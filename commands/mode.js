// commands/mode.js
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const mem = require('../lib/memory');

const MODE_CHOICES = [
  { name: 'admin', value: 'admin' },
  { name: 'personality', value: 'personality' },
  { name: 'no_personality', value: 'no_personality' },
  { name: 'super_snail', value: 'super_snail' },
];

function formatModes(modes) {
  return MODE_CHOICES.map(({ value }) => `${value}: ${modes[value] ? '✅' : '❌'}`).join(' | ');
}

function describeTarget(target, targetType) {
  if (targetType === 'category') {
    return target.name ? `category **${target.name}**` : `category ${target.id}`;
  }
  return `<#${target.id}>`;
}

function ensureGuild(interaction) {
  if (!interaction.guildId) {
    throw new Error('This command can only be used inside a server.');
  }
}

function requireAdmin(interaction) {
  const canManage = interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);
  if (!canManage) {
    throw new Error('Manage Guild permission required.');
  }
}

function resolveTarget(interaction) {
  const option = interaction.options.getChannel('target');
  const target = option || interaction.channel;
  if (!target) {
    throw new Error('Unable to resolve target channel.');
  }
  const targetType = target.type === ChannelType.GuildCategory ? 'category' : 'channel';
  return { target, targetType };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mode')
    .setDescription('Manage slimy.ai modes for channels or categories')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Enable or disable a mode')
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Which mode to toggle')
            .setRequired(true)
            .addChoices(...MODE_CHOICES),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('enabled')
            .setDescription('Enable (true) or disable (false) the mode')
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName('target')
            .setDescription('Channel or category (defaults to current channel)')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
              ChannelType.GuildForum,
              ChannelType.GuildMedia,
              ChannelType.GuildCategory,
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View active modes for a channel or category')
        .addChannelOption((opt) =>
          opt
            .setName('target')
            .setDescription('Channel or category (defaults to current channel)')
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
              ChannelType.GuildForum,
              ChannelType.GuildMedia,
              ChannelType.GuildCategory,
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all explicit mode overrides in this server'),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      ensureGuild(interaction);
      const guildId = interaction.guildId;
      const sub = interaction.options.getSubcommand(true);

      if (sub === 'set') {
        requireAdmin(interaction);
        const { target, targetType } = resolveTarget(interaction);
        const mode = interaction.options.getString('mode', true);
        const enabled = interaction.options.getBoolean('enabled', true);

        await mem.setChannelMode({
          guildId,
          targetId: target.id,
          targetType,
          mode,
          enabled,
        });

        const modes = await mem.getChannelModes({
          guildId,
          targetId: target.id,
          targetType,
        });

        return interaction.editReply({
          content: `📂 ${enabled ? 'Enabled' : 'Disabled'} **${mode}** for ${describeTarget(target, targetType)}.\nCurrent: ${formatModes(modes)}`,
        });
      }

      if (sub === 'view') {
        const { target, targetType } = resolveTarget(interaction);
        const direct = await mem.getChannelModes({
          guildId,
          targetId: target.id,
          targetType,
        });

        let parentLine = '';
        if (targetType === 'channel' && target.parentId) {
          const parentChannel = interaction.guild.channels.cache.get(target.parentId);
          const parentModes = await mem.getChannelModes({
            guildId,
            targetId: target.parentId,
            targetType: 'category',
          });
          const parentLabel = parentChannel
            ? describeTarget(parentChannel, 'category')
            : `category ${target.parentId}`;
          parentLine = `\nParent ${parentLabel} modes: ${formatModes(parentModes)}.`;
        }

        return interaction.editReply({
          content: `🔎 Modes for ${describeTarget(target, targetType)}: ${formatModes(direct)}.${parentLine}`,
        });
      }

      if (sub === 'list') {
        requireAdmin(interaction);
        const rows = await mem.listChannelModes({ guildId });
        if (!rows.length) {
          return interaction.editReply({
            content: '📭 No explicit channel or category overrides set.',
          });
        }

        const lines = rows
          .sort((a, b) => a.targetId.localeCompare(b.targetId))
          .map((row) => {
            const label =
              row.targetType === 'category'
                ? `category ${row.targetId}`
                : `<#${row.targetId}>`;
            return `• ${label}: ${formatModes(row.modes)}`;
          });

        return interaction.editReply({
          content: ['🗂 Mode overrides:', ...lines].join('\n'),
        });
      }

      return interaction.editReply({ content: '❌ Unknown subcommand.' });
    } catch (err) {
      const message = err?.message || 'Unexpected error';
      return interaction.editReply({ content: `❌ ${message}` });
    }
  },
};
