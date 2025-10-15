// lib/health-server.js - HTTP health check server for monitoring
const express = require('express');
const app = express();

// Health check endpoint
app.get('/health', async (req, res) => {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  };

  // Test database connection
  try {
    const database = require('./database');
    if (database.isConfigured()) {
      await database.testConnection();
      checks.database = 'connected';
    } else {
      checks.database = 'not configured';
    }
  } catch (err) {
    checks.database = 'disconnected';
    checks.status = 'unhealthy';
    checks.error = err.message;
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(checks);
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metrics = require('./metrics');
    res.json(metrics.getStats());
  } catch (err) {
    res.status(500).json({ error: 'Metrics not available', message: err.message });
  }
});

// Start server
const PORT = process.env.HEALTH_PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Health check server running on port ${PORT}`);
  console.log(`   - Health: http://localhost:${PORT}/health`);
  console.log(`   - Metrics: http://localhost:${PORT}/metrics`);
});

// Handle server errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`⚠️  Port ${PORT} already in use. Health server not started.`);
  } else {
    console.error('[health-server] Error:', err.message);
  }
});

module.exports = server;
