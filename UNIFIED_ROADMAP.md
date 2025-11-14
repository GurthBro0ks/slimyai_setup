# Slimy.ai Unified Implementation Roadmap

**Generated**: 2025-11-14
**Scope**: Integration plan for slimyai_setup + slimyai-web repositories
**Timeline**: 12 weeks (3 months)

---

## Executive Summary

### Current State Analysis

You have **three operational worlds** with different maturity levels:

| World | Status | Critical Issues |
|-------|--------|-----------------|
| **1. Discord Bot** | ✅ Production (vulnerable) | Security fixes needed |
| **2. Admin Panel** | ✅ Production (vulnerable) | Security fixes needed |
| **3. Next.js Dashboard** | ⚠️ Foundation only | Missing backend entirely |

### Critical Finding

**🚨 PRODUCTION SECURITY VULNERABILITIES** - Your live admin panel at admin.slimyai.xyz has:
- Missing CSRF protection on 18+ routes (allows cross-site attacks)
- Memory leak in chat command (bot crashes after extended use)
- Hardcoded configuration fallbacks (wrong CORS origins possible)

**Fixes exist in code but are NOT deployed to production.**

### Strategic Vision

The long-term goal is to **unify these three worlds** into one clean stack:

```
┌─────────────────────────────────────────────────────────────┐
│                    Future Unified Stack                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Discord Bot  ←──┐                                           │
│  (world 1)       │                                           │
│                  │     ┌──────────────────┐                  │
│                  ├────→│  Admin API       │                  │
│  Admin Panel     │     │  (unified)       │←─────┐           │
│  (world 2)       │     └──────────────────┘      │           │
│                  │              ↕                 │           │
│                  │     ┌──────────────────┐      │           │
│  Next.js Web    ─┘     │  PostgreSQL      │      │           │
│  (world 3)             │  (single source) │      │           │
│                        └──────────────────┘      │           │
│                                                   │           │
│                        Discord OAuth ─────────────┘           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Today**: Three separate stacks with duplicate code, separate databases, security vulnerabilities
**Goal**: One API, one database, one auth system, all three frontends integrated

---

## Phase 0: IMMEDIATE ACTIONS (Days 1-3)

### Priority: CRITICAL SECURITY DEPLOYMENT

**Why This Can't Wait**:
- Your production admin panel is vulnerable to CSRF attacks RIGHT NOW
- Users with malicious links could perform unauthorized actions
- Memory leak will crash bot during high-usage periods
- Every day of delay increases risk

### Tasks

#### Day 1: Manual Testing & Validation

**Repository**: slimyai_setup
**Branch**: `claude/repo-scan-report-01UCn4QgdqJA4DnDjpVw2Wdb`

```bash
# 1. Environment validation test (5 minutes)
cd /home/user/slimyai_setup/admin-api
npm start  # Verify fails without CORS_ORIGIN

# 2. CSRF protection test (10 minutes)
# Start server, run manual test script
node ../tests/csrf-manual-test.js

# 3. Memory leak validation (check code changes)
grep -A 10 "cleanupOldHistories" commands/chat.js
```

**Expected Results**:
- Server fails immediately when CORS_ORIGIN missing ✅
- All state-changing routes reject requests without CSRF token ✅
- Chat command includes TTL cleanup logic ✅

**Deliverable**: Test results documented in TESTING-CHECKLIST.md

---

#### Day 2: Staging Deployment

**Prerequisites**:
- Manual tests passing
- Staging environment configured with proper .env

**Steps**:

1. **Deploy to staging server**
```bash
# SSH to staging box
ssh user@staging.slimyai.xyz

# Pull latest code
cd /opt/slimy/app
git fetch origin
git checkout claude/repo-scan-report-01UCn4QgdqJA4DnDjpVw2Wdb
git pull

# Verify .env has required variables
grep -E "^(CORS_ORIGIN|COOKIE_DOMAIN|DISCORD_REDIRECT_URI)" admin-api/.env

# Install dependencies
npm install

# Restart services
pm2 restart admin-api
pm2 restart admin-ui
pm2 restart slimy-bot
```

2. **Integration testing on staging**
- Log in via Discord OAuth
- Test personality configuration update (CSRF protected)
- Upload test file (CSRF protected)
- Send chat messages (verify no memory leak)
- Monitor logs for 1 hour

**Success Criteria**:
- All features work as before
- CSRF protection blocks unauthorized requests
- No errors in pm2 logs
- Memory usage stable over 1 hour

**Deliverable**: Staging sign-off in TESTING-CHECKLIST.md

---

#### Day 3: Production Deployment

**Prerequisites**:
- Staging tests 100% successful
- Production .env verified

**Critical Pre-Deployment Checklist**:

```bash
# 1. Verify production environment variables
ssh user@admin.slimyai.xyz
cd /opt/slimy/app/admin-api
cat .env | grep -E "^(CORS_ORIGIN|COOKIE_DOMAIN|DISCORD_REDIRECT_URI)"

# Expected values:
# CORS_ORIGIN=https://admin.slimyai.xyz
# COOKIE_DOMAIN=.slimyai.xyz
# DISCORD_REDIRECT_URI=https://admin.slimyai.xyz/api/auth/callback

# 2. If ANY are missing, ADD them before deployment
nano .env  # Add missing variables
```

**Deployment Steps**:

```bash
# 1. Create backup
cd /opt/slimy/app
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz .

# 2. Merge security fixes to main
git checkout main
git merge claude/repo-scan-report-01UCn4QgdqJA4DnDjpVw2Wdb
git push origin main

# 3. Deploy to production
git pull origin main
npm install

# 4. Restart services (zero-downtime)
pm2 reload admin-api
pm2 reload admin-ui
pm2 reload slimy-bot

# 5. Verify services started
pm2 list
pm2 logs admin-api --lines 50
```

**Post-Deployment Monitoring** (1 hour):
- Watch pm2 logs for errors
- Test login flow
- Test one CSRF-protected action
- Monitor memory usage of bot process

**Rollback Plan** (if failures occur):
```bash
git revert HEAD
npm install
pm2 reload all
```

**Deliverable**: Production deployment documented in SECURITY-FIXES-REVIEW.md

---

### Phase 0 Deliverables

- ✅ Security vulnerabilities patched in production
- ✅ CSRF protection active on all state-changing routes
- ✅ Memory leak fixed in chat command
- ✅ Environment validation prevents misconfigurations
- ✅ Test results documented
- ✅ Monitoring confirms stable operation

**Estimated Time**: 3 days
**Resources Required**: 1 developer, access to staging + production servers
**Risk Level**: Medium (breaking changes to environment requirements)

---

## Phase 1: FOUNDATION (Weeks 1-4)

### Goal: Make slimyai-web Production-Ready

**Why**: The new Next.js dashboard (world 3) has a beautiful UI but no backend. It's currently blocked by missing infrastructure.

### Current State (slimyai-web)

**What Exists** ✅:
- UI components (chat, guilds, analytics, codes)
- Page layouts and routing
- Mock data and localStorage

**What's Missing** ❌:
- Admin API service (no backend at all)
- Database layer (using mocks instead of Postgres)
- Discord OAuth (can't actually log in)
- Error handling, logging, monitoring
- Testing infrastructure

### Architecture Decision: Two Paths Forward

You have a choice about how to approach the backend:

#### Option A: Build New Admin API for slimyai-web (Recommended)

**Pros**:
- Clean slate, modern stack (Postgres + Prisma)
- Designed for slimyai-web from day 1
- No legacy baggage
- Easier to test and maintain

**Cons**:
- More initial work (2-3 weeks)
- Two admin APIs running in parallel temporarily
- Migration path needed from old → new

**Architecture**:
```
slimyai-web/
├── app/                    # Next.js frontend (exists)
├── lib/
│   ├── admin-api/         # NEW: Backend API routes
│   │   ├── auth/          # Discord OAuth
│   │   ├── guilds/        # Guild management
│   │   ├── chat/          # Chat system
│   │   └── codes/         # Code aggregator
│   ├── db/                # NEW: Prisma client
│   │   ├── schema.prisma  # Database schema
│   │   └── migrations/    # Version control
│   └── config/            # NEW: Environment + logging
└── prisma/
    └── schema.prisma      # Single source of truth
```

---

#### Option B: Extend Existing Admin API

**Pros**:
- Faster initial setup (1 week)
- Reuse existing code in slimyai_setup/admin-api
- One admin API from day 1

**Cons**:
- Legacy code carries forward (CSRF fixes, old patterns)
- Still uses MySQL (migration to Postgres later)
- Technical debt accumulates

**Architecture**:
```
slimyai_setup/admin-api/
├── src/
│   ├── routes/            # Extend existing routes
│   ├── middleware/        # Reuse auth, CSRF
│   └── app.js
└── (point slimyai-web to this API)
```

---

### Recommendation: Option A (New Admin API)

**Rationale**:
1. You already identified the old admin-api has issues (mega-commands, inconsistent error handling)
2. Postgres + Prisma is better foundation than MySQL + raw SQL
3. Clean OAuth implementation vs. patching old one
4. You're planning to refactor anyway (from NEXT-HIGH-PRIORITY-ITEMS.md)

**Timeline**: 3-4 weeks vs. 1-2 weeks for Option B

---

### Week 1: Admin API Foundation

**Goal**: Stand up basic Admin API service with proper structure

#### Tasks

**1.1: Project Structure & Configuration**

```bash
cd slimyai-web
mkdir -p lib/admin-api/{auth,guilds,chat,codes,users}
mkdir -p lib/db/{migrations,seeds}
mkdir -p lib/config
mkdir -p lib/utils/{logger,errors,validation}
```

**Files to Create**:
- `lib/config/env.ts` - Type-safe environment validation
- `lib/config/logger.ts` - Structured logging (pino or winston)
- `lib/utils/errors.ts` - Custom error classes
- `lib/admin-api/index.ts` - API entry point

**Environment Variables** (.env.local):
```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/slimyai"

# Discord OAuth
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."
DISCORD_REDIRECT_URI="http://localhost:3000/api/auth/callback"

# Session
SESSION_SECRET="..."
COOKIE_DOMAIN="localhost"

# API
ADMIN_API_PORT=3000
NODE_ENV="development"
```

**1.2: Database Setup (Postgres + Prisma)**

```bash
npm install prisma @prisma/client
npx prisma init
```

**Initial Schema** (prisma/schema.prisma):
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(cuid())
  discordId     String   @unique
  username      String
  discriminator String
  avatar        String?
  globalConsent Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  guilds        UserGuild[]
  memories      Memory[]
  sessions      Session[]
}

model Guild {
  id               String   @id @default(cuid())
  discordId        String   @unique
  name             String
  icon             String?
  personalityMode  String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  users            UserGuild[]
  channels         Channel[]
  codes            Code[]
}

model UserGuild {
  id           String   @id @default(cuid())
  userId       String
  guildId      String
  role         String   @default("member")
  sheetsConsent Boolean @default(false)
  sheetId      String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  guild        Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@unique([userId, guildId])
}

model Channel {
  id        String   @id @default(cuid())
  discordId String   @unique
  guildId   String
  name      String
  type      String
  modes     String[] @default([])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  guild     Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)
}

model Memory {
  id        String   @id @default(cuid())
  userId    String
  guildId   String?
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  csrfToken String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
}

model Code {
  id          String   @id @default(cuid())
  code        String   @unique
  guildId     String?
  source      String   // 'discord', 'reddit', 'snelp'
  postedBy    String?
  postedAt    DateTime
  lastChecked DateTime?
  isValid     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  guild       Guild?   @relation(fields: [guildId], references: [id], onDelete: SetNull)

  @@index([source])
  @@index([isValid])
}
```

**Run Migration**:
```bash
npx prisma migrate dev --name init
npx prisma generate
```

**1.3: Error Handling & Logging**

**lib/utils/errors.ts**:
```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}
```

**lib/config/logger.ts**:
```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});
```

**Deliverables**:
- ✅ Project structure created
- ✅ Environment configuration
- ✅ Postgres database initialized
- ✅ Prisma schema + migrations
- ✅ Error handling framework
- ✅ Logging infrastructure

**Time Estimate**: 2-3 days

---

### Week 2: Discord OAuth & Authentication

**Goal**: Implement secure Discord OAuth flow with session management

#### Tasks

**2.1: OAuth Flow Implementation**

**lib/admin-api/auth/oauth.ts**:
```typescript
import { logger } from '@/lib/config/logger';
import { prisma } from '@/lib/db/client';
import { UnauthorizedError } from '@/lib/utils/errors';

const DISCORD_API = 'https://discord.com/api/v10';
const OAUTH_URL = `${DISCORD_API}/oauth2/authorize`;
const TOKEN_URL = `${DISCORD_API}/oauth2/token`;
const USER_URL = `${DISCORD_API}/users/@me`;

export async function getOAuthURL(state: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });
  return `${OAUTH_URL}?${params}`;
}

export async function exchangeCode(code: string) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    }),
  });

  if (!response.ok) {
    throw new UnauthorizedError('Failed to exchange OAuth code');
  }

  return await response.json();
}

export async function getDiscordUser(accessToken: string) {
  const response = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new UnauthorizedError('Failed to fetch Discord user');
  }

  return await response.json();
}

export async function createOrUpdateUser(discordUser: any) {
  return await prisma.user.upsert({
    where: { discordId: discordUser.id },
    update: {
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar,
    },
    create: {
      discordId: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar,
    },
  });
}
```

**2.2: Session Management**

**lib/admin-api/auth/session.ts**:
```typescript
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db/client';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSession(userId: string) {
  const csrfToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL);

  return await prisma.session.create({
    data: {
      userId,
      csrfToken,
      expiresAt,
    },
    include: {
      user: true,
    },
  });
}

export async function getSession(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export async function deleteSession(sessionId: string) {
  await prisma.session.delete({
    where: { id: sessionId },
  });
}

// Cleanup expired sessions
export async function cleanupExpiredSessions() {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}
```

**2.3: API Routes**

**app/api/auth/login/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getOAuthURL } from '@/lib/admin-api/auth/oauth';
import { randomBytes } from 'crypto';

export async function GET(request: NextRequest) {
  const state = randomBytes(16).toString('hex');

  // Store state in session for verification
  const response = NextResponse.redirect(await getOAuthURL(state));
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  });

  return response;
}
```

**app/api/auth/callback/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCode,
  getDiscordUser,
  createOrUpdateUser,
} from '@/lib/admin-api/auth/oauth';
import { createSession } from '@/lib/admin-api/auth/session';
import { UnauthorizedError } from '@/lib/utils/errors';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const storedState = request.cookies.get('oauth_state')?.value;

  if (!code || !state || state !== storedState) {
    throw new UnauthorizedError('Invalid OAuth state');
  }

  // Exchange code for access token
  const tokens = await exchangeCode(code);

  // Fetch Discord user
  const discordUser = await getDiscordUser(tokens.access_token);

  // Create/update user in database
  const user = await createOrUpdateUser(discordUser);

  // Create session
  const session = await createSession(user.id);

  // Set session cookie
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set('session_id', session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    domain: process.env.COOKIE_DOMAIN,
  });

  return response;
}
```

**app/api/auth/logout/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/admin-api/auth/session';

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('session_id');
  return response;
}
```

**2.4: Auth Middleware**

**lib/admin-api/middleware/auth.ts**:
```typescript
import { NextRequest } from 'next/server';
import { getSession } from '@/lib/admin-api/auth/session';
import { UnauthorizedError, ForbiddenError } from '@/lib/utils/errors';

export async function requireAuth(request: NextRequest) {
  const sessionId = request.cookies.get('session_id')?.value;

  if (!sessionId) {
    throw new UnauthorizedError();
  }

  const session = await getSession(sessionId);

  if (!session) {
    throw new UnauthorizedError('Session expired');
  }

  return { user: session.user, session };
}

export async function requireCsrf(request: NextRequest, session: any) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return; // Safe methods don't need CSRF
  }

  const csrfToken = request.headers.get('x-csrf-token');

  if (!csrfToken || csrfToken !== session.csrfToken) {
    throw new ForbiddenError('Invalid CSRF token');
  }
}
```

**Deliverables**:
- ✅ Discord OAuth flow working
- ✅ Session management with CSRF tokens
- ✅ Auth middleware
- ✅ Login/logout endpoints
- ✅ Session cleanup job

**Time Estimate**: 3-4 days

---

### Week 3: Core API Endpoints

**Goal**: Implement essential API endpoints for guilds, users, chat

#### Tasks

**3.1: Guild Management API**

**app/api/guilds/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/admin-api/middleware/auth';
import { prisma } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const { user } = await requireAuth(request);

  const guilds = await prisma.userGuild.findMany({
    where: { userId: user.id },
    include: {
      guild: {
        include: {
          _count: {
            select: { users: true, channels: true },
          },
        },
      },
    },
  });

  return NextResponse.json(guilds.map(ug => ({
    ...ug.guild,
    role: ug.role,
    userCount: ug.guild._count.users,
    channelCount: ug.guild._count.channels,
  })));
}
```

**app/api/guilds/[guildId]/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/admin-api/middleware/auth';
import { prisma } from '@/lib/db/client';
import { NotFoundError, ForbiddenError } from '@/lib/utils/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const { user } = await requireAuth(request);

  const userGuild = await prisma.userGuild.findUnique({
    where: {
      userId_guildId: {
        userId: user.id,
        guildId: params.guildId,
      },
    },
    include: {
      guild: {
        include: {
          channels: true,
          users: {
            include: { user: true },
          },
        },
      },
    },
  });

  if (!userGuild) {
    throw new NotFoundError('Guild');
  }

  return NextResponse.json({
    ...userGuild.guild,
    role: userGuild.role,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { guildId: string } }
) {
  const { user, session } = await requireAuth(request);
  await requireCsrf(request, session);

  const userGuild = await prisma.userGuild.findUnique({
    where: {
      userId_guildId: {
        userId: user.id,
        guildId: params.guildId,
      },
    },
  });

  if (!userGuild || userGuild.role !== 'admin') {
    throw new ForbiddenError();
  }

  const body = await request.json();

  const updated = await prisma.guild.update({
    where: { id: params.guildId },
    data: {
      personalityMode: body.personalityMode,
    },
  });

  return NextResponse.json(updated);
}
```

**3.2: Chat API**

**app/api/chat/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCsrf } from '@/lib/admin-api/middleware/auth';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  const { user, session } = await requireAuth(request);
  await requireCsrf(request, session);

  const { prompt, guildId } = await request.json();

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are Slimy, a helpful AI assistant.' },
      { role: 'user', content: prompt },
    ],
  });

  return NextResponse.json({
    response: response.choices[0].message.content,
  });
}
```

**3.3: User API**

**app/api/users/me/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/admin-api/middleware/auth';

export async function GET(request: NextRequest) {
  const { user, session } = await requireAuth(request);

  return NextResponse.json({
    ...user,
    csrfToken: session.csrfToken, // For frontend to use
  });
}

export async function PATCH(request: NextRequest) {
  const { user, session } = await requireAuth(request);
  await requireCsrf(request, session);

  const body = await request.json();

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      globalConsent: body.globalConsent,
    },
  });

  return NextResponse.json(updated);
}
```

**Deliverables**:
- ✅ Guild list and detail endpoints
- ✅ Guild settings update (CSRF protected)
- ✅ Chat endpoint (CSRF protected)
- ✅ User profile endpoints
- ✅ Proper authorization checks (role-based)

**Time Estimate**: 3-4 days

---

### Week 4: Integration & Testing

**Goal**: Wire up frontend to real API, add tests, deploy to staging

#### Tasks

**4.1: Frontend Integration**

**Remove Mock Data**:
```typescript
// Before (lib/mock-data.ts)
export const mockGuilds = [...];

// After (lib/api-client.ts)
export async function fetchGuilds() {
  const response = await fetch('/api/guilds', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch guilds');
  return response.json();
}
```

**Add CSRF Token Handling**:
```typescript
// lib/api-client.ts
let csrfToken: string | null = null;

export async function fetchCurrentUser() {
  const response = await fetch('/api/users/me', {
    credentials: 'include',
  });
  const user = await response.json();
  csrfToken = user.csrfToken; // Store for later use
  return user;
}

export async function updateGuildSettings(guildId: string, data: any) {
  const response = await fetch(`/api/guilds/${guildId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken!, // Include in all mutations
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  return response.json();
}
```

**4.2: Testing Infrastructure**

**Install Testing Libraries**:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
npm install -D supertest @types/supertest
```

**API Tests** (tests/api/auth.test.ts):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/client';

describe('Auth API', () => {
  beforeAll(async () => {
    // Setup test database
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should create session on successful OAuth', async () => {
    // Test OAuth flow
  });

  it('should validate CSRF tokens on mutations', async () => {
    // Test CSRF protection
  });

  it('should reject expired sessions', async () => {
    // Test session expiry
  });
});
```

**4.3: Deployment to Staging**

**Docker Setup** (Dockerfile):
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**Docker Compose** (docker-compose.yml):
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: slimyai
      POSTGRES_USER: slimyai
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - slimy-net

  web:
    build: .
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgresql://slimyai:${DB_PASSWORD}@postgres:5432/slimyai
      DISCORD_CLIENT_ID: ${DISCORD_CLIENT_ID}
      DISCORD_CLIENT_SECRET: ${DISCORD_CLIENT_SECRET}
      DISCORD_REDIRECT_URI: ${DISCORD_REDIRECT_URI}
      SESSION_SECRET: ${SESSION_SECRET}
      COOKIE_DOMAIN: ${COOKIE_DOMAIN}
    ports:
      - "3000:3000"
    networks:
      - slimy-net

networks:
  slimy-net:
    driver: bridge

volumes:
  postgres_data:
```

**Deploy to Staging**:
```bash
# SSH to staging NUC
ssh user@staging.slimyai.xyz

# Clone slimyai-web repo
git clone https://github.com/user/slimyai-web.git /opt/slimy/web
cd /opt/slimy/web

# Setup .env
cp .env.example .env.staging
nano .env.staging  # Configure staging values

# Start with Docker Compose
docker-compose --env-file .env.staging up -d

# Run migrations
docker-compose exec web npx prisma migrate deploy

# Verify
docker-compose logs -f web
curl http://localhost:3000/api/health
```

**Deliverables**:
- ✅ Frontend using real API endpoints
- ✅ CSRF tokens working end-to-end
- ✅ API tests passing
- ✅ Docker deployment working
- ✅ Staging environment functional

**Time Estimate**: 4-5 days

---

### Phase 1 Summary

**Deliverables**:
- ✅ slimyai-web has functional backend (Admin API + Postgres)
- ✅ Discord OAuth login working
- ✅ Guild management API complete
- ✅ Chat API functional
- ✅ CSRF protection on all mutations
- ✅ Testing infrastructure in place
- ✅ Staging deployment successful

**Time**: 4 weeks
**Status**: slimyai-web is now production-ready for basic features

---

## Phase 2: INTEGRATION (Weeks 5-8)

### Goal: Unify the Three Worlds

Now that you have:
- World 1 (Discord Bot) - Production, security fixes deployed
- World 2 (Admin Panel) - Production, security fixes deployed
- World 3 (Next.js Dashboard) - Production-ready with new backend

**Next step**: Make them all talk to the same database and API.

### Current Problem

```
Discord Bot ──→ MySQL (old schema)
             └→ JSON files (data_store.json)

Admin Panel ──→ MySQL (old schema)
              └→ Express API (old, just patched)

Next.js Web ──→ Postgres (new schema)
              └→ New Admin API
```

**Goal**:
```
                    ┌─────────────────┐
Discord Bot ────────┤                 │
                    │   Unified API   │
Admin Panel ────────┤   (GraphQL?)    │
                    │                 │
Next.js Web ────────┤                 │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   PostgreSQL    │
                    │  (single DB)    │
                    └─────────────────┘
```

### Week 5-6: Database Migration

**Goal**: Migrate from MySQL + JSON to Postgres

#### Tasks

**5.1: Schema Mapping**

**Old MySQL Schema** → **New Postgres Schema**:

| Old Table | Old Storage | New Table | Notes |
|-----------|-------------|-----------|-------|
| users | MySQL | User | Map discordId |
| guilds | MySQL | Guild | Map discordId |
| user_guilds | MySQL | UserGuild | Direct mapping |
| memories | MySQL + JSON | Memory | Merge both sources |
| channels | MySQL | Channel | Map discordId |
| snail_stats | MySQL | SnailStat | New table |
| image_generation_log | MySQL | ImageGeneration | New table |
| consent_preferences | JSON | User.globalConsent | Merge into User |
| memos | JSON | Memory | Merge with DB memories |
| channel_modes | JSON | Channel.modes | Merge into Channel |

**5.2: Migration Script**

**scripts/migrate-mysql-to-postgres.ts**:
```typescript
import { PrismaClient as PgClient } from '@prisma/client';
import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import { logger } from '@/lib/config/logger';

const pg = new PgClient();
const mysqlConfig = {
  host: process.env.OLD_DB_HOST,
  user: process.env.OLD_DB_USER,
  password: process.env.OLD_DB_PASSWORD,
  database: process.env.OLD_DB_NAME,
};

async function migrateUsers(mysqlConn: any) {
  logger.info('Migrating users...');

  const [rows] = await mysqlConn.query('SELECT * FROM users');

  for (const row of rows) {
    await pg.user.upsert({
      where: { discordId: row.discord_id },
      update: {
        username: row.username,
        discriminator: row.discriminator,
        avatar: row.avatar,
        globalConsent: row.global_consent === 1,
      },
      create: {
        discordId: row.discord_id,
        username: row.username,
        discriminator: row.discriminator,
        avatar: row.avatar,
        globalConsent: row.global_consent === 1,
      },
    });
  }

  logger.info(`Migrated ${rows.length} users`);
}

async function migrateGuilds(mysqlConn: any) {
  logger.info('Migrating guilds...');

  const [rows] = await mysqlConn.query('SELECT * FROM guilds');

  for (const row of rows) {
    await pg.guild.upsert({
      where: { discordId: row.guild_id },
      update: {
        name: row.name,
        icon: row.icon,
      },
      create: {
        discordId: row.guild_id,
        name: row.name,
        icon: row.icon,
      },
    });
  }

  logger.info(`Migrated ${rows.length} guilds`);
}

async function migrateMemories(mysqlConn: any) {
  logger.info('Migrating memories from MySQL...');

  const [rows] = await mysqlConn.query('SELECT * FROM memories');

  for (const row of rows) {
    const user = await pg.user.findUnique({
      where: { discordId: row.user_id },
    });

    if (!user) {
      logger.warn(`Skipping memory for unknown user ${row.user_id}`);
      continue;
    }

    await pg.memory.create({
      data: {
        userId: user.id,
        guildId: row.guild_id,
        content: row.content,
        createdAt: row.created_at,
      },
    });
  }

  logger.info(`Migrated ${rows.length} memories from MySQL`);

  // Also migrate from JSON file
  logger.info('Migrating memories from JSON...');

  const jsonData = JSON.parse(
    await fs.readFile('/opt/slimy/app/data_store.json', 'utf-8')
  );

  let jsonMemoCount = 0;
  for (const [key, data] of Object.entries(jsonData.memos || {})) {
    const [userId, guildId] = key.split(':');

    const user = await pg.user.findUnique({
      where: { discordId: userId },
    });

    if (!user) continue;

    for (const memo of data.memos || []) {
      await pg.memory.create({
        data: {
          userId: user.id,
          guildId: guildId === 'null' ? null : guildId,
          content: memo.note,
          createdAt: new Date(memo.timestamp),
        },
      });
      jsonMemoCount++;
    }
  }

  logger.info(`Migrated ${jsonMemoCount} memories from JSON`);
}

async function main() {
  const mysqlConn = await mysql.createConnection(mysqlConfig);

  try {
    await migrateUsers(mysqlConn);
    await migrateGuilds(mysqlConn);
    await migrateMemories(mysqlConn);
    // ... migrate other tables

    logger.info('Migration complete!');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    await mysqlConn.end();
    await pg.$disconnect();
  }
}

main();
```

**Run Migration**:
```bash
# Backup old data first!
mysqldump -u root -p slimyai > backup-$(date +%Y%m%d).sql
cp data_store.json data_store.json.backup

# Run migration
tsx scripts/migrate-mysql-to-postgres.ts

# Verify
psql slimyai -c "SELECT COUNT(*) FROM \"User\";"
psql slimyai -c "SELECT COUNT(*) FROM \"Memory\";"
```

**5.3: Parallel Operation**

**Strategy**: Run both databases in parallel during transition
- Discord bot still writes to MySQL
- Admin panel reads from Postgres (via new API)
- Sync script runs every 5 minutes to copy new data MySQL → Postgres

**Sync Script** (scripts/sync-mysql-to-postgres.ts):
```typescript
// Similar to migration script but only syncs records
// created/updated since last sync
async function syncChanges() {
  const lastSync = await getLastSyncTime();

  // Sync users updated since last sync
  const [newUsers] = await mysqlConn.query(
    'SELECT * FROM users WHERE updated_at > ?',
    [lastSync]
  );

  // ... sync to Postgres

  await setLastSyncTime(new Date());
}

// Run every 5 minutes
setInterval(syncChanges, 5 * 60 * 1000);
```

**Deliverables**:
- ✅ Migration script tested and working
- ✅ All historical data in Postgres
- ✅ Sync script keeping Postgres up-to-date
- ✅ Both databases operational (no downtime)

**Time Estimate**: 1-2 weeks

---

### Week 7-8: Discord Bot Integration

**Goal**: Make Discord bot use new Postgres database

#### Current Bot Architecture

```
commands/chat.js ──→ lib/openai.js ──→ OpenAI API
                 └──→ lib/memory.js ──→ data_store.json

commands/remember.js ──→ lib/memory.js ──→ data_store.json
                      └──→ lib/database.js ──→ MySQL
```

#### New Bot Architecture

```
commands/chat.js ──→ lib/api-client.js ──→ Admin API ──→ Postgres
                                                      └──→ OpenAI

commands/remember.js ──→ lib/api-client.js ──→ Admin API ──→ Postgres
```

**Tasks**

**7.1: Bot API Client**

**lib/api-client.js** (new file in Discord bot):
```javascript
const axios = require('axios');

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:3000/api';
const BOT_API_KEY = process.env.BOT_API_KEY; // New: bot authentication

class AdminAPIClient {
  constructor() {
    this.client = axios.create({
      baseURL: ADMIN_API_URL,
      headers: {
        'Authorization': `Bearer ${BOT_API_KEY}`,
      },
    });
  }

  async createOrUpdateUser(discordUser) {
    const { data } = await this.client.post('/internal/users', {
      discordId: discordUser.id,
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar,
    });
    return data;
  }

  async getMemories(userId, guildId) {
    const { data } = await this.client.get('/internal/memories', {
      params: { userId, guildId },
    });
    return data;
  }

  async createMemory(userId, guildId, content) {
    const { data } = await this.client.post('/internal/memories', {
      userId,
      guildId,
      content,
    });
    return data;
  }

  async deleteMemory(memoryId) {
    await this.client.delete(`/internal/memories/${memoryId}`);
  }

  async chat(userId, guildId, messages) {
    const { data } = await this.client.post('/internal/chat', {
      userId,
      guildId,
      messages,
    });
    return data;
  }
}

module.exports = new AdminAPIClient();
```

**7.2: Update Bot Commands**

**commands/remember.js**:
```javascript
// Before
const memory = require('../lib/memory');

async function execute(interaction) {
  const note = interaction.options.getString('note');
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id;

  await memory.addMemo(userId, guildId, note);
  // ...
}

// After
const apiClient = require('../lib/api-client');

async function execute(interaction) {
  const note = interaction.options.getString('note');
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id;

  await apiClient.createMemory(userId, guildId, note);
  // ...
}
```

**commands/chat.js**:
```javascript
// Before
const openai = require('../lib/openai');
const memory = require('../lib/memory');

async function execute(interaction) {
  const prompt = interaction.options.getString('message');
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id;

  // Get memories
  const memories = await memory.getMemos(userId, guildId);

  // Build context
  const messages = [
    { role: 'system', content: buildSystemPrompt(memories) },
    { role: 'user', content: prompt },
  ];

  // Call OpenAI
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
  });

  // ...
}

// After
const apiClient = require('../lib/api-client');

async function execute(interaction) {
  const prompt = interaction.options.getString('message');
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id;

  // Admin API now handles memory retrieval + OpenAI call
  const response = await apiClient.chat(userId, guildId, [
    { role: 'user', content: prompt },
  ]);

  // ...
}
```

**7.3: Internal API Endpoints**

**app/api/internal/chat/route.ts** (in slimyai-web):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireBotAuth } from '@/lib/admin-api/middleware/bot-auth';
import { prisma } from '@/lib/db/client';
import { openai } from '@/lib/openai';

export async function POST(request: NextRequest) {
  await requireBotAuth(request); // Validate BOT_API_KEY

  const { userId, guildId, messages } = await request.json();

  // Get user memories
  const user = await prisma.user.findUnique({
    where: { discordId: userId },
    include: {
      memories: {
        where: guildId ? { guildId } : { guildId: null },
      },
    },
  });

  // Build system prompt with memories
  const systemPrompt = buildSystemPrompt(user?.memories || []);

  // Call OpenAI
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  return NextResponse.json({
    response: response.choices[0].message.content,
  });
}
```

**app/api/internal/memories/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireBotAuth } from '@/lib/admin-api/middleware/bot-auth';
import { prisma } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  await requireBotAuth(request);

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const guildId = searchParams.get('guildId');

  const user = await prisma.user.findUnique({
    where: { discordId: userId! },
  });

  if (!user) {
    return NextResponse.json([]);
  }

  const memories = await prisma.memory.findMany({
    where: {
      userId: user.id,
      guildId: guildId || null,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(memories);
}

export async function POST(request: NextRequest) {
  await requireBotAuth(request);

  const { userId, guildId, content } = await request.json();

  const user = await prisma.user.findUnique({
    where: { discordId: userId },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const memory = await prisma.memory.create({
    data: {
      userId: user.id,
      guildId: guildId || null,
      content,
    },
  });

  return NextResponse.json(memory);
}
```

**7.4: Gradual Rollout**

**Strategy**: Feature flag to toggle between old and new storage

**.env**:
```bash
USE_NEW_API=false  # Start with false, flip to true after testing
```

**commands/remember.js**:
```javascript
const memory = require('../lib/memory');
const apiClient = require('../lib/api-client');

async function execute(interaction) {
  const note = interaction.options.getString('note');
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id;

  if (process.env.USE_NEW_API === 'true') {
    await apiClient.createMemory(userId, guildId, note);
  } else {
    await memory.addMemo(userId, guildId, note);
  }

  // ...
}
```

**Rollout Plan**:
1. Week 7: Deploy bot code with `USE_NEW_API=false` (no behavior change)
2. Test internal API endpoints manually
3. Flip to `USE_NEW_API=true` on staging bot
4. Monitor for 48 hours
5. Week 8: Flip to `USE_NEW_API=true` on production
6. Monitor for 1 week
7. Remove old code paths (memory.js, database.js)

**Deliverables**:
- ✅ Discord bot using unified Admin API
- ✅ Single database (Postgres) for all three worlds
- ✅ Gradual rollout with feature flag
- ✅ Old MySQL + JSON deprecated

**Time Estimate**: 2 weeks

---

### Phase 2 Summary

**Deliverables**:
- ✅ All data migrated from MySQL + JSON → Postgres
- ✅ Discord bot integrated with new Admin API
- ✅ Admin panel using new backend
- ✅ Next.js web using new backend
- ✅ Single source of truth (Postgres)
- ✅ Unified API handling all requests

**Time**: 4 weeks
**Status**: Three worlds now unified

---

## Phase 3: ENHANCED FEATURES (Weeks 9-10)

Now that infrastructure is unified, add the fancy features from slimyai-web roadmap.

### Week 9: Codes Aggregator

**Goal**: Implement Super Snail codes aggregation from Reddit + Snelp

**Features**:
- Fetch codes from Reddit `/r/SuperSnail`
- Fetch codes from Snelp API
- Deduplicate across sources
- Validate codes
- Display in web dashboard

**Implementation**: Follow `slimyai-web/ROADMAP.md` "Codes Aggregator" section

---

### Week 10: Club Analytics

**Goal**: GPT-4 Vision screenshot analysis + stat tracking

**Features**:
- Upload Super Snail screenshots
- Extract stats via GPT-4 Vision
- Store in database
- Show charts/trends
- Export to Google Sheets

**Implementation**: Follow `slimyai-web/ROADMAP.md` "Club Analytics" section

---

## Phase 4: POLISH & MIGRATION (Weeks 11-12)

### Week 11: Infrastructure Migration

**Goal**: Move everything from IONOS VPS → NUCs at home

**Tasks**:
1. Setup NUC1 as primary production server
2. Setup NUC2 as staging + backup server
3. Migrate services one by one
4. Update DNS to point to NUC1 public IP
5. Decommission IONOS VPS

---

### Week 12: CI/CD & Monitoring

**Goal**: Automated testing, deployment, monitoring

**Tasks**:
1. GitHub Actions for automated tests
2. Deployment pipeline (staging → production)
3. Prometheus + Grafana monitoring
4. Error tracking (Sentry)
5. Performance monitoring
6. Documentation updates

---

## Timeline Summary

| Phase | Duration | Key Deliverable | Status |
|-------|----------|-----------------|--------|
| **Phase 0** | Days 1-3 | Security fixes deployed | ⏳ Next |
| **Phase 1** | Weeks 1-4 | slimyai-web production-ready | ⏳ Pending |
| **Phase 2** | Weeks 5-8 | Three worlds unified | ⏳ Pending |
| **Phase 3** | Weeks 9-10 | Enhanced features | ⏳ Pending |
| **Phase 4** | Weeks 11-12 | Infrastructure complete | ⏳ Pending |

**Total Time**: ~12 weeks (3 months)

---

## Immediate Next Steps

### This Week (Week 0)

**Day 1** (Today):
```bash
# 1. Review this roadmap
# 2. Choose Option A or B for slimyai-web backend
# 3. Deploy security fixes to production (Phase 0)

cd /home/user/slimyai_setup/admin-api
npm start  # Test environment validation
```

**Day 2**:
```bash
# Deploy to staging
ssh staging.slimyai.xyz
# ... follow Phase 0, Day 2 steps
```

**Day 3**:
```bash
# Deploy to production
ssh admin.slimyai.xyz
# ... follow Phase 0, Day 3 steps
```

**Next Week (Week 1)**:
- Start Phase 1: Foundation
- Setup slimyai-web Admin API structure
- Initialize Postgres database
- Implement Discord OAuth

---

## Decision Points

You need to decide:

### 1. Backend Approach (Phase 1)

**Option A**: New Admin API in slimyai-web (recommended)
- Clean slate
- Postgres + Prisma
- 3-4 weeks

**Option B**: Extend existing Admin API
- Faster (1-2 weeks)
- Keep MySQL
- More tech debt

**Recommendation**: Option A (better long-term)

### 2. Migration Strategy (Phase 2)

**Option A**: Big Bang Migration
- One weekend, switch everything
- Higher risk, faster

**Option B**: Gradual Migration (recommended)
- Feature flags
- Parallel databases
- Lower risk, slower

**Recommendation**: Option B (safer)

### 3. Hosting Strategy

**Option A**: Move to NUCs now
- Do migration + hosting change together
- One big change

**Option B**: Migrate later (recommended)
- Get software unified first on IONOS
- Move hardware in Phase 4
- Separate concerns

**Recommendation**: Option B (less variables)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Production downtime during migration | High | Use gradual rollout with feature flags |
| Data loss during DB migration | Critical | Multiple backups, test migration first |
| Security vulnerabilities unpatched | High | Deploy Phase 0 immediately (days 1-3) |
| Timeline slippage | Medium | Build buffer into estimates, prioritize MVP |
| Discord bot breaks during integration | High | Keep old code paths, use feature flags |
| User disruption | Medium | Communicate changes, maintain compatibility |

---

## Success Metrics

### Phase 0 Success
- ✅ No CSRF vulnerabilities in production
- ✅ No bot crashes from memory leak
- ✅ All environment variables validated

### Phase 1 Success
- ✅ Users can log in via Discord OAuth to slimyai-web
- ✅ Guild management working
- ✅ Chat functional from web dashboard
- ✅ Tests passing (>80% coverage)

### Phase 2 Success
- ✅ Single Postgres database serving all three worlds
- ✅ No data loss during migration
- ✅ Discord bot commands work identically
- ✅ Admin panel features preserved

### Final Success (End of Phase 4)
- ✅ All features from original roadmap implemented
- ✅ Three worlds unified into one stack
- ✅ CI/CD pipeline operational
- ✅ Monitoring and alerting active
- ✅ Running on NUCs (off IONOS)
- ✅ Documentation complete

---

## Conclusion

This roadmap takes you from "three separate worlds with security vulnerabilities" to "one unified, production-grade Slimy.ai platform" in 12 weeks.

**Critical Path**:
1. Deploy security fixes (3 days) ← DO THIS FIRST
2. Build slimyai-web backend (4 weeks)
3. Migrate to unified database (4 weeks)
4. Add enhanced features (2 weeks)
5. Complete infrastructure migration (2 weeks)

**Start**: Deploy security fixes to production (Phase 0)
**Next**: Choose backend approach and begin Phase 1
**End**: Fully unified, feature-complete platform on your own infrastructure

---

**Questions?** Review specific sections above or ask for clarification on any phase.
