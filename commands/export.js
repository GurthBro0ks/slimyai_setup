// commands/export.js - FIXED VERSION
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
      // Defer ONCE at the start
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

      const file = new AttachmentBuilder(Buffer.from(payload, "utf8"), {
        name: `slimy-notes-${interaction.user.id}.json`,
      });

      // Try to send file
      try {
        await interaction.editReply({
          content: `📦 ${rows.length} note(s) exported.`,
          files: [file],
        });
      } catch (attachErr) {
        console.warn("Export attachment failed, sending as text:", attachErr.message);
        
        // Fallback: send as text (truncated)
        const max = 1900;
        const text = payload.length > max 
          ? payload.slice(0, max) + "\n…(truncated)…" 
          : payload;
          
        await interaction.editReply({
          content: "📦 Attachment failed; here is the JSON:\n```json\n" + text + "\n```",
        });
      }
    } catch (err) {
      console.error("export error:", err);
      
      // Safe error handling
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: "❌ Export failed. Check logs." });
        } else {
          await interaction.reply({
            content: "❌ Export failed. Check logs.",
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch (innerErr) {
        console.error("Could not send error to user:", innerErr.message);
      }
    }
  },
};
