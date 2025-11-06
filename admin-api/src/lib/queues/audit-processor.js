"use strict";

/**
 * Audit Processor
 *
 * Handles asynchronous processing of audit events for event sourcing:
 * - User actions and system events logging
 * - Compliance and security event tracking
 * - Event-driven audit trail management
 */

const database = require("../database");
const { logger } = require("../logger");
const metrics = require("../monitoring/metrics");

/**
 * Process audit event logging job
 *
 * @param {Object} data - Job data
 * @param {string} data.userId - User ID who performed the action
 * @param {string} data.action - Action performed
 * @param {string} data.resourceType - Type of resource affected
 * @param {string} data.resourceId - ID of the affected resource
 * @param {Object} data.details - Additional details about the action
 * @param {string} data.ipAddress - IP address of the user
 * @param {string} data.userAgent - User agent string
 * @param {string} data.sessionId - Session ID for tracking
 * @param {string} data.requestId - Request ID for correlation
 * @param {boolean} data.success - Whether the action was successful
 * @param {string} data.errorMessage - Error message if action failed
 * @returns {Object} Processing result
 */
async function processLogEvent(data) {
  const {
    userId,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress,
    userAgent,
    sessionId,
    requestId,
    success = true,
    errorMessage,
  } = data;

  logger.debug(`[audit-processor] Processing audit event: ${action}`, {
    userId,
    resourceType,
    resourceId,
    requestId,
    success,
  });

  try {
    if (!database.isConfigured()) {
      logger.warn('[audit-processor] Database not configured, skipping audit logging');
      return { success: false, reason: 'database_not_configured' };
    }

    // Validate required fields
    if (!action || !resourceType || !resourceId) {
      throw new Error('Missing required audit fields: action, resourceType, resourceId');
    }

    // Create audit log entry
    const auditLog = await database.createAuditLog({
      userId,
      action,
      resourceType,
      resourceId,
      details: details || {},
      ipAddress,
      userAgent,
      sessionId,
      requestId,
      success,
      errorMessage,
    });

    // Record audit metrics
    metrics.recordAuditEvent({
      action,
      resourceType,
      success,
    });

    logger.debug(`[audit-processor] Audit event logged successfully`, {
      auditLogId: auditLog.id,
      action,
      resourceType,
      resourceId,
    });

    return {
      success: true,
      auditLogId: auditLog.id,
      loggedAt: auditLog.timestamp.toISOString(),
    };

  } catch (error) {
    logger.error(`[audit-processor] Failed to log audit event: ${action}`, {
      error: error.message,
      userId,
      resourceType,
      resourceId,
      requestId,
      stack: error.stack,
    });

    // Don't throw - audit logging failures shouldn't fail the main operation
    // But we should record this as a failed audit event
    metrics.recordAuditEvent({
      action: 'audit_log_failure',
      resourceType: 'system',
      success: false,
    });

    return {
      success: false,
      error: error.message,
      loggedAt: new Date().toISOString(),
    };
  }
}

/**
 * Process bulk audit event logging job
 *
 * @param {Object} data - Job data
 * @param {Array} data.events - Array of audit events to log
 * @returns {Object} Processing result
 */
async function processBulkLogEvents(data) {
  const { events } = data;

  logger.info(`[audit-processor] Processing ${events.length} bulk audit events`);

  const results = [];
  const errors = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    try {
      const result = await processLogEvent(event);
      results.push({
        index: i,
        success: result.success,
        auditLogId: result.auditLogId,
        loggedAt: result.loggedAt,
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

  logger.info(`[audit-processor] Bulk audit logging completed`, {
    total: events.length,
    success: successCount,
    errors: errorCount,
  });

  return {
    success: errorCount === 0,
    results,
    summary: {
      total: events.length,
      success: successCount,
      errors: errorCount,
    },
  };
}

/**
 * Process audit cleanup job (for compliance/data retention)
 *
 * @param {Object} data - Job data
 * @param {Date} data.beforeDate - Delete logs before this date
 * @param {Array} data.excludeActions - Actions to exclude from cleanup
 * @returns {Object} Processing result
 */
async function processAuditCleanup(data) {
  const { beforeDate, excludeActions = [] } = data;

  logger.info(`[audit-processor] Processing audit cleanup before ${beforeDate}`);

  try {
    if (!database.isConfigured()) {
      throw new Error('Database not configured');
    }

    const prisma = database.getClient();

    // Build exclusion filter
    const where = {
      timestamp: {
        lt: new Date(beforeDate),
      },
    };

    if (excludeActions.length > 0) {
      where.action = {
        notIn: excludeActions,
      };
    }

    // Count logs to be deleted
    const countToDelete = await prisma.auditLog.count({ where });

    if (countToDelete === 0) {
      logger.info('[audit-processor] No audit logs to clean up');
      return {
        success: true,
        deletedCount: 0,
      };
    }

    // Delete old audit logs
    const deleteResult = await prisma.auditLog.deleteMany({ where });

    logger.info(`[audit-processor] Audit cleanup completed`, {
      deletedCount: deleteResult.count,
      beforeDate,
      excludedActions: excludeActions,
    });

    return {
      success: true,
      deletedCount: deleteResult.count,
    };

  } catch (error) {
    logger.error(`[audit-processor] Failed to process audit cleanup`, {
      error: error.message,
      beforeDate,
      excludeActions,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Process audit report generation job
 *
 * @param {Object} data - Job data
 * @param {string} data.reportType - Type of report (daily, weekly, monthly)
 * @param {Date} data.startDate - Report start date
 * @param {Date} data.endDate - Report end date
 * @returns {Object} Processing result
 */
async function processAuditReport(data) {
  const { reportType, startDate, endDate } = data;

  logger.info(`[audit-processor] Generating ${reportType} audit report`, {
    startDate,
    endDate,
  });

  try {
    if (!database.isConfigured()) {
      throw new Error('Database not configured');
    }

    const filters = {
      startDate,
      endDate,
    };

    const stats = await database.getAuditLogStats(filters);

    // Generate detailed breakdowns
    const prisma = database.getClient();

    const [
      topUsers,
      topActions,
      topResources,
      failureAnalysis,
    ] = await Promise.all([
      // Top users by activity
      prisma.auditLog.groupBy({
        by: ['userId'],
        where: {
          userId: { not: null },
          timestamp: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      // Top actions
      prisma.auditLog.groupBy({
        by: ['action'],
        where: {
          timestamp: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      // Top resource types
      prisma.auditLog.groupBy({
        by: ['resourceType'],
        where: {
          timestamp: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      // Failure analysis
      prisma.auditLog.groupBy({
        by: ['action', 'success'],
        where: {
          timestamp: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        _count: { id: true },
      }),
    ]);

    const report = {
      reportType,
      period: {
        startDate,
        endDate,
      },
      generatedAt: new Date().toISOString(),
      summary: stats,
      topUsers: topUsers.map(item => ({
        userId: item.userId,
        count: item._count.id,
      })),
      topActions: topActions.map(item => ({
        action: item.action,
        count: item._count.id,
      })),
      topResources: topResources.map(item => ({
        resourceType: item.resourceType,
        count: item._count.id,
      })),
      failureAnalysis: failureAnalysis.map(item => ({
        action: item.action,
        success: item.success,
        count: item._count.id,
      })),
    };

    logger.info(`[audit-processor] ${reportType} audit report generated successfully`);

    return {
      success: true,
      report,
    };

  } catch (error) {
    logger.error(`[audit-processor] Failed to generate ${reportType} audit report`, {
      error: error.message,
      reportType,
      startDate,
      endDate,
      stack: error.stack,
    });
    throw error;
  }
}

module.exports = {
  processLogEvent,
  processBulkLogEvents,
  processAuditCleanup,
  processAuditReport,
};
