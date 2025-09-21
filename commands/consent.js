// commands/consent.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const mem = require('../lib/memory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('consent')
    .setDescription('Allow or revoke remembering your notes')
    .addBooleanOption(o =>
      o.setName('allow')
       .setDescription('true = allow memory, false = stop remembering')
       .setRequired(true)
    ),

  async execute(interaction) {
    const allow = interaction.options.getBoolean('allow', true);
    await mem.setConsent({
      userId: interaction.user.id,
      guildId: interaction.guildId || null,
      allowed: allow,
    });

    return interaction.reply({
      content: allow ? '✅ Memory ON for you here.' : '🧽 Memory OFF (new notes won’t be saved).',
      flags: MessageFlags.Ephemeral,
    });
  }
};

