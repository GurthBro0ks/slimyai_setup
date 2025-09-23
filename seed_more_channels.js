// seed_more_channels.js
// Fills Planning, Bot Lab, Testing Grounds, Dev Ops, Team Corner, Snail Lab with pinned content + forum templates.
require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

const TEXT_TOPICS = {
  // planning
  announcements_log: 'release notes • goals • locked decisions • minimal chatter',
  // testing_grounds
  playground_tmp: 'freefire @mention tests • ephemeral chatter • rate-limit yourselves pls',
  sandbox_env: 'slash command testing • ephemeral replies preferred',
  // dev_ops
  commit_feed_log: 'git events • commits • PRs • merges • do not chat here',
  deploy_logs_log: 'deploy/rollback notes • versions • timestamps',
  ci_pipeline_log: 'CI runs • pass/fail • artifacts • coverage',
  // team_corner
  general_chat_txt: 'intros • social chat • light planning • be decent',
  // snail_lab
  snail_overview_md: 'snail scope • access • rules • current goals',
  snail_resources_md: 'links • sheets • data dictionary • pipelines',
};

const TEXT_CONTENT = {
  announcements_log: [
    '# announcements',
    '',
    '**purpose**: central, low-noise stream for project updates and locked decisions.',
    '',
    '## template',
    '### [YYYY-MM-DD] tag: short_title',
    '- change:',
    '- why:',
    '- action items:',
    '- owner:',
    '',
    '## recent',
    '- add items here as you ship',
  ].join('\n'),

  playground_tmp: [
    '# playground',
    '',
    '**purpose**: noisy @mention tests and casual pokes. use `/chat` for clean logs.',
    '',
    'rules:',
    '- don’t spam global pings',
    '- if you uncover a bug, file it in `bug_tracker_forum_exe`',
  ].join('\n'),

  sandbox_env: [
    '# sandbox',
    '',
    '**purpose**: slash command tests (`/chat`, `/mode`, etc.).',
    '',
    'try:',
    '- `/chat what’s our next milestone?`',
    '- `/mode operator` then `/chat give me a two-step plan`',
    '',
    'if something breaks, capture details and open a bug.',
  ].join('\n'),

  commit_feed_log: [
    '# commit feed',
    '',
    '**how to connect (GitHub example)**',
    '1) Channel → ⚙️ **Integrations** → **Webhooks** → **New Webhook** → copy URL.',
    '2) GitHub repo → **Settings → Webhooks → Add webhook**:',
    '   - Payload URL: paste Discord webhook URL',
    '   - Content type: application/json',
    '   - Events: Just the push event (or choose more)',
    '3) Save. Make a commit → expect a message here.',
    '',
    '_tip: prefer one-way feeds; chat about commits in threads elsewhere._',
  ].join('\n'),

  deploy_logs_log: [
    '# deploy logs',
    '',
    '**purpose**: short notes when you deploy/rollback.',
    '',
    '### template',
    '- time (UTC-5):',
    '- version/tag:',
    '- changes:',
    '- result: success | fail',
    '- follow-up:',
  ].join('\n'),

  ci_pipeline_log: [
    '# ci pipeline',
    '',
    '**purpose**: post CI runs (pass/fail, artifacts).',
    '',
    '### template',
    '- build #:',
    '- branch:',
    '- tests: 123/123 pass',
    '- artifacts: link',
    '- notes:',
  ].join('\n'),

  general_chat_txt: [
    '# general',
    '',
    'intros, vibes, coordination. deeper work belongs to forums.',
    '',
    '**intro template**',
    '- name:',
    '- what i break best:',
    '- time zone:',
    '- availability:',
  ].join('\n'),

  snail_overview_md: [
    '# snail lab overview',
    '',
    '**scope**: Super Snail math + OCR analysis → structured data → insights.',
    '',
    '**rules**',
    '- no PII/secrets in screenshots',
    '- keep calc threads focused; one topic per thread',
    '- tag correctly: `verified`, `approx`, `needs_data`, `model_update`',
    '',
    '**current goals**',
    '- validate OCR accuracy ≥ 98% on sample set',
    '- define resource growth model v1',
    '- wire Sheets sync w/ column contracts',
  ].join('\n'),

  snail_resources_md: [
    '# snail resources',
    '',
    '**links (add real URLs)**',
    '- master sheet:',
    '- sample images folder:',
    '- snelp/wiki index:',
    '',
    '**data dictionary (draft)**',
    '- `run_id`: string, monotonic, format `YYYYMMDD_HHMMSS_rand`',
    '- `image_id`: string, source filename',
    '- `ocr_confidence`: float [0..1]',
    '- `resource_type`: enum { gold, food, shell, … }',
    '- `value`: integer',
    '- `notes`: free text',
  ].join('\n'),
};

// Forum “Guidelines” (topic) text
const FORUM_TOPICS = {
  planning_forum_exe:
    'Use threads like files. Prefix: idea_v#_desc or design_v#_desc. Keep one idea per thread. Tags: phase1|phase2|phase3|phase4|docs.',
  phase1_forum_exe:
    'Phase 1 tests: conversational core. Thread name: test_v#_desc. Tags: pass|fail|needs_review.',
  phase2_forum_exe:
    'Phase 2 tests: personality & community. Thread name: test_v#_desc. Tags: pass|fail|needs_review.',
  phase3_forum_exe:
    'Phase 3 tests: image gen. Thread name: test_v#_desc. Tags: pass|fail|needs_review.',
  phase4_forum_exe:
    'Phase 4 tests: snail analysis. Thread name: test_v#_desc. Tags: pass|fail|needs_review.',
  bug_tracker_forum_exe:
    'One bug per thread. Name: bug_###_desc. Tags: open|fixed|duplicate|needs_test. Include repro steps + expected vs actual.',
  feature_requests_forum_exe:
    'One feature per thread. Name: feature_###_desc. Tags: idea|approved|in_progress|deferred. Include problem → proposal → impact.',
  snail_math_den_forum_exe:
    'Snail math threads. Name: calc_###_desc. Tags: verified|approx|needs_data|model_update. Show formulas + sample inputs.',
  snail_analysis_forum_exe:
    'Snail OCR/analysis runs. Name: analyze_###_desc. Tags: pass|fail|needs_review|dataset. Attach samples + metrics.',
  faq_forum_exe:
    'FAQ. One question per thread. Name: question_###_desc. Tags: commands|snail|dev_ops|general.',
};

// Template threads to create (locked)
const FORUM_TEMPLATES = [
  {
    forum: 'planning_forum_exe',
    name: 'idea_v0_template_do_not_edit',
    tag: 'docs',
    body: [
      '# idea template',
      '**context**: what problem are we trying to solve?',
      '**proposal**: the shape of the solution (non-technical OK)',
      '**impact**: who benefits, what improves',
      '**risks**: notable tradeoffs',
      '**measure**: how we’ll know it worked',
      '',
      '_copy this text into your own thread, don’t edit this template._',
    ].join('\n'),
  },
  {
    forum: 'planning_forum_exe',
    name: 'design_v0_template_do_not_edit',
    tag: 'docs',
    body: [
      '# design doc template',
      '**status**: draft',
      '**summary**:',
      '**requirements**:',
      '**non_goals**:',
      '**api/commands**:',
      '**data/storage**:',
      '**security/safety**:',
      '**rollout/metrics**:',
      '',
      '_copy this text into your own thread, don’t edit this template._',
    ].join('\n'),
  },

  // Bot Lab (Phase 1-4)
  ...[1,2,3,4].map(n => ({
    forum: `phase${n}_forum_exe`,
    name: 'test_v0_template_do_not_edit',
    tag: 'needs_review',
    body: [
      '# test run',
      '**build/version**:',
      '**goal**:',
      '**steps**:',
      '1.',
      '2.',
      '3.',
      '**expected**:',
      '**actual**:',
      '**artifacts**: (screens/logs)',
      '**result**: pass | fail | needs_review',
      '',
      '_copy this text into your own thread, don’t edit this template._',
    ].join('\n'),
  })),

  // Testing Grounds
  {
    forum: 'bug_tracker_forum_exe',
    name: 'bug_000_template_do_not_edit',
    tag: 'open',
    body: [
      '# bug report',
      '**title**: short_desc',
      '**env**: OS / app version / channel',
      '**steps to repro**:',
      '1.',
      '2.',
      '3.',
      '**expected**:',
      '**actual**:',
      '**attachments**: (screens/logs)',
      '**severity**: low | med | high',
      '',
      '_copy this text into your own thread, don’t edit this template._',
    ].join('\n'),
  },
  {
    forum: 'feature_requests_forum_exe',
    name: 'feature_000_template_do_not_edit',
    tag: 'idea',
    body: [
      '# feature request',
      '**problem**: what hurts today?',
      '**proposal**: what we want built',
      '**alternatives**: other approaches considered',
      '**impact**: who benefits / measurable outcome',
      '**dependencies**:',
      '',
      '_copy this text into your own thread, don’t edit this template._',
    ].join('\n'),
  },

  // Snail Lab
  {
    forum: 'snail_math_den_forum_exe',
    name: 'calc_000_template_do_not_edit',
    tag: 'needs_data',
    body: [
      '# calc thread',
      '**question**:',
      '**inputs**: (units!)',
      '**formula/approach**:',
      '**sample calc**:',
      '**result**:',
      '**confidence**: low | med | high',
      '',
      '_copy this text into your own thread, don’t edit this template._',
    ].join('\n'),
  },
  {
    forum: 'snail_analysis_forum_exe',
    name: 'analyze_000_template_do_not_edit',
    tag: 'dataset',
    body: [
      '# analysis run',
      '**dataset**: link / size',
      '**ocr params**:',
      '**metrics**: acc / precision / recall',
      '**notes**:',
      '**next**:',
      '',
      '_copy this text into your own thread, don’t edit this template._',
    ].join('\n'),
  },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.channels.fetch();

    const findText = (n)=> guild.channels.cache.find(c=>c.type===ChannelType.GuildText && c.name===n);
    const findForum= (n)=> guild.channels.cache.find(c=>c.type===ChannelType.GuildForum && c.name===n);

    // 1) Text channels: set topic + pin content (skip if header already there)
    for (const [name, topic] of Object.entries(TEXT_TOPICS)) {
      const ch = findText(name);
      if (!ch) { console.warn(`⚠️ missing text channel: ${name}`); continue; }

      try { if (ch.topic !== topic) await ch.setTopic(topic); } catch {}

      const body = TEXT_CONTENT[name];
      const header = body.split('\n')[0];
      let exists = false;
      try {
        const msgs = await ch.messages.fetch({ limit: 25 });
        exists = msgs.some(m => m.author?.id === client.user.id && typeof m.content === 'string' && m.content.startsWith(header));
      } catch {}
      if (!exists) {
        const msg = await ch.send(body);
        await sleep(300);
        await msg.pin().catch(()=>{});
        console.log(`✅ seeded + pinned: ${name}`);
      } else {
        console.log(`↪︎ already seeded: ${name}`);
      }
      await sleep(200);
    }

    // 2) Forums: set topic (Guidelines)
    for (const [forumName, topic] of Object.entries(FORUM_TOPICS)) {
      const forum = findForum(forumName);
      if (!forum) { console.warn(`⚠️ missing forum: ${forumName}`); continue; }
      try {
        if (forum.topic !== topic) {
          await forum.setTopic(topic);
          console.log(`✅ set guidelines: ${forumName}`);
        } else {
          console.log(`↪︎ guidelines ok: ${forumName}`);
        }
      } catch (e) {
        console.warn(`⚠️ setTopic failed: ${forumName}: ${e.message}`);
      }
      await sleep(150);
    }

    // 3) Create template threads (lock them)
    for (const t of FORUM_TEMPLATES) {
      const forum = findForum(t.forum);
      if (!forum) { console.warn(`⚠️ missing forum: ${t.forum}`); continue; }

      // avoid dupes: check active + archived
      const active = await forum.threads.fetchActive();
      const archived = await forum.threads.fetchArchived();
      const exists = [...active.threads.values(), ...archived.threads.values()]
        .some(th => th.name === t.name);

      if (exists) {
        console.log(`↪︎ template exists: ${t.forum}/${t.name}`);
        continue;
      }

      // tag id (optional)
      const tagId = (forum.availableTags || []).find(x => x.name.toLowerCase() === (t.tag||'').toLowerCase())?.id;
      const options = {
        name: t.name,
        message: { content: t.body },
        autoArchiveDuration: 4320,
      };
      if (tagId) options.appliedTags = [tagId];

      try {
        const thread = await forum.threads.create(options);
        // try to lock and archive template
        await sleep(300);
        await thread.setLocked(true).catch(()=>{});
        await thread.setArchived(true).catch(()=>{});
        console.log(`✅ template created: ${t.forum}/${t.name}`);
      } catch (e) {
        console.warn(`⚠️ create failed: ${t.forum}/${t.name}: ${e.message}`);
      }
      await sleep(300);
    }

    console.log('✅ Seeding complete.');
  } catch (err) {
    console.error('Seeder error:', err);
  } finally {
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
