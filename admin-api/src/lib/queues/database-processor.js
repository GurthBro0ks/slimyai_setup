"use strict";

/**
 * Database Job Processor
 *
 * Handles asynchronous processing of database operations:
 * - Conversation creation and management
 * - Message saving and retrieval
 * - Bulk operations with proper transaction handling
 */

const database = require("../database");
const { logger } = require("../logger");
const metrics = require("../monitoring/metrics");

/**
 * Process conversation creation job
 *
 * @param {Object} data - Job data
 * @param {string} data.userId - User ID creating the conversation
 * @param {string} data.title - Optional conversation title
 * @param {string} data.personalityMode - Personality mode (default: "helpful")
 * @returns {Object} Creation result
 */
async function processCreateConversation(data) {
  const { userId, title, personalityMode } = data;

  logger.info(`[database-processor] Creating conversation for user ${userId}`, {
    title: title?.substring(0, 50),
    personalityMode,
  });

  try {
    if (!database.isConfigured()) {
      throw new Error('Database not configured');
    }

    const conversationId = await database.createChatConversation(
      userId,
      title || null,
      personalityMode || 'helpful'
    );

    logger.info(`[database-processor] Conversation created successfully`, {
      conversationId,
      userId,
    });

    return {
      success: true,
      conversationId,
      createdAt: new Date().toISOString(),
    };

  } catch (error) {
    logger.error(`[database-processor] Failed to create conversation for user ${userId}:`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process message saving job
 *
 * @param {Object} data - Job data
 * @param {string} data.conversationId - Conversation ID
 * @param {string} data.userId - User ID
 * @param {string} data.role - Message role (user/assistant)
 * @param {string} data.content - Message content
 * @param {string} data.personalityMode - Optional personality mode
 * @returns {Object} Save result
 */
async function processSaveMessage(data) {
  const { conversationId, userId, role, content, personalityMode } = data;

  logger.debug(`[database-processor] Saving message to conversation ${conversationId}`, {
    userId,
    role,
    contentLength: content?.length,
    personalityMode,
  });

  try {
    if (!database.isConfigured()) {
      throw new Error('Database not configured');
    }

    await database.saveChatMessage(
      conversationId,
      userId,
      role,
      content,
      personalityMode || null
    );

    logger.debug(`[database-processor] Message saved successfully to conversation ${conversationId}`);

    return {
      success: true,
      savedAt: new Date().toISOString(),
    };

  } catch (error) {
    logger.error(`[database-processor] Failed to save message to conversation ${conversationId}:`, {
      error: error.message,
      userId,
      role,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process conversation update job
 *
 * @param {Object} data - Job data
 * @param {string} data.conversationId - Conversation ID to update
 * @param {string} data.userId - User ID making the update
 * @param {string} data.title - New conversation title
 * @returns {Object} Update result
 */
async function processUpdateConversation(data) {
  const { conversationId, userId, title } = data;

  logger.info(`[database-processor] Updating conversation ${conversationId}`, {
    userId,
    title: title?.substring(0, 50),
  });

  try {
    if (!database.isConfigured()) {
      throw new Error('Database not configured');
    }

    await database.updateConversationTitle(conversationId, userId, title);

    logger.info(`[database-processor] Conversation ${conversationId} updated successfully`);

    return {
      success: true,
      updatedAt: new Date().toISOString(),
    };

  } catch (error) {
    logger.error(`[database-processor] Failed to update conversation ${conversationId}:`, {
      error: error.message,
      userId,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process conversation deletion job
 *
 * @param {Object} data - Job data
 * @param {string} data.conversationId - Conversation ID to delete
 * @param {string} data.userId - User ID making the deletion
 * @returns {Object} Deletion result
 */
async function processDeleteConversation(data) {
  const { conversationId, userId } = data;

  logger.info(`[database-processor] Deleting conversation ${conversationId}`, {
    userId,
  });

  try {
    if (!database.isConfigured()) {
      throw new Error('Database not configured');
    }

    await database.deleteChatConversation(conversationId, userId);

    logger.info(`[database-processor] Conversation ${conversationId} deleted successfully`);

    return {
      success: true,
      deletedAt: new Date().toISOString(),
    };

  } catch (error) {
    logger.error(`[database-processor] Failed to delete conversation ${conversationId}:`, {
      error: error.message,
      userId,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process bulk conversation retrieval job
 *
 * @param {Object} data - Job data
 * @param {string} data.userId - User ID
 * @param {number} data.limit - Maximum number of conversations to retrieve
 * @returns {Object} Retrieval result
 */
async function processGetConversations(data) {
  const { userId, limit } = data;

  logger.debug(`[database-processor] Retrieving conversations for user ${userId}`, {
    limit,
  });

  try {
    if (!database.isConfigured()) {
      return {
        success: true,
        conversations: [],
      };
    }

    const conversations = await database.getChatConversations(userId, limit);

    // Get message count for each conversation (this is a heavier operation)
    const conversationsWithCounts = await Promise.all(
      conversations.map(async (conv) => {
        try {
          const messages = await database.getChatMessages(conv.id, 1);
          return {
            id: conv.id,
            title: conv.title,
            personalityMode: conv.personality_mode,
            createdAt: conv.created_at.toISOString(),
            updatedAt: conv.updated_at.toISOString(),
            messageCount: messages.length,
          };
        } catch (error) {
          logger.warn(`[database-processor] Failed to get message count for conversation ${conv.id}:`, {
            error: error.message,
          });
          // Return conversation without count rather than failing entirely
          return {
            id: conv.id,
            title: conv.title,
            personalityMode: conv.personality_mode,
            createdAt: conv.created_at.toISOString(),
            updatedAt: conv.updated_at.toISOString(),
            messageCount: 0,
          };
        }
      })
    );

    logger.debug(`[database-processor] Retrieved ${conversationsWithCounts.length} conversations for user ${userId}`);

    return {
      success: true,
      conversations: conversationsWithCounts,
    };

  } catch (error) {
    logger.error(`[database-processor] Failed to retrieve conversations for user ${userId}:`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process bulk message retrieval job
 *
 * @param {Object} data - Job data
 * @param {string} data.conversationId - Conversation ID
 * @param {number} data.limit - Maximum number of messages to retrieve
 * @returns {Object} Retrieval result
 */
async function processGetMessages(data) {
  const { conversationId, limit } = data;

  logger.debug(`[database-processor] Retrieving messages for conversation ${conversationId}`, {
    limit,
  });

  try {
    if (!database.isConfigured()) {
      return {
        success: true,
        messages: [],
      };
    }

    const messages = await database.getChatMessages(conversationId, limit);

    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      personalityMode: msg.personality_mode,
      createdAt: msg.created_at.toISOString(),
    }));

    logger.debug(`[database-processor] Retrieved ${formattedMessages.length} messages for conversation ${conversationId}`);

    return {
      success: true,
      messages: formattedMessages,
    };

  } catch (error) {
    logger.error(`[database-processor] Failed to retrieve messages for conversation ${conversationId}:`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  processCreateConversation,
  processSaveMessage,
  processUpdateConversation,
  processDeleteConversation,
  processGetConversations,
  processGetMessages,
};
