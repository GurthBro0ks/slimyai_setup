/**
 * MCP Client for Discord Bot
 *
 * Simple client to call MCP tool servers from slash commands
 * Handles request formatting, authentication, and error handling
 */

const axios = require('axios');

/**
 * MCP Tool Server URLs (from environment or defaults)
 */
const MCP_SERVERS = {
  'club.analytics': process.env.MCP_CLUB_ANALYTICS_URL || 'http://localhost:3091',
  'google.sheets': process.env.MCP_GOOGLE_SHEETS_URL || 'http://localhost:3092',
  'mysql.data': process.env.MCP_MYSQL_DATA_URL || 'http://localhost:3093',
};

/**
 * Get JWT token for MCP authentication
 * In production, this would be obtained from the Admin API or generated
 */
function getAuthToken() {
  // For now, use a shared secret approach
  // In production, implement proper OAuth flow or JWT generation
  return process.env.MCP_AUTH_TOKEN || '';
}

/**
 * Call an MCP tool
 *
 * @param {string} serverName - Server name (e.g., 'club.analytics')
 * @param {string} toolName - Tool name (e.g., 'get_user_stats')
 * @param {object} args - Tool arguments
 * @param {string} [authToken] - Optional auth token override
 * @returns {Promise<any>} Tool execution result
 */
async function callTool(serverName, toolName, args, authToken = null) {
  try {
    const serverUrl = MCP_SERVERS[serverName];
    if (!serverUrl) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    const token = authToken || getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    // Create MCP request
    const mcpRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    // Send request to MCP server
    const response = await axios.post(`${serverUrl}/mcp`, mcpRequest, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      timeout: 30000, // 30 second timeout
    });

    // Check for MCP error
    if (response.data.error) {
      throw new Error(`MCP Error: ${response.data.error.message}`);
    }

    return response.data.result;

  } catch (error) {
    console.error(`[MCP Client] Error calling ${serverName}/${toolName}:`, error.message);
    throw error;
  }
}

/**
 * Call a club.analytics tool
 */
async function callAnalytics(toolName, args, authToken) {
  return callTool('club.analytics', toolName, args, authToken);
}

/**
 * Call a google.sheets tool
 */
async function callSheets(toolName, args, authToken) {
  return callTool('google.sheets', toolName, args, authToken);
}

/**
 * Call a mysql.data tool
 */
async function callDatabase(toolName, args, authToken) {
  return callTool('mysql.data', toolName, args, authToken);
}

/**
 * Get user statistics
 *
 * @param {string} userId - Discord user ID
 * @param {string} [guildId] - Optional guild ID filter
 * @param {string} [period='30d'] - Time period
 * @param {string} [authToken] - Auth token
 * @returns {Promise<object>} User stats
 */
async function getUserStats(userId, guildId = null, period = '30d', authToken = null) {
  return callAnalytics('get_user_stats', { userId, guildId, period }, authToken);
}

/**
 * Get guild activity
 *
 * @param {string} guildId - Discord guild ID
 * @param {string} [period='7d'] - Time period
 * @param {string} [authToken] - Auth token
 * @returns {Promise<object>} Guild activity data
 */
async function getGuildActivity(guildId, period = '7d', authToken = null) {
  return callAnalytics('get_guild_activity', { guildId, period }, authToken);
}

/**
 * Get Super Snail leaderboard
 *
 * @param {string} [guildId] - Optional guild ID filter
 * @param {number} [limit=50] - Max results
 * @param {string} [authToken] - Auth token
 * @returns {Promise<object>} Leaderboard data
 */
async function getSnailLeaderboard(guildId = null, limit = 50, authToken = null) {
  return callAnalytics('get_snail_leaderboard', { guildId, limit }, authToken);
}

/**
 * Create user spreadsheet
 *
 * @param {string} userId - Discord user ID
 * @param {string} [title] - Optional spreadsheet title
 * @param {string} [authToken] - Auth token
 * @returns {Promise<object>} Spreadsheet creation result
 */
async function createUserSheet(userId, title = null, authToken = null) {
  return callSheets('create_user_sheet', { userId, title }, authToken);
}

/**
 * Append Super Snail data to spreadsheet
 *
 * @param {string} spreadsheetId - Google Sheets ID
 * @param {object} data - Game data to append
 * @param {string} [authToken] - Auth token
 * @returns {Promise<object>} Append result
 */
async function appendSnailData(spreadsheetId, data, authToken = null) {
  return callSheets('append_snail_data', { spreadsheetId, data }, authToken);
}

/**
 * Get sheet data
 *
 * @param {string} spreadsheetId - Google Sheets ID
 * @param {string} [range] - Optional range
 * @param {number} [limit] - Max rows
 * @param {string} [authToken] - Auth token
 * @returns {Promise<object>} Sheet data
 */
async function getSheetData(spreadsheetId, range = null, limit = null, authToken = null) {
  return callSheets('get_sheet_data', { spreadsheetId, range, limit }, authToken);
}

/**
 * Query users from database
 *
 * @param {object} filters - Query filters (userId, guildId, limit, offset)
 * @param {string} [authToken] - Auth token
 * @returns {Promise<object>} User query results
 */
async function queryUsers(filters, authToken = null) {
  return callDatabase('query_users', filters, authToken);
}

/**
 * Query memories from database
 *
 * @param {object} filters - Query filters (userId, guildId, search, limit, offset)
 * @param {string} [authToken] - Auth token
 * @returns {Promise<object>} Memory query results
 */
async function queryMemories(filters, authToken = null) {
  return callDatabase('query_memories', filters, authToken);
}

/**
 * Health check all MCP servers
 *
 * @returns {Promise<object>} Health status for all servers
 */
async function healthCheck() {
  const results = {};

  for (const [serverName, serverUrl] of Object.entries(MCP_SERVERS)) {
    try {
      const response = await axios.get(`${serverUrl}/health`, { timeout: 5000 });
      results[serverName] = {
        healthy: response.status === 200,
        status: response.data,
      };
    } catch (error) {
      results[serverName] = {
        healthy: false,
        error: error.message,
      };
    }
  }

  return results;
}

module.exports = {
  // Low-level API
  callTool,
  callAnalytics,
  callSheets,
  callDatabase,

  // High-level helpers
  getUserStats,
  getGuildActivity,
  getSnailLeaderboard,
  createUserSheet,
  appendSnailData,
  getSheetData,
  queryUsers,
  queryMemories,

  // Utilities
  healthCheck,
};
