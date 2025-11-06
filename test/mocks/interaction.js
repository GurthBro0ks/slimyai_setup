const { PermissionFlagsBits, ChannelType } = require("discord.js");

class MockOptionResolver {
  constructor(values = {}, meta = {}) {
    this.values = { ...values };
    this.subcommand = meta.subcommand || null;
    this.subcommandGroup = meta.subcommandGroup || null;
    this.data = meta.data || [];
    this.resolved = meta.resolved || { attachments: new Map() };
  }

  _get(name) {
    if (Object.prototype.hasOwnProperty.call(this.values, name)) {
      return this.values[name];
    }
    return null;
  }

  _ensure(value, name, required) {
    if (value === null || typeof value === "undefined") {
      if (required) {
        throw new Error(
          `Missing required option "${name}" in mock interaction.`,
        );
      }
      return null;
    }
    return value;
  }

  getString(name, required = false) {
    const value = this._get(name);
    return this._ensure(value, name, required);
  }

  getInteger(name, required = false) {
    const value = this._get(name);
    if (value === null || typeof value === "undefined") {
      return this._ensure(value, name, required);
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(`Option "${name}" is not a valid integer.`);
    }
    return parsed;
  }

  getNumber(name, required = false) {
    const value = this._get(name);
    if (value === null || typeof value === "undefined") {
      return this._ensure(value, name, required);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Option "${name}" is not a valid number.`);
    }
    return parsed;
  }

  getBoolean(name, required = false) {
    const value = this._get(name);
    if (typeof value === "boolean") return value;
    if (value === null || typeof value === "undefined") {
      return this._ensure(value, name, required);
    }
    return Boolean(value);
  }

  getAttachment(name, required = false) {
    const value = this._get(name);
    return this._ensure(value, name, required);
  }

  getUser(name, required = false) {
    const value = this._get(name);
    return this._ensure(value, name, required);
  }

  getRole(name, required = false) {
    const value = this._get(name);
    return this._ensure(value, name, required);
  }

  getChannel(name, required = false) {
    const value = this._get(name);
    return this._ensure(value, name, required);
  }

  getSubcommand(required = true) {
    if (!this.subcommand && required) {
      throw new Error("Subcommand not provided in mock interaction.");
    }
    return this.subcommand;
  }

  getSubcommandGroup(required = false) {
    if (!this.subcommandGroup && required) {
      throw new Error("Subcommand group not provided in mock interaction.");
    }
    return this.subcommandGroup;
  }
}

class MockInteraction {
  constructor({
    commandName,
    user,
    guild,
    channel,
    member,
    options = {},
    optionMeta = {},
    client,
    locale = "en-US",
  }) {
    this.commandName = commandName;
    this.user = user;
    this.guild = guild;
    this.guildId = guild?.id || null;
    this.channel = channel;
    this.channelId = channel?.id || null;
    this.member = member;
    this.memberPermissions = member?.permissions || {
      has: (permission) => permission === PermissionFlagsBits.ViewChannel,
    };
    this.client = client;
    this.locale = locale;
    this.deferred = false;
    this.replied = false;
    this.replyLog = [];
    this.followUps = [];
    this.edits = [];
    this.options = new MockOptionResolver(options, optionMeta);
  }

  async reply(payload) {
    this.replied = true;
    this.replyLog.push({ type: "reply", payload });
    return payload;
  }

  async deferReply(options = {}) {
    this.deferred = true;
    this.replyLog.push({ type: "defer", payload: options });
    return true;
  }

  async editReply(payload) {
    if (!this.deferred && !this.replied) {
      throw new Error("Cannot edit reply before deferring or replying.");
    }
    this.edits.push(payload);
    return payload;
  }

  async followUp(payload) {
    this.followUps.push(payload);
    return payload;
  }

  isRepliable() {
    return true;
  }
}

function createDefaultChannel(overrides = {}) {
  return {
    id: "channel-default",
    name: "general",
    type: ChannelType.GuildText,
    parentId: null,
    isThread: () => false,
    ...overrides,
  };
}

function createPermissions({ admin = false } = {}) {
  const perms = new Set();
  if (admin) perms.add(PermissionFlagsBits.Administrator);
  return {
    has(bit) {
      if (bit === PermissionFlagsBits.Administrator) return admin;
      return perms.has(bit);
    },
  };
}

function createMember(user, { admin = false, roles = [] } = {}) {
  const roleCache = new Map(roles.map((role) => [role.id, role]));
  return {
    user,
    displayName: user.username,
    permissions: createPermissions({ admin }),
    roles: {
      cache: roleCache,
      has(roleId) {
        return roleCache.has(roleId);
      },
    },
  };
}

module.exports = {
  MockInteraction,
  MockOptionResolver,
  createDefaultChannel,
  createMember,
  createPermissions,
};
