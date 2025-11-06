"use strict";

const express = require("express");
const router = express.Router();
const { getStatsTracker } = require("../../lib/stats/tracker");
const Database = require("../../lib/database");

// Initialize stats tracker
let statsTracker = null;

async function getStatsTrackerInstance() {
  if (!statsTracker) {
    await Database.initialize();
    statsTracker = getStatsTracker(Database);
  }
  return statsTracker;
}

// GET /api/stats - Query stats data
router.get("/", async (req, res) => {
  try {
    const tracker = await getStatsTrackerInstance();
    const action = req.query.action || 'summary';

    // Query parameters
    const eventType = req.query.eventType;
    const eventCategory = req.query.eventCategory;
    const userId = req.query.userId;
    const guildId = req.query.guildId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const groupBy = req.query.groupBy || 'day';
    const limit = req.query.limit ? parseInt(req.query.limit) : 1000;
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;

    const baseQuery = {
      eventType: eventType || undefined,
      eventCategory: eventCategory || undefined,
      userId: userId || undefined,
      guildId: guildId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };

    switch (action) {
      case 'events':
        const events = await tracker.queryEvents({
          ...baseQuery,
          limit,
          offset,
        });
        return res.json({ success: true, events });

      case 'aggregates':
        const aggregates = await tracker.getAggregates({
          ...baseQuery,
          groupBy: groupBy === 'week' ? 'week' : groupBy === 'month' ? 'month' : 'day',
        });
        return res.json({ success: true, aggregates });

      case 'user-activity':
        if (!userId) {
          return res.status(400).json({
            success: false,
            error: 'userId required for user-activity'
          });
        }
        const days = req.query.days ? parseInt(req.query.days) : 30;
        const userActivity = await tracker.getUserActivity(userId, days);
        return res.json({ success: true, userActivity });

      case 'system-metrics':
        const metricDays = req.query.days ? parseInt(req.query.days) : 7;
        const systemMetrics = await tracker.getSystemMetrics(metricDays);
        return res.json({ success: true, systemMetrics });

      case 'summary':
      default:
        const summary = await tracker.getSummary(baseQuery);
        return res.json({ success: true, summary });
    }
  } catch (err) {
    console.error("[stats-tracker] GET failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /api/stats - Record stats events
router.post("/", async (req, res) => {
  try {
    const tracker = await getStatsTrackerInstance();
    const body = req.body;

    // Handle single event
    if (body.eventType && body.eventCategory) {
      await tracker.recordEvent({
        eventType: body.eventType,
        eventCategory: body.eventCategory,
        userId: body.userId,
        guildId: body.guildId,
        channelId: body.channelId,
        sessionId: body.sessionId,
        eventData: body.eventData || {},
        metadata: body.metadata || {},
      });

      return res.json({ success: true, message: 'Event recorded' });
    }

    // Handle batch events
    if (body.events && Array.isArray(body.events)) {
      await tracker.recordEvents(body.events);
      return res.json({
        success: true,
        message: `${body.events.length} events recorded`
      });
    }

    // Handle specific tracking methods
    if (body.action) {
      switch (body.action) {
        case 'track-command':
          await tracker.trackCommandUsage(
            body.commandName,
            body.userId,
            body.guildId,
            body.channelId,
            body.success !== false,
            body.executionTime,
            body.metadata
          );
          return res.json({ success: true, message: 'Command usage tracked' });

        case 'track-chat':
          await tracker.trackChatMessage(
            body.userId,
            body.guildId,
            body.channelId,
            body.messageLength || 0,
            body.conversationId,
            body.personalityMode
          );
          return res.json({ success: true, message: 'Chat message tracked' });

        case 'track-image':
          await tracker.trackImageGeneration(
            body.userId,
            body.guildId,
            body.channelId,
            body.prompt || '',
            body.style || 'standard',
            body.success !== false,
            body.generationTime,
            body.errorMessage
          );
          return res.json({ success: true, message: 'Image generation tracked' });

        case 'track-memory':
          await tracker.trackMemoryOperation(
            body.operation,
            body.userId,
            body.guildId,
            body.memoryCount,
            body.tags
          );
          return res.json({ success: true, message: 'Memory operation tracked' });

        case 'track-engagement':
          await tracker.trackUserEngagement(
            body.userId,
            body.guildId,
            body.engagementType,
            body.duration,
            body.features
          );
          return res.json({ success: true, message: 'User engagement tracked' });

        case 'track-api':
          await tracker.trackApiUsage(
            body.endpoint,
            body.method || 'GET',
            body.userId,
            body.responseTime,
            body.statusCode,
            body.error
          );
          return res.json({ success: true, message: 'API usage tracked' });

        case 'track-game':
          await tracker.trackGameStats(
            body.gameType,
            body.userId,
            body.guildId,
            body.stats || {},
            body.metadata
          );
          return res.json({ success: true, message: 'Game stats tracked' });

        case 'update-aggregates':
          await tracker.updateDailyAggregates(body.date);
          return res.json({ success: true, message: 'Daily aggregates updated' });
      }
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid request format'
    });
  } catch (err) {
    console.error("[stats-tracker] POST failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// PUT /api/stats - Update operations
router.put("/", async (req, res) => {
  try {
    const tracker = await getStatsTrackerInstance();
    const body = req.body;

    // Update daily aggregates
    if (body.action === 'update-aggregates') {
      await tracker.updateDailyAggregates(body.date);
      return res.json({ success: true, message: 'Aggregates updated' });
    }

    return res.status(400).json({
      success: false,
      error: 'Invalid action'
    });
  } catch (err) {
    console.error("[stats-tracker] PUT failed");
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Server-Sent Events endpoint for real-time updates
router.get("/events/stream", (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Real-time stats stream connected' })}\n\n`);

  // Set up interval to send periodic updates
  const interval = setInterval(async () => {
    try {
      const tracker = await getStatsTrackerInstance();
      const summary = await tracker.getSummary();

      const eventData = {
        type: 'stats_update',
        timestamp: new Date().toISOString(),
        data: summary
      };

      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    } catch (error) {
      console.error('[Stats SSE] Error sending update:', error);
    }
  }, 30000); // Update every 30 seconds

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });

  // Handle errors
  req.on('error', (error) => {
    console.error('[Stats SSE] Request error:', error);
    clearInterval(interval);
    res.end();
  });
});

module.exports = router;
