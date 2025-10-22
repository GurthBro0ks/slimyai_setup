// setup_roles_and_structure.js - MULTI-SERVER VERSION
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");

const P = PermissionsBitField.Flags;

// Accept GUILD_ID from CLI or environment
const TARGET_GUILD_ID =
  process.argv[2] || process.env.GUILD_ID || process.env.DISCORD_GUILD_ID;

if (!TARGET_GUILD_ID) {
  console.error("❌ Usage: node setup_roles_and_structure.js <GUILD_ID>");
  console.error("   Or set GUILD_ID in .env");
  process.exit(1);
}

// ----- Roles you want created -----
const ROLE_CONFIG = [
  { name: "admin", color: 0xff3366, perms: [P.Administrator] },
  {
    name: "builders",
    color: 0x00c2ff,
    perms: [
      P.ManageChannels,
      P.ManageThreads,
      P.EmbedLinks,
      P.AttachFiles,
      P.ReadMessageHistory,
    ],
  },
  { name: "testers", color: 0x8be37f, perms: [] },
  { name: "snail_team", color: 0xf3b13d, perms: [] },
  { name: "observers", color: 0x9ca3af, perms: [] },
];

// ----- Server structure -----
const STRUCT = [
  {
    cat: "about_slimyai",
    chans: [
      ["welcome_md", "text"],
      ["about_slimy_txt", "text"],
      ["roadmap_v1_md", "text"],
      ["modes_and_commands_md", "text"],
      ["branding_style_css", "text"],
      [
        "faq_forum_exe",
        "forum",
        { tags: ["commands", "snail", "dev_ops", "general"] },
      ],
    ],
  },
  {
    cat: "planning",
    chans: [
      ["announcements_log", "text"],
      [
        "planning_forum_exe",
        "forum",
        { tags: ["phase1", "phase2", "phase3", "phase4", "docs"] },
      ],
    ],
  },
  {
    cat: "bot_lab",
    chans: [
      ["phase1_forum_exe", "forum", { tags: ["pass", "fail", "needs_review"] }],
      ["phase2_forum_exe", "forum", { tags: ["pass", "fail", "needs_review"] }],
      ["phase3_forum_exe", "forum", { tags: ["pass", "fail", "needs_review"] }],
      ["phase4_forum_exe", "forum", { tags: ["pass", "fail", "needs_review"] }],
    ],
  },
  {
    cat: "testing_grounds",
    chans: [
      [
        "bug_tracker_forum_exe",
        "forum",
        { tags: ["open", "fixed", "duplicate", "needs_test"] },
      ],
      [
        "feature_requests_forum_exe",
        "forum",
        { tags: ["idea", "approved", "in_progress", "deferred"] },
      ],
      ["playground_tmp", "text"],
      ["sandbox_env", "text"],
    ],
  },
  {
    cat: "dev_ops",
    chans: [
      ["commit_feed_log", "text"],
      ["deploy_logs_log", "text"],
      ["ci_pipeline_log", "text"],
    ],
  },
  {
    cat: "team_corner",
    chans: [
      ["general_chat_txt", "text"],
      ["voice_huddle_vc", "voice"],
    ],
  },
  {
    cat: "snail_lab",
    chans: [
      ["snail_overview_md", "text"],
      ["snail_resources_md", "text"],
      [
        "snail_math_den_forum_exe",
        "forum",
        { tags: ["verified", "approx", "needs_data", "model_update"] },
      ],
      [
        "snail_analysis_forum_exe",
        "forum",
        { tags: ["pass", "fail", "needs_review", "dataset"] },
      ],
    ],
  },
];

const OBSERVER_DENIES = [
  P.SendMessages,
  P.CreatePublicThreads,
  P.CreatePrivateThreads,
  P.SendMessagesInThreads,
];

async function ensureRole(guild, { name, color, perms }) {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return existing;
  return guild.roles.create({ name, color, permissions: perms });
}

async function ensureCategory(guild, name) {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name,
  );
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function ensureChannel(guild, parentId, [name, kind, opts]) {
  const typeMap = {
    text: ChannelType.GuildText,
    voice: ChannelType.GuildVoice,
    forum: ChannelType.GuildForum,
  };
  const type = typeMap[kind];

  const existing = guild.channels.cache.find(
    (c) => c.parentId === parentId && c.name === name && c.type === type,
  );
  if (existing) return existing;

  const data = { name, type, parent: parentId };
  if (type === ChannelType.GuildForum) {
    data.availableTags = (opts?.tags || []).map((t) => ({ name: t }));
    data.defaultAutoArchiveDuration = 4320;
  }
  return guild.channels.create(data);
}

async function setForumTagsIfNeeded(channel, tags) {
  if (channel.type !== ChannelType.GuildForum || !tags?.length) return;
  const wanted = new Map(tags.map((t) => [t, true]));
  const have = new Map((channel.availableTags || []).map((t) => [t.name, t]));
  const merged = [
    ...new Set([...(channel.availableTags || []).map((t) => t.name), ...tags]),
  ].map((name) => have.get(name) || { name });
  if (merged.length !== (channel.availableTags || []).length) {
    try {
      await channel.setAvailableTags(merged);
    } catch {}
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    console.log(`🎯 Setting up guild: ${TARGET_GUILD_ID}`);
    const guild = await client.guilds.fetch(TARGET_GUILD_ID);
    await guild.roles.fetch();

    const roles = {};
    for (const cfg of ROLE_CONFIG) {
      roles[cfg.name] = await ensureRole(guild, cfg);
    }
    const everyone = guild.roles.everyone;

    for (const block of STRUCT) {
      const category = await ensureCategory(guild, block.cat);

      const overwrites = [
        { id: everyone.id, deny: [P.ViewChannel] },
        {
          id: roles.observers.id,
          allow: [P.ViewChannel],
          deny: OBSERVER_DENIES,
        },
        { id: roles.testers.id, allow: [P.ViewChannel] },
        { id: roles.builders.id, allow: [P.ViewChannel] },
        { id: roles.admin.id, allow: [P.ViewChannel] },
      ];

      if (block.cat === "snail_lab") {
        overwrites[0] = { id: everyone.id, deny: [P.ViewChannel] };
        overwrites[1] = { id: roles.observers.id, deny: [P.ViewChannel] };
        overwrites.push({ id: roles.snail_team.id, allow: [P.ViewChannel] });
      }

      await category.permissionOverwrites.set(overwrites);

      for (const chanDef of block.chans) {
        const chan = await ensureChannel(guild, category.id, chanDef);
        await setForumTagsIfNeeded(chan, chanDef[2]?.tags);
        console.log(`✅ ${block.cat}/${chan.name}`);
      }
    }

    console.log(`\n✨ Setup complete for guild ${TARGET_GUILD_ID}`);
    process.exit(0);
  } catch (e) {
    console.error("Setup failed:", e);
    process.exit(1);
  }
});

client.login(process.env.DISCORD_TOKEN);
