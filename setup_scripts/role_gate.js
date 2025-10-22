// role_gate.js
// Role gate with 3 toggles (snail_team, testers, observers) + Request Builders flow.
// Posts/updates panel in welcome_md. Review messages go to builders_review_inbox.
//
// Requires: Server Members Intent = ON.
// .env (optional):
//   WELCOME_CHANNEL_NAME=welcome_md
//   SNAIL_ROLE_NAME=snail_team
//   TESTERS_ROLE_NAME=testers
//   OBSERVERS_ROLE_NAME=observers
//   BUILDERS_ROLE_NAME=builders
//   REVIEW_CHANNEL_NAME=builders_review_inbox
//   PANEL_MESSAGE=Join project roles via the buttons below. Click to toggle.

require("dotenv").config({
  path: require("node:path").join(__dirname, ".env"),
});

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require("discord.js");

const WELCOME_CHANNEL_NAME = process.env.WELCOME_CHANNEL_NAME || "welcome_md";
const BUILDERS_ROLE_NAME = process.env.BUILDERS_ROLE_NAME || "builders";
const REVIEW_CHANNEL_NAME =
  process.env.REVIEW_CHANNEL_NAME || "builders_review_inbox";

const ROLES = [
  {
    name: process.env.SNAIL_ROLE_NAME || "snail_team",
    label: "Snail Team",
    color: 0xf3b13d,
    customId: "gate_toggle:snail_team",
    desc: "Access **snail_lab/** (math + analysis)",
  },
  {
    name: process.env.TESTERS_ROLE_NAME || "testers",
    label: "Testers",
    color: 0x8be37f,
    customId: "gate_toggle:testers",
    desc: "File bugs & run checks in **testing_grounds/**",
  },
  {
    name: process.env.OBSERVERS_ROLE_NAME || "observers",
    label: "Observers",
    color: 0x9ca3af,
    customId: "gate_toggle:observers",
    desc: "Read-only visibility across most categories",
  },
];

const PANEL_MESSAGE =
  process.env.PANEL_MESSAGE ||
  "Join project roles via the buttons below. Click to toggle. Need builder access? Use the request button.";

  // eslint-disable-next-line no-unused-vars
const _P = PermissionsBitField.Flags;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ---- commands ----
const commands = [
  new SlashCommandBuilder()
    .setName("setup_gate")
    .setDescription("Post or update the role gate panel in the welcome channel")
    .addStringOption((o) =>
      o
        .setName("channel")
        .setDescription(`Channel (default: ${WELCOME_CHANNEL_NAME})`),
    ),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID,
    ),
    { body: commands },
  );
  console.log("✅ Slash command registered: /setup_gate");
}

// ---- helpers ----
async function ensureRole(guild, name, color) {
  await guild.roles.fetch();
  return (
    guild.roles.cache.find((r) => r.name === name) ||
    guild.roles.create({ name, color, reason: "Role gate setup" })
  );
}

async function ensureReviewChannel(guild) {
  await guild.channels.fetch();
  let ch = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === REVIEW_CHANNEL_NAME,
  );
  if (ch) return ch;

  // Try to place under dev_ops if it exists
  const devOpsCat = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === "dev_ops",
  );
  ch = await guild.channels.create({
    name: REVIEW_CHANNEL_NAME,
    type: ChannelType.GuildText,
    parent: devOpsCat?.id,
    topic: "Builders role requests — approvers click Approve/Deny.",
  });
  return ch;
}

function toggleRow() {
  const row = new ActionRowBuilder();
  for (const r of ROLES) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(r.customId)
        .setStyle(ButtonStyle.Primary)
        .setLabel(`${r.label} (toggle)`),
    );
  }
  return row;
}
function requestRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gate_request:builders")
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Request Builders (mod review)"),
  );
}
function panelRows() {
  return [toggleRow(), requestRow()];
}
function panelBody() {
  const lines = [PANEL_MESSAGE, ""];
  for (const r of ROLES) lines.push(`• **${r.label}** — ${r.desc}`);
  lines.push(
    "• **Builders** — elevated permissions to structure and ship features (request via button).",
  );
  return lines.join("\n");
}

async function ensurePanelMessage(guild, channelName) {
  await guild.channels.fetch();
  const ch = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === channelName,
  );
  if (!ch) throw new Error(`Channel not found: ${channelName}`);

  const msgs = await ch.messages.fetch({ limit: 25 }).catch(() => null);
  const existing = msgs?.find(
    (m) =>
      m.author?.id === guild.client.user.id &&
      m.components?.length &&
      m.components[0].components?.some?.((b) =>
        b.customId?.startsWith("gate_toggle:"),
      ),
  );
  const payload = { content: panelBody(), components: panelRows() };
  if (existing) {
    await existing.edit(payload);
    return existing;
  }
  return ch.send(payload);
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
    // /setup_gate
    if (ix.isChatInputCommand() && ix.commandName === "setup_gate") {
      await ix.deferReply({ ephemeral: true });
      const channelName =
        ix.options.getString("channel") || WELCOME_CHANNEL_NAME;

      const guild = ix.guild;
      const created = [];
      for (const r of ROLES)
        created.push(await ensureRole(guild, r.name, r.color));
      const buildersRole = await ensureRole(
        guild,
        BUILDERS_ROLE_NAME,
        0x00c2ff,
      );
      const me = await guild.members.fetchMe();
      const tooLow = [buildersRole, ...created].filter(
        (role) => me.roles.highest.comparePositionTo(role) <= 0,
      );
      if (tooLow.length) {
        await ix.editReply(
          `⚠️ Move my highest role above: ${tooLow.map((r) => `\`${r.name}\``).join(", ")}`,
        );
        return;
      }
      await ensureReviewChannel(guild);
      await ensurePanelMessage(guild, channelName);
      await ix.editReply(`✅ Gate panel ready in #${channelName}.`);
      return;
    }

    // Toggles
    if (ix.isButton() && ix.customId.startsWith("gate_toggle:")) {
      const key = ix.customId.split(":")[1];
      const cfg = ROLES.find((r) => r.customId.endsWith(key));
      if (!cfg)
        return ix.reply({
          content: "⚠️ Unknown role button.",
          ephemeral: true,
        });

      const guild = ix.guild;
      const member = await guild.members.fetch(ix.user.id);
      const role = await ensureRole(guild, cfg.name, cfg.color);
      const me = await guild.members.fetchMe();
      if (me.roles.highest.comparePositionTo(role) <= 0)
        return ix.reply({
          content: `⚠️ Move my highest role above \`${role.name}\`.`,
          ephemeral: true,
        });

      const has = member.roles.cache.has(role.id);
      if (has) {
        await member.roles.remove(role.id, "gate toggle");
        return ix.reply({
          content: `🧹 Removed \`${role.name}\`.`,
          ephemeral: true,
        });
      } else {
        await member.roles.add(role.id, "gate toggle");
        return ix.reply({
          content: `✅ Added \`${role.name}\`.`,
          ephemeral: true,
        });
      }
    }

    // Request builders -> show modal
    if (ix.isButton() && ix.customId === "gate_request:builders") {
      const modal = new ModalBuilder()
        .setCustomId("builders_request_modal")
        .setTitle("Request Builders Access");
      const reason = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Why do you need builders?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);
      const links = new TextInputBuilder()
        .setCustomId("links")
        .setLabel("Links (PRs, examples) — optional")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200);
      modal.addComponents(
        new ActionRowBuilder().addComponents(reason),
        new ActionRowBuilder().addComponents(links),
      );
      return ix.showModal(modal);
    }

    // Modal submitted
    if (ix.isModalSubmit() && ix.customId === "builders_request_modal") {
      const guild = ix.guild;
      const review = await ensureReviewChannel(guild);
    // eslint-disable-next-line no-unused-vars
      const buildersRole = await ensureRole(
        guild,
        BUILDERS_ROLE_NAME,
        0x00c2ff,
      );

      const reason = ix.fields.getTextInputValue("reason") || "(no reason)";
      const links = ix.fields.getTextInputValue("links") || "(none)";

      const embed = new EmbedBuilder()
        .setTitle("Builders Access Request")
        .addFields(
          {
            name: "User",
            value: `<@${ix.user.id}> (${ix.user.id})`,
            inline: false,
          },
          { name: "Reason", value: reason, inline: false },
          { name: "Links", value: links, inline: false },
        )
        .setColor(0x00c2ff)
        .setTimestamp(new Date());

      const approveId = `builders_approve:${ix.user.id}`;
      const denyId = `builders_deny:${ix.user.id}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(approveId)
          .setStyle(ButtonStyle.Success)
          .setLabel("Approve"),
        new ButtonBuilder()
          .setCustomId(denyId)
          .setStyle(ButtonStyle.Danger)
          .setLabel("Deny"),
      );

      await review
        .send({
          content: `@here Builders request pending for <@${ix.user.id}>`,
          embeds: [embed],
          components: [row],
          allowedMentions: { parse: ["everyone", "roles"] },
        })
        .catch(() => review.send({ embeds: [embed], components: [row] }));

      return ix.reply({
        content:
          "✅ Request sent to moderators. You’ll be notified after review.",
        ephemeral: true,
      });
    }

    // Approve / Deny
    if (
      ix.isButton() &&
      (ix.customId.startsWith("builders_approve:") ||
        ix.customId.startsWith("builders_deny:"))
    ) {
      // Only admins/managers can approve
      if (
        !ix.memberPermissions?.has(PermissionsBitField.Flags.ManageRoles) &&
        !ix.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
      ) {
        return ix.reply({
          content: "⛔ You need Manage Roles to approve/deny.",
          ephemeral: true,
        });
      }
      const targetId = ix.customId.split(":")[1];
      const action = ix.customId.startsWith("builders_approve:")
        ? "approve"
        : "deny";
      const guild = ix.guild;
      const member = await guild.members.fetch(targetId).catch(() => null);
      const buildersRole = await ensureRole(
        guild,
        BUILDERS_ROLE_NAME,
        0x00c2ff,
      );
      const me = await guild.members.fetchMe();
      if (action === "approve") {
        if (!member)
          return ix.reply({ content: "⚠️ User not found.", ephemeral: true });
        if (me.roles.highest.comparePositionTo(buildersRole) <= 0)
          return ix.reply({
            content: `⚠️ Move my highest role above \`${buildersRole.name}\`.`,
            ephemeral: true,
          });
        await member.roles.add(buildersRole.id, "Builders request approved");
        await ix.reply({
          content: `✅ Approved. Granted \`${buildersRole.name}\` to <@${targetId}>.`,
          ephemeral: true,
        });
      } else {
        await ix.reply({
          content: `🧹 Denied builders request for <@${targetId}>.`,
          ephemeral: true,
        });
      }
      // disable buttons on the review message
      try {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("disabled_approve")
            .setStyle(ButtonStyle.Success)
            .setLabel("Approve")
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId("disabled_deny")
            .setStyle(ButtonStyle.Danger)
            .setLabel("Deny")
            .setDisabled(true),
        );
        await ix.message.edit({ components: [row] });
      } catch { /* Intentionally empty */ }
      return;
    }
  } catch (err) {
    console.error("gate error:", err);
    if (ix.isRepliable()) {
      await ix
        .reply({ content: `⚠️ Error: ${err.message || err}`, ephemeral: true })
        .catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
