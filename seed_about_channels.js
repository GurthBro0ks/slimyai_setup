// seed_about_channels.js
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ChannelType,
} = require('discord.js');

const TOPICS = {
  welcome_md: 'start here • roles • quick links • rules (light)',
  about_slimy_txt: 'what slimy.ai is • elevator pitch',
  roadmap_v1_md: 'current plan • living draft',
  modes_and_commands_md: 'how to drive slimy.ai • commands & modes',
  branding_style_css: 'name, watermark, colors, tone',
};

const CONTENT = {
  welcome_md: [
    '# 👋 welcome to slimy.ai',
    '',
    '**slimy.ai** is a Discord-native, multimodal AI built for small, fast teams who like to break things on purpose and then make them wonderful again.',
    '',
    '## quick start',
    '1) Read **about_slimy_txt** (what this is).',
    '2) Skim **roadmap_v1_md** (where we’re going).',
    '3) Peek **modes_and_commands_md** (how to drive).',
    '4) If you’re on the Snail squad, ask an admin for the `snail_team` role to see **snail_lab/**.',
    '',
    '## roles',
    '- **admin** – keys to the castle',
    '- **builders** – structure, configs, migrations, releases',
    '- **testers** – break things methodically',
    '- **snail_team** – Super Snail math/analysis',
    '- **observers** – read-only',
    '',
    '## house rules (light)',
    '- Be kind. Be specific. Use threads.',
    '- Tag forum posts correctly (`open`, `needs_review`, etc.).',
    '- No secrets in screenshots.',
    '- Bugs: one thread per bug. Repro > vibes.',
    '',
    '## quick links',
    '- ➜ **about_slimy_txt**',
    '- ➜ **roadmap_v1_md**',
    '- ➜ **modes_and_commands_md**',
    '- ➜ **testing_grounds/bug_tracker_forum_exe**',
    '',
    '*Tip: admins—pin this message.*',
  ].join('\n'),

  about_slimy_txt: [
    '# about slimy.ai',
    '',
    '**slimy.ai** is a Discord-native AI that adapts to your crew’s rhythm. It has four working modes and an opinionated focus on fast iteration, ADHD-friendly workflows, and creative tooling (image gen + game analysis).',
    '',
    '**modes**',
    '- **Mentor** – grounding, calm, resets when chaos spikes',
    '- **Partner-in-crime** – playful sparks, big ideas, dopamine fuel',
    '- **Mirror** – reflects patterns & tradeoffs clearly',
    '- **Operator** – organizes, plans, ships',
    '',
    '**scope**',
    '- Conversational core with memory',
    '- Per-channel personas + admin controls',
    '- Image generation with safety filters',
    '- Super Snail: OCR → Sheets → wiki/snelp enrichment',
    '',
    '**design values**',
    '- Small loops > long lectures',
    '- Clear status, crisp tags, humane defaults',
    '- “Repo” feel: channels as files, forums as folders',
  ].join('\n'),

  roadmap_v1_md: [
    '# roadmap v1 (living)',
    '',
    '_Last updated: 2025-09-11_',
    '',
    '## phase 1 — conversational core',
    '- Commands: `/chat`, `/mode`, `/remember`, `/forget`, `/export`',
    '- Memory: SQLite; auto-mode detection with jitter',
    '- Goal: ship scaffold + baseline safety',
    '',
    '**status:** building / early testing',
    '',
    '## phase 2 — personality & community',
    '- Per-channel personas (`/channel_config`), admin locks',
    '- Auto mode switching by context',
    '',
    '**status:** design in progress',
    '',
    '## phase 3 — image generation',
    '- `/imagine` + style presets, neon-blue watermark (bottom-left)',
    '- Safety filters, rate limits',
    '',
    '**status:** prototyping',
    '',
    '## phase 4 — super snail analysis',
    '- OCR screenshots → structured stats/resources → Google Sheets',
    '- Enrich with wiki/snelp; math tools for optimization',
    '',
    '**status:** research + data plumbing',
    '',
    '---',
    '',
    '### change log',
    '- 2025-09-11: initial publish of v1 roadmap',
    '- (append notable changes here)',
  ].join('\n'),

  modes_and_commands_md: [
    '# modes & commands',
    '',
    '## adaptive modes',
    '- **Mentor** – grounding guidance, short steps, resets',
    '- **Partner-in-crime** – creative riffs, speculative paths',
    '- **Mirror** – reflects your plan, highlights risks/assumptions',
    '- **Operator** – tight execution, checklists, ownership',
    '',
    'Switch with `/mode <mentor|partner|mirror|operator>`.',
    '',
    '## core commands (phase 1)',
    '- `/chat <question>` – ephemeral answer (clean for testing)',
    '- `/mode <name>` – lock a mode',
    '- `/remember <fact>` – add to memory',
    '- `/forget <fact>` – remove from memory',
    '- `/export` – dump memory',
    '',
    '## mentions',
    'If you @mention the bot in a text channel, it replies publicly. Use `/chat` for quieter testing.',
    '(When ready, we can route @mentions into threads automatically.)',
    '',
    '## posting etiquette',
    '- Use forums for bugs/features/tests; text channels for quick chatter.',
    '- One bug per thread. Repro steps, expected vs. actual, logs if possible.',
    '- Tag correctly (`open`, `needs_test`, etc.).',
  ].join('\n'),

  branding_style_css: [
    '# branding guide (v1)',
    '',
    'name: "slimy.ai" (always lowercase)',
    'watermark: neon-blue bottom-left; opacity ~0.7',
    '',
    'suggested colors',
    '- core-ink: #0f172a',
    '- core-bg:  #0b1020',
    '- accent:   #00d1ff',
    '- green:    #8BE37F  (pass/success)',
    '- amber:    #F3B13D  (warn/needs_review)',
    '- rose:     #FF3366  (error/fail)',
    '',
    'tone',
    '- plain language over jargon',
    '- short paragraphs; show steps',
    '- never leak secrets in examples',
    '',
    'doc conventions',
    '- filenames: snake_case',
    '- thread prefixes: bug_, feature_, test_, calc_, question_',
    '- numbers: zero-padded_3 (e.g., bug_042_memory_leak)',
  ].join('\n'),
};

const FAQ_THREADS = [
  {
    name: 'question_001_how_to_join_snail_team',
    tag: 'snail',
    body: [
      '**Q:** How do I get access to the Snail lab?',
      '**A:** Ask an admin for the `snail_team` role. Once granted, you’ll see **snail_lab/** with math + analysis forums. Keep data clean and avoid PII in screenshots.',
    ].join('\n'),
  },
  {
    name: 'question_002_how_to_report_a_bug',
    tag: 'general',
    body: [
      '**Q:** How do I report a bug?',
      '**A:** Post in **testing_grounds/bug_tracker_forum_exe** using `bug_###_shortdesc`. Include: repro steps, expected vs actual, screenshots/logs, and tag `open`. A builder will triage to `needs_test` or `in_progress`.',
    ].join('\n'),
  },
  {
    name: 'question_003_what_are_the_modes',
    tag: 'commands',
    body: [
      '**Q:** What are slimy.ai modes?',
      '**A:** Mentor (ground), Partner-in-crime (ideas), Mirror (reflect), Operator (ship). Switch with `/mode <name>`. See **modes_and_commands_md** for details.',
    ].join('\n'),
  },
  {
    name: 'question_004_how_to_use_chat',
    tag: 'commands',
    body: [
      '**Q:** When should I use `/chat` vs @mention?',
      '**A:** Use `/chat` for ephemeral testing and cleaner logs. Use @mention for public replies in chat (good for vibe checks).',
    ].join('\n'),
  },
  {
    name: 'question_005_where_is_the_roadmap',
    tag: 'general',
    body: [
      '**Q:** Where’s the current plan?',
      '**A:** **about_slimyai/roadmap_v1_md**. It’s a living doc—watch the change log at the bottom.',
    ].join('\n'),
  },
  {
    name: 'question_006_branding_rules',
    tag: 'general',
    body: [
      '**Q:** Any branding rules?',
      '**A:** Always “slimy.ai” (lowercase). Neon-blue watermark bottom-left on images. See **branding_style_css** for palette + tone.',
    ].join('\n'),
  },
  {
    name: 'question_007_how_to_ping_bot',
    tag: 'commands',
    body: [
      '**Q:** How do I make the bot respond to a ping?',
      '**A:** @mention the bot in a text channel. For structured testing, `/chat` is preferred.',
    ].join('\n'),
  },
  {
    name: 'question_008_data_safety',
    tag: 'general',
    body: [
      '**Q:** What about data safety?',
      '**A:** No secrets/PII in uploads. Redact tokens/IDs. If in doubt, ask an admin before posting.',
    ].join('\n'),
  },
];

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.channels.fetch();

    // Helper: get text channel by name
    const getText = (name) =>
      guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
    const getForum = (name) =>
      guild.channels.cache.find(c => c.type === ChannelType.GuildForum && c.name === name);

    // 1) Set topics + seed pinned messages for text channels
    for (const [chanName, topic] of Object.entries(TOPICS)) {
      const ch = getText(chanName);
      if (!ch) { console.warn(`⚠️ missing channel: ${chanName}`); continue; }

      // set topic if different
      try {
        if (ch.topic !== topic) await ch.setTopic(topic);
      } catch (e) { console.warn(`topic set failed for ${chanName}:`, e.message); }

      // check if our header already exists to avoid dupes
      const header = CONTENT[chanName].split('\n')[0]; // first line (e.g., '# 👋 welcome to slimy.ai')
      let exists = false;
      try {
        const msgs = await ch.messages.fetch({ limit: 20 }).catch(()=>null);
        if (msgs) {
          exists = msgs.some(m => typeof m.content === 'string' && m.content.startsWith(header));
        }
      } catch {}
      if (!exists) {
        const msg = await ch.send(CONTENT[chanName]);
        await sleep(400);
        await msg.pin().catch(()=>{});
      } else {
        console.log(`↪︎ skipped (exists): ${chanName}`);
      }
    }

    // 2) Seed FAQ forum threads
    const faq = getForum('faq_forum_exe');
    if (!faq) {
      console.warn('⚠️ missing forum: faq_forum_exe');
    } else {
      const tagByName = (name) => (faq.availableTags || []).find(t => t.name.toLowerCase() === name.toLowerCase())?.id;
      const active = await faq.threads.fetchActive();
      const existingNames = new Set(active.threads.map(t => t.name));

      for (const t of FAQ_THREADS) {
        if (existingNames.has(t.name)) {
          console.log(`↪︎ skipped (exists): ${t.name}`);
          continue;
        }
        const tagId = tagByName(t.tag);
        const options = {
          name: t.name,
          message: { content: t.body },
          autoArchiveDuration: 4320, // 3 days
        };
        if (tagId) options.appliedTags = [tagId];
        try {
          await faq.threads.create(options);
          await sleep(500);
          console.log(`✅ created thread: ${t.name}`);
        } catch (e) {
          console.warn(`⚠️ failed to create ${t.name}:`, e.message);
        }
      }
    }

    console.log('✅ Seeding complete.');
  } catch (err) {
    console.error('Seeder error:', err);
  } finally {
    process.exit(0);
  }
});

client.login(process.env.DISCORD_TOKEN);
