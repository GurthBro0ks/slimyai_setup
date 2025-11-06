"use strict";

/**
 * Chat Routes
 * 
 * Handles all chat-related API endpoints including:
 * - Bot chat interactions
 * - Chat history retrieval
 * - Conversation management (create, list, get, update, delete)
 * - Message persistence
 * 
 * All routes require authentication. Some routes require specific roles.
 */

const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getSession } = require("../../lib/session-store");
const metrics = require("../lib/monitoring/metrics");
const { queueManager } = require("../lib/queues");
const database = require("../../../lib/database");
const { chat } = require("../lib/validation/schemas");
const { apiHandler } = require("../lib/errors");

// Special room ID for admin-only global chat
const ADMIN_ROOM_ID = "admin-global";

const router = express.Router();
// All chat routes require authentication
router.use(requireAuth);

/**
 * POST /api/chat/bot
 *
 * Submit a chat bot interaction job for async processing.
 *
 * Requires: member role or higher
 *
 * Request body:
 *   - prompt: string (required) - User's message/question
 *   - guildId: string (required) - Discord guild ID for context
 *
 * Response:
 *   - ok: boolean
 *   - jobId: string - Job ID for tracking progress
 *   - status: string - Initial job status ("queued")
 *
 * Errors:
 *   - 400: missing_prompt - No prompt provided
 *   - 503: queues_unavailable - Job queues not available
 *   - 500: server_error - Internal server error
 */
router.post("/bot", requireRole("member"), express.json(), chat.bot, apiHandler(async (req, res) => {
  const { prompt, guildId } = req.body;
  const userId = req.user.id;

  // Basic validation (more detailed validation happens in the job processor)
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    const error = new Error("missing_prompt");
    error.code = "missing_prompt";
    throw error;
  }

  // Check if queues are available
  if (!queueManager.isInitialized) {
    res.status(503).json({ error: "queues_unavailable" });
    return;
  }

  try {
    // Submit job to chat queue
    const job = await queueManager.addJob('chat', 'chat_bot_interaction', {
      prompt: prompt.trim(),
      guildId,
      userId,
      requestId: req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    metrics.recordChatMessage();

    return {
      ok: true,
      jobId: job.id,
      status: "queued",
      estimatedWaitTime: "10-30 seconds", // Rough estimate
    };

  } catch (error) {
    console.error('[chat/bot] Failed to submit chat job:', error);
    throw error;
  }
}, {
  routeName: "chat/bot",
  errorMapper: (error, req, res) => {
    if (error.code === "missing_prompt") {
      res.status(400).json({ error: "missing_prompt" });
      return false; // Don't continue with default error handling
    }
    // Let default error handling take over
    return null;
  }
}));

/**
 * GET /api/chat/jobs/:jobId
 *
 * Check the status of a chat bot job and retrieve results when complete.
 *
 * Requires: member role or higher, job ownership
 *
 * Path parameters:
 *   - jobId: string - Job ID returned from chat/bot endpoint
 *
 * Response:
 *   - ok: boolean
 *   - status: string - Job status ("queued", "active", "completed", "failed")
 *   - result: object (only present when status is "completed")
 *     - reply: string - AI-generated response
 *     - usedFallback: boolean - Whether fallback response was used
 *   - error: string (only present when status is "failed")
 *
 * Errors:
 *   - 404: job_not_found - Job doesn't exist
 *   - 403: job_access_denied - User doesn't own this job
 *   - 503: queues_unavailable - Job queues not available
 */
router.get("/jobs/:jobId", requireRole("member"), apiHandler(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id;

  // Check if queues are available
  if (!queueManager.isInitialized) {
    res.status(503).json({ error: "queues_unavailable" });
    return;
  }

  try {
    const chatQueue = queueManager.getQueue('chat');
    const job = await chatQueue.getJob(jobId);

    if (!job) {
      res.status(404).json({ error: "job_not_found" });
      return;
    }

    // Check job ownership (stored in job data)
    if (job.data.userId !== userId) {
      res.status(403).json({ error: "job_access_denied" });
      return;
    }

    const state = await job.getState();

    const response = {
      ok: true,
      status: state,
      jobId,
      createdAt: job.opts.timestamp,
    };

    if (state === 'completed') {
      response.result = job.returnvalue;
      response.completedAt = job.finishedOn;
    } else if (state === 'failed') {
      response.error = job.failedReason;
      response.failedAt = job.finishedOn;
    } else if (state === 'active') {
      // Get progress if available
      const progress = job.progress;
      if (progress) {
        response.progress = progress;
      }
    }

    return response;

  } catch (error) {
    console.error('[chat/jobs] Failed to get job status:', error);
    throw error;
  }
}, { routeName: "chat/jobs" }));

/**
 * GET /api/chat/db-jobs/:jobId
 *
 * Check the status of a database operation job and retrieve results when complete.
 *
 * Requires: Authentication, job ownership
 *
 * Path parameters:
 *   - jobId: string - Job ID returned from database operation endpoints
 *
 * Response:
 *   - ok: boolean
 *   - status: string - Job status ("queued", "active", "completed", "failed")
 *   - jobType: string - Type of database operation
 *   - result: object (only present when status is "completed")
 *   - error: string (only present when status is "failed")
 *
 * Errors:
 *   - 404: job_not_found - Job doesn't exist
 *   - 403: job_access_denied - User doesn't own this job
 *   - 503: queues_unavailable - Job queues not available
 */
router.get("/db-jobs/:jobId", apiHandler(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id;

  // Check if queues are available
  if (!queueManager.isInitialized) {
    res.status(503).json({ error: "queues_unavailable" });
    return;
  }

  try {
    const databaseQueue = queueManager.getQueue('database');
    const job = await databaseQueue.getJob(jobId);

    if (!job) {
      res.status(404).json({ error: "job_not_found" });
      return;
    }

    // Check job ownership (stored in job data)
    if (job.data.userId !== userId) {
      res.status(403).json({ error: "job_access_denied" });
      return;
    }

    const state = await job.getState();

    const response = {
      ok: true,
      status: state,
      jobId,
      jobType: job.name,
      createdAt: job.opts.timestamp,
    };

    if (state === 'completed') {
      response.result = job.returnvalue;
      response.completedAt = job.finishedOn;
    } else if (state === 'failed') {
      response.error = job.failedReason;
      response.failedAt = job.finishedOn;
    }

    return response;

  } catch (error) {
    console.error('[chat/db-jobs] Failed to get job status:', error);
    throw error;
  }
}, { routeName: "chat/db-jobs" }));

/**
 * GET /api/chat/:guildId/history
 * 
 * Retrieve chat history for a specific guild.
 * 
 * Requires: member role or higher, guild membership (unless admin)
 * 
 * Query parameters:
 *   - limit: number (optional) - Maximum number of messages to return (default: 50)
 * 
 * Path parameters:
 *   - guildId: string - Discord guild ID or "admin-global" for admin room
 * 
 * Response:
 *   - ok: boolean
 *   - messages: array - Array of chat messages with metadata
 * 
 * Access control:
 *   - Admin room (admin-global): Admin role required
 *   - Regular guilds: Must be guild member or admin
 *   - Guild admins/club members: Can view all messages
 *   - Regular members: Can view non-admin-only messages
 */
router.get("/:guildId/history", chat.history, apiHandler(async (req, res) => {
  const { guildId } = req.params;
  const { limit } = req.query;
  const isAdmin = req.user.role === "admin";

  if (guildId === ADMIN_ROOM_ID) {
    if (!isAdmin) {
      res.status(403).json({
        error: "forbidden",
        hint: "admin room is available to admins only",
      });
      return; // Early return to prevent further execution
    }
  } else {
    const session = getSession(req.user.id);
    const guilds = Array.isArray(session?.guilds) ? session.guilds : [];
    const guildEntry = guilds.find((guild) => String(guild.id) === guildId);
    const effectiveRole = guildEntry?.role || req.user.role || "member";

    const allowed =
      isAdmin || effectiveRole === "admin" || effectiveRole === "club";

    if (!allowed) {
      res.status(403).json({
        error: "forbidden",
        hint: "insufficient role to view chat history",
      });
      return; // Early return to prevent further execution
    }

    if (!guildEntry && !isAdmin) {
      res.status(403).json({
        error: "not_in_guild",
        guildId,
      });
      return; // Early return to prevent further execution
    }
  }

  if (!database.isConfigured()) {
    return { ok: true, messages: [] };
  }

  const includeAdminOnly = guildId === ADMIN_ROOM_ID || isAdmin;
  const messages = await database.getChatMessages(guildId, limit, includeAdminOnly);

  const formatted = messages.map((msg) => ({
    messageId: msg.message_id,
    guildId: msg.guild_id,
    userId: msg.user_id,
    username: msg.global_name || msg.username,
    from: {
      id: msg.user_id,
      name: msg.global_name || msg.username,
      role: msg.user_role,
      color: getColorForRole(msg.user_role),
    },
    text: msg.text,
    adminOnly: Boolean(msg.admin_only),
    ts: msg.created_at.toISOString(),
  }));

  return { ok: true, messages: formatted };
}, { routeName: "chat/history" }));

/**
 * POST /api/chat/conversations
 *
 * Submit a job to create a new chat conversation for the authenticated user.
 *
 * Requires: Authentication
 *
 * Request body:
 *   - title: string (optional) - Conversation title
 *   - personalityMode: string (optional) - Personality mode (default: "helpful")
 *
 * Response:
 *   - ok: boolean
 *   - jobId: string - Job ID for tracking progress
 *   - status: string - Initial job status ("queued")
 *
 * Errors:
 *   - 503: queues_unavailable - Job queues not available
 *   - 500: server_error - Internal server error
 */
router.post("/conversations", express.json(), chat.createConversation, apiHandler(async (req, res) => {
  const { title, personalityMode } = req.body;
  const userId = req.user.id;

  // Check if queues are available
  if (!queueManager.isInitialized) {
    res.status(503).json({ error: "queues_unavailable" });
    return;
  }

  try {
    // Submit job to database queue
    const job = await queueManager.addJob('database', 'create_conversation', {
      userId,
      title: title || null,
      personalityMode: personalityMode || 'helpful',
      requestId: req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    return {
      ok: true,
      jobId: job.id,
      status: "queued",
      estimatedWaitTime: "2-5 seconds", // Rough estimate for DB operations
    };

  } catch (error) {
    console.error('[chat/conversations] Failed to submit conversation creation job:', error);
    throw error;
  }
}, { routeName: "chat/conversations" }));

/**
 * GET /api/chat/conversations
 * 
 * List all conversations for the authenticated user.
 * 
 * Requires: Authentication
 * 
 * Query parameters:
 *   - limit: number (optional) - Maximum number of conversations to return
 * 
 * Response:
 *   - ok: boolean
 *   - conversations: array - Array of conversation objects with metadata
 */
router.get("/conversations", chat.listConversations, apiHandler(async (req, res) => {
  const userId = req.user.id;
  const { limit } = req.query;

  if (!database.isConfigured()) {
    return { ok: true, conversations: [] };
  }

  const conversations = await database.getChatConversations(userId, limit);

  // Get message count for each conversation
  const conversationsWithCounts = await Promise.all(
    conversations.map(async (conv) => {
      const messages = await database.getChatMessages(conv.id, 1);
      return {
        id: conv.id,
        title: conv.title,
        personalityMode: conv.personality_mode,
        createdAt: conv.created_at.toISOString(),
        updatedAt: conv.updated_at.toISOString(),
        messageCount: messages.length,
      };
    })
  );

  return {
    ok: true,
    conversations: conversationsWithCounts,
  };
}, { routeName: "chat/conversations" }));

/**
 * GET /api/chat/conversations/:conversationId
 * 
 * Get a specific conversation with all its messages.
 * 
 * Requires: Authentication, conversation ownership
 * 
 * Path parameters:
 *   - conversationId: string - Conversation ID
 * 
 * Response:
 *   - ok: boolean
 *   - conversation: object - Conversation object with messages array
 * 
 * Errors:
 *   - 404: conversation_not_found - Conversation doesn't exist or user doesn't have access
 */
router.get("/conversations/:conversationId", chat.getConversation, apiHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;

  if (!database.isConfigured()) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }

  // Verify ownership
  const conversations = await database.getChatConversations(userId, 1000);
  const conversation = conversations.find(c => c.id === conversationId);

  if (!conversation) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }

  const messages = await database.getChatMessages(conversationId, 1000);

  const formattedMessages = messages.map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    personalityMode: msg.personality_mode,
    createdAt: msg.created_at.toISOString(),
  }));

  return {
    ok: true,
    conversation: {
      id: conversation.id,
      title: conversation.title,
      personalityMode: conversation.personality_mode,
      createdAt: conversation.created_at.toISOString(),
      updatedAt: conversation.updated_at.toISOString(),
      messages: formattedMessages,
    },
  };
}, { routeName: "chat/conversations/:id" }));

/**
 * DELETE /api/chat/conversations/:conversationId
 * 
 * Delete a conversation. Only the owner can delete their own conversations.
 * 
 * Requires: Authentication, conversation ownership
 * 
 * Path parameters:
 *   - conversationId: string - Conversation ID to delete
 * 
 * Response:
 *   - ok: boolean
 * 
 * Errors:
 *   - 404: conversation_not_found - Conversation doesn't exist or user doesn't have access
 */
router.delete("/conversations/:conversationId", chat.deleteConversation, apiHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;

  if (!database.isConfigured()) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }

  await database.deleteChatConversation(conversationId, userId);

  return { ok: true };
}, {
  routeName: "chat/conversations/:id",
  errorMapper: (error, req, res) => {
    if (error.message === 'Conversation not found or access denied') {
      res.status(404).json({ error: "conversation_not_found" });
      return false; // Don't continue with default error handling
    }
    // Let default error handling take over
    return null;
  }
}));

/**
 * PATCH /api/chat/conversations/:conversationId
 * 
 * Update a conversation's title.
 * 
 * Requires: Authentication, conversation ownership
 * 
 * Path parameters:
 *   - conversationId: string - Conversation ID
 * 
 * Request body:
 *   - title: string (optional) - New conversation title
 * 
 * Response:
 *   - ok: boolean
 * 
 * Errors:
 *   - 404: conversation_not_found - Conversation doesn't exist or user doesn't have access
 */
router.patch("/conversations/:conversationId", express.json(), chat.updateConversation, apiHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;
  const { title } = req.body;

  if (!database.isConfigured()) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }

  await database.updateConversationTitle(conversationId, userId, title);

  return { ok: true };
}, {
  routeName: "chat/conversations/:id",
  errorMapper: (error, req, res) => {
    if (error.message === 'Conversation not found or access denied') {
      res.status(404).json({ error: "conversation_not_found" });
      return false; // Don't continue with default error handling
    }
    // Let default error handling take over
    return null;
  }
}));

/**
 * POST /api/chat/messages
 *
 * Submit a job to add a message to a conversation.
 *
 * Requires: Authentication
 *
 * Request body:
 *   - conversationId: string (required) - Conversation ID
 *   - message: object (required) - Message object
 *     - role: string (required) - "user" or "assistant"
 *     - content: string (required) - Message content
 *     - personalityMode: string (optional) - Personality mode used
 *
 * Response:
 *   - ok: boolean
 *   - jobId: string - Job ID for tracking progress
 *   - status: string - Initial job status ("queued")
 *
 * Errors:
 *   - 503: queues_unavailable - Job queues not available
 */
router.post("/messages", express.json(), chat.addMessage, apiHandler(async (req, res) => {
  const { conversationId, message } = req.body;
  const userId = req.user.id;

  // Check if queues are available
  if (!queueManager.isInitialized) {
    res.status(503).json({ error: "queues_unavailable" });
    return;
  }

  try {
    // Submit job to database queue
    const job = await queueManager.addJob('database', 'save_message', {
      conversationId,
      userId,
      role: message.role,
      content: message.content,
      personalityMode: message.personalityMode || null,
      requestId: req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    });

    return {
      ok: true,
      jobId: job.id,
      status: "queued",
      estimatedWaitTime: "1-3 seconds", // Rough estimate for DB operations
    };

  } catch (error) {
    console.error('[chat/messages] Failed to submit message saving job:', error);
    throw error;
  }
}, { routeName: "chat/messages" }));

/**
 * Get color code for a user role.
 * Used for UI display purposes in chat history.
 * 
 * @param {string} role - User role (member, club, admin, bot)
 * @returns {string} Hex color code
 */
function getColorForRole(role) {
  const colors = {
    member: "#3b82f6",  // Blue
    club: "#f59e0b",     // Orange
    admin: "#ef4444",    // Red
    bot: "#22c55e",      // Green
  };
  return colors[role] || colors.member;
}

module.exports = router;
