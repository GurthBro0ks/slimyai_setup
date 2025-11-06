"use strict";

/**
 * Queue Infrastructure
 *
 * Provides job queuing capabilities using BullMQ with Redis.
 * Supports async processing of heavy operations like chat bot interactions,
 * database writes, and background tasks.
 *
 * Queues:
 * - chat: Chat bot interactions and message processing
 * - database: Database operations and data processing
 * - audit: Event sourcing and audit trail logging
 */

const { Queue, Worker, QueueScheduler } = require('bullmq');
const Redis = require('ioredis');
const config = require('../config');
const { logger } = require('../logger');
const metrics = require('../monitoring/metrics');
const { processChatBotInteraction } = require('./chat-processor');
const {
  processCreateConversation,
  processSaveMessage,
  processUpdateConversation,
  processDeleteConversation,
} = require('./database-processor');
const { processLogEvent } = require('./audit-processor');

class QueueManager {
  constructor() {
    this.redis = null;
    this.queues = new Map();
    this.workers = new Map();
    this.schedulers = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize Redis connection and queues
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Initialize Redis connection
      this.redis = new Redis(config.redis.url, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        lazyConnect: true,
      });

      // Test Redis connection
      await this.redis.ping();
      logger.info('[queues] Connected to Redis');

      // Initialize queues
      await this._initializeQueues();

      // Initialize workers
      await this._initializeWorkers();

      // Initialize schedulers for reliability
      await this._initializeSchedulers();

      this.isInitialized = true;
      logger.info('[queues] Queue infrastructure initialized');
      return true;
    } catch (error) {
      logger.error('[queues] Failed to initialize queue infrastructure:', error);
      return false;
    }
  }

  /**
   * Initialize job queues
   */
  async _initializeQueues() {
    const queueConfigs = [
      { name: 'chat', concurrency: 5 },
      { name: 'database', concurrency: 10 },
      { name: 'audit', concurrency: 2 },
    ];

    for (const { name, concurrency } of queueConfigs) {
      const queue = new Queue(name, {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: 50,    // Keep last 50 completed jobs
          removeOnFail: 100,       // Keep last 100 failed jobs
          attempts: 3,             // Retry failed jobs 3 times
          backoff: {
            type: 'exponential',
            delay: 2000,           // Start with 2 second delay
          },
        },
      });

      this.queues.set(name, queue);
      logger.info(`[queues] Initialized queue: ${name}`);
    }
  }

  /**
   * Initialize job workers
   */
  async _initializeWorkers() {
    // Chat queue worker
    const chatWorker = new Worker('chat', async (job) => {
      const startTime = Date.now();
      try {
        const result = await this._processChatJob(job);
        const duration = Date.now() - startTime;
        metrics.recordJobDuration('chat', duration);
        metrics.recordJobCompleted('chat');
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        metrics.recordJobDuration('chat', duration);
        metrics.recordJobFailed('chat');
        logger.error(`[queues] Chat job ${job.id} failed:`, error);
        throw error;
      }
    }, {
      connection: this.redis,
      concurrency: 5,
    });

    // Database queue worker
    const databaseWorker = new Worker('database', async (job) => {
      const startTime = Date.now();
      try {
        const result = await this._processDatabaseJob(job);
        const duration = Date.now() - startTime;
        metrics.recordJobDuration('database', duration);
        metrics.recordJobCompleted('database');
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        metrics.recordJobDuration('database', duration);
        metrics.recordJobFailed('database');
        logger.error(`[queues] Database job ${job.id} failed:`, error);
        throw error;
      }
    }, {
      connection: this.redis,
      concurrency: 10,
    });

    // Audit queue worker
    const auditWorker = new Worker('audit', async (job) => {
      const startTime = Date.now();
      try {
        const result = await this._processAuditJob(job);
        const duration = Date.now() - startTime;
        metrics.recordJobDuration('audit', duration);
        metrics.recordJobCompleted('audit');
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        metrics.recordJobDuration('audit', duration);
        metrics.recordJobFailed('audit');
        logger.error(`[queues] Audit job ${job.id} failed:`, error);
        throw error;
      }
    }, {
      connection: this.redis,
      concurrency: 2,
    });

    this.workers.set('chat', chatWorker);
    this.workers.set('database', databaseWorker);
    this.workers.set('audit', auditWorker);

    logger.info('[queues] Initialized job workers');
  }

  /**
   * Initialize queue schedulers for job reliability
   */
  async _initializeSchedulers() {
    const queueNames = ['chat', 'database', 'audit'];

    for (const queueName of queueNames) {
      const scheduler = new QueueScheduler(queueName, {
        connection: this.redis,
      });
      this.schedulers.set(queueName, scheduler);
    }

    logger.info('[queues] Initialized queue schedulers');
  }

  /**
   * Get a queue by name
   */
  getQueue(name) {
    return this.queues.get(name);
  }

  /**
   * Add a job to a queue
   */
  async addJob(queueName, jobName, data, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.add(jobName, data, {
      priority: options.priority || 0,
      delay: options.delay || 0,
      ...options,
    });

    metrics.recordJobQueued(queueName);
    logger.debug(`[queues] Added job ${job.id} to queue ${queueName}:${jobName}`);

    return job;
  }

  /**
   * Process chat-related jobs
   */
  async _processChatJob(job) {
    const { type, data } = job.data;

    switch (type) {
      case 'chat_bot_interaction':
        return await this._processChatBotInteraction(data);
      default:
        throw new Error(`Unknown chat job type: ${type}`);
    }
  }

  /**
   * Process database-related jobs
   */
  async _processDatabaseJob(job) {
    const { type, data } = job.data;

    switch (type) {
      case 'create_conversation':
        return await this._processCreateConversation(data);
      case 'save_message':
        return await this._processSaveMessage(data);
      case 'update_conversation':
        return await this._processUpdateConversation(data);
      case 'delete_conversation':
        return await this._processDeleteConversation(data);
      default:
        throw new Error(`Unknown database job type: ${type}`);
    }
  }

  /**
   * Process audit-related jobs
   */
  async _processAuditJob(job) {
    const { type, data } = job.data;

    switch (type) {
      case 'log_event':
        return await this._processLogEvent(data);
      default:
        throw new Error(`Unknown audit job type: ${type}`);
    }
  }

  /**
   * Process chat bot interaction job
   */
  async _processChatBotInteraction(data) {
    return await processChatBotInteraction(data);
  }

  /**
   * Process conversation creation job
   */
  async _processCreateConversation(data) {
    return await processCreateConversation(data);
  }

  /**
   * Process message saving job
   */
  async _processSaveMessage(data) {
    return await processSaveMessage(data);
  }

  /**
   * Process conversation update job
   */
  async _processUpdateConversation(data) {
    return await processUpdateConversation(data);
  }

  /**
   * Process conversation deletion job
   */
  async _processDeleteConversation(data) {
    return await processDeleteConversation(data);
  }

  /**
   * Process audit event logging job
   */
  async _processLogEvent(data) {
    return await processLogEvent(data);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return null;
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Close all queues, workers, and Redis connection
   */
  async close() {
    // Close workers first
    for (const [name, worker] of this.workers) {
      try {
        await worker.close();
        logger.info(`[queues] Closed worker: ${name}`);
      } catch (error) {
        logger.error(`[queues] Error closing worker ${name}:`, error);
      }
    }

    // Close schedulers
    for (const [name, scheduler] of this.schedulers) {
      try {
        await scheduler.close();
        logger.info(`[queues] Closed scheduler: ${name}`);
      } catch (error) {
        logger.error(`[queues] Error closing scheduler ${name}:`, error);
      }
    }

    // Close queues
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
        logger.info(`[queues] Closed queue: ${name}`);
      } catch (error) {
        logger.error(`[queues] Error closing queue ${name}:`, error);
      }
    }

    // Close Redis connection
    if (this.redis) {
      try {
        await this.redis.quit();
        logger.info('[queues] Closed Redis connection');
      } catch (error) {
        logger.error('[queues] Error closing Redis connection:', error);
      }
    }

    this.isInitialized = false;
  }
}

// Export singleton instance
const queueManager = new QueueManager();

module.exports = {
  queueManager,
  QueueManager,
};
