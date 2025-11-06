const path = require("node:path");
const { Collection, ChannelType } = require("discord.js");
const {
  MockInteraction,
  createDefaultChannel,
  createMember,
} = require("./interaction");

function buildGuild(base = {}) {
  const roles = new Collection();
  (base.roles || []).forEach((role) => {
    roles.set(role.id, role);
  });

  const channels = new Collection();
  const guild = {
    id: base.id || "guild-123",
    name: base.name || "QA Test Guild",
    iconURL: () => null,
    channels: { cache: channels },
    roles: { cache: roles },
    members: { cache: new Collection() },
  };

  return guild;
}

function buildClient({ guild, channel, user }) {
  const guilds = new Collection([[guild.id, guild]]);
  const users = new Collection([[user.id, user]]);
  const channels = new Collection([[channel.id, channel]]);

  return {
    ws: { ping: 42 },
    guilds: { cache: guilds },
    users: { cache: users },
    channels: { cache: channels },
  };
}

function createUser(overrides = {}) {
  return {
    id: overrides.id || "user-123",
    username: overrides.username || "TestUser",
    globalName: overrides.globalName || "Test User",
    bot: false,
    ...overrides,
  };
}

function createRole(overrides = {}) {
  return {
    id: overrides.id || "role-qa",
    name: overrides.name || "QA Role",
    position: overrides.position || 1,
    ...overrides,
  };
}

function createChannel(overrides = {}) {
  const channel = createDefaultChannel({
    id: overrides.id || "channel-qa",
    name: overrides.name || "qa-channel",
    type: overrides.type || ChannelType.GuildText,
    parentId: overrides.parentId || null,
    ...overrides,
  });
  return channel;
}

function attachGuildLinks(guild, channel, member) {
  channel.guild = guild;
  guild.channels.cache.set(channel.id, channel);
  guild.members.cache.set(member.user.id, member);
  return { guild, channel, member };
}

function makeInteractionFor(commandModule, overrides = {}) {
  const data = commandModule?.data;
  const commandName =
    typeof data?.toJSON === "function"
      ? data.toJSON().name
      : data?.name || "unknown";

  const roleOverrides = overrides.role ? [createRole(overrides.role)] : [];
  const guild = buildGuild({ ...overrides.guild, roles: roleOverrides });
  const user = createUser(overrides.user);
  const channel = createChannel(overrides.channel);

  const member = createMember(user, {
    admin: overrides.admin ?? true,
    roles: roleOverrides,
  });

  attachGuildLinks(guild, channel, member);

  const client = buildClient({ guild, channel, user });

  const optionMeta = {
    subcommand: overrides.subcommand || null,
    subcommandGroup: overrides.subcommandGroup || null,
    data: overrides.optionData || [],
    resolved: overrides.resolved || { attachments: new Map() },
  };

  const interaction = new MockInteraction({
    commandName,
    user,
    guild,
    channel,
    member,
    options: overrides.options || {},
    optionMeta,
    client,
    locale: overrides.locale || "en-US",
  });

  interaction.createdTimestamp = Date.now();
  interaction.commandGuildId = guild.id;

  if (overrides.attachments) {
    interaction.attachments = new Collection(
      overrides.attachments.map((attachment) => [attachment.id, attachment]),
    );
  }

  return interaction;
}

function createFixtureAttachment(
  name,
  buffer = Buffer.from("stub"),
  contentType = "text/plain",
) {
  return {
    id: `att-${Date.now()}`,
    name,
    contentType,
    size: buffer.length,
    url: `file://${path.join(process.cwd(), "tests", name)}`,
    proxyURL: `file://${path.join(process.cwd(), "tests", "proxy", name)}`,
    attachment: buffer,
  };
}

module.exports = {
  makeInteractionFor,
  createFixtureAttachment,
  createRole,
  createUser,
  createChannel,
};
