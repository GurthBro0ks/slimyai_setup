#!/usr/bin/env node

require("dotenv/config");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { performance } = require("node:perf_hooks");
const { Collection } = require("discord.js");
const {
  makeInteractionFor,
  createFixtureAttachment,
  createRole,
} = require("../test/mocks/context");
const stubs = require("../test/mocks/stubs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REPORT_FILE = path.join(PROJECT_ROOT, "command-test-report.txt");
const DEFAULT_TIMEOUT_MS = 30_000;

process.env.TEST_MODE = process.env.TEST_MODE || "1";

installTestStubs();

async function main() {
  const context = await seedStubData();
  if (!process.env.CLUB_ROLE_ID && context.clubRole?.id) {
    process.env.CLUB_ROLE_ID = context.clubRole.id;
  }
  const commandModules = loadCommandModules();
  const tests = buildTestMatrix(commandModules, context);

  const results = [];
  for (const testCase of tests) {
    // eslint-disable-next-line no-await-in-loop
    const result = await executeTest(testCase);
    results.push(result);
  }

  await writeReport(results);

  const failures = results.filter((result) => result.status === "FAIL");
  if (failures.length) {
    console.error(`[slash-tests] ${failures.length} test(s) failed.`);
    process.exit(1);
  }
}

function installTestStubs() {
  const stubBindings = {
    "lib/database.js": stubs.database,
    "lib/memory.js": stubs.memory,
    "lib/metrics.js": stubs.metrics,
    "lib/rate-limiter.js": stubs.rateLimiter,
    "lib/club-store.js": stubs.clubStore,
    "lib/club-vision.js": stubs.clubVision,
    "lib/club-sheets.js": stubs.clubSheets,
    "lib/persona.js": stubs.persona,
    "lib/auto-image.js": stubs.autoImage,
    "lib/images.js": stubs.images,
    "lib/openai.js": stubs.openai,
    "lib/modes.js": stubs.modes,
    "lib/personality-engine.js": stubs.personalityEngine,
    "lib/personality-store.js": stubs.personalityStore,
  };

  for (const [relativePath, exportsValue] of Object.entries(stubBindings)) {
    const fullPath = path.join(PROJECT_ROOT, relativePath);
    require.cache[fullPath] = {
      id: fullPath,
      filename: fullPath,
      loaded: true,
      exports: exportsValue,
    };
  }
}

async function seedStubData() {
  const userId = "user-123";
  const guildId = "guild-123";
  const memory = await stubs.database.saveMemory(
    userId,
    guildId,
    "Initial seeded memory for QA harness.",
    ["seeded"],
    { seeded: true },
  );

  const clubRole = createRole({ id: "role-club", name: "Club Manager" });

  return {
    userId,
    guildId,
    memoryId: memory.id,
    clubRole,
  };
}

function loadCommandModules() {
  const commandsDir = path.join(PROJECT_ROOT, "commands");
  const entries = fs.readdirSync(commandsDir, { withFileTypes: true });
  const modules = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".js")) continue;

    const filePath = path.join(commandsDir, entry.name);
    // eslint-disable-next-line global-require
    const mod = require(filePath);
    if (!mod?.data || typeof mod.execute !== "function") continue;

    const data =
      typeof mod.data.toJSON === "function" ? mod.data.toJSON() : mod.data;
    if (!data?.name) continue;

    modules.push({
      name: data.name,
      data,
      module: mod,
      filePath,
    });
  }

  modules.sort((a, b) => a.name.localeCompare(b.name));
  return modules;
}

function buildTestMatrix(commandModules, context) {
  const variantConfig = getVariantConfig(context);
  const tests = [];

  for (const command of commandModules) {
    const variants = variantConfig[command.name] || [{ variant: "default" }];
    for (const variant of variants) {
      tests.push({
        command,
        ...variant,
      });
    }
  }

  return tests;
}

function getVariantConfig(context) {
  return {
    chat: [
      {
        variant: "default",
        options: { message: "Hello from the QA harness!" },
      },
    ],
    "club-analyze": [
      {
        variant: "preview",
        options: { type: "both" },
        attachments: () => [createFixtureAttachment("club-preview.png")],
        admin: true,
      },
      {
        variant: "force-dry",
        options: { type: "both", force_commit: true },
        attachments: () => [createFixtureAttachment("club-force.png")],
        admin: true,
      },
      {
        variant: "no-perms",
        options: { type: "both", force_commit: true },
        attachments: () => [createFixtureAttachment("club-denied.png")],
        admin: false,
        expectDenied: true,
      },
    ],
    "club-stats": [
      {
        variant: "both/embed",
        options: { metric: "both", top: 5, format: "embed" },
        admin: true,
      },
      {
        variant: "both/csv",
        options: { metric: "both", top: 5, format: "csv" },
        admin: false,
        role: context.clubRole,
      },
      {
        variant: "no-perms",
        admin: false,
        expectDenied: true,
      },
    ],
    consent: [
      {
        variant: "status",
        subcommand: "status",
      },
      {
        variant: "set-allow",
        subcommand: "set",
        options: { allow: true },
      },
    ],
    diag: [{ variant: "default" }],
    dream: [
      {
        variant: "anime",
        options: {
          prompt: "A cheerful snail hero exploring a neon city.",
          style: "anime",
        },
      },
    ],
    export: [{ variant: "default" }],
    forget: [
      {
        variant: "single",
        options: { id: context.memoryId },
      },
      {
        variant: "all",
        options: { id: "ALL" },
      },
    ],
    mode: [
      {
        variant: "view",
        subcommand: "view",
      },
      {
        variant: "non-admin",
        skip: true,
        reason:
          "Discord permission gates this command before execution; mocked runs skip.",
      },
    ],
    "personality-config": [
      { variant: "view", subcommand: "view" },
      { variant: "analytics", subcommand: "analytics" },
      {
        variant: "adjust",
        subcommand: "adjust",
        options: { parameter: "enthusiasm", value: 6 },
      },
      {
        variant: "non-admin",
        subcommand: "view",
        admin: false,
        expectDenied: true,
      },
    ],
    remember: [
      {
        variant: "default",
        options: {
          note: "Remember to hydrate during QA runs.",
          tags: "qa,health",
        },
      },
    ],
    snail: [
      {
        variant: "skip",
        skip: true,
        reason: "Vision pipeline and OCR integrations skipped in dry-run mode.",
      },
    ],
  };
}

async function executeTest(testCase) {
  const {
    command,
    variant,
    options: baseOptions = {},
    attachments: attachmentFactory,
    subcommand = null,
    subcommandGroup = null,
    admin = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    skip = false,
    reason = "Skipped by configuration",
    expectDenied = false,
    role = null,
  } = testCase;

  if (skip) {
    return {
      command: command.name,
      variant,
      status: "SKIP",
      ms: 0,
      note: reason,
    };
  }

  const attachments =
    typeof attachmentFactory === "function"
      ? attachmentFactory()
      : Array.isArray(attachmentFactory)
        ? attachmentFactory
        : [];

  const options = { ...baseOptions };
  if (attachments.length && !options.images) {
    options.images = attachments[0];
  }

  const resolvedAttachments = new Collection(
    attachments.map((item) => [item.id, item]),
  );
  const optionData = attachments.map((attachment) => ({ attachment }));

  const interaction = makeInteractionFor(command.module, {
    options,
    subcommand,
    subcommandGroup,
    admin,
    attachments,
    optionData,
    resolved: { attachments: resolvedAttachments },
    role,
  });

  const start = performance.now();
  let status = "PASS";
  let error = null;

  try {
    const execution = command.module.execute(interaction);
    await withTimeout(execution, timeoutMs);
  } catch (err) {
    status = "FAIL";
    error = err;
  }
  const duration = Math.round(performance.now() - start);

  let note = summarizeInteraction(interaction);
  if (expectDenied && status === "PASS") {
    const denied = detectPermissionDenied(interaction);
    if (!denied) {
      status = "FAIL";
      note = "Expected permission denial but command responded normally.";
    } else {
      note = "Denied as expected.";
    }
  }

  if (error) {
    note = error.message || String(error);
  }

  return {
    command: command.name,
    variant,
    status,
    ms: duration,
    note,
    error,
  };
}

function detectPermissionDenied(interaction) {
  const messages = [
    ...interaction.replyLog.map((entry) => entry.payload?.content || ""),
    ...interaction.edits.map((payload) => payload?.content || ""),
  ].filter(Boolean);

  return messages.some((msg) => /permission|admin|require/i.test(msg));
}

function summarizeInteraction(interaction) {
  if (interaction.edits.length) {
    const first = interaction.edits[0];
    if (typeof first === "string") return clip(first);
    if (first?.content) return clip(first.content);
    if (first?.embeds?.length) return `edit: ${first.embeds.length} embed(s)`;
    if (first?.files?.length) return `edit: ${first.files.length} file(s)`;
  }

  const replyEntry = interaction.replyLog.find(
    (entry) => entry.type === "reply",
  );
  if (replyEntry) {
    const payload = replyEntry.payload;
    if (typeof payload === "string") return clip(payload);
    if (payload?.content) return clip(payload.content);
    if (payload?.embeds?.length)
      return `reply: ${payload.embeds.length} embed(s)`;
    if (payload?.files?.length) return `reply: ${payload.files.length} file(s)`;
  }

  if (interaction.followUps.length) {
    return `follow-up: ${interaction.followUps.length}`;
  }

  return "no reply";
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function clip(value) {
  const str = String(value).replace(/\s+/g, " ").trim();
  if (str.length <= 80) return str;
  return `${str.slice(0, 77)}…`;
}

async function writeReport(results) {
  const now = new Date();
  const timestamp = now.toISOString();
  const failures = results.filter((result) => result.status === "FAIL");

  const lines = [];
  lines.push(`# Slash Command Test Report — ${timestamp}`);
  lines.push("");
  lines.push("Environment Summary");
  lines.push("-------------------");
  lines.push(`Node.js: ${process.version}`);
  lines.push(`Platform: ${os.platform()} ${os.release()}`);
  lines.push(`Package Manager: ${process.env.npm_config_user_agent || "npm"}`);
  lines.push(`TEST_MODE: ${process.env.TEST_MODE}`);
  lines.push("");
  lines.push("Results");
  lines.push("-------");
  lines.push("```");
  lines.push(formatResultsTable(results));
  lines.push("```");
  lines.push("");

  if (failures.length) {
    lines.push("Failures");
    lines.push("--------");
    failures.forEach((failure) => {
      lines.push(`- ${failure.command} (${failure.variant})`);
      if (failure.error?.stack) {
        const snippet = failure.error.stack.split("\n").slice(0, 20).join("\n");
        lines.push("```");
        lines.push(snippet);
        lines.push("```");
      } else if (failure.error) {
        lines.push(`  ${failure.error.message || failure.error}`);
      }
    });
    lines.push("");
  }

  await fs.promises.writeFile(REPORT_FILE, lines.join("\n"), "utf8");
  console.log(`[slash-tests] Wrote report to ${REPORT_FILE}`);
}

function formatResultsTable(results) {
  const headers = ["Command", "Variant", "Status", "ms", "Notes"];
  const rows = results.map((result) => [
    `/${result.command}`,
    result.variant,
    result.status,
    result.ms.toString(),
    result.note,
  ]);

  const table = [headers, ...rows];
  const widths = headers.map((_, column) =>
    Math.max(...table.map((row) => row[column].length)),
  );

  return table
    .map((row) =>
      row.map((cell, index) => cell.padEnd(widths[index], " ")).join("   "),
    )
    .join("\n");
}

main().catch((error) => {
  console.error("[slash-tests] Unhandled error:", error);
  process.exit(1);
});
