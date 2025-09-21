// commands/mode.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const mem = require('../lib/memory');

const MODES = ['mentor','partner','mirror','operator'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mode')
    .setDescription('Get or set slimy.ai mode')
    .addStringOption(o =>
      o.setName('value')
       .setDescription('mentor | partner | mirror | operator (omit to view)')
       .addChoices(...MODES.map(m => ({ name: m, value: m })))
    ),

  async execute(interaction) {
    const value = interaction.options.getString('value');
    const guildId = interaction.guildId || null;
    const userId = interaction.user.id;

    if (value) {
      await mem.setMode({ userId, guildId, mode: value });
      return interaction.reply({
        content: `🧭 Mode set to **${value}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const current = await mem.getMode({ userId, guildId }) || '(auto)';
    return interaction.reply({
      content: `🧭 Current mode: **${current}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
};

