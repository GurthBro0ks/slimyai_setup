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

const PROFILE_CHOICES = [
  { name: 'Chat · Personality · Rated', value: 'chat|personality|rated' },
  { name: 'Chat · Personality · Unrated', value: 'chat|personality|unrated' },
  { name: 'Chat · No Personality · Rated', value: 'chat|no_personality|rated' },
  { name: 'Chat · No Personality · Unrated', value: 'chat|no_personality|unrated' },
  { name: 'Super Snail · Personality · Rated', value: 'super_snail|personality|rated' },
  { name: 'Super Snail · Personality · Unrated', value: 'super_snail|personality|unrated' },
  { name: 'Super Snail · No Personality · Rated', value: 'super_snail|no_personality|rated' },
  { name: 'Super Snail · No Personality · Unrated', value: 'super_snail|no_personality|unrated' },
  { name: 'Clear (remove all modes)', value: 'clear' },
];

const PROFILE_LABEL = PROFILE_CHOICES.reduce((map, choice) => {
  map[choice.value] = choice.name;
  return map;
}, {});

const FILTER_MODE_CHOICES = [
  { name: 'Chat', value: 'chat' },
  { name: 'Super Snail', value: 'super_snail' },
  { name: 'Personality', value: 'personality' },
  { name: 'No Personality', value: 'no_personality' },
  { name: 'Rated PG-13', value: 'rating_pg13' },
  { name: 'Unrated', value: 'rating_unrated' },
];

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
            .setName('profile')
            .setDescription('Select mode profile')
            .setRequired(true)
            .addChoices(...PROFILE_CHOICES),
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
            .addChoices(...FILTER_MODE_CHOICES),
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
        const profile = interaction.options.getString('profile', true);
        const actorHasManageGuild =
          interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild) ?? false;
        const label = describeTarget(target, targetType);

        if (profile === 'clear') {
          modeHelper.setModes({
            guildId,
            targetId: target.id,
            targetType,
            modes: [],
            operation: 'clear',
            actorHasManageGuild,
          });
          return interaction.editReply({
            content: `🧹 Cleared all modes for ${label}.`,
          });
        }

        const definition = PROFILE_LABEL[profile] ? profile.split('|') : null;
        if (!definition || definition.length !== 3) {
          return interaction.editReply({ content: '❌ Unknown profile selected.' });
        }

        const [primaryKey, personalityKey, ratingKey] = definition;
        const personaMode = personalityKey === 'personality' ? 'personality' : 'no_personality';
        const ratingMode = ratingKey === 'rated' ? 'rating_pg13' : 'rating_unrated';

        modeHelper.setModes({
          guildId,
          targetId: target.id,
          targetType,
          modes: [primaryKey, personaMode, ratingMode],
          operation: 'merge',
          actorHasManageGuild,
        });

        const personaToRemove = personaMode === 'personality' ? 'no_personality' : 'personality';
        modeHelper.setModes({
          guildId,
          targetId: target.id,
          targetType,
          modes: [personaToRemove],
          operation: 'remove',
          actorHasManageGuild,
        });

        const ratingToRemove = ratingMode === 'rating_pg13' ? 'rating_unrated' : 'rating_pg13';
        modeHelper.setModes({
          guildId,
          targetId: target.id,
          targetType,
          modes: [ratingToRemove],
          operation: 'remove',
          actorHasManageGuild,
        });

        const otherPrimary = primaryKey === 'chat' ? 'super_snail' : 'chat';
        modeHelper.setModes({
          guildId,
          targetId: target.id,
          targetType,
          modes: [otherPrimary],
          operation: 'remove',
          actorHasManageGuild,
        });

        const parents = gatherParentRefs(interaction, target, targetType);
        const summary = modeHelper.viewModes({
          guildId,
          targetId: target.id,
          targetType,
          parents,
        });

        const profileLabel = PROFILE_LABEL[profile] || 'Selected profile';
        const lines = [
          `📂 Applied **${profileLabel}** to ${label}.`,
          `Direct: ${formatModes(summary.direct.modes)}`,
        ];
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
