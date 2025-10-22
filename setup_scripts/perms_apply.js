// perms_apply.js — scan & apply perms, lock "branding style", create chat/
// Requires: DISCORD_TOKEN, GUILD_ID in .env (CLIENT_ID not needed here)
require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
});

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");

const P = PermissionsBitField.Flags;

// ------- names (env overrides OK) -------
const N = (k, d) => process.env[k] || d;

// Roles (file-style defaults)
const ROLE_NAME = {
  admin: N("ADMIN_ROLE_NAME", "admin"),
  verified: N("VERIFIED_ROLE_NAME", "verified_exe"),
  testers: N("TESTERS_ROLE_NAME", "testers.txt"),
  observers: N("OBSERVERS_ROLE_NAME", "observers.zip"),
  builders: N("BUILDERS_ROLE_NAME", "coder.js"),
  snail: N("SNAIL_ROLE_NAME", "snail_team.iso"),
  math: N("MATH_ROLE_NAME", "math_expert.7z"),
};

// Categories we care about (scan is case/spacing tolerant)
const CAT_HINTS = {
  entry: ["entry"],
  about: ["about_slimyai", "about-slimyai", "about slimyai", "about"],
  team: ["team_corner", "team-corner", "team corner"],
  botlab: ["bot_lab", "bot-lab", "bot lab"],
  testing: ["testing_grounds", "testing-grounds", "testing grounds"],
  devops: ["dev_ops", "dev-ops", "dev ops"],
  snail: ["snail_lab", "snail-lab", "snail lab"],
  chat: ["chat", "chatting", "general chat"], // to find preexisting chat category if any
};

// Forums we tune (we’ll scan, so exact names aren’t required but help)
const FORUM_GUESSES = [
  "phase1_forum_exe",
  "phase2_forum_exe",
  "phase3_forum_exe",
  "phase4_forum_exe",
  "bug_tracker_forum_exe",
  "feature_requests_forum_exe",
  "snail_math_den_forum_exe",
  "snail_analysis_forum_exe",
];

// ------- helpers -------
const NEED_SEND = [P.SendMessages, P.SendMessagesInThreads];
const NEED_CREATE = [P.CreatePublicThreads, P.CreatePrivateThreads];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uniq = (a) => [...new Set(a.filter(Boolean))];
const ow = (id, allow = [], deny = []) => ({ id, allow, deny });

const norm = (s) =>
  (s || "").toLowerCase().replace(/[_\-]/g, " ").replace(/\s+/g, " ").trim();

function ciFind(arr, nameOrHints) {
  const targets = Array.isArray(nameOrHints) ? nameOrHints : [nameOrHints];
  const wants = targets.map(norm);
  return (
    arr.find((x) => wants.includes(norm(x.name))) ||
    arr.find((x) => wants.some((w) => norm(x.name).includes(w)))
  );
}

function info(...x) {
  console.log("•", ...x);
}
function warn(...x) {
  console.warn("⚠️", ...x);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once("ready", async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch();
  await guild.roles.fetch();
  const me = await guild.members.fetchMe();

  // ---- resolve roles ----
  const ROLES = {};
  for (const [k, name] of Object.entries(ROLE_NAME)) {
    // prefer exact, else case-insensitive contains
    let role =
      guild.roles.cache.find((r) => r.name === name) ||
      guild.roles.cache.find((r) => norm(r.name) === norm(name)) ||
      guild.roles.cache.find((r) => norm(r.name).includes(norm(name)));
    // special case admin: if not found by name, pick any role with Administrator
    if (!role && k === "admin") {
      role = guild.roles.cache.find((r) =>
        r.permissions.has(PermissionsBitField.Flags.Administrator),
      );
    }
    if (!role) warn(`role missing: ${k} (${name})`);
    ROLES[k] = role || null;
  }
  const everyone = guild.roles.everyone;
  const botRoles = guild.roles.cache.filter((r) => r.tags?.botId).map((r) => r);

  // ---- resolve categories (scan) ----
  const cats = {};
  const allCats = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildCategory)
    .map((c) => c);

  for (const [key, hints] of Object.entries(CAT_HINTS)) {
    cats[key] = ciFind(allCats, hints) || null;
    if (!cats[key]) warn(`category not found: ${key} (${hints.join(", ")})`);
  }

  // ---- ensure chat/ exists and sits right under about/ ----
  let chatCat = cats.chat;
  const aboutCat = cats.about;

  if (!chatCat) {
    chatCat = await guild.channels.create({
      name: "chat",
      type: ChannelType.GuildCategory,
      reason: "Create chat category (verified can chat)",
    });
    info("created category: chat");
  }
  // place directly below about/
  if (aboutCat) {
    try {
      await chatCat.setPosition(aboutCat.position + 1);
      info(`positioned chat/ under ${aboutCat.name}`);
    } catch {
      /* ignore */
    }
  }

  // ensure general_chat_txt exists inside chat/
  let general = guild.channels.cache.find(
    (c) =>
      c.parentId === chatCat.id &&
      c.type === ChannelType.GuildText &&
      c.name === "general_chat_txt",
  );
  if (!general) {
    general = await guild.channels.create({
      name: "general_chat_txt",
      type: ChannelType.GuildText,
      parent: chatCat.id,
      reason: "Create general chat",
    });
    info("created channel: chat/general_chat_txt");
  }

  // ---- backup container ----
  const backup = {};
  const cap = (ch) => {
    backup[ch.id] = {
      name: ch.name,
      type: ch.type,
      overwrites: ch.permissionOverwrites.cache.map((o) => ({
        id: o.id,
        type: o.type,
        allow: o.allow.bitfield.toString(),
        deny: o.deny.bitfield.toString(),
      })),
    };
  };

  // ---- category applier (with sync) ----
  async function applyCategory(cat, overwrites) {
    if (!cat) return;
    cap(cat);
    const kids = guild.channels.cache.filter((x) => x.parentId === cat.id);
    kids.forEach(cap);

    await cat.permissionOverwrites
      .set(overwrites)
      .catch((e) => warn(`set ${cat.name}: ${e.message}`));
    for (const ch of kids.values()) {
      // forums will be tuned later; sync baseline now
      await ch.permissionOverwrites.set(overwrites).catch(() => {});
      await sleep(60);
    }
    info(`applied: ${cat.name} (+${kids.size} children)`);
  }

  // ---- build overwrites for each category ----
  const baseBot = uniq(
    botRoles.map((r) =>
      ow(
        r.id,
        [P.ViewChannel, ...NEED_SEND, ...NEED_CREATE, P.ReadMessageHistory],
        [],
      ),
    ),
  );
  const observersDenySend = ROLES.observers
    ? [ow(ROLES.observers.id, [], [P.SendMessages, P.SendMessagesInThreads])]
    : [];

  // team_corner/
  if (cats.team)
    await applyCategory(
      cats.team,
      uniq([
        ow(everyone.id, [], [P.ViewChannel]),
        ROLES.verified &&
          ow(ROLES.verified.id, [P.ViewChannel, ...NEED_SEND], []),
        ...observersDenySend,
        ...baseBot,
      ]),
    );

  // bot_lab/
  if (cats.botlab)
    await applyCategory(
      cats.botlab,
      uniq([
        ow(everyone.id, [], [P.ViewChannel]),
        ROLES.verified && ow(ROLES.verified.id, [P.ViewChannel], []),
        ...observersDenySend,
        ROLES.testers &&
          ow(ROLES.testers.id, [...NEED_SEND, ...NEED_CREATE], []),
        ROLES.builders &&
          ow(
            ROLES.builders.id,
            [...NEED_SEND, ...NEED_CREATE, P.ManageThreads],
            [],
          ),
        ...baseBot,
      ]),
    );

  // testing_grounds/
  if (cats.testing)
    await applyCategory(
      cats.testing,
      uniq([
        ow(everyone.id, [], [P.ViewChannel]),
        ROLES.verified && ow(ROLES.verified.id, [P.ViewChannel], []),
        ...observersDenySend,
        ROLES.testers &&
          ow(ROLES.testers.id, [...NEED_SEND, ...NEED_CREATE], []),
        ROLES.builders &&
          ow(
            ROLES.builders.id,
            [...NEED_SEND, ...NEED_CREATE, P.ManageThreads],
            [],
          ),
        ...baseBot,
      ]),
    );

  // dev_ops/
  if (cats.devops)
    await applyCategory(
      cats.devops,
      uniq([
        ow(everyone.id, [], [P.ViewChannel]),
        ROLES.verified &&
          ow(ROLES.verified.id, [P.ViewChannel], [P.SendMessages]),
        ROLES.builders && ow(ROLES.builders.id, [P.SendMessages], []),
        ...baseBot,
      ]),
    );

  // about_slimyai/ (read-only to verified; builders can edit/pin)
  if (cats.about)
    await applyCategory(
      cats.about,
      uniq([
        ow(everyone.id, [], [P.ViewChannel]),
        ROLES.verified &&
          ow(ROLES.verified.id, [P.ViewChannel], [P.SendMessages]),
        ROLES.builders &&
          ow(ROLES.builders.id, [P.SendMessages, P.ManageMessages], []),
        ...baseBot,
      ]),
    );

  // snail_lab/
  if (cats.snail)
    await applyCategory(
      cats.snail,
      uniq([
        ow(everyone.id, [], [P.ViewChannel]),
        ROLES.verified && ow(ROLES.verified.id, [], [P.ViewChannel]),
        ROLES.math &&
          ow(ROLES.math.id, [P.ViewChannel, ...NEED_SEND, ...NEED_CREATE], []),
        ROLES.snail &&
          ow(ROLES.snail.id, [P.ViewChannel, ...NEED_SEND, ...NEED_CREATE], []),
        ROLES.builders &&
          ow(ROLES.builders.id, [P.ViewChannel, P.ManageThreads], []),
        ...baseBot,
      ]),
    );

  // entry/
  if (cats.entry)
    await applyCategory(
      cats.entry,
      uniq([
        ow(everyone.id, [P.ViewChannel, P.SendMessages], []), // verify here only
        ROLES.verified && ow(ROLES.verified.id, [], [P.ViewChannel]),
        ...baseBot,
      ]),
    );

  // chat/ (new): verified and higher can chat; observers remain read-only
  if (chatCat) {
    await applyCategory(
      chatCat,
      uniq([
        ow(everyone.id, [], [P.ViewChannel]),
        ROLES.verified &&
          ow(ROLES.verified.id, [P.ViewChannel, ...NEED_SEND], []),
        ROLES.testers && ow(ROLES.testers.id, [...NEED_SEND], []),
        ROLES.builders && ow(ROLES.builders.id, [...NEED_SEND], []),
        ROLES.math && ow(ROLES.math.id, [...NEED_SEND], []),
        ROLES.snail && ow(ROLES.snail.id, [...NEED_SEND], []),
        ...observersDenySend, // keep observers read-only
        ...baseBot,
      ]),
    );
  }

  // ---- lock "branding style" in about/ to admin + bots only ----
  if (aboutCat) {
    const aboutKids = guild.channels.cache.filter(
      (c) => c.parentId === aboutCat.id,
    );
    const branding = aboutKids.find((c) => {
      const n = norm(c.name);
      return (
        n.includes("branding") || (n.includes("brand") && n.includes("style"))
      );
    });
    if (branding) {
      cap(branding);
      const allows = uniq([
        ...(ROLES.admin
          ? [
              ow(
                ROLES.admin.id,
                [P.ViewChannel, ...NEED_SEND, P.ReadMessageHistory],
                [],
              ),
            ]
          : []),
        ...botRoles.map((r) =>
          ow(r.id, [P.ViewChannel, ...NEED_SEND, P.ReadMessageHistory], []),
        ),
      ]);
      const denies = uniq([
        ow(everyone.id, [], [P.ViewChannel]),
        ...Object.values(ROLES)
          .filter((r) => r && r !== ROLES.admin)
          .map((r) => ow(r.id, [], [P.ViewChannel])),
      ]);
      await branding.permissionOverwrites
        .set(uniq([...allows, ...denies]))
        .then(() => info(`locked channel: ${branding.name} (admin+bots only)`))
        .catch((e) => warn(`branding lock: ${e.message}`));
    } else {
      warn(
        'branding style channel not found in about/ (looked for "branding" or "brand"+"style")',
      );
    }
  }

  // ---- tune forums: allow Create Posts for testers/builders; deny observers send; grant math in snail forums ----
  const allForums = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildForum)
    .map((c) => c);
  const guessed = new Set();
  for (const guess of FORUM_GUESSES) {
    const f = ciFind(allForums, [guess]);
    if (f) {
      guessed.add(f.id);
      await tuneForum(f);
    }
  }
  // Also tune any forum found under our known categories
  for (const f of allForums) {
    if (
      f.parentId &&
      [cats.botlab?.id, cats.testing?.id, cats.snail?.id].includes(
        f.parentId,
      ) &&
      !guessed.has(f.id)
    ) {
      await tuneForum(f);
    }
  }

  async function tuneForum(forum) {
    const extras = [];
    if (ROLES.testers)
      extras.push(ow(ROLES.testers.id, [...NEED_CREATE, ...NEED_SEND], []));
    if (ROLES.builders)
      extras.push(
        ow(
          ROLES.builders.id,
          [...NEED_CREATE, ...NEED_SEND, P.ManageThreads],
          [],
        ),
      );
    if (ROLES.observers)
      extras.push(
        ow(ROLES.observers.id, [], [P.SendMessages, P.SendMessagesInThreads]),
      );
    // Snail forums also grant math
    if (forum.parent?.id === cats.snail?.id && ROLES.math) {
      extras.push(ow(ROLES.math.id, [...NEED_CREATE, ...NEED_SEND], []));
    }
    const base = forum.permissionOverwrites.cache.map((o) => ({
      id: o.id,
      allow: o.allow,
      deny: o.deny,
    }));
    const byId = new Map(base.map((x) => [x.id, x]));
    for (const e of extras) byId.set(e.id, e);
    await forum.permissionOverwrites
      .set([...byId.values()])
      .catch((e) => warn(`forum ${forum.name}: ${e.message}`));
    info(`forum tuned: ${forum.name}`);
  }

  // ---- write backup ----
  const out = path.join(__dirname, `perms_backup_${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(backup, null, 2));
  console.log(`\n✅ Permissions applied. Backup saved to ${out}`);
  process.exit(0);
});

if (require.main === module) {
  client.login(process.env.DISCORD_TOKEN);
}
