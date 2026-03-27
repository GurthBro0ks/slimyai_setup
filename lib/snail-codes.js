const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

// Node 22 has native global fetch
const API_URL = "https://slimyai.xyz/api/codes";
const CODES_PER_PAGE = 20;
const COLLECTOR_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function registerSubcommand(builder) {
  return builder.addSubcommand((sub) =>
    sub
      .setName("codes")
      .setDescription("View or copy active Super Snail codes")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("Choose what to display")
          .addChoices(
            { name: "View Active Codes", value: "active" },
            { name: "Recent (7 Days)", value: "recent" },
            { name: "All (Archive)", value: "all" },
            { name: "Copy All (Game Format)", value: "copy" },
          ),
      ),
  );
}

async function fetchCodes() {
  const res = await fetch(API_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`API returned ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data.codes) ? data.codes : [];
}

function filterActive(codes) {
  return codes.filter((c) => Array.isArray(c.tags) && c.tags.includes("active"));
}

function filterRecent(codes, days = 7) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return codes.filter((c) => {
    try {
      return new Date(c.ts).getTime() >= cutoff;
    } catch {
      return false;
    }
  });
}

function buildHeading(action) {
  switch (action) {
    case "recent":
      return "Recent Super Snail Codes (7 Days)";
    case "all":
      return "All Super Snail Codes";
    default:
      return "Active Super Snail Codes";
  }
}

function buildCodeLines(codes) {
  return codes.map((c) => {
    const source = c.source || "unknown";
    const tags =
      Array.isArray(c.tags) && c.tags.length
        ? c.tags.map((t) => `\`${t}\``).join(" ")
        : "";
    return `**${c.code}** — ${source} ${tags}`.trim();
  });
}

function buildEmbed(page, totalPages, totalCodes, action, codeLines) {
  const embed = new EmbedBuilder()
    .setColor(0x00ae86)
    .setTitle(`🐌 ${buildHeading(action)}`)
    .setDescription(codeLines.join("\n") || "_No codes found_")
    .setFooter({
      text: `Page ${page + 1}/${totalPages} • ${totalCodes} codes`,
    });
  return embed;
}

function buildPaginationButtons(page, totalPages) {
  const row = new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setCustomId(`snail-codes:prev:${page}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("◀ Prev")
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId("snail-codes:page-indicator")
      .setStyle(ButtonStyle.Secondary)
      .setLabel(`${page + 1} / ${totalPages}`)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`snail-codes:next:${page}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Next ▶")
      .setDisabled(page >= totalPages - 1),
  ]);
  return [row];
}

function buildCopyButton(action, totalCodes) {
  const customId = JSON.stringify({
    type: "snail-codes-copy",
    action,
    total: totalCodes,
    timestamp: Date.now(),
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("📋 Copy All Codes"),
  );
  return [row];
}

function disableAllButtons() {
  const row = new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setCustomId("snail-codes:prev:disabled")
      .setStyle(ButtonStyle.Secondary)
      .setLabel("◀ Prev")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("snail-codes:page-indicator")
      .setStyle(ButtonStyle.Secondary)
      .setLabel("—")
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("snail-codes:next:disabled")
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Next ▶")
      .setDisabled(true),
  ]);
  return [row];
}

async function handleCodes(interaction) {
  if (process.env.FEATURE_CODES !== "true") {
    return interaction.reply({
      content: "Codes feature disabled.",
      ephemeral: true,
    });
  }

  const action = interaction.options.getString("action") || "active";
  await interaction.deferReply();

  let codes = [];
  try {
    codes = await fetchCodes();
  } catch (err) {
    return interaction.editReply({
      content:
        "❌ Codes temporarily unavailable. Visit [slimyai.xyz/snail/codes](https://slimyai.xyz/snail/codes)",
      components: [],
    });
  }

  // Filter based on action
  let filtered = codes;
  if (action === "active") {
    filtered = filterActive(codes);
  } else if (action === "recent") {
    filtered = filterRecent(codes, 7);
  }
  // "all" and "copy" use the full list

  // Sort: newest first (by ts)
  filtered = [...filtered].sort((a, b) => {
    const ta = new Date(a.ts || 0).getTime();
    const tb = new Date(b.ts || 0).getTime();
    return tb - ta;
  });

  const codesOnly = filtered.map((c) => c.code).filter(Boolean);

  // "copy" action: ephemeral reply with just code strings
  if (action === "copy") {
    const payload = codesOnly.join("\n") || "No codes found.";
    const copyId = JSON.stringify({
      type: "snail-codes-copy-ephemeral",
      count: filtered.length,
      timestamp: Date.now(),
    });

    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(copyId)
          .setStyle(ButtonStyle.Secondary)
          .setLabel(`📋 Copy ${filtered.length} Codes`),
      ),
    ];

    const replyMessage = await interaction.editReply({
      content: `🐌 **Copy All Codes** — ${filtered.length} codes ready to copy below`,
      components,
    });

    const collector = replyMessage.createMessageComponentCollector({
      filter: (i) => {
        try {
          const data = JSON.parse(i.customId);
          return data?.type === "snail-codes-copy-ephemeral";
        } catch {
          return false;
        }
      },
      time: COLLECTOR_TIMEOUT_MS,
    });

    collector.on("collect", async (i) => {
      await i.reply({
        content: `\`\`\`\n${payload}\n\`\`\``,
        ephemeral: true,
      });
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("snail-codes-copy-ephemeral:done")
                .setStyle(ButtonStyle.Secondary)
                .setLabel("📋 Copy Codes")
                .setDisabled(true),
            ),
          ],
        });
      } catch {
        // message likely deleted
      }
    });
    return;
  }

  // Paginated view for active/recent/all
  const totalPages = Math.max(1, Math.ceil(filtered.length / CODES_PER_PAGE));
  let currentPage = 0;

  const pageCodes = filtered.slice(
    currentPage * CODES_PER_PAGE,
    (currentPage + 1) * CODES_PER_PAGE,
  );
  const codeLines = buildCodeLines(pageCodes);

  const replyMessage = await interaction.editReply({
    embeds: [buildEmbed(currentPage, totalPages, filtered.length, action, codeLines)],
    components: buildPaginationButtons(currentPage, totalPages),
  });

  const collector = replyMessage.createMessageComponentCollector({
    filter: (i) => i.customId.startsWith("snail-codes:prev:") || i.customId.startsWith("snail-codes:next:"),
    time: COLLECTOR_TIMEOUT_MS,
  });

  collector.on("collect", async (i) => {
    const [, , direction, pageStr] = i.customId.split(":");
    const newPage = parseInt(pageStr, 10);
    if (isNaN(newPage)) return;

    let updatedPage;
    if (direction === "prev") {
      updatedPage = Math.max(0, newPage - 1);
    } else {
      updatedPage = Math.min(totalPages - 1, newPage + 1);
    }

    if (updatedPage === currentPage) {
      await i.deferUpdate();
      return;
    }

    currentPage = updatedPage;
    const start = currentPage * CODES_PER_PAGE;
    const end = start + CODES_PER_PAGE;
    const paginatedCodes = filtered.slice(start, end);
    const lines = buildCodeLines(paginatedCodes);

    await i.update({
      embeds: [buildEmbed(currentPage, totalPages, filtered.length, action, lines)],
      components: buildPaginationButtons(currentPage, totalPages),
    });
  });

  collector.on("end", async () => {
    try {
      await interaction.editReply({
        components: disableAllButtons(),
      });
    } catch {
      // message likely deleted
    }
  });
}

module.exports = {
  registerSubcommand,
  handleCodes,
};
