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
// commands/mode.js
const { SlashCommandBuilder } = require('discord.js');
const memory = require('../lib/memory');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mode')
    .setDescription('Get or set the channel mode')
    .addStringOption((opt) =>
      opt
        .setName('value')
        .setDescription('mentor | partner | mirror | operator')
        .setRequired(false)
        .addChoices(
          { name: 'mentor', value: 'mentor' },
          { name: 'partner', value: 'partner' },
          { name: 'mirror', value: 'mirror' },
          { name: 'operator', value: 'operator' },
        )
    ),

  async execute(interaction) {
    try {
      const wanted = interaction.options.getString('value');
      const channelId = interaction.channelId;

      if (!wanted) {
        const current = await memory.getMode(channelId);
        return interaction.reply({
          content: `Mode here: **${current ?? 'not set'}**`,
          flags: 64, // ephemeral replacement
        });
      }

      await memory.setMode(channelId, wanted);
      return interaction.reply({
        content: `Mode set to **${wanted}**`,
        flags: 64,
      });
    } catch (err) {
      console.error('❌ /mode error:', err);
      // Try not to crash the process on bad DB state
      const msg = err?.message ? `Error: ${err.message}` : 'Something went sideways.';
      if (interaction.deferred || interaction.replied) {
        return interaction.followUp({ content: msg, flags: 64 }).catch(()=>{});
      }
      return interaction.reply({ content: msg, flags: 64 }).catch(()=>{});
    }
  },
};

    const current = await mem.getMode({ userId, guildId }) || '(auto)';
    return interaction.reply({
      content: `🧭 Current mode: **${current}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
};

