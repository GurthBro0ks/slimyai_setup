// commands/mode.js
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const { setModes, viewModes, listModes, formatModeState } = TEST
  ? stubs.modes
  : require("../lib/modes.js");

const MODE_PROFILES = [
  {
    key: "chat|personality|rating_pg13",
    label: "Chat · Personality · Rated PG-13",
  },
  {
    key: "chat|personality|rating_unrated",
    label: "Chat · Personality · Unrated",
  },
  {
    key: "chat|no_personality|rating_pg13",
    label: "Chat · No Personality · Rated PG-13",
  },
  {
    key: "chat|no_personality|rating_unrated",
    label: "Chat · No Personality · Unrated",
  },
  {
    key: "super_snail|personality|rating_pg13",
    label: "Super Snail · Personality · Rated PG-13",
  },
  {
    key: "super_snail|personality|rating_unrated",
    label: "Super Snail · Personality · Unrated",
  },
  {
    key: "super_snail|no_personality|rating_pg13",
    label: "Super Snail · No Personality · Rated PG-13",
  },
  {
    key: "super_snail|no_personality|rating_unrated",
    label: "Super Snail · No Personality · Unrated",
  },
];

const PROFILE_CHOICE_MAP = new Map(
  MODE_PROFILES.map((profile) => [profile.key, profile]),
);
PROFILE_CHOICE_MAP.set("clear", { key: "clear", label: "Clear all modes" });

const PROFILE_CHOICES = [
  ...MODE_PROFILES.map((profile) => ({
    name: profile.label,
    value: profile.key,
  })),
  { name: "Clear (remove all modes)", value: "clear" },
];

const LIST_FILTER_CHOICES = [
  { name: "All configurations", value: "all" },
  { name: "Chat enabled", value: "chat" },
  { name: "Super Snail enabled", value: "super_snail" },
  { name: "Personality enabled", value: "personality" },
  { name: "No Personality enabled", value: "no_personality" },
  { name: "Rated PG-13", value: "rating_pg13" },
  { name: "Unrated", value: "rating_unrated" },
];

function resolveTargetAndParents(interaction, channelOption, categoryOption) {
  let target = channelOption || interaction.channel;
  let targetType = "channel";
  const parents = [];

  if (categoryOption) {
    target = categoryOption;
    targetType = "category";
  } else if (target?.isThread?.()) {
    targetType = "thread";
    if (target.parentId) {
      parents.push({ targetId: target.parentId, targetType: "channel" });
      const parentChannel = interaction.guild.channels.cache.get(
        target.parentId,
      );
      if (parentChannel?.parentId) {
        parents.push({
          targetId: parentChannel.parentId,
          targetType: "category",
        });
      }
    }
  } else if (
    target?.type === ChannelType.GuildText ||
    target?.type === ChannelType.GuildVoice
  ) {
    if (target.parentId) {
      parents.push({ targetId: target.parentId, targetType: "category" });
    }
  }

  if (!target) {
    throw new Error("Unable to resolve target channel.");
  }

  return { target, targetType, parents };
}

function formatTargetLabel(interaction, type, id) {
  if (type === "category") {
    const category = interaction.guild.channels.cache.get(id);
    return category ? `category **${category.name}**` : `category ${id}`;
  }
  if (type === "channel" || type === "thread") {
    return `<#${id}>`;
  }
  return `${type} ${id}`;
}

async function handleSet(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const profileKey = interaction.options.getString("profile", true);
  const channelOption = interaction.options.getChannel("channel");
  const categoryOption = interaction.options.getChannel("category");

  const { target, targetType, parents } = resolveTargetAndParents(
    interaction,
    channelOption,
    categoryOption,
  );

  const profile = PROFILE_CHOICE_MAP.get(profileKey);
  if (!profile) {
    throw new Error("Unknown profile selected.");
  }

  if (profile.key === "clear") {
    setModes({
      guildId: interaction.guildId,
      targetId: target.id,
      targetType,
      modes: [],
      operation: "clear",
      actorHasManageGuild: true,
    });

    return interaction.editReply({
      content: `🧹 Cleared all modes for ${formatTargetLabel(interaction, targetType, target.id)}.`,
    });
  }

  const [primary, personality, rating] = profile.key.split("|");
  const modes = [primary, personality, rating];

  setModes({
    guildId: interaction.guildId,
    targetId: target.id,
    targetType,
    modes,
    operation: "replace",
    actorHasManageGuild: true,
  });

  const view = viewModes({
    guildId: interaction.guildId,
    targetId: target.id,
    targetType,
    parents,
  });

  const lines = [
    `📂 Applied **${profile.label}** to ${formatTargetLabel(interaction, targetType, target.id)}.`,
    "",
    `**Direct:** ${formatModeState(view.direct.modes)}`,
  ];

  if (view.inherited.length) {
    lines.push("");
    lines.push("**Inherited:**");
    for (const entry of view.inherited) {
      const [type, id] = entry.label.split(":");
      lines.push(
        `${formatTargetLabel(interaction, type, id)}: ${formatModeState(entry.modes)}`,
      );
    }
  } else {
    lines.push("");
    lines.push("**Inherited:** none");
  }

  lines.push("");
  lines.push(`**Effective:** ${formatModeState(view.effective.modes)}`);

  return interaction.editReply({ content: lines.join("\n") });
}

async function handleView(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const channelOption = interaction.options.getChannel("channel");
  const { target, targetType, parents } = resolveTargetAndParents(
    interaction,
    channelOption,
    null,
  );

  const view = viewModes({
    guildId: interaction.guildId,
    targetId: target.id,
    targetType,
    parents,
  });

  const lines = [
    `📋 Mode configuration for ${formatTargetLabel(interaction, targetType, target.id)}`,
    "",
    `**Direct:** ${formatModeState(view.direct.modes)}`,
  ];

  if (view.inherited.length) {
    lines.push("");
    lines.push("**Inherited:**");
    for (const entry of view.inherited) {
      const [type, id] = entry.label.split(":");
      lines.push(
        `${formatTargetLabel(interaction, type, id)}: ${formatModeState(entry.modes)}`,
      );
    }
  } else {
    lines.push("");
    lines.push("**Inherited:** none");
  }

  lines.push("");
  lines.push(`**Effective:** ${formatModeState(view.effective.modes)}`);

  return interaction.editReply({ content: lines.join("\n") });
}

async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const filter = interaction.options.getString("filter") || "all";

  const presenceFilter = filter === "all" ? null : "has";
  const presenceMode = filter === "all" ? null : filter;

  const entries = listModes({
    guildId: interaction.guildId,
    scope: "guild",
    presenceMode,
    presenceFilter,
  });

  if (!entries.length) {
    return interaction.editReply("📭 No mode configurations found.");
  }

  const lines = [`📋 Mode configurations (${filter})`, ""];
  for (const entry of entries) {
    const [type, id] = entry.label.split(":");
    lines.push(`${formatTargetLabel(interaction, type, id)}`);
    lines.push(`  ${formatModeState(entry.modes)}`);
  }

  return interaction.editReply({ content: lines.join("\n") });
}

async function handleClear(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const channelOption = interaction.options.getChannel("channel");
  const { target, targetType } = resolveTargetAndParents(
    interaction,
    channelOption,
    null,
  );

  setModes({
    guildId: interaction.guildId,
    targetId: target.id,
    targetType,
    modes: [],
    operation: "clear",
    actorHasManageGuild: true,
  });

  return interaction.editReply({
    content: `✅ All modes cleared from ${formatTargetLabel(interaction, targetType, target.id)}`,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mode")
    .setDescription("[Admin] Manage slimy.ai modes")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Select a profile for this channel/category")
        .addStringOption((opt) =>
          opt
            .setName("profile")
            .setDescription("Mode profile")
            .setRequired(true)
            .addChoices(...PROFILE_CHOICES),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to modify (defaults to current)"),
        )
        .addChannelOption((opt) =>
          opt
            .setName("category")
            .setDescription("Category to modify (overrides channel)")
            .addChannelTypes(ChannelType.GuildCategory),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("View the active modes here")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to inspect (defaults to current)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List mode configurations in the guild")
        .addStringOption((opt) =>
          opt
            .setName("filter")
            .setDescription("Filter by mode presence")
            .addChoices(...LIST_FILTER_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Remove all modes from a channel/category")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to clear (defaults to current)"),
        ),
    ),

  async execute(interaction) {
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === "set") return handleSet(interaction);
      if (sub === "view") return handleView(interaction);
      if (sub === "list") return handleList(interaction);
      if (sub === "clear") return handleClear(interaction);
      throw new Error("Unknown subcommand.");
    } catch (error) {
      console.error("Mode command error:", error);
      const message = error?.message || "Unexpected error.";
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: `❌ ${message}` });
      }
      return interaction.reply({ content: `❌ ${message}`, ephemeral: true });
    }
  },
};
