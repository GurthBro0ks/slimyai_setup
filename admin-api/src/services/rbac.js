"use strict";

const config = require("../config");

const PERMISSIONS = {
  MANAGE_GUILD: BigInt(0x00000020),
  MANAGE_CHANNELS: BigInt(0x00000010),
  MANAGE_ROLES: BigInt(0x10000000),
};

function parsePermissions(value) {
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

function hasPermission(guild, bit) {
  if (!guild) return false;
  return (parsePermissions(guild.permissions) & bit) === bit;
}

function filterAllowedGuilds(guilds) {
  if (!Array.isArray(guilds)) return [];
  if (!config.guilds.allowedIds.size) return guilds;
  return guilds.filter((guild) => config.guilds.allowedIds.has(guild.id));
}

function determineRole(userId, guilds) {
  if (config.roles.ownerIds.has(userId)) return "owner";

  const allowed = filterAllowedGuilds(guilds);
  if (!allowed.length) return null;

  const hasManageGuild = allowed.some((guild) =>
    hasPermission(guild, PERMISSIONS.MANAGE_GUILD),
  );
  if (hasManageGuild) return "admin";

  const hasEditorPerm = allowed.some(
    (guild) =>
      hasPermission(guild, PERMISSIONS.MANAGE_CHANNELS) ||
      hasPermission(guild, PERMISSIONS.MANAGE_ROLES),
  );
  if (hasEditorPerm) return "editor";

  return "viewer";
}

function roleRank(role) {
  const index = config.roles.order.indexOf(role);
  return index === -1 ? -1 : index;
}

function hasRole(userRole, requiredRole) {
  return roleRank(userRole) >= roleRank(requiredRole);
}

module.exports = {
  determineRole,
  filterAllowedGuilds,
  hasRole,
  roleRank,
};
