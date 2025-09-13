// setup_roles_and_structure.js
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const P = PermissionsBitField.Flags;

// ----- Roles you want created -----
const ROLE_CONFIG = [
  { name: 'admin',      color: 0xff3366, perms: [P.Administrator] },
  { name: 'builders',   color: 0x00c2ff, perms: [P.ManageChannels, P.ManageThreads, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory] },
  { name: 'testers',    color: 0x8be37f, perms: [] },
  { name: 'snail_team', color: 0xf3b13d, perms: [] },
  { name: 'observers',  color: 0x9ca3af, perms: [] }, // read-only via overwrites
];

// ----- Server structure (categories -> channels) -----
const STRUCT = [
  { cat: 'about_slimyai', chans: [
    ['welcome_md','text'],
    ['about_slimy_txt','text'],
    ['roadmap_v1_md','text'],
    ['modes_and_commands_md','text'],
    ['branding_style_css','text'],
    ['faq_forum_exe','forum', { tags: ['commands','snail','dev_ops','general'] }],
  ]},
  { cat: 'planning', chans: [
    ['announcements_log','text'],
    ['planning_forum_exe','forum', { tags: ['phase1','phase2','phase3','phase4','docs'] }],
  ]},
  { cat: 'bot_lab', chans: [
    ['phase1_forum_exe','forum', { tags: ['pass','fail','needs_review'] }],
    ['phase2_forum_exe','forum', { tags: ['pass','fail','needs_review'] }],
    ['phase3_forum_exe','forum', { tags: ['pass','fail','needs_review'] }],
    ['phase4_forum_exe','forum', { tags: ['pass','fail','needs_review'] }],
  ]},
  { cat: 'testing_grounds', chans: [
    ['bug_tracker_forum_exe','forum', { tags: ['open','fixed','duplicate','needs_test'] }],
    ['feature_requests_forum_exe','forum', { tags: ['idea','approved','in_progress','deferred'] }],
    ['playground_tmp','text'],
    ['sandbox_env','text'],
  ]},
  { cat: 'dev_ops', chans: [
    ['commit_feed_log','text'],
    ['deploy_logs_log','text'],
    ['ci_pipeline_log','text'],
  ]},
  { cat: 'team_corner', chans: [
    ['general_chat_txt','text'],
    ['voice_huddle_vc','voice'], // single voice channel for entire server
  ]},
  { cat: 'snail_lab', chans: [
    ['snail_overview_md','text'],
    ['snail_resources_md','text'],
    ['snail_math_den_forum_exe','forum', { tags: ['verified','approx','needs_data','model_update'] }],
    ['snail_analysis_forum_exe','forum', { tags: ['pass','fail','needs_review','dataset'] }],
  ]},
];

// ----- Observer read-only baseline (applied to most categories) -----
const OBSERVER_DENIES = [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads];

// Helpers
async function ensureRole(guild, { name, color, perms }) {
  const existing = guild.roles.cache.find(r => r.name === name);
  if (existing) return existing;
  return guild.roles.create({ name, color, permissions: perms });
}

async function ensureCategory(guild, name) {
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
  if (existing) return existing;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function ensureChannel(guild, parentId, [name, kind, opts]) {
  const typeMap = {
    text: ChannelType.GuildText,
    voice: ChannelType.GuildVoice,
    forum: ChannelType.GuildForum
  };
  const type = typeMap[kind];

  // try find existing in this parent
  const existing = guild.channels.cache.find(
    c => c.parentId === parentId && c.name === name && c.type === type
  );
  if (existing) return existing;

  const data = { name, type, parent: parentId };
  if (type === ChannelType.GuildForum) {
    data.availableTags = (opts?.tags || []).map(t => ({ name: t }));
    data.defaultAutoArchiveDuration = 4320; // 3 days
  }
  return guild.channels.create(data);
}

async function setForumTagsIfNeeded(channel, tags) {
  if (channel.type !== ChannelType.GuildForum || !tags?.length) return;
  // Merge existing + desired by name, avoid dupes
  const wanted = new Map(tags.map(t => [t, true]));
  const have = new Map((channel.availableTags || []).map(t => [t.name, t]));
  const merged = [...new Set([...(channel.availableTags||[]).map(t=>t.name), ...tags])]
    .map(name => have.get(name) || { name });
  if (merged.length !== (channel.availableTags||[]).length || merged.some((t,i)=>t.name !== (channel.availableTags||[])[i]?.name)) {
    try { await channel.setAvailableTags(merged); } catch {}
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.roles.fetch(); // warm cache

    // 1) Ensure roles
    const roles = {};
    for (const cfg of ROLE_CONFIG) {
      roles[cfg.name] = await ensureRole(guild, cfg);
    }
    const everyone = guild.roles.everyone;

    // 2) Build categories + channels
    for (const block of STRUCT) {
      const category = await ensureCategory(guild, block.cat);

      // 2a) Default overwrites per category
      // Observers: read-only everywhere except snail_lab visibility special-cased below
      const overwrites = [
        { id: roles.observers.id, allow: [P.ViewChannel], deny: OBSERVER_DENIES },
      ];

      // Special isolation for snail_lab
      if (block.cat === 'snail_lab') {
        overwrites.push(
          { id: everyone.id, deny: [P.ViewChannel] },
          { id: roles.snail_team.id, allow: [P.ViewChannel, P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads, P.AttachFiles, P.EmbedLinks, P.ReadMessageHistory] },
          { id: roles.builders.id, allow: [P.ViewChannel, P.ManageThreads, P.SendMessages, P.CreatePublicThreads, P.SendMessagesInThreads, P.AttachFiles, P.EmbedLinks, P.ReadMessageHistory] },
          { id: roles.admin.id, allow: [P.ViewChannel] }, // admin has Administrator anyway
        );
      }

      // Apply category overwrites (idempotent-ish)
      if (overwrites.length) {
        await category.permissionOverwrites.set(overwrites).catch(()=>{});
      }

      // 2b) Create channels under the category
      for (const ch of block.chans) {
        const channel = await ensureChannel(guild, category.id, ch);

        // For forums, ensure tags (also if preexisting)
        if (ch[1] === 'forum') {
          const tags = ch[2]?.tags || [];
          await setForumTagsIfNeeded(channel, tags);

          // For observers: enforce read-only at channel-level as well
          await channel.permissionOverwrites.edit(roles.observers.id, {
            ViewChannel: true,
            SendMessages: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
            SendMessagesInThreads: false,
          }).catch(()=>{});
        }
      }
    }

    console.log('✅ Roles, categories, perms, and forum tags are in place.');
  } catch (err) {
    console.error('Setup error:', err);
  } finally {
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
