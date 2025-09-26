// commands/mode.js
const { SlashCommandBuilder } = require('discord.js');
const memory = require('../lib/memory');

// UI presets (Phase-1 voices); memory.VALID_MODES still accepts legacy values.
const MODE_CHOICES = ['mentor', 'partner', 'mirror', 'operator'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mode')
    .setDescription('Get or set this channel’s mode.')
    .addStringOption(o =>
      o.setName('value')
        .setDescription(`One of: ${MODE_CHOICES.join(', ')}, or leave blank to view`)
        .setRequired(false)
        .addChoices(...MODE_CHOICES.map(v => ({ name: v, value: v })))
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const raw = interaction.options.getString('value');
    const val = typeof raw === 'string' ? raw.trim().toLowerCase() : null;

    // GET (no value supplied)
    if (!val) {
      const cur = await memory.getMode(guildId, channelId);
      return interaction.reply({
        content: `Mode here: **${cur ?? 'not set'}**`,
        flags: 64, // ephemeral
      });
    }

    // SET
    if (!memory.VALID_MODES.includes(val)) {
      const allowed = MODE_CHOICES.join(', ');
      return interaction.reply({
        content: `Invalid mode. Allowed: ${allowed}`,
        flags: 64,
      });
    }

    try {
      await memory.setMode(guildId, channelId, val);
    } catch (err) {
      console.error('/mode set error:', err);
      return interaction.reply({
        content: 'Could not persist that mode — please try again in a moment.',
        flags: 64,
      });
    }

    return interaction.reply({
      content: `Mode set to **${val}** for this channel.`,
      flags: 64,
    });
  },
};
