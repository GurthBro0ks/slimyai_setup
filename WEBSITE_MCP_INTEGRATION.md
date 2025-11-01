# Website MCP Integration Guide

## Overview

This document provides a comprehensive guide for integrating the slimy.ai website with the MCP (Model Context Protocol) tool servers.

## Integration Status

### ✅ Completed (Website Side)

1. **MCP Client Library** (`lib/mcp-client.ts`)
   - Tool calling interface
   - WebSocket subscription support
   - Singleton pattern implementation
   - Error handling and logging

2. **API Routes**
   - `/api/chat/messages` - Chat message CRUD operations
   - `/api/chat/users` - Online users management
   - `/api/club/upload` - Screenshot upload handling
   - `/api/club/export` - Google Sheets export

3. **UI Components**
   - Slime Chat bar (fixed bottom, responsive)
   - Chat window with AOL IM aesthetic
   - User list with hamburger menu
   - Club analytics upload interface

4. **Documentation**
   - Deployment summary
   - Developer guide
   - Implementation checklist

### 🔄 Pending (MCP Server Side)

1. **chat.service** - Real-time messaging service
2. **club.analytics** - Screenshot processing (extend existing)
3. **google.sheets** - Data export (extend existing)
4. **mysql.data** - Database operations (extend existing)

## MCP Services Required

### 1. chat.service (New)

**Purpose:** Real-time guild chat with message persistence

**Methods:**
- `getMessages(guildId, limit, since)` - Retrieve chat history
- `sendMessage(guildId, userId, username, content)` - Send new message
- `getOnlineUsers(guildId)` - Get online user list
- `subscribe(guildId)` - WebSocket subscription for real-time updates

**Database Tables:**
- `chat_messages` - Message storage
- `chat_users` - User status tracking
- `chat_permissions` - Role-based access control

**Port:** 3101

### 2. club.analytics (Extend Existing)

**Purpose:** Process club screenshots and generate analytics

**New Methods:**
- `uploadScreenshot(guildId, file, metadata)` - Process uploaded screenshot
- `getAnalytics(guildId, dateRange)` - Retrieve analytics data
- `getMemberStats(guildId, userId)` - Get individual member stats

**Existing Methods:**
- Already implemented in `/opt/slimy/mcp/tools/club-analytics/`

**Port:** 3102

### 3. google.sheets (Extend Existing)

**Purpose:** Export club data to Google Sheets

**New Methods:**
- `exportClubData(guildId, options)` - Export to new or existing sheet
- `updateSheet(spreadsheetId, data)` - Update existing sheet
- `getExportHistory(guildId)` - Get export history

**Existing Methods:**
- Already implemented in `/opt/slimy/mcp/tools/google-sheets/`

**Port:** 3104

### 4. mysql.data (Extend Existing)

**Purpose:** Database operations for all services

**New Methods:**
- `createChatMessage(data)` - Insert chat message
- `getChatMessages(guildId, options)` - Query messages
- `updateUserStatus(userId, status)` - Update online status
- `archiveOldMessages(days)` - Archive old chat messages

**Existing Methods:**
- Already implemented in `/opt/slimy/mcp/tools/mysql-data/`

**Port:** 3103

## Environment Configuration

### Website (.env.local)

```bash
# MCP Configuration
MCP_BASE_URL=http://localhost:3100
MCP_API_KEY=your-mcp-api-key

# Service URLs (optional, overrides base URL)
MCP_CHAT_SERVICE_URL=http://localhost:3101
MCP_CLUB_ANALYTICS_URL=http://localhost:3102
MCP_MYSQL_DATA_URL=http://localhost:3103
MCP_GOOGLE_SHEETS_URL=http://localhost:3104

# Feature Flags
ENABLE_SLIME_CHAT=true
ENABLE_CLUB_ANALYTICS=true
ENABLE_GOOGLE_SHEETS_EXPORT=true

# Chat Configuration
CHAT_MESSAGE_LIMIT=50
CHAT_RETENTION_DAYS=7
CHAT_MAX_MESSAGE_LENGTH=2000
```

### MCP Services (mcp/.env)

```bash
# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=slimy
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=slimy_db

# Chat Service
CHAT_SERVICE_PORT=3101
CHAT_WS_PORT=3101
CHAT_MESSAGE_RETENTION_DAYS=7
CHAT_ARCHIVE_RETENTION_DAYS=30

# Club Analytics
CLUB_ANALYTICS_PORT=3102
UPLOAD_MAX_FILE_SIZE=10485760  # 10MB
UPLOAD_ALLOWED_TYPES=image/png,image/jpeg,image/jpg

# Google Sheets
GOOGLE_SHEETS_PORT=3104
GOOGLE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json

# MySQL Data
MYSQL_DATA_PORT=3103
```

## API Integration Flow

### Chat Message Flow

```
User sends message
    ↓
SlimeChatWindow component
    ↓
POST /api/chat/messages
    ↓
MCP Client (lib/mcp-client.ts)
    ↓
chat.service.sendMessage()
    ↓
mysql.data.createChatMessage()
    ↓
MySQL Database
    ↓
WebSocket broadcast
    ↓
All connected clients receive update
```

### Screenshot Upload Flow

```
User uploads screenshot
    ↓
Club Analytics page
    ↓
POST /api/club/upload
    ↓
MCP Client
    ↓
club.analytics.uploadScreenshot()
    ↓
Process image (OCR, analysis)
    ↓
mysql.data.saveAnalytics()
    ↓
Return processed data
```

### Google Sheets Export Flow

```
User clicks export button
    ↓
Club Analytics page
    ↓
POST /api/club/export
    ↓
MCP Client
    ↓
mysql.data.getClubData()
    ↓
google.sheets.exportClubData()
    ↓
Create/update spreadsheet
    ↓
Return spreadsheet URL
```

## WebSocket Integration

### Client Side (Website)

```typescript
// components/slime-chat/slime-chat-window.tsx
import { getMCPClient } from '@/lib/mcp-client';

useEffect(() => {
  const mcpClient = getMCPClient();
  
  // Subscribe to chat updates
  const unsubscribe = mcpClient.subscribeToChat(guildId, (message) => {
    setMessages(prev => [...prev, message]);
    
    // Update unread count if window is collapsed
    if (!isExpanded) {
      setUnreadCount(prev => prev + 1);
    }
  });
  
  return () => unsubscribe();
}, [guildId, isExpanded]);
```

### Server Side (chat.service)

```javascript
// mcp/tools/chat-service/websocket.js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3101 });

wss.on('connection', (ws, req) => {
  const guildId = new URL(req.url, 'http://localhost').searchParams.get('guildId');
  
  // Add to guild room
  ws.guildId = guildId;
  
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    
    // Broadcast to all clients in the same guild
    wss.clients.forEach(client => {
      if (client.guildId === guildId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  });
});
```

## Error Handling

### Client Side

```typescript
// lib/mcp-client.ts
async callTool(tool: string, method: string, params: any) {
  try {
    const response = await fetch(`${this.baseUrl}/tools/${tool}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`MCP tool call failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error calling MCP tool ${tool}.${method}:`, error);
    
    // Return fallback data or throw
    if (process.env.NODE_ENV === 'development') {
      return this.getFallbackData(tool, method);
    }
    
    throw error;
  }
}
```

### Server Side

```javascript
// mcp/tools/chat-service/index.js
app.post('/tools/chat.service/:method', async (req, res) => {
  const { method } = req.params;
  
  try {
    const result = await chatService[method](req.body);
    res.json(result);
  } catch (error) {
    console.error(`Error in chat.service.${method}:`, error);
    res.status(500).json({
      error: error.message,
      tool: 'chat.service',
      method: method,
    });
  }
});
```

## Testing Strategy

### Unit Tests

```bash
# Website API routes
cd /home/ubuntu/slimyai-web
npm run test:api

# MCP services
cd /opt/slimy/mcp
npm run test:chat-service
npm run test:club-analytics
```

### Integration Tests

```bash
# End-to-end chat flow
npm run test:e2e:chat

# Screenshot upload flow
npm run test:e2e:club-upload

# Google Sheets export
npm run test:e2e:sheets-export
```

### Manual Testing Checklist

- [ ] Send chat message from website
- [ ] Verify message appears in real-time
- [ ] Check message persists in database
- [ ] Test online user list updates
- [ ] Upload club screenshot
- [ ] Verify screenshot processing
- [ ] Export data to Google Sheets
- [ ] Check spreadsheet creation
- [ ] Test permission levels (Admin/Club/Guild)
- [ ] Verify message retention (7 days)

## Deployment Steps

### 1. Database Setup

```bash
# Run migrations
cd /opt/slimy/mcp
npm run migrate:chat-tables
npm run migrate:club-tables
```

### 2. Build MCP Services

```bash
cd /opt/slimy/mcp
docker compose -f docker-compose.mcp.yml build
```

### 3. Start Services

```bash
docker compose -f docker-compose.mcp.yml --env-file mcp/.env up -d
```

### 4. Verify Services

```bash
# Check all services are running
docker ps | grep slimy-mcp

# Test health endpoints
curl http://localhost:3101/health  # chat.service
curl http://localhost:3102/health  # club.analytics
curl http://localhost:3103/health  # mysql.data
curl http://localhost:3104/health  # google.sheets
```

### 5. Deploy Website

```bash
cd /home/ubuntu/slimyai-web
npm run build
npm start  # or deploy to Vercel/production
```

## Monitoring

### Logs

```bash
# View all MCP service logs
docker compose -f docker-compose.mcp.yml logs -f

# View specific service
docker logs slimy-mcp-chat-service -f

# Check for errors
docker logs slimy-mcp-chat-service 2>&1 | grep ERROR
```

### Metrics

```bash
# Check service health
curl http://localhost:3101/metrics

# Database connections
docker exec slimy-mysql mysql -u root -p -e "SHOW PROCESSLIST;"

# WebSocket connections
curl http://localhost:3101/stats
```

## Troubleshooting

### Common Issues

1. **MCP service not responding**
   ```bash
   # Restart service
   docker compose -f docker-compose.mcp.yml restart chat-service
   
   # Check logs
   docker logs slimy-mcp-chat-service --tail 100
   ```

2. **WebSocket connection fails**
   ```bash
   # Check if port is open
   netstat -tulpn | grep 3101
   
   # Test WebSocket
   wscat -c ws://localhost:3101/subscribe?guildId=test
   ```

3. **Database connection errors**
   ```bash
   # Check MySQL status
   docker exec slimy-mysql mysqladmin -u root -p status
   
   # Verify credentials
   docker exec slimy-mysql mysql -u slimy -p -e "SELECT 1;"
   ```

4. **Website can't reach MCP services**
   ```bash
   # Check network connectivity
   docker network inspect mcp-network
   
   # Verify environment variables
   cat /home/ubuntu/slimyai-web/.env.local
   ```

## Security Considerations

1. **API Authentication**
   - Use API keys for MCP service authentication
   - Rotate keys regularly
   - Store keys in environment variables

2. **Rate Limiting**
   - Implement rate limiting on API routes
   - Limit WebSocket connections per user
   - Throttle message sending

3. **Input Validation**
   - Sanitize all user input
   - Validate message length
   - Check file types and sizes

4. **Permission Checks**
   - Verify user roles before operations
   - Implement guild-level access control
   - Log permission violations

## Next Steps

1. ✅ Website implementation complete
2. 🔄 Create chat.service MCP tool
3. 🔄 Extend club.analytics for uploads
4. 🔄 Extend google.sheets for exports
5. 🔄 Update mysql.data with new methods
6. 🔄 Deploy and test integration
7. 🔄 Monitor and optimize performance

## References

- Website Deployment Summary: `/home/ubuntu/DEPLOYMENT_SUMMARY.md`
- Developer Guide: `/home/ubuntu/DEVELOPER_GUIDE.md`
- MCP Chat Service: `/home/ubuntu/slimyai_setup/MCP_CHAT_SERVICE_INTEGRATION.md`
- Main MCP Docs: `/opt/slimy/mcp/README.md`
