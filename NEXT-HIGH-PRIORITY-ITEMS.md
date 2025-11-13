# Next High-Priority Items
**Based on:** Repository Scan Report (2025-11-13)
**Status:** Post-Security Hardening
**Estimated Total Effort:** 2-3 weeks

---

## Priority Summary

After completing critical security fixes (CSRF, config hardening, memory leak), these items remain from the HIGH priority category:

| # | Item | Priority | Effort | Impact | Risk if Delayed |
|---|------|----------|--------|--------|-----------------|
| 1 | Database Transactions | 🔴 HIGH | 2 days | High | Data inconsistency |
| 2 | Caching Layer | 🔴 HIGH | 1 day | Medium | Performance degradation |
| 3 | Refactor Mega-Commands | 🔴 HIGH | 1 week | Medium | Maintenance difficulty |
| 4 | Centralized Error Handling | 🟡 MEDIUM | 3 days | Medium | Inconsistent UX |
| 5 | CI/CD Pipeline | 🟡 MEDIUM | 2 days | High | Manual errors |

---

## Item 1: Database Transaction Support 🔴

### Current Issue
Multi-step database operations are not atomic. If a failure occurs partway through, data can be left in an inconsistent state.

**Example Problem:**
```javascript
// admin-api/src/routes/snail.js
await database.saveSnailStat(guildId, userId, stats);        // ✅ Succeeds
await database.saveRecommendation(guildId, userId, recs);    // ❌ Fails
// Result: Stat saved but no recommendation - inconsistent state
```

### Impact
- **Data Integrity:** Partial updates leave database in invalid state
- **User Experience:** Users see incomplete operations
- **Debugging:** Hard to trace which operations completed
- **Recovery:** Manual database fixes required

### Affected Operations
1. **Snail stat upload + recommendation save** (2 tables)
2. **User creation + guild association** (2 tables)
3. **Personality update + cache invalidation** (2 operations)
4. **Club member data + corrections** (3 tables)

### Proposed Solution

**Approach:** Wrap multi-step operations in database transactions using MySQL transaction support.

**Implementation:**
```javascript
// lib/database.js - Add transaction helpers
async transaction(callback) {
  const connection = await this.pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Usage in routes
await database.transaction(async (conn) => {
  await conn.execute('INSERT INTO snail_stats ...');
  await conn.execute('INSERT INTO recommendations ...');
  // Both succeed or both rollback
});
```

### Files to Modify
```
lib/database.js                          - Add transaction helpers
admin-api/src/routes/snail.js            - Wrap stat + recommendation saves
admin-api/src/routes/guilds.js           - Wrap user + guild operations
admin-api/lib/club-vision.js             - Wrap club data operations
commands/remember.js                     - Wrap memo + consent operations
```

### Testing Strategy
1. **Happy path:** Verify both operations complete successfully
2. **Failure injection:** Trigger error in second operation, verify first rolled back
3. **Concurrency:** Run parallel transactions, verify isolation
4. **Performance:** Measure transaction overhead (should be <10ms)

### Estimated Effort: 2 days
- Day 1: Implement transaction helpers, update database.js
- Day 2: Refactor affected routes, write tests

### Success Criteria
- [ ] All multi-step DB operations use transactions
- [ ] Tests verify rollback on failure
- [ ] No performance degradation
- [ ] Documentation updated

---

## Item 2: Caching Layer Implementation 🔴

### Current Issue
Frequently accessed data (guild modes, personality config) loaded from database/files on every request.

**Performance Impact:**
```
Every message → Load guild modes from data_store.json (~10ms)
Every chat → Load personality config from file (~5ms)
100 req/min → 1,500ms total overhead (1.5 seconds wasted)
```

### Affected Operations
1. **Guild mode resolution** - Every message event (highest volume)
2. **Personality config loading** - Every chat interaction
3. **User consent checks** - Every memory operation
4. **Guild settings** - Every admin API request

### Proposed Solution

**Approach:** LRU cache with TTL for frequently accessed data.

**Implementation:**
```javascript
// lib/cache-manager.js
const LRU = require('lru-cache');

const cache = new LRU({
  max: 500,           // Max 500 entries
  ttl: 5 * 60 * 1000, // 5 minute TTL
  updateAgeOnGet: true,
  updateAgeOnHas: false,
});

function cached(key, ttl, fetchFn) {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;

  const value = await fetchFn();
  cache.set(key, value, { ttl });
  return value;
}

// Usage
const modes = await cached(
  `guild:${guildId}:modes`,
  5 * 60 * 1000,
  () => modeHelper.viewModes({ guildId, ... })
);
```

### Cache Strategy

| Data Type | TTL | Invalidation Trigger |
|-----------|-----|---------------------|
| Guild modes | 5 min | Mode update API call |
| Personality config | 10 min | Personality update API call |
| User consent | 15 min | Consent change API call |
| Guild settings | 5 min | Settings update API call |

### Files to Modify
```
lib/cache-manager.js          - NEW: Cache implementation
lib/modes.js                  - Add caching to viewModes()
lib/personality-engine.js     - Add caching to config loading
lib/memory.js                 - Add caching to consent checks
admin-api/src/middleware/cache.js - Use cache manager
```

### Performance Improvement
- **Before:** ~10-15ms per request for data loading
- **After:** ~0.1ms for cached data (100x faster)
- **Cache hit rate:** Estimated 80-90% for guild modes
- **Memory usage:** ~5-10MB for 500 cached entries

### Testing Strategy
1. **Cache hit:** Load data twice, verify second is from cache
2. **TTL expiry:** Load data, wait for TTL, verify fresh fetch
3. **Invalidation:** Update data, verify cache cleared
4. **Memory limits:** Fill cache beyond max, verify LRU eviction

### Estimated Effort: 1 day
- Morning: Implement cache manager, add to lib/modes.js
- Afternoon: Add to personality-engine.js, memory.js, test

### Success Criteria
- [ ] 80%+ cache hit rate for guild modes
- [ ] <100ms response time for cached data
- [ ] Cache invalidates on updates
- [ ] Memory usage stays under 10MB

---

## Item 3: Refactor Mega-Commands 🔴

### Current Issue
Two commands exceed 1,000 lines with mixed responsibilities:
- `commands/club-analyze.js` - **1,743 lines**
- `commands/snail.js` - **1,173 lines**

**Problems:**
- Hard to understand flow (40+ functions in one file)
- Difficult to test (integration tests only)
- Merge conflicts during collaboration
- Performance unclear (mixed sync/async operations)

### club-analyze.js Breakdown
```javascript
// Current structure (1,743 lines)
- Screenshot processing logic     (~300 lines)
- GPT-4 Vision API calls          (~200 lines)
- Google Sheets sync              (~400 lines)
- Stat extraction/validation      (~300 lines)
- Error handling/logging          (~200 lines)
- Helper functions                (~343 lines)
```

### snail.js Breakdown
```javascript
// Current structure (1,173 lines)
- Vision API integration          (~250 lines)
- Stat parsing/validation         (~300 lines)
- Database operations             (~200 lines)
- Sheet creation logic            (~250 lines)
- UI response formatting          (~173 lines)
```

### Proposed Refactoring

**Approach:** Extract into service modules with single responsibility.

**New Structure:**
```
commands/
  club-analyze/
    index.js                 (~150 lines) - Command definition & orchestration
    vision-service.js        (~200 lines) - GPT-4 Vision API calls
    sheet-sync-service.js    (~300 lines) - Google Sheets operations
    stat-extractor.js        (~250 lines) - Stat extraction logic
    validator.js             (~150 lines) - Input/output validation
    error-handler.js         (~100 lines) - Error formatting

  snail/
    index.js                 (~100 lines) - Command definition
    vision-analyzer.js       (~200 lines) - Vision API
    stat-parser.js           (~250 lines) - Stat parsing
    database-service.js      (~150 lines) - DB operations
    sheet-manager.js         (~200 lines) - Sheet creation
    formatter.js             (~100 lines) - UI formatting
```

### Benefits
- **Testability:** Each module can be unit tested independently
- **Reusability:** Services can be shared between commands
- **Maintainability:** Changes isolated to specific modules
- **Performance:** Easier to identify bottlenecks
- **Collaboration:** Reduced merge conflicts

### Refactoring Strategy

**Phase 1: Extract Services (3 days)**
- Day 1: Extract vision-service.js and vision-analyzer.js
- Day 2: Extract sheet-sync-service.js and sheet-manager.js
- Day 3: Extract stat-extractor.js and stat-parser.js

**Phase 2: Update Command Files (1 day)**
- Simplify index.js to orchestration only
- Update imports and function calls

**Phase 3: Testing (2 days)**
- Day 1: Write unit tests for each service
- Day 2: Integration tests for command flow

**Phase 4: Validation (1 day)**
- Compare output with original implementation
- Performance benchmarking
- Edge case testing

### Testing Strategy
1. **Equivalence testing:** New implementation produces same results as old
2. **Unit tests:** Each service module tested in isolation
3. **Integration tests:** Full command flow tested end-to-end
4. **Performance tests:** Ensure no regression

### Estimated Effort: 1 week (7 days)
- Days 1-3: Extract services
- Day 4: Update commands
- Days 5-6: Testing
- Day 7: Validation and deployment

### Success Criteria
- [ ] No file exceeds 300 lines
- [ ] All services have unit tests (80%+ coverage)
- [ ] Integration tests pass
- [ ] Performance matches or exceeds original
- [ ] Documentation updated

---

## Item 4: Centralized Error Handling 🟡

### Current Issue
Error handling is inconsistent across commands and routes:

```javascript
// Pattern 1: Console.error only
} catch (err) {
  console.error("Command failed:", err);
}

// Pattern 2: Console + interaction reply
} catch (err) {
  console.error("Error:", err);
  await interaction.editReply(`❌ Error: ${err.message}`);
}

// Pattern 3: Structured logging
} catch (err) {
  logger.error("Operation failed", { userId, error: err.message });
  return res.status(500).json({ error: "server_error" });
}
```

**Problems:**
- Inconsistent user-facing error messages
- Missing error context (userId, guildId, command)
- No centralized error metrics
- Sensitive error details leaked to users

### Proposed Solution

**Approach:** Centralized error middleware with classification.

**Implementation:**
```javascript
// lib/error-handler.js
class ApplicationError extends Error {
  constructor(message, code, statusCode = 500, context = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
  }
}

class ValidationError extends ApplicationError {
  constructor(message, context) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}

class ExternalServiceError extends ApplicationError {
  constructor(service, message, context) {
    super(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 503, context);
  }
}

// Global error handler
function handleError(error, interaction = null, req = null) {
  // Log with full context
  logger.error(error.message, {
    code: error.code,
    stack: error.stack,
    userId: interaction?.user?.id || req?.user?.id,
    guildId: interaction?.guildId || req?.params?.guildId,
    command: interaction?.commandName,
  });

  // Track in metrics
  metrics.trackError(error.code, error.statusCode);

  // Return user-friendly message
  const userMessage = getUserMessage(error);
  if (interaction) {
    await interaction.editReply(userMessage);
  } else if (req) {
    req.res.status(error.statusCode).json({ error: userMessage });
  }
}

function getUserMessage(error) {
  // Never expose stack traces or sensitive data
  const safeMessages = {
    VALIDATION_ERROR: '❌ Invalid input. Please check your command and try again.',
    EXTERNAL_SERVICE_ERROR: '⚠️ External service temporarily unavailable. Please try again later.',
    DATABASE_ERROR: '❌ Database error. Please contact support if this persists.',
    PERMISSION_ERROR: '🔒 You don\'t have permission to perform this action.',
  };
  return safeMessages[error.code] || '❌ An unexpected error occurred. Please try again.';
}
```

### Files to Modify
```
lib/error-handler.js          - NEW: Error handling utilities
commands/*.js                 - Update all commands to use error handler
admin-api/src/routes/*.js     - Already has error handler, standardize
handlers/*.js                 - Update mention.js, snail-auto-detect.js
```

### Estimated Effort: 3 days
- Day 1: Implement error handler, define error classes
- Day 2: Update bot commands (18 files)
- Day 3: Update handlers, test error scenarios

### Success Criteria
- [ ] All errors logged with full context
- [ ] No sensitive data in user-facing messages
- [ ] Error metrics tracked
- [ ] Consistent error format across bot & API

---

## Item 5: CI/CD Pipeline 🟡

### Current Issue
No automated testing or deployment:
- Manual testing before deployment
- No test runs on pull requests
- Risk of deploying broken code
- No automated code quality checks

### Proposed Solution

**Approach:** GitHub Actions workflow for testing and deployment.

**Workflow:**
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: |
          npm ci
          npm ci --prefix admin-api
          npm ci --prefix admin-ui

      - name: Run linter
        run: npm run lint

      - name: Run tests
        run: |
          npm run test
          npm run test --prefix admin-api

      - name: Check code coverage
        run: npm run test:coverage
        continue-on-error: true

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to staging
        run: ./scripts/deploy-staging.sh

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: ./scripts/deploy-production.sh
```

### Components Needed
1. **Test scripts** - Add to package.json
2. **Linting** - ESLint configuration
3. **Deployment scripts** - Automated deploy to PM2/Docker
4. **Environment secrets** - GitHub repository secrets

### Estimated Effort: 2 days
- Day 1: Create workflows, add test scripts
- Day 2: Configure deployment scripts, test pipeline

### Success Criteria
- [ ] Tests run automatically on PR
- [ ] Linting fails prevent merge
- [ ] Auto-deploy to staging on develop push
- [ ] Manual approval for production deploy

---

## Recommended Implementation Order

### Week 1: Foundation & Performance
**Priority:** Database reliability and performance

1. **Database Transactions** (2 days)
   - Critical for data integrity
   - Prevents data corruption
   - Relatively isolated change

2. **Caching Layer** (1 day)
   - Immediate performance improvement
   - Reduces database load
   - Complements transaction work

3. **Start Mega-Command Refactoring** (2 days)
   - Begin with club-analyze.js
   - Extract vision-service and sheet-sync-service

### Week 2: Code Quality & Reliability
**Priority:** Maintainability and error handling

4. **Continue Mega-Command Refactoring** (3 days)
   - Complete club-analyze.js refactoring
   - Refactor snail.js
   - Write tests

5. **Centralized Error Handling** (2 days)
   - Improves user experience
   - Better debugging
   - Works well with refactored commands

### Week 3: Automation & Validation
**Priority:** Prevent future issues

6. **CI/CD Pipeline** (2 days)
   - Automate testing
   - Prevent regressions
   - Safer deployments

7. **Testing & Documentation** (3 days)
   - Integration tests for all changes
   - Update documentation
   - Performance validation

---

## Risk Assessment

### Database Transactions
- **Risk:** Breaking existing operations
- **Mitigation:** Thorough testing, gradual rollout
- **Rollback:** Easy - revert commit

### Caching Layer
- **Risk:** Stale data shown to users
- **Mitigation:** Proper TTL tuning, invalidation on updates
- **Rollback:** Easy - disable cache

### Mega-Command Refactoring
- **Risk:** Breaking command functionality
- **Mitigation:** Equivalence testing, parallel deployment
- **Rollback:** Moderate - keep old code until validated

### Error Handling
- **Risk:** Missing error cases
- **Mitigation:** Comprehensive error classification
- **Rollback:** Easy - error handler is additive

### CI/CD Pipeline
- **Risk:** Failed deployments
- **Mitigation:** Staging environment testing first
- **Rollback:** N/A - doesn't affect runtime

---

## Success Metrics

After completing these items, measure:

1. **Data Integrity**
   - Zero partial database updates
   - Zero data inconsistency reports

2. **Performance**
   - 80%+ cache hit rate
   - <100ms response time for cached operations
   - 30%+ reduction in database queries

3. **Code Quality**
   - No files >300 lines
   - 80%+ test coverage for refactored modules
   - Zero critical linting errors

4. **Reliability**
   - 99.9% uptime
   - <1% error rate
   - Zero production incidents from deployments

5. **Automation**
   - 100% of PRs tested automatically
   - Zero manual test runs before deployment
   - <10 minute deployment time

---

## Next Document

After completing these items, the next focus areas will be:

1. **Input Validation Framework** (deferred from this cycle)
2. **API Documentation** (OpenAPI/Swagger spec)
3. **Monitoring & Alerting** (Datadog/Grafana integration)
4. **Performance Optimization** (Query optimization, indexes)
5. **TypeScript Migration** (Long-term project)

---

**Document Version:** 1.0
**Created:** 2025-11-13
**Estimated Completion:** 3 weeks from start
