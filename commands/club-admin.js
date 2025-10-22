const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require("discord.js");

const TEST = process.env.TEST_MODE === "1";
const stubs = TEST ? require("../test/mocks/stubs") : null;
const database = TEST ? stubs.database : require("../lib/database");
const logger = require("../lib/logger");
const metrics = TEST ? stubs.metrics : require("../lib/metrics");
const clubStore = TEST ? stubs.clubStore : require("../lib/club-store");
const {
  getLatestForGuild,
  recomputeLatestForGuild,
} = clubStore;

function ensureDatabase() {
  if (!database.isConfigured()) {
    throw new Error("Database not configured for club admin.");
  }
}

function checkPermissions(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const roleId = process.env.CLUB_ROLE_ID;
  if (roleId && member.roles.cache.has(roleId)) return true;
  return false;
}

async function handleAliases(interaction) {
  ensureDatabase();

  const action = interaction.options.getString("action") || "view";

  if (action === "view") {
    const aliases = await database.query(
      `SELECT ca.alias_canonical, cm.name_display, cm.name_canonical
       FROM club_aliases ca
       JOIN club_members cm ON cm.id = ca.member_id
       WHERE ca.guild_id = ?
       ORDER BY cm.name_display, ca.alias_canonical`,
      [interaction.guildId],
    );

    if (!aliases.length) {
      return interaction.reply({
        content: "No aliases configured for this guild.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("Club Member Aliases")
      .setColor(0x6366f1)
      .setDescription(`Found ${aliases.length} alias(es)`);

    // Group by canonical name
    const grouped = new Map();
    for (const alias of aliases) {
      if (!grouped.has(alias.name_canonical)) {
        grouped.set(alias.name_canonical, {
          display: alias.name_display,
          aliases: [],
        });
      }
      grouped.get(alias.name_canonical).aliases.push(alias.alias_canonical);
    }

    const lines = [];
    for (const [canonical, data] of grouped.entries()) {
      lines.push(`**${data.display}** (${canonical})`);
      lines.push(
        ...data.aliases.map((alias) => `  • \`${alias}\``),
      );
    }

    embed.addFields({
      name: "Aliases",
      value: lines.slice(0, 20).join("\n") || "None",
    });

    if (lines.length > 20) {
      embed.setFooter({ text: `... and ${lines.length - 20} more` });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return interaction.reply({
    content: "Only 'view' action is currently implemented.",
    ephemeral: true,
  });
}

async function handleSnapshots(interaction) {
  ensureDatabase();

  const limit = Math.min(
    Math.max(interaction.options.getInteger("limit") || 10, 1),
    50,
  );

  const snapshots = await database.query(
    `SELECT s.id, s.snapshot_at, s.created_by, s.notes,
            COUNT(m.id) AS metric_count
     FROM club_snapshots s
     LEFT JOIN club_metrics m ON m.snapshot_id = s.id
     WHERE s.guild_id = ?
     GROUP BY s.id, s.snapshot_at, s.created_by, s.notes
     ORDER BY s.snapshot_at DESC
     LIMIT ?`,
    [interaction.guildId, limit],
  );

  if (!snapshots.length) {
    return interaction.reply({
      content: "No snapshots found for this guild.",
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`Recent Club Snapshots (${snapshots.length})`)
    .setColor(0x3b82f6);

  const lines = [];
  for (const snap of snapshots) {
    const date = new Date(snap.snapshot_at).toISOString().split("T")[0];
    const time = new Date(snap.snapshot_at)
      .toISOString()
      .split("T")[1]
      .slice(0, 5);
    lines.push(
      `**#${snap.id}** • ${date} ${time} • <@${snap.created_by}> • ${snap.metric_count} metrics`,
    );
  }

  embed.setDescription(lines.join("\n"));

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRollback(interaction) {
  ensureDatabase();

  await interaction.deferReply({ ephemeral: true });

  // Get the last snapshot
  const [lastSnapshot] = await database.query(
    `SELECT s.id, s.snapshot_at
     FROM club_snapshots s
     WHERE s.guild_id = ?
     ORDER BY s.snapshot_at DESC
     LIMIT 1`,
    [interaction.guildId],
  );

  if (!lastSnapshot) {
    return interaction.editReply({
      content: "❌ No snapshots found to rollback.",
    });
  }

  // Get the snapshot before that
  const [prevSnapshot] = await database.query(
    `SELECT s.id, s.snapshot_at
     FROM club_snapshots s
     WHERE s.guild_id = ? AND s.snapshot_at < ?
     ORDER BY s.snapshot_at DESC
     LIMIT 1`,
    [interaction.guildId, lastSnapshot.snapshot_at],
  );

  if (!prevSnapshot) {
    return interaction.editReply({
      content: "❌ Cannot rollback: only one snapshot exists.",
    });
  }

  // Delete the last snapshot (CASCADE will delete metrics)
  await database.query(`DELETE FROM club_snapshots WHERE id = ?`, [
    lastSnapshot.id,
  ]);

  // Recompute latest based on the previous snapshot
  await recomputeLatestForGuild(interaction.guildId, prevSnapshot.snapshot_at);

  logger.info("[club-admin] Rollback successful", {
    guildId: interaction.guildId,
    deletedSnapshotId: lastSnapshot.id,
    restoredSnapshotId: prevSnapshot.id,
  });

  const embed = new EmbedBuilder()
    .setTitle("✅ Rollback Successful")
    .setColor(0x22c55e)
    .setDescription(
      `Deleted snapshot #${lastSnapshot.id}\nRestored state from snapshot #${prevSnapshot.id}`,
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handleExport(interaction) {
  ensureDatabase();

  await interaction.deferReply({ ephemeral: true });

  const latest = await getLatestForGuild(interaction.guildId);

  if (!latest.length) {
    return interaction.editReply({
      content: "❌ No data to export.",
    });
  }

  // Build CSV
  const header =
    "Name,Canonical,SimPower,TotalPower,SimPrev,TotalPrev,SimChange%,TotalChange%";
  const rows = latest.map((row) => {
    return [
      `"${row.name_display.replace(/"/g, '""')}"`,
      `"${row.name_canonical.replace(/"/g, '""')}"`,
      row.sim_power ?? "",
      row.total_power ?? "",
      row.sim_prev ?? "",
      row.total_prev ?? "",
      row.sim_pct_change ?? "",
      row.total_pct_change ?? "",
    ].join(",");
  });

  const csv = [header, ...rows].join("\n");
  const attachment = new AttachmentBuilder(Buffer.from(csv, "utf8"), {
    name: `club-data-${interaction.guildId}-${Date.now()}.csv`,
  });

  return interaction.editReply({
    content: `Exported ${latest.length} member(s) to CSV.`,
    files: [attachment],
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("club-admin")
    .setDescription("Admin tools for club analytics")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("aliases")
        .setDescription("Manage member aliases")
        .addStringOption((option) =>
          option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(false)
            .addChoices({ name: "View", value: "view" }),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("snapshots")
        .setDescription("View recent snapshots")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of snapshots to show (1-50)")
            .setMinValue(1)
            .setMaxValue(50)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("rollback")
        .setDescription("Rollback the last commit (dangerous!)"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("export")
        .setDescription("Export full club data to CSV"),
    ),
  async execute(interaction) {
    try {
      ensureDatabase();

      if (!checkPermissions(interaction.member)) {
        return interaction.reply({
          content:
            "You need administrator permissions or the configured club role to use this command.",
          ephemeral: true,
        });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "aliases") {
        await handleAliases(interaction);
      } else if (subcommand === "snapshots") {
        await handleSnapshots(interaction);
      } else if (subcommand === "rollback") {
        await handleRollback(interaction);
      } else if (subcommand === "export") {
        await handleExport(interaction);
      } else {
        await interaction.reply({
          content: `Unknown subcommand: ${subcommand}`,
          ephemeral: true,
        });
      }

      metrics.trackCommand("club-admin", 0, true);
    } catch (err) {
      logger.error("[club-admin] Command failed", { error: err.message });
      const reply = {
        content: `❌ ${err.message}`,
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  },
};
