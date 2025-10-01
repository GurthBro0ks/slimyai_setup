// commands/export.js
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require("discord.js");
const mem = require("../lib/memory");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("export")
    .setDescription("Export your notes as JSON (latest 25)"),
  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const rows = await mem.listMemos({
        userId: interaction.user.id,
        guildId: interaction.guildId || null,
        limit: 25,
      });

      const payload = JSON.stringify(
        {
          user: interaction.user.id,
          guild: interaction.guildId || null,
          notes: rows,
        },
        null,
        2,
      );

      // Try ephemeral attachment first
      const file = new AttachmentBuilder(Buffer.from(payload, "utf8"), {
        name: `slimy-notes-${interaction.user.id}.json`,
      });

      try {
        await interaction.editReply({
          content: `📦 ${rows.length} notes.`,
          files: [file],
        });
      } catch (attachErr) {
        console.warn(
          "export attachment failed, falling back to text:",
          attachErr?.message || attachErr,
        );
        // Fallback: send as text (truncated to Discord limit)
        const max = 1900;
        const text =
          payload.length > max
            ? payload.slice(0, max) + "\n…(truncated)…"
            : payload;
        await interaction.editReply({
          content:
            "📦 Attachment failed; here is the JSON:\n```json\n" +
            text +
            "\n```",
        });
      }
    } catch (err) {
      console.error("export error:", err);
      if (interaction.deferred || interaction.replied) {
        return interaction
          .editReply({ content: "❌ export crashed. See logs." })
          .catch(() => {});
      }
      return interaction
        .reply({
          content: "❌ export crashed. See logs.",
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
    }
  },
};
