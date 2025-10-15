#!/bin/bash
# System Check Script - Slimy.AI Bot v2.1
# Verifies all production components are properly configured and functional

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
WARN=0

echo "========================================="
echo "Slimy.AI Bot v2.1 - System Check"
echo "========================================="
echo ""

# Function to print test result
pass() {
  echo -e "${GREEN}✅ PASS${NC}: $1"
  ((PASS++))
}

fail() {
  echo -e "${RED}❌ FAIL${NC}: $1"
  ((FAIL++))
}

warn() {
  echo -e "${YELLOW}⚠️  WARN${NC}: $1"
  ((WARN++))
}

# Change to app directory
cd /opt/slimy/app

echo "1. File Structure Checks"
echo "------------------------"

# Required files
if [ -f "index.js" ]; then
  pass "index.js exists"
else
  fail "index.js missing"
fi

if [ -f "package.json" ]; then
  pass "package.json exists"
else
  fail "package.json missing"
fi

if [ -f "deploy-commands.js" ]; then
  pass "deploy-commands.js exists"
else
  fail "deploy-commands.js missing"
fi

if [ -f "docker-compose.yml" ]; then
  pass "docker-compose.yml exists"
else
  fail "docker-compose.yml missing"
fi

if [ -f "Dockerfile" ]; then
  pass "Dockerfile exists"
else
  fail "Dockerfile missing"
fi

# Required directories
if [ -d "commands" ]; then
  pass "commands/ directory exists"
else
  fail "commands/ directory missing"
fi

if [ -d "lib" ]; then
  pass "lib/ directory exists"
else
  fail "lib/ directory missing"
fi

if [ -d "handlers" ]; then
  pass "handlers/ directory exists"
else
  fail "handlers/ directory missing"
fi

echo ""
echo "2. Core Library Files (v2.1)"
echo "----------------------------"

# Core libs
for lib in database memory modes openai persona personality-engine vision snail-vision images auto-image image-intent; do
  if [ -f "lib/${lib}.js" ]; then
    pass "lib/${lib}.js exists"
  else
    warn "lib/${lib}.js missing (may be optional)"
  fi
done

# v2.1 monitoring libs
for lib in health-server metrics logger alert rate-limiter; do
  if [ -f "lib/${lib}.js" ]; then
    pass "lib/${lib}.js exists (v2.1)"
  else
    fail "lib/${lib}.js missing (required for v2.1)"
  fi
done

echo ""
echo "3. Configuration Files"
echo "----------------------"

if [ -f ".env" ]; then
  pass ".env file exists"

  # Check required variables
  if grep -q "DISCORD_TOKEN=" .env && ! grep -q "DISCORD_TOKEN=$" .env && ! grep -q "DISCORD_TOKEN=your_token_here" .env; then
    pass "DISCORD_TOKEN is set"
  else
    fail "DISCORD_TOKEN not configured in .env"
  fi

  if grep -q "DISCORD_CLIENT_ID=" .env && ! grep -q "DISCORD_CLIENT_ID=$" .env; then
    pass "DISCORD_CLIENT_ID is set"
  else
    fail "DISCORD_CLIENT_ID not configured in .env"
  fi

  # Check v2.1 variables
  if grep -q "HEALTH_PORT=" .env; then
    pass "HEALTH_PORT configured (v2.1)"
  else
    warn "HEALTH_PORT not set (defaults to 3000)"
  fi

  if grep -q "LOG_LEVEL=" .env; then
    pass "LOG_LEVEL configured (v2.1)"
  else
    warn "LOG_LEVEL not set (defaults to info)"
  fi

else
  fail ".env file missing"
fi

if [ -f ".env.example" ]; then
  pass ".env.example exists (v2.1)"
else
  warn ".env.example missing"
fi

if [ -f "bot-personality.md" ]; then
  pass "bot-personality.md exists (v2.1)"
else
  warn "bot-personality.md missing (personality engine will use defaults)"
fi

echo ""
echo "4. Documentation (v2.1)"
echo "-----------------------"

if [ -f "README.md" ]; then
  pass "README.md exists (v2.1)"
else
  warn "README.md missing"
fi

if [ -f "DEPLOYMENT.md" ]; then
  pass "DEPLOYMENT.md exists (v2.1)"
else
  warn "DEPLOYMENT.md missing"
fi

if [ -f "CLAUDE.md" ]; then
  pass "CLAUDE.md exists"
else
  warn "CLAUDE.md missing"
fi

echo ""
echo "5. Scripts (v2.1)"
echo "-----------------"

if [ -f "scripts/backup-database.sh" ] && [ -x "scripts/backup-database.sh" ]; then
  pass "backup-database.sh exists and is executable (v2.1)"
elif [ -f "scripts/backup-database.sh" ]; then
  warn "backup-database.sh exists but not executable (run: chmod +x scripts/backup-database.sh)"
else
  fail "scripts/backup-database.sh missing (v2.1)"
fi

if [ -f "scripts/restore-database.sh" ] && [ -x "scripts/restore-database.sh" ]; then
  pass "restore-database.sh exists and is executable (v2.1)"
elif [ -f "scripts/restore-database.sh" ]; then
  warn "restore-database.sh exists but not executable (run: chmod +x scripts/restore-database.sh)"
else
  fail "scripts/restore-database.sh missing (v2.1)"
fi

if [ -f "scripts/system-check.sh" ] && [ -x "scripts/system-check.sh" ]; then
  pass "system-check.sh exists and is executable (v2.1)"
elif [ -f "scripts/system-check.sh" ]; then
  warn "system-check.sh exists but not executable (run: chmod +x scripts/system-check.sh)"
else
  warn "system-check.sh missing (you're running it, so it exists!)"
fi

echo ""
echo "6. Node.js Dependencies"
echo "-----------------------"

if [ -d "node_modules" ]; then
  pass "node_modules directory exists"

  # Check critical dependencies
  if [ -d "node_modules/discord.js" ]; then
    pass "discord.js installed"
  else
    fail "discord.js not installed (run: npm install)"
  fi

  if [ -d "node_modules/mysql2" ]; then
    pass "mysql2 installed"
  else
    warn "mysql2 not installed (database features unavailable)"
  fi

  if [ -d "node_modules/openai" ]; then
    pass "openai installed"
  else
    warn "openai not installed (AI features unavailable)"
  fi

  # v2.1 dependencies
  if [ -d "node_modules/express" ]; then
    pass "express installed (v2.1)"
  else
    fail "express not installed (run: npm install) - required for health server"
  fi

else
  fail "node_modules missing (run: npm install)"
fi

echo ""
echo "7. Docker Environment"
echo "---------------------"

if command -v docker &> /dev/null; then
  pass "Docker is installed"

  # Check if network exists
  if docker network inspect slimy-net &> /dev/null; then
    pass "slimy-net network exists"
  else
    warn "slimy-net network missing (run: docker network create slimy-net)"
  fi

  # Check if containers are running
  if docker ps | grep -q "slimy-db"; then
    pass "slimy-db container is running"
  else
    warn "slimy-db container not running (run: docker compose up -d)"
  fi

  if docker ps | grep -q "slimy-bot"; then
    pass "slimy-bot container is running"
  else
    warn "slimy-bot container not running (run: docker compose up -d)"
  fi

else
  warn "Docker not installed (required for production deployment)"
fi

echo ""
echo "8. Persistent Directories"
echo "-------------------------"

if [ -d "/opt/slimy/ops/mysql" ]; then
  pass "/opt/slimy/ops/mysql exists"
else
  warn "/opt/slimy/ops/mysql missing (create: mkdir -p /opt/slimy/ops/mysql)"
fi

if [ -d "/opt/slimy/ops/logs" ]; then
  pass "/opt/slimy/ops/logs exists"
else
  warn "/opt/slimy/ops/logs missing (create: mkdir -p /opt/slimy/ops/logs)"
fi

if [ -d "/opt/slimy/ops/bot-data" ]; then
  pass "/opt/slimy/ops/bot-data exists"
else
  warn "/opt/slimy/ops/bot-data missing (create: mkdir -p /opt/slimy/ops/bot-data)"
fi

if [ -d "backups" ]; then
  pass "backups/ directory exists"
else
  warn "backups/ directory missing (create: mkdir backups)"
fi

echo ""
echo "9. Health Check Endpoints (v2.1)"
echo "---------------------------------"

# Check if health server is responding
if curl -f -s http://localhost:3000/health > /dev/null 2>&1; then
  pass "Health endpoint responding at http://localhost:3000/health"

  # Check if response is valid JSON
  HEALTH_JSON=$(curl -s http://localhost:3000/health)
  if echo "$HEALTH_JSON" | jq -e '.status' > /dev/null 2>&1; then
    pass "Health endpoint returns valid JSON"

    STATUS=$(echo "$HEALTH_JSON" | jq -r '.status')
    if [ "$STATUS" == "healthy" ]; then
      pass "Bot status is healthy"
    else
      warn "Bot status is: $STATUS"
    fi
  else
    warn "Health endpoint response is not valid JSON"
  fi
else
  warn "Health endpoint not responding (bot may not be running or HEALTH_PORT misconfigured)"
fi

# Check metrics endpoint
if curl -f -s http://localhost:3000/metrics > /dev/null 2>&1; then
  pass "Metrics endpoint responding at http://localhost:3000/metrics"
else
  warn "Metrics endpoint not responding"
fi

echo ""
echo "10. Security Checks"
echo "-------------------"

# Check .gitignore
if [ -f ".gitignore" ]; then
  pass ".gitignore exists"

  if grep -q "google-service-account.json" .gitignore; then
    pass "google-service-account.json in .gitignore"
  else
    fail "google-service-account.json NOT in .gitignore (SECURITY RISK!)"
  fi

  if grep -q "\.env" .gitignore; then
    pass ".env in .gitignore"
  else
    fail ".env NOT in .gitignore (SECURITY RISK!)"
  fi
else
  fail ".gitignore missing"
fi

# Check file permissions
if [ -f ".env" ]; then
  PERM=$(stat -c '%a' .env)
  if [ "$PERM" == "600" ] || [ "$PERM" == "400" ]; then
    pass ".env has secure permissions ($PERM)"
  else
    warn ".env has loose permissions ($PERM) - recommend: chmod 600 .env"
  fi
fi

# Check if google-service-account.json is tracked in git
if git ls-files --error-unmatch google-service-account.json &> /dev/null; then
  fail "google-service-account.json is tracked in git! (CRITICAL: run git rm --cached google-service-account.json)"
else
  pass "google-service-account.json not tracked in git"
fi

echo ""
echo "========================================="
echo "Summary"
echo "========================================="
echo -e "${GREEN}✅ Passed${NC}: $PASS"
echo -e "${YELLOW}⚠️  Warnings${NC}: $WARN"
echo -e "${RED}❌ Failed${NC}: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 System check complete! All critical tests passed.${NC}"

  if [ $WARN -gt 0 ]; then
    echo -e "${YELLOW}⚠️  There are $WARN warnings. Review them for optimal configuration.${NC}"
  fi

  exit 0
else
  echo -e "${RED}❌ System check failed with $FAIL critical errors.${NC}"
  echo "Please fix the errors above before deploying to production."
  exit 1
fi
