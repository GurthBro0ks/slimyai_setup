import { v4 as uuidv4 } from 'uuid';

export interface StatsEvent {
  eventType: string;
  eventCategory: string;
  userId?: string;
  guildId?: string;
  channelId?: string;
  sessionId?: string;
  eventData?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface StatsQuery {
  eventType?: string;
  eventCategory?: string;
  userId?: string;
  guildId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AggregateQuery extends Omit<StatsQuery, 'limit' | 'offset'> {
  groupBy?: 'day' | 'week' | 'month';
}

export class StatsTracker {
  private db: any;
  private eventQueue: StatsEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds

  constructor(database: any) {
    this.db = database;
    this.startFlushInterval();
  }

  /**
   * Record a single stats event
   */
  async recordEvent(event: StatsEvent): Promise<void> {
    try {
      await this.db.recordStatsEvent(event);
    } catch (error) {
      console.error('[StatsTracker] Failed to record event:', error);
      // Queue for retry
      this.eventQueue.push(event);
    }
  }

  /**
   * Record multiple events in batch
   */
  async recordEvents(events: StatsEvent[]): Promise<void> {
    const promises = events.map(event => this.recordEvent(event));
    await Promise.allSettled(promises);
  }

  /**
   * Track command usage
   */
  async trackCommandUsage(
    commandName: string,
    userId: string,
    guildId?: string,
    channelId?: string,
    success: boolean = true,
    executionTime?: number,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'command_used',
      eventCategory: 'bot_interaction',
      userId,
      guildId,
      channelId,
      eventData: {
        command: commandName,
        success,
        executionTime,
        ...metadata
      }
    });
  }

  /**
   * Track chat message
   */
  async trackChatMessage(
    userId: string,
    guildId?: string,
    channelId?: string,
    messageLength: number,
    conversationId?: string,
    personalityMode?: string
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'chat_message',
      eventCategory: 'conversation',
      userId,
      guildId,
      channelId,
      sessionId: conversationId,
      eventData: {
        messageLength,
        personalityMode,
        hasConversation: !!conversationId
      }
    });
  }

  /**
   * Track image generation
   */
  async trackImageGeneration(
    userId: string,
    guildId?: string,
    channelId?: string,
    prompt: string,
    style: string,
    success: boolean,
    generationTime?: number,
    errorMessage?: string
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'image_generated',
      eventCategory: 'ai_generation',
      userId,
      guildId,
      channelId,
      eventData: {
        promptLength: prompt.length,
        style,
        success,
        generationTime,
        errorMessage
      }
    });
  }

  /**
   * Track memory operations
   */
  async trackMemoryOperation(
    operation: 'create' | 'read' | 'update' | 'delete',
    userId: string,
    guildId?: string,
    memoryCount?: number,
    tags?: string[]
  ): Promise<void> {
    await this.recordEvent({
      eventType: `memory_${operation}`,
      eventCategory: 'memory_management',
      userId,
      guildId,
      eventData: {
        memoryCount,
        tags: tags?.length,
        tagList: tags
      }
    });
  }

  /**
   * Track user engagement
   */
  async trackUserEngagement(
    userId: string,
    guildId?: string,
    engagementType: 'login' | 'active' | 'inactive' | 'feature_used',
    duration?: number,
    features?: string[]
  ): Promise<void> {
    await this.recordEvent({
      eventType: engagementType,
      eventCategory: 'user_engagement',
      userId,
      guildId,
      eventData: {
        duration,
        features: features?.join(','),
        featureCount: features?.length
      }
    });
  }

  /**
   * Track API usage
   */
  async trackApiUsage(
    endpoint: string,
    method: string,
    userId?: string,
    responseTime?: number,
    statusCode?: number,
    error?: boolean
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'api_call',
      eventCategory: 'api_usage',
      userId,
      eventData: {
        endpoint,
        method,
        responseTime,
        statusCode,
        error
      }
    });
  }

  /**
   * Track game stats (Snail or other games)
   */
  async trackGameStats(
    gameType: string,
    userId: string,
    guildId?: string,
    stats: Record<string, number>,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.recordEvent({
      eventType: 'game_stats_recorded',
      eventCategory: 'gaming',
      userId,
      guildId,
      eventData: {
        gameType,
        ...stats,
        ...metadata
      }
    });
  }

  /**
   * Query stats events
   */
  async queryEvents(query: StatsQuery = {}): Promise<any[]> {
    try {
      return await this.db.getStatsEvents(query);
    } catch (error) {
      console.error('[StatsTracker] Failed to query events:', error);
      return [];
    }
  }

  /**
   * Get aggregated stats
   */
  async getAggregates(query: AggregateQuery = {}): Promise<any[]> {
    try {
      return await this.db.getStatsAggregates(query);
    } catch (error) {
      console.error('[StatsTracker] Failed to get aggregates:', error);
      return [];
    }
  }

  /**
   * Get stats summary
   */
  async getSummary(query: Omit<StatsQuery, 'eventType' | 'eventCategory' | 'limit' | 'offset'> = {}): Promise<any> {
    try {
      return await this.db.getStatsSummary(query);
    } catch (error) {
      console.error('[StatsTracker] Failed to get summary:', error);
      return {
        totalEvents: 0,
        uniqueUsers: 0,
        topEventTypes: [],
        topCategories: []
      };
    }
  }

  /**
   * Update daily aggregates for performance
   */
  async updateDailyAggregates(date?: string): Promise<void> {
    try {
      await this.db.updateDailyAggregates(date);
    } catch (error) {
      console.error('[StatsTracker] Failed to update daily aggregates:', error);
    }
  }

  /**
   * Get user activity metrics
   */
  async getUserActivity(userId: string, days: number = 30): Promise<any> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const [events, aggregates] = await Promise.all([
      this.queryEvents({
        userId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }),
      this.getAggregates({
        userId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        groupBy: 'day'
      })
    ]);

    // Calculate activity metrics
    const eventTypes = events.reduce((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {});

    const totalEvents = events.length;
    const activeDays = aggregates.length;
    const avgEventsPerDay = activeDays > 0 ? totalEvents / activeDays : 0;

    return {
      userId,
      period: { startDate, endDate, days },
      summary: {
        totalEvents,
        activeDays,
        avgEventsPerDay
      },
      eventBreakdown: eventTypes,
      dailyActivity: aggregates
    };
  }

  /**
   * Get system-wide metrics
   */
  async getSystemMetrics(days: number = 7): Promise<any> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const summary = await this.getSummary({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    const dailyAggregates = await this.getAggregates({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      groupBy: 'day'
    });

    return {
      period: { startDate, endDate, days },
      summary,
      dailyTrends: dailyAggregates,
      health: {
        eventsPerDay: summary.totalEvents / days,
        uniqueUsersPerDay: summary.uniqueUsers / days
      }
    };
  }

  /**
   * Start automatic batch flushing
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flushQueue();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Flush queued events
   */
  private async flushQueue(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const batch = this.eventQueue.splice(0, this.BATCH_SIZE);
    try {
      await this.recordEvents(batch);
    } catch (error) {
      console.error('[StatsTracker] Failed to flush batch:', error);
      // Re-queue failed events
      this.eventQueue.unshift(...batch);
    }
  }

  /**
   * Gracefully shutdown
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining events
    while (this.eventQueue.length > 0) {
      await this.flushQueue();
    }
  }
}

// Singleton instance
let statsTrackerInstance: StatsTracker | null = null;

export function getStatsTracker(database?: any): StatsTracker {
  if (!statsTrackerInstance) {
    if (!database) {
      throw new Error('Database instance required for first StatsTracker initialization');
    }
    statsTrackerInstance = new StatsTracker(database);
  }
  return statsTrackerInstance;
}

export default StatsTracker;
