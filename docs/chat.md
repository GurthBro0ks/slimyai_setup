# Slime Chat

## Overview

Real-time chat for admin panel users, powered by Socket.IO.

## Server-side (`admin-api/src/socket.js`)

- Socket.IO server with cookie-based authentication
- Rooms:
  - `guild:<id>` - Auto-joined for each guild user has access to
  - `admins` - Auto-joined for users with `role === "admin"`
- All authenticated users join their guilds' rooms on connect

## Message Flow

**Regular Messages:**
- Broadcast globally with `io.emit("chat:message", message)`
- Everyone sees these messages

**Admin-Only Messages:**
- Only admins can mark messages as `adminOnly: true`
- Emitted to `io.to("admins")` room instead of global broadcast
- Only visible to other admins
- Visual distinction: red background, "ADMIN" badge, red border

## Message Format

```javascript
{
  from: { id, name, role, color },
  text: "message content",
  ts: "ISO timestamp",
  guildId: "guild id",
  messageId: "unique id",
  adminOnly: true/false  // optional, default false
}
```

## Client-side (`admin-ui/pages/chat/index.js`)

- Located at `/chat` route
- Guild selector dropdown
- Real-time message bubbles with role-based colors:
  - `member` → Blue (#3b82f6)
  - `club` → Orange (#f59e0b)
  - `admin` → Red (#ef4444)
  - `bot` → Green (#22c55e)
- **Admin-only checkbox** (visible only to admins):
  - When checked, message is sent with `adminOnly: true`
  - Results in red-styled message with "ADMIN" badge

## Bot Integration

- Mention `@slimy.ai` in any message to trigger bot reply
- Bot responses are broadcast to everyone (not admin-only)
- Falls back to friendly error message if OpenAI is unavailable

## Error Handling

- Auth failures reject with clear error messages
- Missing guild context returns `{ error: "Missing guild." }`
- Non-admin trying to send admin-only message returns `{ error: "Only admins can send admin-only messages." }`
- UI shows error state instead of "Connecting..." forever
