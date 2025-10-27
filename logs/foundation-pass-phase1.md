# Phase 1 Foundation Hardening Log

**Generated:** 2025-10-27T20:54:21+00:00
**Node.js:** v20.19.5
**npm:** v10.8.2
**Environment:** Production
**Working Directory:** /opt/slimy/app

## Execution Checklist

### Core Flows to Verify

- [ ] **Auth & Session**
  - [ ] OAuth login sets secure cookie with correct domain
  - [ ] `/api/auth/debug` returns valid user object with role
  - [ ] Role-based redirect works (admin→/guilds, club→/club, member→/snail)

- [ ] **Guild Picker**
  - [ ] `/api/guilds` responds quickly with parallel bot checks
  - [ ] Timeout protection prevents hanging
  - [ ] Admin UI shows error card instead of infinite spinner

- [ ] **Admin Panel Pages**
  - [ ] Settings, Personality, Usage pages are null-safe
  - [ ] Mobile UI works (hamburger nav, responsive layout)
  - [ ] Error boundaries prevent white screens

- [ ] **Snail Tools**
  - [ ] Upload limits enforced (max 8 images, ≤10 MB each)
  - [ ] Output saves to `data/snail/<guildId>/<userId>/latest.json`
  - [ ] Response format matches documentation

- [ ] **Club Analytics**
  - [ ] `/club analyze` flow works end-to-end
  - [ ] Scripts run without crashes (ingest, verify, recompute)
  - [ ] Corrections system functional

- [ ] **Memory / Consent / Export**
  - [ ] `lib/memory.js` uses proper-lockfile
  - [ ] Atomic writes with tmp→rename pattern
  - [ ] Export correctly scoped (guild vs DM)

- [ ] **Diagnostics & Usage**
  - [ ] `/api/diag` never crashes, masks secrets
  - [ ] Usage page shows data or safe fallback (not blank)

- [ ] **Slime Chat**
  - [ ] Chat loads without hanging
  - [ ] Messages deliver in real-time
  - [ ] Admin-only message feature works
  - [ ] Error handling (no infinite "Connecting...")

---

## Step 0: Setup & Logging

**Status:** IN PROGRESS
**Started:** 2025-10-27T20:54:21+00:00

### Environment Snapshot

```
Node.js:     v20.19.5
npm:         v10.8.2
OS:          Linux (production)
Directory:   /opt/slimy/app
Workspaces:  admin-api, admin-ui, packages/core
```

### Workspace Structure Verified

- `/opt/slimy/app/admin-api/` - Express REST API
- `/opt/slimy/app/admin-ui/` - Next.js frontend
- `/opt/slimy/app/packages/core/` - Shared utilities
- `/opt/slimy/app/commands/` - Discord bot commands
- `/opt/slimy/app/handlers/` - Discord bot handlers
- `/opt/slimy/app/lib/` - Shared libraries

**Completed:** 2025-10-27T20:54:21+00:00

---

## Step 1: Static Health Check

**Status:** PENDING

### Findings
_(to be populated during execution)_

---

## Step 2: Auth & Guilds Hardening

**Status:** PENDING

### 2A: Role-based Redirect
_(to be populated during execution)_

### 2B: Debug Endpoints
_(to be populated during execution)_

### 2C: Parallel Guilds API
_(to be populated during execution)_

### 2D: Guilds UI Error Handling
_(to be populated during execution)_

---

## Step 3: Admin Panel Pages Safety

**Status:** PENDING

---

## Step 4: Slime Chat Admin-Only Messages

**Status:** PENDING

---

## Step 5: Snail Tools Validation

**Status:** PENDING

---

## Step 6: Club Analytics Smoke Test

**Status:** PENDING

---

## Step 7: Memory & Consent

**Status:** PENDING

---

## Step 8: Diagnostics Hardening

**Status:** PENDING

---

## Step 9: Docs Sync

**Status:** PENDING

---

## Phase 1 Status: IN PROGRESS

**Last Updated:** 2025-10-27T20:54:21+00:00
