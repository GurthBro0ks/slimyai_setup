const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const db = require("./database");

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

async function handleCodes(interaction) {
  const featureEnabled = process.env.FEATURE_CODES === "true";
  if (!featureEnabled) {
    return interaction.reply({
      content: "Codes feature disabled.",
      ephemeral: true,
    });
  }

  const action = interaction.options.getString("action") || "active";
  await interaction.deferReply();

  let rows = [];
  let content;

  if (action === "active") {
    rows = await db.query(
      `SELECT code, rewards
       FROM snail_codes
       WHERE status = 'active'
       ORDER BY date_added DESC
       LIMIT 50`,
    );
  } else if (action === "recent") {
    rows = await db.query(
      `SELECT code, rewards, date_added
       FROM snail_codes
       WHERE date_added >= NOW() - INTERVAL 7 DAY
       ORDER BY date_added DESC`,
    );
  } else if (action === "all") {
    rows = await db.query(
      `SELECT code, rewards, status, date_added
       FROM snail_codes
       ORDER BY date_added DESC
       LIMIT 200`,
    );
  } else if (action === "copy") {
    rows = await db.query(
      `SELECT code
       FROM snail_codes
       WHERE status = 'active'
       ORDER BY date_added DESC`,
    );
  }

  const codesOnly = rows.map((row) => row.code).filter(Boolean);
  if (action === "copy") {
    const payload = codesOnly.join("\n") || "No active codes.";
    content = `🐌 **Active Super Snail Codes (Copy View)**\n\`\`\`\n${payload}\n\`\`\``;
  } else {
    const text = rows.length
      ? rows.map((row) => `**${row.code}** — ${row.rewards || ""}`).join("\n")
      : "_No codes found_";
    const heading =
      action === "recent"
        ? "Recent Super Snail Codes (7 Days)"
        : action === "all"
          ? "All Super Snail Codes (Latest 200)"
          : "Active Super Snail Codes";
    content = `🐌 **${heading}**\n${text}`;
  }

  // eslint-disable-next-line no-unused-vars
  const _buttonId = `snail-codes-copy-${interaction.id}`;
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
    content,
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
