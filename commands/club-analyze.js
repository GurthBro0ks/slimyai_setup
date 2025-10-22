const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const database = TEST ? stubs.database : require("../lib/database");
const logger = require("../lib/logger");
const metrics = TEST ? stubs.metrics : require("../lib/metrics");
const clubVision = TEST ? stubs.clubVision : require("../lib/club-vision");
const { parseManageMembersImage, parseManageMembersImageEnsemble } =
  clubVision;
const clubStore = TEST ? stubs.clubStore : require("../lib/club-store");
const {
  canonicalize,
  upsertMembers,
  createSnapshot,
  insertMetrics,
  recomputeLatestForGuild,
  getLatestForGuild,
  addAlias,
  findLikelyMemberId,
} = clubStore;
const { pushLatest } = TEST ? stubs.clubSheets : require("../lib/club-sheets");

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const MIN_ROWS_FOR_COMMIT = 3;
const SESSION_TTL_MS = 15 * 60 * 1000;
const SUSPICIOUS_THRESHOLD = Number(
  process.env.CLUB_QA_SUSPICIOUS_JUMP_PCT || 85,
);
const BUTTON_PREFIX = "club-analyze";
const USE_ENSEMBLE = process.env.CLUB_USE_ENSEMBLE === "1";

const sessions = new Map();

function ensureDatabase() {
  if (!database.isConfigured()) {
    throw new Error(
      "Database is not configured. Club analytics require MySQL.",
    );
  }
}

function toNumber(value) {
  if (value === null || typeof value === "undefined") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatNumber(value) {
  const num = toNumber(value);
  if (num === null) return "—";
  return num.toLocaleString();
}

function formatPercent(value) {
  const num = toNumber(value);
  if (num === null) return "—";
  const sign = num > 0 ? "▲" : num < 0 ? "▼" : "▶";
  return `${sign} ${Math.abs(num).toFixed(2)}%`;
}

function createSession(interaction, type, attachments, forceCommit) {
  const id = uuidv4();
  const session = {
    id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    type,
    forceCommit,
    attachments,
    metrics: {
      sim: new Map(),
      total: new Map(),
    },
    aliases: new Map(),
    createdAt: Date.now(),
    threshold: SUSPICIOUS_THRESHOLD,
    previousByCanonical: new Map(),
    lastWeekSet: new Set(),
    qa: null,
    replyMessageId: null,
    strictRuns: 0,
    initialInteraction: interaction,
    useEnsemble: USE_ENSEMBLE,
    ensembleMetadata: null,
  };

  sessions.set(id, session);

  const timeout = setTimeout(() => {
    const existing = sessions.get(id);
    if (existing) {
      sessions.delete(id);
    }
  }, SESSION_TTL_MS);

  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  return session;
}

function mergeRows(session, metric, rows, source, filterSet = null) {
  const target = session.metrics[metric];
  if (!target) return;

  for (const row of rows) {
    const display = String(row?.display || row?.name || "").trim();
    const canonical = row?.canonical || canonicalize(display);
    const value = toNumber(row?.value);
    const confidence =
      typeof row?.confidence === "number"
        ? Math.max(0, Math.min(1, row.confidence))
        : 0;

    if (!canonical || value === null) continue;
    if (filterSet && !filterSet.has(canonical)) continue;

    const existing = target.get(canonical);
    if (!existing) {
      target.set(canonical, {
        canonical,
        display: display || canonical,
        value,
        confidence,
        sources: new Set([source]),
      });
    } else {
      if (value > existing.value) {
        existing.value = value;
        if (display && display.length >= existing.display.length) {
          existing.display = display;
        }
      }
      if (confidence > existing.confidence) {
        existing.confidence = confidence;
      }
      existing.sources.add(source);
    }
  }
}

function collectCanonicals(session) {
  const combined = new Set();
  for (const map of [session.metrics.sim, session.metrics.total]) {
    for (const key of map.keys()) combined.add(key);
  }
  return combined;
}

function getDisplayForCanonical(session, canonical) {
  const total = session.metrics.total.get(canonical);
  if (total?.display) return total.display;
  const sim = session.metrics.sim.get(canonical);
  if (sim?.display) return sim.display;
  const prev = session.previousByCanonical.get(canonical);
  if (prev?.display) return prev.display;
  return canonical;
}

function recomputeQA(session) {
  const canonicals = collectCanonicals(session);
  const missing = [];
  const newNames = [];

  for (const prev of session.lastWeekSet) {
    if (!canonicals.has(prev)) {
      missing.push(prev);
    }
  }

  for (const current of canonicals) {
    if (!session.lastWeekSet.has(current)) {
      newNames.push(current);
    }
  }

  missing.sort();
  newNames.sort();

  const suspicious = [];
  for (const canonical of canonicals) {
    const totalRow = session.metrics.total.get(canonical);
    if (!totalRow) continue;
    const prev = session.previousByCanonical.get(canonical);
    const previousValue = toNumber(prev?.totalPower);
    if (!previousValue || previousValue === 0) continue;
    const pct = ((totalRow.value - previousValue) / previousValue) * 100;
    if (Number.isFinite(pct) && Math.abs(pct) >= session.threshold) {
      suspicious.push({
        canonical,
        display: getDisplayForCanonical(session, canonical),
        previous: previousValue,
        current: totalRow.value,
        pct,
      });
    }
  }

  suspicious.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const lowConfidence = [];
  const lowConfidenceSet = new Set();

  for (const [canonical, row] of session.metrics.sim.entries()) {
    if (row.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidence.push({
        canonical,
        display: getDisplayForCanonical(session, canonical),
        metric: "sim",
        confidence: row.confidence,
      });
      lowConfidenceSet.add(canonical);
    }
  }

  for (const [canonical, row] of session.metrics.total.entries()) {
    if (row.confidence < LOW_CONFIDENCE_THRESHOLD) {
      lowConfidence.push({
        canonical,
        display: getDisplayForCanonical(session, canonical),
        metric: "total",
        confidence: row.confidence,
      });
      lowConfidenceSet.add(canonical);
    }
  }

  const totalCount = session.metrics.total.size;
  const simCount = session.metrics.sim.size;
  const totalRows =
    totalCount +
    simCount -
    (totalCount && simCount
      ? [...session.metrics.total.keys()].filter((k) =>
          session.metrics.sim.has(k),
        ).length
      : 0);

  const lastWeekCount = session.lastWeekSet.size;
  const missingRatio = lastWeekCount > 0 ? missing.length / lastWeekCount : 0;
  const coverage = lastWeekCount > 0 ? 1 - missingRatio : 1;
  const coveragePct = Math.round(coverage * 100);

  // Paranoid mode: require 100% coverage unless force commit
  const fullCoverage = missing.length === 0 && lastWeekCount > 0;
  const coverageGuardTriggered = !fullCoverage && lastWeekCount > 0;

  session.qa = {
    missing,
    newNames,
    suspicious,
    lowConfidence,
    lowConfidenceSet,
    canonicals,
    metricsPresent: {
      total: session.metrics.total.size > 0,
      sim: session.metrics.sim.size > 0,
    },
    totalRows,
    missingGuardTriggered: missingRatio >= 0.2 && lastWeekCount > 0, // Legacy guard (20%)
    coverageGuardTriggered, // New paranoid guard (100% required)
    missingRatio,
    coverage,
    coveragePct,
    fullCoverage,
  };
}

function buildPreviewEmbed(session) {
  const coverageColor = session.qa?.coverageGuardTriggered
    ? 0xff3366 // Red for <100% coverage
    : session.qa?.missingGuardTriggered
      ? 0xffa500 // Orange for legacy guard
      : 0x3b82f6; // Blue for good

  const embed = new EmbedBuilder()
    .setTitle("Club Analyze — Preview")
    .setColor(coverageColor)
    .setFooter({
      text: `Coverage: ${session.qa?.coveragePct || 0}% • Manual fixes available`,
    });

  const totalSim = session.metrics.sim.size;
  const totalTotal = session.metrics.total.size;
  const warnMissingMetric =
    session.type === "both" &&
    (!session.qa.metricsPresent.sim || !session.qa.metricsPresent.total);

  const sheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    process.env.SHEETS_SPREADSHEET_ID;
  const sheetLink = sheetId
    ? `https://docs.google.com/spreadsheets/d/${sheetId}`
    : null;

  const description = [
    `• Parsed **${totalSim + totalTotal}** rows`,
    `  • Sim: ${totalSim}`,
    `  • Total: ${totalTotal}`,
  ];

  if (session.useEnsemble && session.ensembleMetadata) {
    const meta = session.ensembleMetadata;
    description.push(
      `• **Ensemble Mode**: ${meta.disagreements} digit conflicts reconciled`,
    );
    if (meta.disagreements > 0) {
      description.push(
        `  • Both models agreed: ${meta.bothModels - meta.disagreements}/${meta.bothModels}`,
      );
    }
  }

  if (warnMissingMetric) {
    description.push("⚠️ Both metrics were requested but not fully detected.");
  }
  if (sheetLink) {
    description.push(`[Open sheet](${sheetLink})`);
  }

  embed.setDescription(description.join("\n"));

  if (session.qa.missing.length) {
    const sample = session.qa.missing
      .slice(0, 10)
      .map((canonical) => `• ${getDisplayForCanonical(session, canonical)}`);
    if (session.qa.missing.length > 10) {
      sample.push(`…+${session.qa.missing.length - 10} more`);
    }
    embed.addFields({
      name: `Missing vs last week (${session.qa.missing.length})`,
      value: sample.join("\n"),
    });
  }

  if (session.qa.newNames.length) {
    const sample = session.qa.newNames
      .slice(0, 10)
      .map((canonical) => `• ${getDisplayForCanonical(session, canonical)}`);
    if (session.qa.newNames.length > 10) {
      sample.push(`…+${session.qa.newNames.length - 10} more`);
    }
    embed.addFields({
      name: `New this week (${session.qa.newNames.length})`,
      value: sample.join("\n"),
    });
  }

  if (session.qa.suspicious.length) {
    const sample = session.qa.suspicious.slice(0, 5).map((row) => {
      return `${formatPercent(row.pct)} • ${row.display} (${formatNumber(row.previous)} → ${formatNumber(row.current)})`;
    });
    embed.addFields({
      name: `Suspicious total changes (${session.qa.suspicious.length})`,
      value: sample.join("\n"),
    });
  }

  if (session.qa.lowConfidence.length) {
    const sample = session.qa.lowConfidence.slice(0, 8).map((row) => {
      return `• ${row.display} (${row.metric}, ${(row.confidence * 100).toFixed(1)}%)`;
    });
    embed.addFields({
      name: `Low-confidence OCR (${session.qa.lowConfidence.length})`,
      value: sample.join("\n"),
    });
  }

  if (session.qa.coverageGuardTriggered) {
    embed.addFields({
      name: `🛡️ Coverage Guard: ${session.qa.coveragePct}%`,
      value:
        "**100% coverage required** for commit. All last week's members must be present. Use manual fixes to add missing members, or force commit (admin only) to override.",
    });
  } else if (session.qa.missingGuardTriggered) {
    embed.addFields({
      name: "⚠️ Warning: High missing rate",
      value: `${session.qa.coveragePct}% coverage. Consider manual fixes before committing.`,
    });
  }

  return embed;
}

function buildPreviewComponents(session) {
  const approveDisabled =
    (session.qa.coverageGuardTriggered || session.qa.missingGuardTriggered) &&
    !session.forceCommit;
  const notEnoughRows = session.qa.totalRows < MIN_ROWS_FOR_COMMIT;
  const disabledApprove = approveDisabled || notEnoughRows;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:approve:${session.id}`)
      .setEmoji("✅")
      .setLabel("Approve & Commit")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabledApprove),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:ocr:${session.id}`)
      .setEmoji("🪄")
      .setLabel("Re-parse (OCR boost)")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(session.strictRuns >= 2),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:manual:${session.id}`)
      .setEmoji("📝")
      .setLabel("Manual Fix")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:cancel:${session.id}`)
      .setEmoji("🛑")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  return [row];
}

async function parseAttachments(session, strict = false) {
  const forcedMetric =
    session.type === "sim" ? "sim" : session.type === "power" ? "total" : null;

  const useEnsemble = session.useEnsemble && !strict;

  for (const attachment of session.attachments) {
    try {
      let result;
      if (useEnsemble) {
        result = await parseManageMembersImageEnsemble(
          attachment.url,
          forcedMetric,
        );
        // Accumulate ensemble metadata
        if (result.ensembleMetadata) {
          if (!session.ensembleMetadata) {
            session.ensembleMetadata = {
              totalMembers: 0,
              disagreements: 0,
              onlyInA: 0,
              onlyInB: 0,
              bothModels: 0,
            };
          }
          session.ensembleMetadata.totalMembers +=
            result.ensembleMetadata.totalMembers;
          session.ensembleMetadata.disagreements +=
            result.ensembleMetadata.disagreements;
          session.ensembleMetadata.onlyInA += result.ensembleMetadata.onlyInA;
          session.ensembleMetadata.onlyInB += result.ensembleMetadata.onlyInB;
          session.ensembleMetadata.bothModels +=
            result.ensembleMetadata.bothModels;
        }
      } else {
        result = await parseManageMembersImage(
          attachment.url,
          forcedMetric,
          { strict },
        );
      }
      mergeRows(session, result.metric, result.rows, attachment.url);
    } catch (err) {
      logger.error("[club-analyze] Vision parse failed", {
        url: attachment.url,
        error: err.message,
      });
      throw err;
    }
  }
}

async function loadPreviousState(session) {
  const latest = await getLatestForGuild(session.guildId);
  for (const row of latest) {
    session.previousByCanonical.set(row.name_canonical, {
      memberId: row.member_id,
      display: row.name_display,
      totalPower: toNumber(row.total_power),
      simPower: toNumber(row.sim_power),
    });
  }
  session.lastWeekSet = new Set(session.previousByCanonical.keys());
}

function determineMetricForLine(session, canonical) {
  if (session.type === "sim") return "sim";
  if (session.type === "power") return "total";

  const hasSim = session.metrics.sim.has(canonical);
  const hasTotal = session.metrics.total.has(canonical);

  if (!hasSim && hasTotal) return "sim";
  if (!hasTotal && hasSim) return "total";
  if (!hasSim && !hasTotal) return "total";
  return "total";
}

async function applyManualUpdates(session, updates) {
  for (const update of updates) {
    const rawCanonical = canonicalize(update.display);
    if (!rawCanonical) continue;

    const metric =
      update.metric || determineMetricForLine(session, rawCanonical);
    const map = session.metrics[metric];
    if (!map) continue;

    let canonicalKey = rawCanonical;
    let memberIdForAlias = null;

    const likelyMemberId = await findLikelyMemberId(
      session.guildId,
      rawCanonical,
    );
    if (likelyMemberId) {
      for (const [
        prevCanonical,
        info,
      ] of session.previousByCanonical.entries()) {
        if (info.memberId === likelyMemberId) {
          canonicalKey = prevCanonical;
          break;
        }
      }
      if (canonicalKey === rawCanonical) {
        memberIdForAlias = likelyMemberId;
      }
    }

    const existing = map.get(canonicalKey);
    if (existing) {
      existing.value = update.value;
      existing.confidence = 1;
      existing.display = update.display;
    } else {
      map.set(canonicalKey, {
        canonical: canonicalKey,
        display: update.display,
        value: update.value,
        confidence: 1,
        sources: new Set(["manual"]),
      });
    }

    if (memberIdForAlias) {
      session.aliases.set(rawCanonical, memberIdForAlias);
    }
  }
}

function parseManualInput(input) {
  const lines = String(input || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const updates = [];
  const errors = [];

  for (const line of lines) {
    const metricMatch = line.match(
      /^(.+?),(?:\s*)(sim|total)\s*=\s*([0-9][0-9,\s]*)$/i,
    );
    const simpleMatch = line.match(/^(.+?)\s*=\s*([0-9][0-9,\s]*)$/);

    if (metricMatch) {
      const display = metricMatch[1].trim();
      const metric = metricMatch[2].toLowerCase();
      const value = Number(metricMatch[3].replace(/[^0-9]/g, ""));

      if (!display || !value) {
        errors.push(line);
        continue;
      }

      updates.push({ display, metric, value });
      continue;
    }

    if (simpleMatch) {
      const display = simpleMatch[1].trim();
      const value = Number(simpleMatch[2].replace(/[^0-9]/g, ""));

      if (!display || !value) {
        errors.push(line);
        continue;
      }

      updates.push({ display, metric: null, value });
      continue;
    }

    errors.push(line);
  }

  return { updates, errors };
}

async function commitSession(session, interaction, source) {
  if (session.qa.totalRows < MIN_ROWS_FOR_COMMIT) {
    throw new Error(
      `Need at least ${MIN_ROWS_FOR_COMMIT} rows to commit (currently ${session.qa.totalRows}).`,
    );
  }

  // Check coverage guard (100% required)
  if (
    session.qa.coverageGuardTriggered &&
    !session.forceCommit &&
    source !== "force"
  ) {
    throw new Error(
      `Coverage guard active: ${session.qa.coveragePct}% coverage. 100% required. ${session.qa.missing.length} members missing from last week. Use manual fixes or force commit.`,
    );
  }

  // Legacy guard (20% threshold)
  if (
    session.qa.missingGuardTriggered &&
    !session.forceCommit &&
    source !== "force"
  ) {
    throw new Error(
      "Missing guard is active. Resolve missing members or run with force commit.",
    );
  }

  const canonicalSet = collectCanonicals(session);
  if (canonicalSet.size === 0) {
    throw new Error("No rows available to commit.");
  }

  const members = [];
  for (const canonical of canonicalSet) {
    members.push({
      canonical,
      display: getDisplayForCanonical(session, canonical),
    });
  }

  const memberMap = await upsertMembers(session.guildId, members);

  const metricsPayload = [];

  for (const [canonical, row] of session.metrics.sim.entries()) {
    const memberId =
      memberMap.get(canonical) ||
      session.previousByCanonical.get(canonical)?.memberId;
    if (!memberId) continue;
    metricsPayload.push({
      memberId,
      metric: "sim",
      value: row.value,
    });
  }

  for (const [canonical, row] of session.metrics.total.entries()) {
    const memberId =
      memberMap.get(canonical) ||
      session.previousByCanonical.get(canonical)?.memberId;
    if (!memberId) continue;
    metricsPayload.push({
      memberId,
      metric: "total",
      value: row.value,
    });
  }

  if (!metricsPayload.length) {
    throw new Error("No metrics to insert.");
  }

  const { snapshotId, snapshotAt } = await createSnapshot(
    session.guildId,
    session.userId,
  );

  await insertMetrics(snapshotId, metricsPayload);

  for (const [aliasCanonical, memberId] of session.aliases.entries()) {
    const canonicalAlready = memberMap.get(aliasCanonical);
    if (canonicalAlready) continue;
    try {
      await addAlias(session.guildId, memberId, aliasCanonical);
    } catch (err) {
      logger.warn("[club-analyze] Failed to add alias", {
        aliasCanonical,
        memberId,
        error: err.message,
      });
    }
  }

  await recomputeLatestForGuild(session.guildId, snapshotAt);

  try {
    await pushLatest(session.guildId);
  } catch (err) {
    logger.warn("[club-analyze] pushLatest failed", { error: err.message });
  }

  sessions.delete(session.id);

  logger.info("[club-analyze] Commit successful", {
    guildId: session.guildId,
    rows: metricsPayload.length,
    snapshotId,
  });

  return {
    snapshotId,
    rows: metricsPayload.length,
    snapshotAt,
  };
}

function buildSuccessEmbed(session, commitSummary) {
  const embed = new EmbedBuilder()
    .setTitle("✅ Club analyze committed")
    .setColor(0x22c55e)
    .setDescription(
      `Snapshot \`#${commitSummary.snapshotId}\` saved with ${commitSummary.rows} metric rows.`,
    )
    .setTimestamp(commitSummary.snapshotAt);

  if (session.qa.newNames.length) {
    embed.addFields({
      name: `New members (${session.qa.newNames.length})`,
      value: session.qa.newNames
        .slice(0, 10)
        .map((canonical) => `• ${getDisplayForCanonical(session, canonical)}`)
        .join("\n"),
    });
  }

  if (session.qa.suspicious.length) {
    const sample = session.qa.suspicious
      .slice(0, 5)
      .map((row) => `${formatPercent(row.pct)} • ${row.display}`);
    embed.addFields({
      name: "Top movers (Total)",
      value: sample.join("\n"),
    });
  }

  return embed;
}

async function handleInitialRun(interaction) {
  ensureDatabase();

  const type = interaction.options.getString("type") || "both";
  const attachmentSet = new Map();

  const resolvedAttachments = interaction.options?.resolved?.attachments;
  if (resolvedAttachments?.size) {
    for (const attachment of resolvedAttachments.values()) {
      attachmentSet.set(attachment.id, attachment);
    }
  }

  const hoisted = interaction.options?.data || [];
  for (const option of hoisted) {
    if (option?.attachment) {
      attachmentSet.set(option.attachment.id, option.attachment);
    }
  }

  const primary = interaction.options.getAttachment("images");
  if (primary) {
    attachmentSet.set(primary.id, primary);
  }

  const attachments = Array.from(attachmentSet.values());
  const forceCommit = interaction.options.getBoolean("force_commit") || false;

  if (!attachments.length) {
    throw new Error("Please attach between 1 and 10 screenshots.");
  }
  if (attachments.length > 10) {
    throw new Error("Attach up to 10 screenshots per run.");
  }

  if (
    forceCommit &&
    !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)
  ) {
    throw new Error("Only administrators can force commit.");
  }

  await interaction.deferReply({ ephemeral: true });

  const normalizedAttachments = attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    url: attachment.url,
    size: attachment.size,
  }));

  const session = createSession(
    interaction,
    type,
    normalizedAttachments,
    forceCommit,
  );

  await loadPreviousState(session);
  await parseAttachments(session, false);
  recomputeQA(session);

  if (forceCommit) {
    const commitSummary = await commitSession(session, interaction, "force");
    const embed = buildSuccessEmbed(session, commitSummary);
    await interaction.editReply({
      content: "Force commit complete.",
      embeds: [embed],
      components: [],
    });
    await interaction.followUp({
      content: null,
      embeds: [embed],
      ephemeral: false,
    });
    metrics.trackCommand("club-analyze", 0, true);
    return;
  }

  const embed = buildPreviewEmbed(session);
  const components = buildPreviewComponents(session);

  const replyMessage = await interaction.editReply({
    content:
      "Review the parsed data below. Approve to commit or refine with OCR/manual fixes.",
    embeds: [embed],
    components,
  });

  session.replyMessageId = replyMessage.id;
}

async function handleApprove(interaction, session) {
  const isOwner = interaction.user.id === session.userId;
  if (!isOwner) {
    return interaction.reply({
      ephemeral: true,
      content: "Only the original caller can approve this session.",
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const commitSummary = await commitSession(
      session,
      interaction,
      session.forceCommit ? "force" : "normal",
    );
    const embed = buildSuccessEmbed(session, commitSummary);
    await session.initialInteraction.editReply({
      content: "✅ Snapshot committed.",
      embeds: [],
      components: [],
    });
    await interaction.editReply({
      content: "Commit successful.",
      embeds: [embed],
    });
    await session.initialInteraction.followUp({
      content: null,
      embeds: [embed],
      ephemeral: false,
    });
    metrics.trackCommand("club-analyze", 0, true);
  } catch (err) {
    await interaction.editReply({
      content: `❌ Commit failed: ${err.message}`,
    });
    logger.error("[club-analyze] Commit failed", { error: err.message });
  }
}

async function handleOcr(interaction, session) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({
      ephemeral: true,
      content: "Only the original caller can adjust this session.",
    });
  }

  if (session.strictRuns >= 2) {
    return interaction.reply({
      ephemeral: true,
      content: "OCR boost already run twice.",
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const targetSet = new Set(session.qa.missing);
  for (const item of session.qa.lowConfidence) {
    targetSet.add(item.canonical);
  }

  try {
    for (const map of [session.metrics.sim, session.metrics.total]) {
      for (const row of map.values()) {
        row.sources.delete("ocr");
      }
    }

    const forcedMetric =
      session.type === "sim"
        ? "sim"
        : session.type === "power"
          ? "total"
          : null;

    for (const attachment of session.attachments) {
      const result = await parseManageMembersImage(
        attachment.url,
        forcedMetric,
        { strict: true },
      );
      mergeRows(
        session,
        result.metric,
        result.rows,
        `${attachment.url}#strict`,
        targetSet,
      );
    }

    session.strictRuns += 1;
    recomputeQA(session);

    const embed = buildPreviewEmbed(session);
    const components = buildPreviewComponents(session);
    await session.initialInteraction.editReply({
      content: "Updated preview after OCR boost.",
      embeds: [embed],
      components,
    });
    await interaction.editReply({ content: "OCR boost applied." });
  } catch (err) {
    logger.error("[club-analyze] OCR boost failed", { error: err.message });
    await interaction.editReply({
      content: `❌ OCR boost failed: ${err.message}`,
    });
  }
}

async function handleManual(interaction, session) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({
      ephemeral: true,
      content: "Only the original caller can adjust this session.",
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`${BUTTON_PREFIX}:modal:${session.id}`)
    .setTitle("Manual Fix — Club Analyze");

  const input = new TextInputBuilder()
    .setCustomId("manual_lines")
    .setLabel("Enter fixes (one per line)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Example:\nPlayer One = 123456\nPlayer Two, sim=654321")
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  await interaction.showModal(modal);
}

async function handleCancel(interaction, session) {
  if (interaction.user.id !== session.userId) {
    return interaction.reply({
      ephemeral: true,
      content: "Only the original caller can cancel this session.",
    });
  }

  sessions.delete(session.id);
  await interaction.reply({
    ephemeral: true,
    content: "Session cancelled. No data was written.",
  });
  await session.initialInteraction.editReply({
    content: "Session cancelled.",
    embeds: [],
    components: [],
  });
}

async function processManualModal(interaction, session) {
  const input = interaction.fields.getTextInputValue("manual_lines");
  const { updates, errors } = parseManualInput(input);

  if (!updates.length) {
    return interaction.reply({
      ephemeral: true,
      content: "No valid manual entries detected.",
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await applyManualUpdates(session, updates);
    recomputeQA(session);
    const embed = buildPreviewEmbed(session);
    const components = buildPreviewComponents(session);
    await session.initialInteraction.editReply({
      content: "Preview updated after manual fixes.",
      embeds: [embed],
      components,
    });

    const messages = [
      `Applied ${updates.length} manual correction${updates.length === 1 ? "" : "s"}.`,
    ];
    if (errors.length) {
      messages.push(
        `Skipped ${errors.length} line${errors.length === 1 ? "" : "s"}:`,
      );
      messages.push(errors.map((line) => `• ${line}`).join("\n"));
    }

    await interaction.editReply({ content: messages.join("\n") });
  } catch (err) {
    await interaction.editReply({
      content: `❌ Manual fix failed: ${err.message}`,
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("club-analyze")
    .setDescription(
      "Parse Manage Members screenshots with QA and confirmation before commit.",
    )
    .addAttachmentOption((option) =>
      option
        .setName("images")
        .setDescription("Manage Members screenshots (1-10 attachments)")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Which metric(s) the screenshots contain")
        .setRequired(false)
        .addChoices(
          { name: "Both (Sim + Total)", value: "both" },
          { name: "Sim Power only", value: "sim" },
          { name: "Total Power only", value: "power" },
        ),
    )
    .addBooleanOption((option) =>
      option
        .setName("force_commit")
        .setDescription("Admins: skip preview and commit immediately")
        .setRequired(false),
    ),
  async execute(interaction) {
    try {
      await handleInitialRun(interaction);
    } catch (err) {
      const userFacingMessages = new Set([
        "Please attach between 1 and 10 screenshots.",
        "Attach up to 10 screenshots per run.",
        "Need at least 3 rows to commit (currently 0).",
        "Only administrators can force commit.",
        "Missing guard is active. Resolve missing members or run with force commit.",
        "Database is not configured. Club analytics require MySQL.",
      ]);
      const logMethod = userFacingMessages.has(err.message) ? "warn" : "error";
      logger[logMethod]("[club-analyze] Initial run failed", {
        error: err.message,
      });
      if (interaction.deferred) {
        await interaction.editReply({
          content: `❌ ${err.message}`,
        });
      } else {
        await interaction.reply({
          content: `❌ ${err.message}`,
          ephemeral: true,
        });
      }
    }
  },
  async handleButton(interaction) {
    if (!interaction.customId.startsWith(BUTTON_PREFIX)) return;
    const [, action, sessionId] = interaction.customId.split(":");
    const session = sessions.get(sessionId);

    if (!session) {
      return interaction.reply({
        ephemeral: true,
        content: "This session has expired.",
      });
    }

    try {
      if (action === "approve") {
        await handleApprove(interaction, session);
      } else if (action === "ocr") {
        await handleOcr(interaction, session);
      } else if (action === "manual") {
        await handleManual(interaction, session);
      } else if (action === "cancel") {
        await handleCancel(interaction, session);
      }
    } catch (err) {
      logger.error("[club-analyze] Button handler failed", {
        action,
        error: err.message,
      });
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          ephemeral: true,
          content: `❌ ${err.message}`,
        });
      }
    }
  },
  async handleModal(interaction) {
    if (!interaction.customId.startsWith(`${BUTTON_PREFIX}:modal:`)) return;
    const sessionId = interaction.customId.split(":")[2];
    const session = sessions.get(sessionId);
    if (!session) {
      return interaction.reply({
        ephemeral: true,
        content: "Session expired.",
      });
    }
    await processManualModal(interaction, session);
  },
};
