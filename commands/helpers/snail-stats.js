const { EmbedBuilder } = require("discord.js");

async function runSnailStats({
  interaction,
  metrics,
  database,
  findActiveSnapshot,
  getSnapshotParts,
  finalizeSnapshot,
  REQUIRED_TYPES,
  TYPE_LABELS,
  WHY_NEEDED,
  buildFullAnalysis,
  formatStatsBlock,
  formatStatsLine: _formatStatsLine,
  FOOTER,
}) {
  const startTime = Date.now();
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const guildId = interaction.guildId || null;
  const username = interaction.user.username;
  const guildName = interaction.guild?.name || "Unknown";

  try {
    const snapshotId = await findActiveSnapshot(userId, guildId);

    if (snapshotId) {
      const parts = await getSnapshotParts(snapshotId);

      if (!parts.length) {
        metrics.trackCommand("snail-stats", Date.now() - startTime, false);
        return interaction.editReply({
          content:
            "📸 No saved screenshot data yet. Use `/snail analyze` to capture each required screen.",
        });
      }

      const capturedTypes = new Set(parts.map((p) => p.part_type));
      const missingTypes = REQUIRED_TYPES.filter((t) => !capturedTypes.has(t));

      if (missingTypes.length) {
        const lines = [
          `Progress: ${capturedTypes.size}/${REQUIRED_TYPES.length} screenshots saved.`,
          "",
          "Still needed:",
          ...missingTypes.map(
            (type) => `• **${TYPE_LABELS[type]}** — ${WHY_NEEDED[type]}`,
          ),
          "",
          "Upload the missing screenshots with `/snail analyze`, then click **Save Screenshot Data** on each preview.",
        ];

        metrics.trackCommand("snail-stats", Date.now() - startTime, true);
        return interaction.editReply({ content: lines.join("\n") });
      }

      const statsPart = parts.find((p) => p.part_type === "STATS_MAIN");
      const loadoutPart = parts.find((p) => p.part_type === "LOADOUT_GEAR");
      const relicPart = parts.find((p) => p.part_type === "COMPASS_RELICS");

      const radar = statsPart?.fields?.radar || null;
      const loadoutItems = Array.isArray(loadoutPart?.fields?.items)
        ? loadoutPart.fields.items
        : [];
      const loadoutSlot = loadoutPart?.fields?.loadout || null;
      const relicItems = Array.isArray(relicPart?.fields?.items)
        ? relicPart.fields.items
        : [];

      const summaryLines = buildFullAnalysis({
        loadoutSlot,
        loadoutItems,
        relicItems,
        radar,
      });
      summaryLines.push("", FOOTER);

      const analysisText = summaryLines.join("\n");

      const snailStatId = await database.saveSnailStat({
        userId,
        guildId,
        username,
        guildName,
        screenshotUrl: statsPart?.image_url || null,
        stats: {
          hp: null,
          atk: null,
          def: null,
          rush: null,
          fame: radar?.FAME ?? null,
          tech: radar?.TECH ?? null,
          art: radar?.ART ?? null,
          civ: radar?.CIV ?? null,
          fth: radar?.FTH ?? null,
        },
        wikiEnrichment: null,
        confidence: { level: radar?.confidence ?? null, notes: null },
        analysisText,
        savedToSheet: false,
        activeLoadout: loadoutSlot,
        loadoutSnapshotId: loadoutPart ? snapshotId : null,
      });

      await finalizeSnapshot(snapshotId);

      const lines = [
        analysisText,
        "",
        `📦 Saved entry #${snailStatId}. Use \`/snail sheet\` to review history or share via Google Sheets if enabled.`,
      ];

      metrics.trackCommand("snail-stats", Date.now() - startTime, true);
      return interaction.editReply({ content: lines.join("\n") });
    }

    const [latest] = await database.getRecentSnailStats(userId, guildId, 1);
    if (latest) {
      const timestamp = latest.createdAt
        ? new Date(latest.createdAt).toISOString()
        : "unknown time";
      const lines = [
        `📊 Last saved Super Snail stats (recorded ${timestamp})`,
        "",
        latest.analysisText ||
          `${formatStatsBlock(latest.stats)}\n\nCompass: ${latest.loadoutSnapshotId || latest.activeLoadout ? "linked data available" : "not captured"}`,
        "",
        FOOTER,
      ];

      const embed = new EmbedBuilder()
        .setColor(0x00ae86)
        .setTitle("🐌 Latest Stored Analysis")
        .setDescription(lines.join("\n").slice(0, 4000));

      metrics.trackCommand("snail-stats", Date.now() - startTime, true);
      return interaction.editReply({
        content: lines.join("\n"),
        embeds: [embed],
      });
    }

    metrics.trackCommand("snail-stats", Date.now() - startTime, false);
    return interaction.editReply({
      content:
        "📊 No saved stats found yet. Use `/snail analyze` followed by `/snail stats` after capturing all required screenshots.",
    });
  } catch (err) {
    metrics.trackCommand("snail-stats", Date.now() - startTime, false);
    metrics.trackError("snail_stats", err.message);
    console.error("[snail] stats error:", err);
    return interaction.editReply({
      content: `❌ Failed to build stats: ${err.message}`,
    });
  }
}

module.exports = { runSnailStats };
