// commands/remember.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const mem = require('../lib/memory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remember')
    .setDescription('Store a short note (requires consent)')
    .addStringOption(o =>
      o.setName('note')
       .setDescription('What should I remember?')
       .setRequired(true)
    ),

  async execute(interaction) {
    const note = interaction.options.getString('note', true);

    const ok = await mem.getConsent({
      userId: interaction.user.id,
      guildId: interaction.guildId || null,
    });
    if (!ok) {
      return interaction.reply({
        content: '❌ No consent. Run `/consent allow:true` first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await mem.addMemo({
      userId: interaction.user.id,
      guildId: interaction.guildId || null,
      content: note,
    });

    return interaction.reply({
      content: '📝 Noted.',
      flags: MessageFlags.Ephemeral,
    });
  }
};

