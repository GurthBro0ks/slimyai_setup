#!/usr/bin/env node

/**
 * Post club stats embed to a Discord channel using the same builder
 * as the /club stats command.
 *
 * Usage:
 * node scripts/post-stats-to-channel.js \
 *   --guild <GUILD_ID> \
 *   --channel <CHANNEL_ID> \
 *   [--metric both|total|sim --top 10]
 */

const path = require("path");
const { REST, Routes } = require("discord.js");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const database = require("../lib/database");
const statsService = require("../lib/club-stats-service");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const guildId = args.guild;
  const channelId = args.channel;
  const metric = (args.metric || "both").toLowerCase();
  const top = args.top ? Number(args.top) : statsService.DEFAULT_TOP;

  if (!guildId || !channelId) {
    console.error(
      "[spotcheck] Missing required arguments. Provide --guild and --channel.",
    );
    process.exit(1);
  }

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error(
      "[spotcheck] DISCORD_TOKEN environment variable is required.",
    );
    process.exit(1);
  }

  if (!database.isConfigured()) {
    console.error(
      "[spotcheck] Database is not configured. Set DB_* environment variables first.",
    );
    process.exit(1);
  }

  await database.initialize();
  const statsData = await statsService.fetchClubStats(guildId, {
    metric,
    top,
  });

  if (!statsData.latest.length) {
    console.error(
      `[spotcheck] No stats available for guild ${guildId}. Run ingest first.`,
    );
    await database.close();
    process.exit(1);
  }

  const { embed, components } = statsService.buildClubStatsEmbed(
    guildId,
    statsData,
    { metric },
  );

  await database.close();

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    const response = await rest.post(Routes.channelMessages(channelId), {
      body: {
        embeds: [embed.toJSON()],
        components: components.map((component) => component.toJSON()),
      },
    });
    const url = `https://discord.com/channels/${guildId}/${channelId}/${response.id}`;
    console.log(`[spotcheck] Posted stats embed → ${url}`);
  } catch (err) {
    const status = err?.status ?? err?.code ?? "unknown";
    console.error(
      `[spotcheck] Failed to post message (guild=${guildId}, channel=${channelId}): ${err.message} (status=${status})`,
    );
    if (status === 404 || status === "10003") {
      console.error(
        "[spotcheck] Verify the bot has access to the provided channel ID.",
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[spotcheck] Unexpected failure:", err);
  process.exit(1);
});
