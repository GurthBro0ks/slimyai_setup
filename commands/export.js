// commands/export.js
const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const mem = require('../lib/memory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export your notes as JSON (latest 25)'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const rows = await mem.listMemos({
      userId: interaction.user.id,
      guildId: interaction.guildId || null,
      limit: 25,
    });

    const payload = JSON.stringify({
      user: interaction.user.id,
      guild: interaction.guildId || null,
      notes: rows,
    }, null, 2);

    const file = new AttachmentBuilder(Buffer.from(payload), {
      name: `slimy-notes-${interaction.user.id}.json`
    });

    return interaction.editReply({
      content: `📦 ${rows.length} notes.`,
      files: [file],
    });
  }
};

