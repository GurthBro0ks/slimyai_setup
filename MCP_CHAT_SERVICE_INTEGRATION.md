# MCP Chat Service Integration

## Overview

This document outlines the integration of the **chat.service** MCP tool for the Slime Chat feature on the slimy.ai website.

## Architecture

The chat service follows the same MCP architecture as the existing `club.analytics`, `mysql.data`, and `google.sheets` tools:

```
┌─────────────────────────────────────────────────────────────┐
│                     Slimy.ai Website                         │
│                  (Next.js Application)                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           MCP Client (lib/mcp-client.ts)            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP/WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  MCP Tool Servers (Docker)                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ chat.service │  │club.analytics│  │ mysql.data   │     │
│  │  Port 3101   │  │  Port 3102   │  │  Port 3103   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Database Connection
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      MySQL Database                          │
│                                                              │
│  Tables:                                                     │
│  - chat_messages                                            │
│  - chat_users                                               │
│  - chat_permissions                                         │
└─────────────────────────────────────────────────────────────┘
```

## Chat Service Tool Methods

### 1. `getMessages`

Retrieve chat messages for a guild.

**Parameters:**
```typescript
{
  guildId: string;
  limit?: number;  // Default: 50
  since?: string;  // ISO timestamp, default: 7 days ago
}
```

**Returns:**
```typescript
{
  messages: Array<{
    id: string;
    guildId: string;
    userId: string;
    username: string;
    content: string;
    timestamp: string;
    userColor: string;
  }>;
}
```

### 2. `sendMessage`

Send a new message to a guild chat.

**Parameters:**
```typescript
{
  guildId: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
}
```

**Returns:**
```typescript
{
  message: {
    id: string;
    guildId: string;
    userId: string;
    username: string;
    content: string;
    timestamp: string;
    userColor: string;
  };
}
```

### 3. `getOnlineUsers`

Get list of online users in a guild.

**Parameters:**
```typescript
{
  guildId: string;
}
```

**Returns:**
```typescript
{
  users: Array<{
    id: string;
    username: string;
    color: string;
    status: 'online' | 'offline';
  }>;
}
```

### 4. `subscribe` (WebSocket)

Subscribe to real-time message updates.

**WebSocket Endpoint:** `ws://localhost:3101/subscribe`

**Message Format:**
```typescript
{
  type: 'message' | 'user_join' | 'user_leave';
  guildId: string;
  data: any;
}
```

## Database Schema

### `chat_messages` Table

```sql
CREATE TABLE chat_messages (
  id VARCHAR(255) PRIMARY KEY,
  guild_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  user_color VARCHAR(7) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_timestamp (guild_id, timestamp),
  INDEX idx_user (user_id)
);
```

### `chat_users` Table

```sql
CREATE TABLE chat_users (
  id VARCHAR(255) PRIMARY KEY,
  guild_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  user_color VARCHAR(7) NOT NULL,
  status ENUM('online', 'offline') DEFAULT 'offline',
  last_seen DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_guild_user (guild_id, user_id),
  INDEX idx_guild_status (guild_id, status)
);
```

### `chat_permissions` Table

```sql
CREATE TABLE chat_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  role ENUM('admin', 'club', 'guild') NOT NULL,
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  granted_by VARCHAR(255),
  UNIQUE KEY unique_guild_user_perm (guild_id, user_id),
  INDEX idx_guild_role (guild_id, role)
);
```

## Permission Levels

### Admin
- Can see all messages
- Can customize personality modes
- Can manage permissions
- Can delete messages

### Club
- Can see club and guild messages
- Can send messages
- Can view member stats

### Guild
- Can see guild messages only
- Can send messages
- Basic chat functionality

## Message Retention Policy

- **Active Display:** Last 7 days of messages
- **Archive:** Messages older than 7 days moved to `chat_messages_archive` table
- **Cleanup:** Archived messages deleted after 30 days

## Docker Configuration

Add to `docker-compose.mcp.yml`:

```yaml
services:
  chat-service:
    build:
      context: ./mcp/tools/chat-service
      dockerfile: Dockerfile
    container_name: slimy-mcp-chat-service
    ports:
      - "3101:3101"
    environment:
      - NODE_ENV=production
      - PORT=3101
      - MYSQL_HOST=${MYSQL_HOST}
      - MYSQL_PORT=${MYSQL_PORT}
      - MYSQL_USER=${MYSQL_USER}
      - MYSQL_PASSWORD=${MYSQL_PASSWORD}
      - MYSQL_DATABASE=${MYSQL_DATABASE}
    volumes:
      - ./mcp/tools/chat-service:/app
      - /app/node_modules
    restart: unless-stopped
    networks:
      - mcp-network
    depends_on:
      - mysql

networks:
  mcp-network:
    driver: bridge
```

## Environment Variables

Add to `mcp/.env`:

```bash
# Chat Service Configuration
CHAT_SERVICE_PORT=3101
CHAT_MESSAGE_RETENTION_DAYS=7
CHAT_ARCHIVE_RETENTION_DAYS=30
CHAT_MAX_MESSAGE_LENGTH=2000
CHAT_RATE_LIMIT_PER_MINUTE=30

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_CONNECTIONS_PER_GUILD=100
```

## Integration with Website

### 1. Update MCP Client

The website already has the MCP client foundation at `lib/mcp-client.ts`. Update the configuration:

```typescript
// In .env.local
MCP_BASE_URL=http://localhost:3100
MCP_CHAT_SERVICE_URL=http://localhost:3101
MCP_API_KEY=your-api-key
```

### 2. Connect API Routes

The API routes are already created:
- `/api/chat/messages` - Uses `chat.service.getMessages` and `chat.service.sendMessage`
- `/api/chat/users` - Uses `chat.service.getOnlineUsers`

### 3. WebSocket Connection

Update `components/slime-chat/slime-chat-window.tsx` to use real WebSocket:

```typescript
useEffect(() => {
  const mcpClient = getMCPClient();
  const unsubscribe = mcpClient.subscribeToChat(guildId, (message) => {
    setMessages(prev => [...prev, message]);
  });
  
  return () => unsubscribe();
}, [guildId]);
```

## Testing

### Manual Testing

```bash
# Start MCP services
docker compose -f docker-compose.mcp.yml --env-file mcp/.env up -d

# Test chat service
curl -X POST http://localhost:3101/tools/chat.service/getMessages \
  -H "Content-Type: application/json" \
  -d '{"guildId": "test-guild", "limit": 10}'

# Test WebSocket
wscat -c ws://localhost:3101/subscribe
```

### Integration Testing

```bash
# From Discord bot
node test-mcp-chat.js

# From website
npm run test:chat
```

## Deployment Checklist

- [ ] Create database tables
- [ ] Build chat service Docker image
- [ ] Update docker-compose.mcp.yml
- [ ] Configure environment variables
- [ ] Start chat service container
- [ ] Test MCP tool methods
- [ ] Test WebSocket connection
- [ ] Update website MCP client
- [ ] Deploy website changes
- [ ] Monitor logs for errors
- [ ] Test end-to-end flow

## Monitoring

### Logs

```bash
# View chat service logs
docker logs slimy-mcp-chat-service -f

# Check for errors
docker logs slimy-mcp-chat-service 2>&1 | grep ERROR
```

### Health Check

```bash
# Check service status
curl http://localhost:3101/health

# Check database connection
curl http://localhost:3101/health/db
```

## Troubleshooting

### Common Issues

1. **WebSocket connection fails**
   - Check firewall rules
   - Verify WS_MAX_CONNECTIONS_PER_GUILD not exceeded
   - Check nginx/proxy WebSocket configuration

2. **Messages not persisting**
   - Verify MySQL connection
   - Check database permissions
   - Review mysql.data tool logs

3. **High latency**
   - Check database indexes
   - Review message retention policy
   - Consider Redis caching layer

## Future Enhancements

- [ ] Add message reactions
- [ ] Implement message editing/deletion
- [ ] Add file/image sharing
- [ ] Implement typing indicators
- [ ] Add message search functionality
- [ ] Implement message threading
- [ ] Add emoji support
- [ ] Implement user mentions

## References

- Main MCP Documentation: `/opt/slimy/mcp/README.md`
- MCP Implementation Guide: `/opt/slimy/mcp/IMPLEMENTATION_GUIDE.md`
- Website Integration: `/home/ubuntu/slimyai-web/lib/mcp-client.ts`
- API Routes: `/home/ubuntu/slimyai-web/app/api/chat/`
