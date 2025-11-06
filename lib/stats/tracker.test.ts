import { StatsTracker } from './tracker';

// Mock the database
const mockDatabase = {
  recordStatsEvent: jest.fn(),
  getStatsEvents: jest.fn(),
  getStatsAggregates: jest.fn(),
  getStatsSummary: jest.fn(),
  updateDailyAggregates: jest.fn(),
  ensureUserRecord: jest.fn(),
  ensureGuildRecord: jest.fn(),
};

jest.mock('../../database', () => mockDatabase);

describe('StatsTracker', () => {
  let tracker: StatsTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    tracker = new StatsTracker(mockDatabase);
  });

  afterEach(() => {
    tracker.shutdown();
  });

  describe('recordEvent', () => {
    it('should record a single event', async () => {
      const event = {
        eventType: 'test_event',
        eventCategory: 'test_category',
        userId: '123',
        eventData: { value: 42 }
      };

      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.recordEvent(event);

      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledWith(event);
    });

    it('should ensure user and guild records are created', async () => {
      const event = {
        eventType: 'test_event',
        eventCategory: 'test_category',
        userId: '123',
        guildId: '456'
      };

      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.recordEvent(event);

      expect(mockDatabase.ensureUserRecord).toHaveBeenCalledWith('123');
      expect(mockDatabase.ensureGuildRecord).toHaveBeenCalledWith('456');
    });
  });

  describe('recordEvents', () => {
    it('should record multiple events', async () => {
      const events = [
        { eventType: 'event1', eventCategory: 'cat1' },
        { eventType: 'event2', eventCategory: 'cat2' }
      ];

      await tracker.recordEvents(events);

      // Should be called for each event
      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('queryEvents', () => {
    it('should query events with filters', async () => {
      const mockEvents = [
        { id: 1, eventType: 'test', timestamp: '2024-01-01T00:00:00Z' }
      ];

      mockDatabase.getStatsEvents.mockResolvedValue(mockEvents);

      const result = await tracker.queryEvents({
        eventType: 'test',
        userId: '123',
        limit: 10
      });

      expect(mockDatabase.getStatsEvents).toHaveBeenCalledWith({
        eventType: 'test',
        userId: '123',
        limit: 10,
        offset: 0
      });
      expect(result).toEqual(mockEvents);
    });

    it('should parse event data and metadata', async () => {
      const rawEvents = [{
        id: 1,
        event_data: '{"value": 42}',
        metadata: '{"source": "test"}'
      }];

      mockDatabase.getStatsEvents.mockResolvedValue(rawEvents);

      const result = await tracker.queryEvents();

      expect(result[0].eventData).toEqual({ value: 42 });
      expect(result[0].metadata).toEqual({ source: 'test' });
    });
  });

  describe('getAggregates', () => {
    it('should get aggregated data', async () => {
      const mockAggregates = [
        { period: '2024-01-01', count: 10, value: '42.5' }
      ];

      mockDatabase.getStatsAggregates.mockResolvedValue(mockAggregates);

      const result = await tracker.getAggregates({
        eventType: 'test',
        groupBy: 'day'
      });

      expect(mockDatabase.getStatsAggregates).toHaveBeenCalledWith({
        eventType: 'test',
        groupBy: 'day'
      });
      expect(result[0].value).toBe(42.5);
    });
  });

  describe('getSummary', () => {
    it('should get stats summary', async () => {
      const mockSummary = {
        totalEvents: 100,
        uniqueUsers: 50,
        topEventTypes: [],
        topCategories: []
      };

      mockDatabase.getStatsSummary.mockResolvedValue(mockSummary);

      const result = await tracker.getSummary({
        startDate: '2024-01-01',
        endDate: '2024-01-07'
      });

      expect(mockDatabase.getStatsSummary).toHaveBeenCalledWith({
        startDate: '2024-01-01',
        endDate: '2024-01-07'
      });
      expect(result).toEqual(mockSummary);
    });

    it('should return default summary on error', async () => {
      mockDatabase.getStatsSummary.mockRejectedValue(new Error('DB error'));

      const result = await tracker.getSummary();

      expect(result.totalEvents).toBe(0);
      expect(result.uniqueUsers).toBe(0);
      expect(result.topEventTypes).toEqual([]);
      expect(result.topCategories).toEqual([]);
    });
  });

  describe('Tracking methods', () => {
    it('should track command usage', async () => {
      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.trackCommandUsage(
        '/test',
        '123',
        '456',
        '789',
        true,
        150,
        { custom: 'data' }
      );

      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledWith({
        eventType: 'command_used',
        eventCategory: 'bot_interaction',
        userId: '123',
        guildId: '456',
        channelId: '789',
        eventData: {
          command: '/test',
          success: true,
          executionTime: 150,
          custom: 'data'
        }
      });
    });

    it('should track chat messages', async () => {
      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.trackChatMessage(
        '123',
        '456',
        '789',
        100,
        'conv-123',
        'helpful'
      );

      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledWith({
        eventType: 'chat_message',
        eventCategory: 'conversation',
        userId: '123',
        guildId: '456',
        channelId: '789',
        sessionId: 'conv-123',
        eventData: {
          messageLength: 100,
          personalityMode: 'helpful',
          hasConversation: true
        }
      });
    });

    it('should track image generation', async () => {
      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.trackImageGeneration(
        '123',
        '456',
        '789',
        'test prompt',
        'anime',
        true,
        2000,
        'timeout'
      );

      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledWith({
        eventType: 'image_generated',
        eventCategory: 'ai_generation',
        userId: '123',
        guildId: '456',
        channelId: '789',
        eventData: {
          promptLength: 11,
          style: 'anime',
          success: true,
          generationTime: 2000,
          errorMessage: 'timeout'
        }
      });
    });

    it('should track memory operations', async () => {
      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.trackMemoryOperation(
        'create',
        '123',
        '456',
        2,
        ['tag1', 'tag2']
      );

      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledWith({
        eventType: 'memory_create',
        eventCategory: 'memory_management',
        userId: '123',
        guildId: '456',
        eventData: {
          memoryCount: 2,
          tags: 2,
          tagList: ['tag1', 'tag2']
        }
      });
    });

    it('should track user engagement', async () => {
      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.trackUserEngagement(
        '123',
        '456',
        'active',
        300,
        ['chat', 'images']
      );

      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledWith({
        eventType: 'active',
        eventCategory: 'user_engagement',
        userId: '123',
        guildId: '456',
        eventData: {
          duration: 300,
          features: 'chat,images',
          featureCount: 2
        }
      });
    });

    it('should track API usage', async () => {
      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.trackApiUsage(
        '/api/test',
        'POST',
        '123',
        150,
        200,
        false
      );

      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledWith({
        eventType: 'api_call',
        eventCategory: 'api_usage',
        userId: '123',
        eventData: {
          endpoint: '/api/test',
          method: 'POST',
          responseTime: 150,
          statusCode: 200,
          error: false
        }
      });
    });

    it('should track game stats', async () => {
      mockDatabase.recordStatsEvent.mockResolvedValue();

      await tracker.trackGameStats(
        'snail',
        '123',
        '456',
        { hp: 100, atk: 50 },
        { level: 10 }
      );

      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledWith({
        eventType: 'game_stats_recorded',
        eventCategory: 'gaming',
        userId: '123',
        guildId: '456',
        eventData: {
          gameType: 'snail',
          hp: 100,
          atk: 50,
          level: 10
        }
      });
    });
  });

  describe('User activity', () => {
    it('should get user activity metrics', async () => {
      const mockEvents = [
        { eventType: 'command_used', timestamp: '2024-01-01T10:00:00Z' },
        { eventType: 'chat_message', timestamp: '2024-01-01T11:00:00Z' }
      ];

      const mockAggregates = [
        { period: '2024-01-01', count: 2, unique_users: 1, unique_guilds: 1 }
      ];

      mockDatabase.getStatsEvents.mockResolvedValue(mockEvents);
      mockDatabase.getStatsAggregates.mockResolvedValue(mockAggregates);

      const result = await tracker.getUserActivity('123', 30);

      expect(result.userId).toBe('123');
      expect(result.summary.totalEvents).toBe(2);
      expect(result.summary.activeDays).toBe(1);
      expect(result.summary.avgEventsPerDay).toBe(2);
      expect(result.eventBreakdown.command_used).toBe(1);
      expect(result.eventBreakdown.chat_message).toBe(1);
      expect(result.dailyActivity).toEqual(mockAggregates);
    });
  });

  describe('System metrics', () => {
    it('should get system-wide metrics', async () => {
      const mockSummary = {
        totalEvents: 100,
        uniqueUsers: 50,
        topEventTypes: [{ event_type: 'test', count: 50 }],
        topCategories: [{ event_category: 'cat', count: 50 }]
      };

      const mockAggregates = [
        { period: '2024-01-01', count: 50, unique_users: 25, unique_guilds: 5 }
      ];

      mockDatabase.getStatsSummary.mockResolvedValue(mockSummary);
      mockDatabase.getStatsAggregates.mockResolvedValue(mockAggregates);

      const result = await tracker.getSystemMetrics(7);

      expect(result.period.days).toBe(7);
      expect(result.summary).toEqual(mockSummary);
      expect(result.dailyTrends).toEqual(mockAggregates);
      expect(result.health.eventsPerDay).toBeCloseTo(14.29, 1);
      expect(result.health.uniqueUsersPerDay).toBeCloseTo(7.14, 1);
    });
  });

  describe('Event queue and batching', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should queue events when recording fails', async () => {
      mockDatabase.recordStatsEvent.mockRejectedValue(new Error('DB error'));

      const event = { eventType: 'test', eventCategory: 'test' };
      await tracker.recordEvent(event);

      // Should be queued for retry
      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledTimes(1);
      // Event should be in queue for next flush
    });

    it('should flush queued events periodically', async () => {
      mockDatabase.recordStatsEvent
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue();

      const event = { eventType: 'test', eventCategory: 'test' };
      await tracker.recordEvent(event);

      // Fast-forward time to trigger flush
      jest.advanceTimersByTime(6000);

      // Should retry the failed event
      expect(mockDatabase.recordStatsEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateDailyAggregates', () => {
    it('should update daily aggregates', async () => {
      mockDatabase.updateDailyAggregates.mockResolvedValue();

      await tracker.updateDailyAggregates('2024-01-01');

      expect(mockDatabase.updateDailyAggregates).toHaveBeenCalledWith('2024-01-01');
    });

    it('should use current date when no date provided', async () => {
      const mockDate = new Date('2024-01-01');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      mockDatabase.updateDailyAggregates.mockResolvedValue();

      await tracker.updateDailyAggregates();

      expect(mockDatabase.updateDailyAggregates).toHaveBeenCalledWith('2024-01-01');
    });
  });
});
