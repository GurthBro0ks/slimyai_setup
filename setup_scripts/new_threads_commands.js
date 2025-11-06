// new_threads_commands.js
// Registers & handles: /new_bug, /new_calc, /new_feature, /new_test, /new_analysis
// Uses .env in this folder.
//
// Optional .env overrides for forum names and roles:
// BUG_FORUM_NAME, FEATURE_FORUM_NAME, CALC_FORUM_NAME, ANALYSIS_FORUM_NAME
// PHASE1_FORUM_NAME..PHASE4_FORUM_NAME
// TESTERS_ROLE_NAME

require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
});

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ChannelType,
  SlashCommandBuilder,
} = require("discord.js");

const BUG_FORUM_NAME = process.env.BUG_FORUM_NAME || "bug_tracker_forum_exe";
const CALC_FORUM_NAME =
  process.env.CALC_FORUM_NAME || "snail_math_den_forum_exe";
const FEATURE_FORUM_NAME =
  process.env.FEATURE_FORUM_NAME || "feature_requests_forum_exe";
const ANALYSIS_FORUM_NAME =
  process.env.ANALYSIS_FORUM_NAME || "snail_analysis_forum_exe";
const TESTERS_ROLE_NAME = process.env.TESTERS_ROLE_NAME || "testers.txt";

const PHASE_FORUMS = {
  1: process.env.PHASE1_FORUM_NAME || "phase1_forum_exe",
  2: process.env.PHASE2_FORUM_NAME || "phase2_forum_exe",
  3: process.env.PHASE3_FORUM_NAME || "phase3_forum_exe",
  4: process.env.PHASE4_FORUM_NAME || "phase4_forum_exe",
};

function toSnakeShort(s, maxWords = 6, maxLen = 36) {
  const cleaned = (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").slice(0, maxWords);
  let slug = words.join("_").replace(/_+/g, "_");
  if (slug.length > maxLen) slug = slug.slice(0, maxLen).replace(/_+$/, "");
  return slug || "untitled";
}

async function nextId(forum, prefix) {
  const active = await forum.threads
    .fetchActive()
    .catch(() => ({ threads: [] }));
  const archived = await forum.threads
    .fetchArchived()
    .catch(() => ({ threads: [] }));
  const all = [
    ...(active.threads?.values?.() || []),
    ...(archived.threads?.values?.() || []),
  ];
  let max = 0;
  const rx = new RegExp(`^${prefix}_(\\d{3,})_`, "i");
  for (const th of all) {
    const m = th.name && th.name.match(rx);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1).padStart(3, "0");
}
async function nextVersion(forum) {
  const active = await forum.threads
    .fetchActive()
    .catch(() => ({ threads: [] }));
  const archived = await forum.threads
    .fetchArchived()
    .catch(() => ({ threads: [] }));
  const all = [
    ...(active.threads?.values?.() || []),
    ...(archived.threads?.values?.() || []),
  ];
  let max = 0;
  const rx = /^test_v(\d+)_/i;
  for (const th of all) {
    const m = th.name && th.name.match(rx);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return String(max + 1);
}
function tagIdByName(forum, n) {
  return forum?.availableTags?.find(
    (t) => t.name.toLowerCase() === n.toLowerCase(),
  )?.id;
}
async function findForumByName(guild, name) {
  await guild.channels.fetch();
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildForum && c.name === name,
  );
}

const commands = [
  new SlashCommandBuilder()
    .setName("new_bug")
    .setDescription("Create a bug thread in bug_tracker_forum_exe")
    .addStringOption((o) =>
      o.setName("title").setDescription("short description").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("severity")
        .setDescription("impact")
        .addChoices(
          { name: "low", value: "low" },
          { name: "med", value: "med" },
          { name: "high", value: "high" },
        )
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("tag")
        .setDescription("forum tag")
        .addChoices(
          { name: "open", value: "open" },
          { name: "needs_test", value: "needs_test" },
          { name: "duplicate", value: "duplicate" },
        ),
    )
    .addStringOption((o) => o.setName("env").setDescription("OS/app/channel"))
    .addStringOption((o) =>
      o.setName("expected").setDescription("what should happen"),
    )
    .addStringOption((o) =>
      o.setName("actual").setDescription("what actually happened"),
    ),
  new SlashCommandBuilder()
    .setName("new_calc")
    .setDescription("Create a calc thread in snail_math_den_forum_exe")
    .addStringOption((o) =>
      o.setName("title").setDescription("short math topic").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("confidence")
        .setDescription("confidence")
        .addChoices(
          { name: "low", value: "low" },
          { name: "med", value: "med" },
          { name: "high", value: "high" },
        )
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("tag")
        .setDescription("forum tag")
        .addChoices(
          { name: "needs_data", value: "needs_data" },
          { name: "approx", value: "approx" },
          { name: "verified", value: "verified" },
          { name: "model_update", value: "model_update" },
        ),
    )
    .addStringOption((o) =>
      o.setName("inputs").setDescription("inputs (units!)"),
    )
    .addStringOption((o) =>
      o.setName("approach").setDescription("formula/approach"),
    ),
  new SlashCommandBuilder()
    .setName("new_feature")
    .setDescription(
      "Create a feature request in feature_requests_forum_exe (pings testers)",
    )
    .addStringOption((o) =>
      o.setName("title").setDescription("short feature name").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("status")
        .setDescription("initial status tag")
        .addChoices(
          { name: "idea", value: "idea" },
          { name: "approved", value: "approved" },
          { name: "in_progress", value: "in_progress" },
          { name: "deferred", value: "deferred" },
        ),
    )
    .addStringOption((o) =>
      o.setName("problem").setDescription("what hurts today?"),
    )
    .addStringOption((o) =>
      o.setName("proposal").setDescription("what we want built"),
    )
    .addStringOption((o) =>
      o.setName("impact").setDescription("who benefits / measurable outcome"),
    )
    .addStringOption((o) =>
      o.setName("alternatives").setDescription("other approaches considered"),
    ),
  new SlashCommandBuilder()
    .setName("new_test")
    .setDescription("Create a test thread in a phase forum (test_v#_desc)")
    .addIntegerOption((o) =>
      o
        .setName("phase")
        .setDescription("phase 1–4")
        .addChoices(
          { name: "1", value: 1 },
          { name: "2", value: 2 },
          { name: "3", value: 3 },
          { name: "4", value: 4 },
        )
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("title").setDescription("short test focus").setRequired(true),
    )
    .addIntegerOption((o) =>
      o.setName("version").setDescription("override version number (optional)"),
    )
    .addStringOption((o) =>
      o
        .setName("result")
        .setDescription("initial tag")
        .addChoices(
          { name: "needs_review", value: "needs_review" },
          { name: "pass", value: "pass" },
          { name: "fail", value: "fail" },
        ),
    )
    .addStringOption((o) =>
      o.setName("goal").setDescription("what this test tries to prove"),
    )
    .addStringOption((o) => o.setName("steps").setDescription("1; 2; 3;")),
  new SlashCommandBuilder()
    .setName("new_analysis")
    .setDescription("Create an analysis thread in snail_analysis_forum_exe")
    .addStringOption((o) =>
      o.setName("title").setDescription("topic").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("dataset")
        .setDescription("dataset name or link")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("method")
        .setDescription("approach/model/experiment")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("metric")
        .setDescription("target metric (e.g., winrate, mse)")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("baseline").setDescription("baseline number or summary"),
    )
    .addStringOption((o) =>
      o.setName("result").setDescription("result number or summary"),
    )
    .addStringOption((o) =>
      o
        .setName("confidence")
        .setDescription("confidence tag")
        .addChoices(
          { name: "needs_data", value: "needs_data" },
          { name: "needs_review", value: "needs_review" },
          { name: "verified", value: "verified" },
        ),
    ),
].map((c) => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID,
    ),
    { body: commands },
  );
  console.log(
    "✅ Slash commands registered: /new_bug, /new_calc, /new_feature, /new_test, /new_analysis",
  );
}

client.once("ready", async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  try {
    await registerCommands();
  } catch (e) {
    console.error("Register error:", e);
  }
});

client.on("interactionCreate", async (ix) => {
  try {
    if (!ix.isChatInputCommand()) return;

    // eslint-disable-next-line no-unused-vars
    const _findForumByName = async (name) => {
      const guild = ix.guild;
      await guild.channels.fetch();
      return guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildForum && c.name === name,
      );
    };
    // eslint-disable-next-line no-unused-vars
    const _tagIdByName = (forum, n) =>
      forum?.availableTags?.find(
        (t) => t.name.toLowerCase() === n.toLowerCase(),
      )?.id;

    if (ix.commandName === "new_bug") {
      const forum = await findForumByName(BUG_FORUM_NAME);
      if (!forum)
        return ix.reply({
          content: `⚠️ Forum not found: ${BUG_FORUM_NAME}`,
          ephemeral: true,
        });

      const title = ix.options.getString("title", true);
      const severity = ix.options.getString("severity", true);
      const tagName = ix.options.getString("tag") || "open";
      const env = ix.options.getString("env") || "";
      const expected = ix.options.getString("expected") || "";
      const actual = ix.options.getString("actual") || "";

      const short = toSnakeShort(title);
      const id = await nextId(forum, "bug");
      const name = `bug_${id}_${short}`;
      const tagId = tagIdByName(forum, tagName);

      const thread = await forum.threads.create({
        name,
        autoArchiveDuration: 4320,
        message: {
          content: [
            "# bug report",
            `**title**: ${title}`,
            `**severity**: ${severity}`,
            env ? `**env**: ${env}` : "",
            "",
            "**steps to repro**:",
            "1.",
            "2.",
            "3.",
            "",
            expected ? `**expected**: ${expected}` : "**expected**:",
            actual ? `**actual**: ${actual}` : "**actual**:",
            "",
            "**attachments**: (screens/logs)",
          ]
            .filter(Boolean)
            .join("\n"),
        },
        appliedTags: tagId ? [tagId] : undefined,
      });
      return ix.reply({
        content: `✅ created <#${thread.id}>`,
        ephemeral: true,
      });
    }

    if (ix.commandName === "new_calc") {
      const forum = await findForumByName(CALC_FORUM_NAME);
      if (!forum)
        return ix.reply({
          content: `⚠️ Forum not found: ${CALC_FORUM_NAME}`,
          ephemeral: true,
        });

      const title = ix.options.getString("title", true);
      const confidence = ix.options.getString("confidence", true);
      const tagName = ix.options.getString("tag") || "needs_data";
      const inputs = ix.options.getString("inputs") || "";
      const approach = ix.options.getString("approach") || "";

      const short = toSnakeShort(title);
      const id = await nextId(forum, "calc");
      const name = `calc_${id}_${short}`;
      const tagId = tagIdByName(forum, tagName);

      const thread = await forum.threads.create({
        name,
        autoArchiveDuration: 4320,
        message: {
          content: [
            "# calc thread",
            `**question**: ${title}`,
            inputs ? `**inputs**: ${inputs}` : "**inputs**:",
            approach
              ? `**formula/approach**: ${approach}`
              : "**formula/approach**:",
            "**sample calc**:",
            "**result**:",
            `**confidence**: ${confidence}`,
          ].join("\n"),
        },
        appliedTags: tagId ? [tagId] : undefined,
      });
      return ix.reply({
        content: `✅ created <#${thread.id}>`,
        ephemeral: true,
      });
    }

    if (ix.commandName === "new_feature") {
      const forum = await findForumByName(FEATURE_FORUM_NAME);
      if (!forum)
        return ix.reply({
          content: `⚠️ Forum not found: ${FEATURE_FORUM_NAME}`,
          ephemeral: true,
        });

      const testersRole = ix.guild.roles.cache.find(
        (r) => r.name === TESTERS_ROLE_NAME,
      );
      const testersMention = testersRole
        ? `<@&${testersRole.id}>`
        : "**[testers]**";
      const title = ix.options.getString("title", true);
      const status = ix.options.getString("status") || "idea";
      const problem = ix.options.getString("problem") || "";
      const proposal = ix.options.getString("proposal") || "";
      const impact = ix.options.getString("impact") || "";
      const alternatives = ix.options.getString("alternatives") || "";

      const short = toSnakeShort(title);
      const id = await nextId(forum, "feature");
      const name = `feature_${id}_${short}`;
      const tagId = tagIdByName(forum, status);

      const content = [
        testersRole ? testersMention : "",
        "# feature request",
        `**title**: ${title}`,
        problem ? `**problem**: ${problem}` : "**problem**:",
        proposal ? `**proposal**: ${proposal}` : "**proposal**:",
        impact ? `**impact**: ${impact}` : "**impact**:",
        alternatives
          ? `**alternatives**: ${alternatives}`
          : "**alternatives**:",
        "**dependencies**:",
      ]
        .filter(Boolean)
        .join("\n");

      const thread = await forum.threads.create({
        name,
        autoArchiveDuration: 4320,
        message: {
          content,
          allowedMentions: testersRole
            ? { parse: [], roles: [testersRole.id] }
            : undefined,
        },
        appliedTags: tagId ? [tagId] : undefined,
      });

      return ix.reply({
        content: `✅ created <#${thread.id}> (notified ${TESTERS_ROLE_NAME})`,
        ephemeral: true,
      });
    }

    if (ix.commandName === "new_test") {
      const phase = ix.options.getInteger("phase", true);
      const forumName = PHASE_FORUMS[phase];
      const forum = await findForumByName(forumName);
      if (!forum)
        return ix.reply({
          content: `⚠️ Forum not found: ${forumName}`,
          ephemeral: true,
        });

      const title = ix.options.getString("title", true);
      const givenVersion = ix.options.getInteger("version");
      const result = ix.options.getString("result") || "needs_review";
      const goal = ix.options.getString("goal") || "";
      const steps = ix.options.getString("steps") || "";

      const version = givenVersion
        ? String(givenVersion)
        : await nextVersion(forum);
      const short = toSnakeShort(title);
      const name = `test_v${version}_${short}`;
      const tagId = tagIdByName(forum, result);

      const body = [
        "# test run",
        `**phase**: ${phase}`,
        `**version**: v${version}`,
        `**title**: ${title}`,
        goal ? `**goal**: ${goal}` : "**goal**:",
        "",
        "**steps**:",
        steps
          ? steps
              .split(";")
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s, i) => `${i + 1}. ${s}`)
              .join("\n")
          : "1.\n2.\n3.",
        "",
        "**expected**:",
        "**actual**:",
        "**artifacts**: (screens/logs)",
        `**result**: ${result}`,
      ].join("\n");

      const thread = await forum.threads.create({
        name,
        autoArchiveDuration: 4320,
        message: { content: body },
        appliedTags: tagId ? [tagId] : undefined,
      });

      return ix.reply({
        content: `✅ created <#${thread.id}>`,
        ephemeral: true,
      });
    }

    if (ix.commandName === "new_analysis") {
      const forum = await findForumByName(ANALYSIS_FORUM_NAME);
      if (!forum)
        return ix.reply({
          content: `⚠️ Forum not found: ${ANALYSIS_FORUM_NAME}`,
          ephemeral: true,
        });

      const title = ix.options.getString("title", true);
      const dataset = ix.options.getString("dataset", true);
      const method = ix.options.getString("method", true);
      const metric = ix.options.getString("metric", true);
      const baseline = ix.options.getString("baseline") || "";
      const result = ix.options.getString("result") || "";
      const confTag = ix.options.getString("confidence") || "needs_review";

      const short = toSnakeShort(title);
      const id = await nextId(forum, "analysis");
      const name = `analysis_${id}_${short}`;
      const tagId = tagIdByName(forum, confTag);

      const body = [
        "# analysis",
        `**title**: ${title}`,
        `**dataset**: ${dataset}`,
        `**method**: ${method}`,
        `**metric**: ${metric}`,
        baseline ? `**baseline**: ${baseline}` : "**baseline**:",
        result ? `**result**: ${result}` : "**result**:",
        "",
        "**protocol**:",
        "1.",
        "2.",
        "3.",
        "",
        "**artifacts**: (links, images, logs)",
        `**confidence**: ${confTag}`,
      ].join("\n");

      const thread = await forum.threads.create({
        name,
        autoArchiveDuration: 4320,
        message: { content: body },
        appliedTags: tagId ? [tagId] : undefined,
      });

      return ix.reply({
        content: `✅ created <#${thread.id}>`,
        ephemeral: true,
      });
    }
  } catch (err) {
    console.error("handler error:", err);
    if (ix.isRepliable()) {
      await ix
        .reply({ content: `⚠️ Error: ${err.message || err}`, ephemeral: true })
        .catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
