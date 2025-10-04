// commands/mode.js
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const modeHelper = require('../lib/modes');

const THREAD_TYPES = new Set([
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

function humanizeMode(key) {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const PRIMARY_MODE_CHOICES = modeHelper.PRIMARY_MODES.map((mode) => ({
  name: humanizeMode(mode),
  value: mode,
}));

const OPTIONAL_MODE_CHOICES = modeHelper.OPTIONAL_MODES.map((mode) => ({
  name: humanizeMode(mode),
  value: mode,
}));

const RATING_MODE_CHOICES = modeHelper.RATING_MODES.map((mode) => ({
  name: mode === 'rating_unrated' ? 'Unrated' : 'Rated PG-13',
  value: mode,
}));

const ALL_MODE_CHOICES = [...PRIMARY_MODE_CHOICES, ...OPTIONAL_MODE_CHOICES, ...RATING_MODE_CHOICES];

function formatModes(state) {
  return modeHelper.MODE_KEYS.map((mode) => `${mode}: ${state[mode] ? '✅' : '❌'}`).join(' | ');
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
  let targetType;
  if (target.type === ChannelType.GuildCategory) targetType = 'category';
  else if (THREAD_TYPES.has(target.type)) targetType = 'thread';
  else targetType = 'channel';
  return { target, targetType };
}

function gatherParentRefs(interaction, target, targetType) {
  const refs = [];
  if (targetType === 'category') return refs;

  if (targetType === 'channel') {
    if (target.parentId) {
      refs.push({ targetId: target.parentId, targetType: 'category' });
    }
    return refs;
  }

  if (targetType === 'thread') {
    if (target.parentId) {
      refs.push({ targetId: target.parentId, targetType: 'channel' });
      const parentChannel = interaction.guild.channels.cache.get(target.parentId);
      if (parentChannel?.parentId) {
        refs.push({ targetId: parentChannel.parentId, targetType: 'category' });
      }
    }
  }

  return refs;
}

function friendlyLabelFromSummary(interaction, label) {
  const [type, id] = label.split(':');
  if (type === 'category') {
    const category = interaction.guild.channels.cache.get(id);
    return category?.name ? `category **${category.name}**` : `category ${id}`;
  }
  if (type === 'channel' || type === 'thread') {
    return `<#${id}>`;
  }
  return `${type} ${id}`;
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
            .setName('primary_mode')
            .setDescription('Primary Mode')
            .addChoices(...PRIMARY_MODE_CHOICES),
        )
        .addStringOption((opt) =>
          opt
            .setName('optional_mode')
            .setDescription('Optional Mode')
            .addChoices(...OPTIONAL_MODE_CHOICES),
        )
        .addStringOption((opt) =>
          opt
            .setName('rating_mode')
            .setDescription('Safety profile (requires Chat + Personality)')
            .addChoices(...RATING_MODE_CHOICES),
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
            .addChoices(...ALL_MODE_CHOICES),
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
        const primaryMode = interaction.options.getString('primary_mode');
        const optionalMode = interaction.options.getString('optional_mode');
        const ratingMode = interaction.options.getString('rating_mode');
        const modeList = [primaryMode, optionalMode, ratingMode].filter(Boolean);
        const actorHasManageGuild =
          interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ?? false;

        if (operation !== 'clear' && !modeList.length) {
          return interaction.editReply({ content: '❌ Select at least one mode to apply.' });
        }

        const result = modeHelper.setModes({
          guildId,
          targetId: target.id,
          targetType,
          modes: modeList,
          operation,
          actorHasManageGuild,
        });

        const label = describeTarget(target, targetType);
        if (operation === 'clear') {
          return interaction.editReply({
            content: `🧹 Cleared all modes for ${label}.\nCurrent: ${formatModes(result.modes.modes)}`,
          });
        }

        const verb =
          operation === 'remove' ? 'Removed' : operation === 'replace' ? 'Replaced with' : 'Merged';
        const summaryModes = modeList.join(', ');
        const ratingActive = modeHelper.RATING_MODES.find((mode) => result.modes.modes[mode]);
        return interaction.editReply({
          content: [
            `📂 ${verb} [${summaryModes}] for ${label}.`,
            `Current: ${formatModes(result.modes.modes)}`,
            ratingMode && !ratingActive
              ? 'ℹ️ Ratings require Chat and Personality to remain enabled.'
              : undefined,
          ]
            .filter(Boolean)
            .join('\n'),
        });
      }

      if (sub === 'view') {
        const { target, targetType } = resolveTarget(interaction);
        const parents = gatherParentRefs(interaction, target, targetType);
        const summary = modeHelper.viewModes({
          guildId,
          targetId: target.id,
          targetType,
          parents,
        });

        const label = describeTarget(target, targetType);
        const lines = [`🔎 Direct modes for ${label}: ${formatModes(summary.direct.modes)}.`];
        if (summary.inherited.length) {
          lines.push('Inherited:');
          for (const entry of summary.inherited) {
            const friendly = friendlyLabelFromSummary(interaction, entry.label);
            lines.push(`• ${friendly}: ${formatModes(entry.modes)}`);
          }
        } else {
          lines.push('Inherited: none.');
        }
        lines.push(`Effective: ${formatModes(summary.effective.modes)}.`);

        return interaction.editReply({ content: lines.join('\n') });
      }

      if (sub === 'list') {
        requireAdmin(interaction);
        const scope = interaction.options.getString('scope') || undefined;
        const filter = interaction.options.getString('filter') || undefined;
        const filterMode = interaction.options.getString('mode') || undefined;
        const rows = modeHelper.listModes({
          guildId,
          scope,
          presenceFilter: filter,
          presenceMode: filterMode,
        });
        if (!rows.length) {
          return interaction.editReply({
            content: '📭 No explicit channel or category overrides set.',
          });
        }

        const lines = rows.map((entry) => {
          const friendly = friendlyLabelFromSummary(interaction, entry.label);
          return `• ${friendly}: ${formatModes(entry.modes)}`;
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
