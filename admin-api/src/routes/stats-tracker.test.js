"use strict";

const request = require("supertest");
const app = require("../app");
const Database = require("../../lib/database");
const { getStatsTracker } = require("../../lib/stats/tracker");

// Mock the database for testing
jest.mock("../../lib/database");

describe("Stats Tracker Routes", () => {
  let mockTracker;

  beforeAll(() => {
    // Mock the stats tracker
    mockTracker = {
      recordEvent: jest.fn(),
      recordEvents: jest.fn(),
      queryEvents: jest.fn(),
      getAggregates: jest.fn(),
      getSummary: jest.fn(),
      getUserActivity: jest.fn(),
      getSystemMetrics: jest.fn(),
      updateDailyAggregates: jest.fn(),
      trackCommandUsage: jest.fn(),
      trackChatMessage: jest.fn(),
      trackImageGeneration: jest.fn(),
      trackMemoryOperation: jest.fn(),
      trackUserEngagement: jest.fn(),
      trackApiUsage: jest.fn(),
      trackGameStats: jest.fn(),
    };

    // Mock getStatsTracker to return our mock
    jest.mocked(getStatsTracker).mockReturnValue(mockTracker);
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("GET /api/stats", () => {
    it("should return summary by default", async () => {
      const mockSummary = {
        totalEvents: 100,
        uniqueUsers: 50,
        topEventTypes: [],
        topCategories: []
      };

      mockTracker.getSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get("/api/stats")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.summary).toEqual(mockSummary);
      expect(mockTracker.getSummary).toHaveBeenCalledWith({});
    });

    it("should return events when action=events", async () => {
      const mockEvents = [
        { id: 1, eventType: "test", timestamp: "2024-01-01T00:00:00Z" }
      ];

      mockTracker.queryEvents.mockResolvedValue(mockEvents);

      const response = await request(app)
        .get("/api/stats?action=events&limit=10")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.events).toEqual(mockEvents);
      expect(mockTracker.queryEvents).toHaveBeenCalledWith({
        limit: 10,
        offset: 0
      });
    });

    it("should return aggregates when action=aggregates", async () => {
      const mockAggregates = [
        { period: "2024-01-01", count: 10, unique_users: 5 }
      ];

      mockTracker.getAggregates.mockResolvedValue(mockAggregates);

      const response = await request(app)
        .get("/api/stats?action=aggregates&eventType=test&groupBy=day")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.aggregates).toEqual(mockAggregates);
      expect(mockTracker.getAggregates).toHaveBeenCalledWith({
        eventType: "test",
        groupBy: "day"
      });
    });

    it("should return user activity when action=user-activity", async () => {
      const mockActivity = {
        userId: "123",
        totalEvents: 25,
        activeDays: 5
      };

      mockTracker.getUserActivity.mockResolvedValue(mockActivity);

      const response = await request(app)
        .get("/api/stats?action=user-activity&userId=123&days=30")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.userActivity).toEqual(mockActivity);
      expect(mockTracker.getUserActivity).toHaveBeenCalledWith("123", 30);
    });

    it("should return error for user-activity without userId", async () => {
      const response = await request(app)
        .get("/api/stats?action=user-activity")
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("userId required");
    });

    it("should return system metrics when action=system-metrics", async () => {
      const mockMetrics = {
        period: { startDate: "2024-01-01", endDate: "2024-01-07", days: 7 },
        summary: { totalEvents: 100, uniqueUsers: 50 },
        dailyTrends: [],
        health: { eventsPerDay: 14.3, uniqueUsersPerDay: 7.1 }
      };

      mockTracker.getSystemMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get("/api/stats?action=system-metrics&days=7")
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.systemMetrics).toEqual(mockMetrics);
      expect(mockTracker.getSystemMetrics).toHaveBeenCalledWith(7);
    });
  });

  describe("POST /api/stats", () => {
    it("should record single event", async () => {
      const eventData = {
        eventType: "test_event",
        eventCategory: "test_category",
        userId: "123",
        eventData: { value: 42 }
      };

      mockTracker.recordEvent.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(eventData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Event recorded");
      expect(mockTracker.recordEvent).toHaveBeenCalledWith(eventData);
    });

    it("should record batch events", async () => {
      const batchData = {
        events: [
          { eventType: "event1", eventCategory: "cat1" },
          { eventType: "event2", eventCategory: "cat2" }
        ]
      };

      mockTracker.recordEvents.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("2 events recorded");
      expect(mockTracker.recordEvents).toHaveBeenCalledWith(batchData.events);
    });

    it("should track command usage", async () => {
      const commandData = {
        action: "track-command",
        commandName: "/test",
        userId: "123",
        success: true,
        executionTime: 150
      };

      mockTracker.trackCommandUsage.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(commandData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Command usage tracked");
      expect(mockTracker.trackCommandUsage).toHaveBeenCalledWith(
        "/test", "123", undefined, undefined, true, 150, undefined
      );
    });

    it("should track chat messages", async () => {
      const chatData = {
        action: "track-chat",
        userId: "123",
        messageLength: 100,
        conversationId: "conv-123"
      };

      mockTracker.trackChatMessage.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(chatData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Chat message tracked");
      expect(mockTracker.trackChatMessage).toHaveBeenCalledWith(
        "123", undefined, undefined, 100, "conv-123", undefined
      );
    });

    it("should track image generation", async () => {
      const imageData = {
        action: "track-image",
        userId: "123",
        prompt: "test prompt",
        style: "anime",
        success: true,
        generationTime: 2000
      };

      mockTracker.trackImageGeneration.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(imageData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Image generation tracked");
      expect(mockTracker.trackImageGeneration).toHaveBeenCalledWith(
        "123", undefined, undefined, "test prompt", "anime", true, 2000, undefined
      );
    });

    it("should track memory operations", async () => {
      const memoryData = {
        action: "track-memory",
        operation: "create",
        userId: "123",
        memoryCount: 1,
        tags: ["test"]
      };

      mockTracker.trackMemoryOperation.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(memoryData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Memory operation tracked");
      expect(mockTracker.trackMemoryOperation).toHaveBeenCalledWith(
        "create", "123", undefined, 1, ["test"]
      );
    });

    it("should track user engagement", async () => {
      const engagementData = {
        action: "track-engagement",
        userId: "123",
        engagementType: "active",
        duration: 300,
        features: ["chat", "images"]
      };

      mockTracker.trackUserEngagement.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(engagementData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("User engagement tracked");
      expect(mockTracker.trackUserEngagement).toHaveBeenCalledWith(
        "123", undefined, "active", 300, ["chat", "images"]
      );
    });

    it("should track API usage", async () => {
      const apiData = {
        action: "track-api",
        endpoint: "/api/test",
        method: "POST",
        userId: "123",
        responseTime: 150,
        statusCode: 200
      };

      mockTracker.trackApiUsage.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(apiData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("API usage tracked");
      expect(mockTracker.trackApiUsage).toHaveBeenCalledWith(
        "/api/test", "POST", "123", 150, 200, undefined
      );
    });

    it("should track game stats", async () => {
      const gameData = {
        action: "track-game",
        gameType: "snail",
        userId: "123",
        stats: { hp: 100, atk: 50 },
        metadata: { level: 10 }
      };

      mockTracker.trackGameStats.mockResolvedValue();

      const response = await request(app)
        .post("/api/stats")
        .send(gameData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Game stats tracked");
      expect(mockTracker.trackGameStats).toHaveBeenCalledWith(
        "snail", "123", undefined, { hp: 100, atk: 50 }, { level: 10 }
      );
    });

    it("should return error for invalid request format", async () => {
      const response = await request(app)
        .post("/api/stats")
        .send({ invalid: "data" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid request format");
    });
  });

  describe("PUT /api/stats", () => {
    it("should update daily aggregates", async () => {
      const updateData = {
        action: "update-aggregates",
        date: "2024-01-01"
      };

      mockTracker.updateDailyAggregates.mockResolvedValue();

      const response = await request(app)
        .put("/api/stats")
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe("Aggregates updated");
      expect(mockTracker.updateDailyAggregates).toHaveBeenCalledWith("2024-01-01");
    });

    it("should return error for invalid action", async () => {
      const response = await request(app)
        .put("/api/stats")
        .send({ action: "invalid" })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Invalid action");
    });
  });

  describe("Error handling", () => {
    it("should handle tracker errors gracefully", async () => {
      mockTracker.getSummary.mockRejectedValue(new Error("Database error"));

      const response = await request(app)
        .get("/api/stats")
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Internal server error");
    });
  });
});
