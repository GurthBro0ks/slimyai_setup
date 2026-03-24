const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

// Node 22 has native global fetch
const API_URL = "https://slimyai.xyz/api/codes";

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

  // Limit display rows
  const DISPLAY_LIMIT = action === "copy" ? 500 : 15;
  const displayCodes = filtered.slice(0, DISPLAY_LIMIT);
  const hasMore = filtered.length > DISPLAY_LIMIT;

  const codesOnly = filtered.map((c) => c.code).filter(Boolean);

  let bodyContent;
  if (action === "copy") {
    const payload = codesOnly.join("\n") || "No active codes.";
    bodyContent = `🐌 **Active Super Snail Codes (Copy View)**\n\`\`\`\n${payload}\n\`\`\``;
  } else {
    const lines = displayCodes.map((c) => {
      const source = c.source || "unknown";
      const tags = Array.isArray(c.tags) && c.tags.length
        ? c.tags.map((t) => `\`${t}\``).join(" ")
        : "";
      return `**${c.code}** — ${source} ${tags}`.trim();
    });

    const heading =
      action === "recent"
        ? "Recent Super Snail Codes (7 Days)"
        : action === "all"
          ? "All Super Snail Codes"
          : "Active Super Snail Codes";

    bodyContent =
      `🐌 **${heading}**\n` +
      (lines.length ? lines.join("\n") : "_No codes found_") +
      (hasMore ? `\n\n_…and ${filtered.length - DISPLAY_LIMIT} more codes_` : "");
  }

  const customId = JSON.stringify({
    type: "snail-codes-copy",
    action,
    timestamp: Date.now(),
  });
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("📋 Copy Codes"),
    ),
  ];

  const replyMessage = await interaction.editReply({
    content: bodyContent,
    components,
  });

  const collector = replyMessage.createMessageComponentCollector({
    filter: (i) => {
      try {
        const data = JSON.parse(i.customId);
        return data?.type === "snail-codes-copy";
      } catch {
        return false;
      }
    },
    time: 60_000,
  });

  collector.on("collect", async (i) => {
    const payload = codesOnly.join("\n") || "No codes available.";
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
              .setCustomId("snail-codes-copy-disabled")
              .setStyle(ButtonStyle.Secondary)
              .setLabel("📋 Copy Codes")
              .setDisabled(true),
          ),
        ],
      });
    } catch {
      // message likely deleted or already updated
    }
  });
}

module.exports = {
  registerSubcommand,
  handleCodes,
};
