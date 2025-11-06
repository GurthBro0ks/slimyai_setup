"use strict";

/**
 * Chat Job Processor
 *
 * Handles asynchronous processing of chat-related operations:
 * - Chat bot interactions with OpenAI
 * - Message processing and validation
 * - Response caching and optimization
 */

const { askChatBot } = require("../../services/chat-bot");
const database = require("../database");
const { logger } = require("../logger");
const metrics = require("../monitoring/metrics");

/**
 * Process chat bot interaction job
 *
 * @param {Object} data - Job data
 * @param {string} data.prompt - User's message
 * @param {string} data.guildId - Discord guild ID for context
 * @param {string} data.userId - User ID who initiated the request
 * @param {string} data.requestId - Request ID for tracking
 * @returns {Object} Processing result
 */
async function processChatBotInteraction(data) {
  const { prompt, guildId, userId, requestId } = data;

  logger.info(`[chat-processor] Processing chat bot interaction for user ${userId}`, {
    requestId,
    guildId,
    promptLength: prompt?.length,
  });

  try {
    // Call the existing chat bot service
    const result = await askChatBot({ prompt, guildId });

    // Record successful interaction
    metrics.recordChatBotInteraction({
      success: true,
      responseLength: result.reply?.length || 0,
      usedFallback: result.usedFallback || false,
    });

    // Log the interaction for audit purposes
    await logChatInteraction({
      userId,
      guildId,
      prompt,
      reply: result.reply,
      usedFallback: result.usedFallback,
      requestId,
    });

    logger.info(`[chat-processor] Chat bot interaction completed for user ${userId}`, {
      requestId,
      success: true,
      replyLength: result.reply?.length,
    });

    return {
      success: true,
      reply: result.reply,
      usedFallback: result.usedFallback,
      processedAt: new Date().toISOString(),
    };

  } catch (error) {
    logger.error(`[chat-processor] Chat bot interaction failed for user ${userId}:`, {
      requestId,
      error: error.message,
      code: error.code,
      stack: error.stack,
    });

    // Record failed interaction
    metrics.recordChatBotInteraction({
      success: false,
      error: error.code || 'unknown_error',
    });

    // Log failed interaction
    await logChatInteraction({
      userId,
      guildId,
      prompt,
      error: error.message,
      errorCode: error.code,
      requestId,
    });

    throw error;
  }
}

/**
 * Log chat interaction for audit purposes
 *
 * @param {Object} interaction - Interaction data
 */
async function logChatInteraction(interaction) {
  try {
    if (!database.isConfigured()) {
      logger.warn('[chat-processor] Database not configured, skipping interaction logging');
      return;
    }

    // Create audit log entry
    await database.createAuditLog({
      userId: interaction.userId,
      action: interaction.error ? 'chat_bot_error' : 'chat_bot_interaction',
      resourceType: 'chat',
      resourceId: interaction.guildId || 'global',
      details: {
        prompt: interaction.prompt?.substring(0, 500), // Truncate long prompts
        reply: interaction.reply?.substring(0, 1000), // Truncate long replies
        error: interaction.error,
        errorCode: interaction.errorCode,
        usedFallback: interaction.usedFallback,
        requestId: interaction.requestId,
        timestamp: new Date().toISOString(),
      },
      ipAddress: null, // Not available in async processing
      userAgent: null, // Not available in async processing
    });

  } catch (logError) {
    logger.error('[chat-processor] Failed to log chat interaction:', {
      logError: logError.message,
      originalInteraction: {
        userId: interaction.userId,
        action: interaction.error ? 'chat_bot_error' : 'chat_bot_interaction',
      },
    });
    // Don't throw - logging failure shouldn't fail the main operation
  }
}

/**
 * Process message validation job
 *
 * @param {Object} data - Job data
 * @param {string} data.conversationId - Conversation ID
 * @param {Object} data.message - Message object
 * @param {string} data.userId - User ID
 * @returns {Object} Validation result
 */
async function processMessageValidation(data) {
  const { conversationId, message, userId } = data;

  logger.debug(`[chat-processor] Validating message for conversation ${conversationId}`);

  try {
    // Basic validation
    if (!message || typeof message !== 'object') {
      throw new Error('Invalid message format');
    }

    if (!message.role || !['user', 'assistant'].includes(message.role)) {
      throw new Error('Invalid message role');
    }

    if (!message.content || typeof message.content !== 'string' || message.content.trim().length === 0) {
      throw new Error('Message content is required');
    }

    if (message.content.length > 10000) {
      throw new Error('Message content too long (max 10000 characters)');
    }

    // Additional security checks
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(message.content)) {
        throw new Error('Message contains potentially unsafe content');
      }
    }

    logger.debug(`[chat-processor] Message validation passed for conversation ${conversationId}`);

    return {
      success: true,
      validatedMessage: {
        ...message,
        content: message.content.trim(),
        validatedAt: new Date().toISOString(),
      },
    };

  } catch (error) {
    logger.warn(`[chat-processor] Message validation failed for conversation ${conversationId}:`, {
      error: error.message,
      userId,
    });

    throw error;
  }
}

/**
 * Process bulk message processing job
 *
 * @param {Object} data - Job data
 * @param {Array} data.messages - Array of messages to process
 * @param {string} data.conversationId - Conversation ID
 * @returns {Object} Processing result
 */
async function processBulkMessages(data) {
  const { messages, conversationId } = data;

  logger.info(`[chat-processor] Processing ${messages.length} bulk messages for conversation ${conversationId}`);

  const results = [];
  const errors = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    try {
      const validationResult = await processMessageValidation({
        conversationId,
        message,
        userId: 'bulk_processor',
      });

      results.push({
        index: i,
        success: true,
        validatedMessage: validationResult.validatedMessage,
      });

    } catch (error) {
      errors.push({
        index: i,
        error: error.message,
      });

      results.push({
        index: i,
        success: false,
        error: error.message,
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const errorCount = errors.length;

  logger.info(`[chat-processor] Bulk message processing completed for conversation ${conversationId}`, {
    total: messages.length,
    success: successCount,
    errors: errorCount,
  });

  return {
    success: errorCount === 0,
    results,
    summary: {
      total: messages.length,
      success: successCount,
      errors: errorCount,
    },
  };
}

module.exports = {
  processChatBotInteraction,
  processMessageValidation,
  processBulkMessages,
};
