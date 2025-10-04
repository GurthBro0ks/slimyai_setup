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
const MODE_SET = new Set(MODE_CHOICES.map((m) => m.value));

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
            .setDescription('Primary mode to affect')
            .addChoices(...MODE_CHOICES),
        )
        .addStringOption((opt) =>
          opt
            .setName('mode_2')
            .setDescription('Optional additional mode')
            .addChoices(...MODE_CHOICES),
        )
        .addStringOption((opt) =>
          opt
            .setName('mode_3')
            .setDescription('Optional additional mode')
            .addChoices(...MODE_CHOICES),
        )
        .addStringOption((opt) =>
          opt
            .setName('mode_4')
            .setDescription('Optional additional mode')
            .addChoices(...MODE_CHOICES),
        )
        .addStringOption((opt) =>
          opt
            .setName('operation')
            .setDescription('How to apply the provided modes')
            .addChoices(
              { name: 'merge (enable in addition to current)', value: 'merge' },
              { name: 'replace (overwrite with provided modes)', value: 'replace' },
              { name: 'remove (disable provided modes)', value: 'remove' },
              { name: 'clear (remove all modes)', value: 'clear' },
            ),
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
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
              ChannelType.AnnouncementThread,
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
              ChannelType.PublicThread,
              ChannelType.PrivateThread,
              ChannelType.AnnouncementThread,
              ChannelType.GuildCategory,
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List all explicit mode overrides in this server')
        .addStringOption((opt) =>
          opt
            .setName('scope')
            .setDescription('Limit output to specific targets')
            .addChoices(
              { name: 'Guild (all)', value: 'guild' },
              { name: 'Categories only', value: 'category' },
              { name: 'Channels only', value: 'channel' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('filter')
            .setDescription('Filter by mode presence')
            .addChoices(
              { name: 'Has mode', value: 'has' },
              { name: 'Missing mode', value: 'missing' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('Mode to use for filtering (optional)')
            .addChoices(...MODE_CHOICES),
        ),
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
        const operation = interaction.options.getString('operation') || 'merge';
        const rawModes = [
          interaction.options.getString('mode'),
          interaction.options.getString('mode_2'),
          interaction.options.getString('mode_3'),
          interaction.options.getString('mode_4'),
        ].filter(Boolean);

        const seen = new Set();
        const modeList = rawModes.filter((mode) => {
          if (!mode || !MODE_SET.has(mode)) return false;
          if (seen.has(mode)) return false;
          seen.add(mode);
          return true;
        });

        if (operation === 'clear') {
          const cleared = await mem.clearChannelModes({
            guildId,
            targetId: target.id,
            targetType,
          });
          return interaction.editReply({
            content: `🧹 Cleared all modes for ${describeTarget(target, targetType)}.\nCurrent: ${formatModes(cleared)}`,
          });
        }

        if (!modeList.length) {
          return interaction.editReply({
            content: '❌ Select at least one mode to apply.',
          });
        }

        const applied = await mem.patchChannelModes({
          guildId,
          targetId: target.id,
          targetType,
          modes: modeList,
          operation,
        });

        const summaryModes = modeList.join(', ');
        const verb = operation === 'remove' ? 'Removed' : operation === 'replace' ? 'Replaced with' : 'Merged';
        return interaction.editReply({
          content: `📂 ${verb} [${summaryModes}] for ${describeTarget(target, targetType)}.\nCurrent: ${formatModes(applied)}`,
        });
      }

      if (sub === 'view') {
        const { target, targetType } = resolveTarget(interaction);
        const direct = await mem.getChannelModes({
          guildId,
          targetId: target.id,
          targetType,
        });

        const effective = await mem.getEffectiveModes({
          guildId,
          channelId: targetType === 'channel' ? target.id : undefined,
          parentId: targetType === 'channel' ? target.parentId : target.id,
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
          content: `🔎 Direct modes for ${describeTarget(target, targetType)}: ${formatModes(direct)}.\nEffective (with inheritance): ${formatModes(effective)}.${parentLine}`,
        });
      }

      if (sub === 'list') {
        requireAdmin(interaction);
        const scope = interaction.options.getString('scope') || 'guild';
        const filter = interaction.options.getString('filter');
        const filterMode = interaction.options.getString('mode');
        const rows = await mem.listChannelModes({ guildId });
        if (!rows.length) {
          return interaction.editReply({
            content: '📭 No explicit channel or category overrides set.',
          });
        }

        const filtered = rows.filter((row) => {
          if (scope === 'category' && row.targetType !== 'category') return false;
          if (scope === 'channel' && row.targetType !== 'channel') return false;
          if (!filter || !filterMode) return true;
          const isActive = !!row.modes[filterMode];
          return filter === 'has' ? isActive : !isActive;
        });

        if (!filtered.length) {
          return interaction.editReply({
            content: '📭 No entries match that filter.',
          });
        }

        const lines = filtered
          .sort((a, b) => a.targetId.localeCompare(b.targetId))
          .map((row) => {
            const cached = interaction.guild?.channels?.cache?.get(row.targetId);
            const label =
              row.targetType === 'category'
                ? cached?.name
                  ? `category **${cached.name}**`
                  : `category ${row.targetId}`
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
