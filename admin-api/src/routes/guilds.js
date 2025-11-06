"use strict";

const express = require("express");
const { requireAuth, requireRole, requireGuildMember } = require("../middleware/auth");
const { cacheGuildData, cacheUserData, getAPICache } = require("../middleware/cache");
const { guilds } = require("../lib/validation/schemas");
const guildService = require("../services/guild.service");
const metrics = require("../lib/monitoring/metrics");
const { apiHandler } = require("../lib/errors");

const router = express.Router();
router.use(requireAuth);


// Guild CRUD operations

/**
 * GET /api/guilds
 * List all guilds with pagination
 */
router.get("/", requireRole("admin"), guilds.list, cacheUserData(300), apiHandler(async (req, res) => {
  const {
    limit = 50,
    offset = 0,
    search,
    includeMembers = false,
  } = req.query;

  const result = await guildService.listGuilds({
    limit: parseInt(limit),
    offset: parseInt(offset),
    search,
    includeMembers: includeMembers === "true",
  });

  metrics.recordApiCall("guilds.list");
  return result;
}, { routeName: "guilds/list" }));

/**
 * POST /api/guilds
 * Create a new guild
 */
router.post("/", requireRole("admin"), express.json(), guilds.create, apiHandler(async (req, res) => {
  const { discordId, name, settings = {} } = req.body;

  const guild = await guildService.createGuild({
    discordId,
    name,
    settings,
  });

  // Invalidate cache for guilds list
  const cache = getAPICache();
  await cache.invalidate('api:*guilds*');

  metrics.recordApiCall("guilds.create");
  res.status(201); // Set status before returning
  return guild;
}, {
  routeName: "guilds/create",
  errorMapper: (error, req, res) => {
    if (error.message.includes("already exists")) {
      res.status(409).json({ error: "guild_already_exists" });
      return false; // Don't continue with default error handling
    }
    // Let default error handling take over
    return null;
  }
}));

/**
 * GET /api/guilds/:id
 * Get guild by ID
 */
router.get("/:id", requireGuildMember(), cacheGuildData(180), apiHandler(async (req, res) => {
  const { id } = req.params;
  const { includeMembers = true } = req.query;

  const guild = await guildService.getGuildById(id);

  // Check if user has permission to view this guild
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "view_members"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  metrics.recordApiCall("guilds.get");
  return includeMembers === "false" ? { ...guild, members: undefined } : guild;
}, {
  routeName: "guilds/get",
  errorMapper: (error, req, res) => {
    if (error.message === "Guild not found") {
      res.status(404).json({ error: "guild_not_found" });
      return false; // Don't continue with default error handling
    }
    // Let default error handling take over
    return null;
  }
}));

/**
 * PATCH /api/guilds/:id
 * Update guild
 */
router.patch("/:id", requireGuildMember(), express.json(), guilds.update, apiHandler(async (req, res) => {
  const { id } = req.params;
  const { name, settings } = req.body;

  // Check permissions
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "manage_guild"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  const guild = await guildService.updateGuild(id, { name, settings });

  // Invalidate cache for this guild and guilds list
  const cache = getAPICache();
  await cache.invalidate(`api:*guild_${id}*`);
  await cache.invalidate('api:*guilds*');

  metrics.recordApiCall("guilds.update");
  return guild;
}, {
  routeName: "guilds/update",
  errorMapper: (error, req, res) => {
    if (error.message === "Guild not found") {
      res.status(404).json({ error: "guild_not_found" });
      return false; // Don't continue with default error handling
    }
    // Let default error handling take over
    return null;
  }
}));

/**
 * DELETE /api/guilds/:id
 * Delete guild
 */
router.delete("/:id", requireRole("admin"), apiHandler(async (req, res) => {
  const { id } = req.params;

  await guildService.deleteGuild(id);

  metrics.recordApiCall("guilds.delete");
  return { success: true };
}, {
  routeName: "guilds/delete",
  errorMapper: (error, req, res) => {
    if (error.message === "Guild not found") {
      res.status(404).json({ error: "guild_not_found" });
      return false; // Don't continue with default error handling
    }
    // Let default error handling take over
    return null;
  }
}));

// Member management

/**
 * GET /api/guilds/:id/members
 * Get guild members
 */
router.get("/:id/members", requireGuildMember(), guilds.members, cacheGuildData(120), apiHandler(async (req, res) => {
  const { id } = req.params;
  const {
    limit = 50,
    offset = 0,
    search,
  } = req.query;

  // Check permissions
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "view_members"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  const result = await guildService.getGuildMembers(id, {
    limit: parseInt(limit),
    offset: parseInt(offset),
    search,
  });

  metrics.recordApiCall("guilds.members.list");
  return result;
}, { routeName: "guilds/members" }));

/**
 * POST /api/guilds/:id/members
 * Add member to guild
 */
router.post("/:id/members", requireGuildMember(), express.json(), guilds.addMember, apiHandler(async (req, res) => {
  const { id } = req.params;
  const { userId, roles = [] } = req.body;

  // Check permissions
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "manage_members"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  const member = await guildService.addMember(id, userId, roles);

  metrics.recordApiCall("guilds.members.add");
  res.status(201); // Set status before returning
  return member;
}, {
  routeName: "guilds/members/add",
  errorMapper: (error, req, res) => {
    if (error.message === "User not found") {
      res.status(404).json({ error: "user_not_found" });
      return false;
    }
    if (error.message === "Guild not found") {
      res.status(404).json({ error: "guild_not_found" });
      return false;
    }
    if (error.message.includes("already a member")) {
      res.status(409).json({ error: "user_already_member" });
      return false;
    }
    // Let default error handling take over
    return null;
  }
}));

/**
 * PATCH /api/guilds/:id/members/:userId
 * Update member roles
 */
router.patch("/:id/members/:userId", requireGuildMember(), express.json(), guilds.updateMember, apiHandler(async (req, res) => {
  const { id, userId } = req.params;
  const { roles } = req.body;

  // Check permissions
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "manage_members"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  const member = await guildService.updateMemberRoles(id, userId, roles);

  metrics.recordApiCall("guilds.members.update");
  return member;
}, {
  routeName: "guilds/members/update",
  errorMapper: (error, req, res) => {
    if (error.message === "User is not a member of this guild") {
      res.status(404).json({ error: "member_not_found" });
      return false;
    }
    // Let default error handling take over
    return null;
  }
}));

/**
 * DELETE /api/guilds/:id/members/:userId
 * Remove member from guild
 */
router.delete("/:id/members/:userId", requireGuildMember(), apiHandler(async (req, res) => {
  const { id, userId } = req.params;

  // Check permissions
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "manage_members"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  await guildService.removeMember(id, userId);

  metrics.recordApiCall("guilds.members.remove");
  return { success: true };
}, {
  routeName: "guilds/members/remove",
  errorMapper: (error, req, res) => {
    if (error.message === "User is not a member of this guild") {
      res.status(404).json({ error: "member_not_found" });
      return false;
    }
    // Let default error handling take over
    return null;
  }
}));

// Bulk operations

/**
 * POST /api/guilds/:id/members/bulk-add
 * Bulk add members
 */
router.post("/:id/members/bulk-add", requireGuildMember(), express.json(), guilds.bulkAddMembers, apiHandler(async (req, res) => {
  const { id } = req.params;
  const { members } = req.body;

  // Check permissions
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "manage_members"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  const result = await guildService.bulkAddMembers(id, members);

  metrics.recordApiCall("guilds.members.bulk_add");
  return result;
}, { routeName: "guilds/members/bulk-add" }));

/**
 * POST /api/guilds/:id/members/bulk-update
 * Bulk update member roles
 */
router.post("/:id/members/bulk-update", requireGuildMember(), express.json(), guilds.bulkUpdateMembers, apiHandler(async (req, res) => {
  const { id } = req.params;
  const { updates } = req.body;

  // Check permissions
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "manage_members"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  const result = await guildService.bulkUpdateMemberRoles(id, updates);

  metrics.recordApiCall("guilds.members.bulk_update");
  return result;
}, { routeName: "guilds/members/bulk-update" }));

/**
 * POST /api/guilds/:id/members/bulk-remove
 * Bulk remove members
 */
router.post("/:id/members/bulk-remove", requireGuildMember(), express.json(), guilds.bulkRemoveMembers, apiHandler(async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;

  // Check permissions
  if (req.user.role !== "admin") {
    const hasPermission = await guildService.checkPermission(
      req.user.id,
      id,
      "manage_members"
    );
    if (!hasPermission) {
      res.status(403).json({ error: "insufficient_permissions" });
      return;
    }
  }

  const result = await guildService.bulkRemoveMembers(id, userIds);

  metrics.recordApiCall("guilds.members.bulk_remove");
  return result;
}, { routeName: "guilds/members/bulk-remove" }));

// User guild relationships

/**
 * GET /api/guilds/user/:userId
 * Get user's guilds
 */
router.get("/user/:userId", guilds.userGuilds, cacheUserData(180), apiHandler(async (req, res) => {
  const { userId } = req.params;

  // Users can only view their own guilds unless they're admin
  if (req.user.id !== userId && req.user.role !== "admin") {
    res.status(403).json({ error: "insufficient_permissions" });
    return;
  }

  const guilds = await guildService.getUserGuilds(userId);

  metrics.recordApiCall("guilds.user_guilds");
  return { guilds };
}, { routeName: "guilds/user" }));

module.exports = router;
