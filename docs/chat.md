# Slime Chat

Slime Chat is the real-time messaging system integrated into the Slimy.ai Admin Panel.

## Overview

Slime Chat appears as a **pinned bottom bar** with a collapse/expand toggle that overlays all admin panel pages. It provides real-time communication between users with role-based visibility controls.

**Key Features:**
- ✅ Pinned to bottom of screen on all pages after login
- ✅ Tap/click header strip to expand or collapse
- ✅ Expanded bar shows ~10 compact messages (scrollable for older messages)
- ✅ **Messages persist locally** - cached per room, survive page refresh
- ✅ Role-aware (admin sees admin/global chat, others see guild chat)
- ✅ Graceful error handling (shows banner instead of silent spinner)

## Features

### Bottom Bar UI

- **Always accessible**: Pinned to the bottom of the screen on all admin panel pages
- **Collapsible**: Toggle between collapsed (~40px header) and expanded (~40% viewport height)
- **Mobile-friendly**: Responsive design that works on desktop and mobile devices
- **Role indicator**: Shows user's role (admin/club/member) in the header
- **Dense layout**: Compact message rows with small fonts and tight spacing (~10 messages visible)
- **Local persistence**: Recent messages (last 50) cached per room in localStorage
  - Messages appear instantly after page refresh
  - Collapse/expand doesn't lose chat history
  - Cached per admin-global room OR per guild-<id> room

### Role-Based Access

**Admin Users**:
- See `(admin)` indicator in the chat bar header
- Can see all messages (including admin-only messages)
- Join the `admins` room automatically
- Can send admin-only messages (future feature)

**Non-Admin Users**:
- Only see messages for their guilds
- Cannot see admin-only messages
- Must have at least one guild to use chat

### Connection States

The chat bar displays different states:

- **Connecting...**: Shown when initially connecting to the socket server
- **Connected**: No indicator (normal operation)
- **Disconnected**: Shows "Disconnected from chat."
- **Error**: Shows specific error message:
  - "not_authorized" - Authentication failed
  - "no_guild_context" - User has no guilds
  - "Failed to connect to chat." - Network/server issue

### Message Display

Each message shows:
- **Sender name**: Colored by role (member: blue, club: orange, admin: red, bot: green)
- **Timestamp**: Compact HH:MM format (e.g. "14:32")
- **Message text**: Supports line breaks, compact font size
- **Admin-only tag**: "[ADMIN]" badge for messages visible only to admins

**Density optimizations:**
- Message padding: 4px 6px (compact)
- Font size: 0.8rem (~13px) for readability
- Line spacing: 1.2-1.3 (tight)
- Gap between messages: 2px
- Result: **~10 messages visible** in expanded panel without scrolling

## Technical Implementation

### Server-Side (admin-api/src/socket.js)

- **Authentication**: Uses session cookie from admin panel login
- **Session validation**: Verifies JWT and fetches guilds from session store
- **Room assignment**:
  - Users join `guild:{guildId}` rooms for each of their guilds
  - Admins additionally join the `admins` room
- **Error handling**: Emits explicit errors before disconnecting
- **Bot integration**: Messages mentioning @slimy trigger bot responses

### Client-Side (admin-ui/components/SlimeChatBar.jsx)

- **Socket.io client**: Connects to admin API with credentials
- **Auto-reconnect**: Handles disconnections gracefully
- **Message filtering**: Non-admins don't see admin-only messages
- **Auto-scroll**: Scrolls to bottom when new messages arrive
- **Keyboard shortcuts**: Press Enter to send (Shift+Enter for new line)
- **Local cache persistence**:
  - Room key: `admin-global` for admins OR `guild-{guildId}` for others
  - Cache key: `slimeChatCache:{roomKey}` in localStorage
  - Stores last 50 messages per room
  - Loads cached messages on component mount (instant restore)
  - Updates cache on every new message received
  - Survives page refresh, collapse/expand, navigation

### Integration

The chat bar is integrated into the Layout component and automatically appears for all logged-in users:

```jsx
{user && <SlimeChatBar guildId={guildId} />}
```

## Architecture

```
User Browser
    ↓ (HTTPS + WebSocket)
    ↓
Admin API (port 3080)
    ↓
Socket.IO Server
    ├─ Auth Middleware
    │   ├─ Verify JWT
    │   ├─ Fetch guilds from session store
    │   └─ Assign rooms
    │
    ├─ Connection Handler
    │   ├─ Check user exists
    │   ├─ Check guild context
    │   └─ Join guild/admin rooms
    │
    └─ Message Handler
        ├─ Validate message
        ├─ Check guild access
        ├─ Emit to appropriate rooms
        └─ Trigger bot if mentioned
```

## Configuration

No special configuration required. Chat automatically:
- Uses the same authentication as the admin panel
- Connects to the same domain as the admin UI
- Respects user's role and guild memberships

## Future Enhancements

Potential improvements (not yet implemented):

- UI toggle for sending admin-only messages
- Direct messages between users
- Message history persistence
- Typing indicators
- Read receipts
- File/image sharing
- Emoji reactions
- @mentions with notifications

## Troubleshooting

### Chat shows "Connecting..." forever

- Check that admin-api service is running
- Check browser console for connection errors
- Verify CORS settings allow credentials

### Chat shows "not_authorized"

- Your session may have expired - try logging out and back in
- Check that cookies are enabled and not being blocked

### Chat shows "no_guild_context"

- Non-admin users need at least one guild to use chat
- Contact an admin to be added to a guild

### Messages not appearing

- Check that you're in the correct guild
- Admins: verify you're in the `admins` room (check server logs)
- Try refreshing the page
- Check browser console for errors

## Development

### Testing Locally

1. Ensure admin-api is running: `npm --workspace admin-api start`
2. Ensure admin-ui is running: `npm --workspace admin-ui run dev`
3. Login to admin panel at http://localhost:3081
4. Chat bar should appear at bottom of screen
5. Open multiple browser tabs to test multi-user chat

### Server Logs

Chat connection attempts are logged:

```
[slime-chat] connection { userId: '12345', role: 'admin', guilds: 2 }
[slime-chat] auth failed: not_authorized
```

### Browser Console

Client logs connection state:

```
[chat-bar] connecting to https://admin.slimyai.xyz
[chat-bar] connected
[chat-bar] disconnected: transport close
```
