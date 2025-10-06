#!/usr/bin/env bash
# scripts/inspect-memory-db.sh
# Database inspection and validation tool for slimy.ai memory system

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Find database file
DB_FILE="${1:-data_store.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="$PROJECT_ROOT/$DB_FILE"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Memory Database Inspector${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if file exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}❌ Database file not found: $DB_PATH${NC}"
    echo ""
    echo "Usage: $0 [database_file]"
    echo "Example: $0 data_store.json"
    exit 1
fi

echo -e "${GREEN}📁 Database File:${NC} $DB_PATH"
echo -e "${GREEN}📏 File Size:${NC} $(du -h "$DB_PATH" | cut -f1)"
echo -e "${GREEN}📅 Last Modified:${NC} $(date -r "$DB_PATH" "+%Y-%m-%d %H:%M:%S")"
echo ""

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  jq not installed. Installing basic inspection...${NC}"
    echo ""
    echo "=== Raw JSON Preview ==="
    head -50 "$DB_PATH"
    echo ""
    echo "=== File Statistics ==="
    echo "Lines: $(wc -l < "$DB_PATH")"
    echo "Characters: $(wc -c < "$DB_PATH")"
    exit 0
fi

# Validate JSON
echo -e "${BLUE}━━━ JSON Validation ━━━${NC}"
if jq empty "$DB_PATH" 2>/dev/null; then
    echo -e "${GREEN}✓ Valid JSON${NC}"
else
    echo -e "${RED}✗ INVALID JSON - File is corrupted!${NC}"
    echo ""
    echo "=== Corruption Details ==="
    jq empty "$DB_PATH" 2>&1 || true
    echo ""
    echo -e "${YELLOW}Recommendation: Restore from backup${NC}"
    exit 1
fi
echo ""

# Schema Check
echo -e "${BLUE}━━━ Schema Validation ━━━${NC}"
HAS_PREFS=$(jq 'has("prefs")' "$DB_PATH")
HAS_MEMOS=$(jq 'has("memos")' "$DB_PATH")
HAS_MODES=$(jq 'has("channelModes")' "$DB_PATH")

if [ "$HAS_PREFS" = "true" ] && [ "$HAS_MEMOS" = "true" ] && [ "$HAS_MODES" = "true" ]; then
    echo -e "${GREEN}✓ Schema valid (prefs, memos, channelModes)${NC}"
else
    echo -e "${YELLOW}⚠️  Missing required fields:${NC}"
    [ "$HAS_PREFS" != "true" ] && echo "  - prefs"
    [ "$HAS_MEMOS" != "true" ] && echo "  - memos"
    [ "$HAS_MODES" != "true" ] && echo "  - channelModes"
fi
echo ""

# Statistics
echo -e "${BLUE}━━━ Database Statistics ━━━${NC}"
PREFS_COUNT=$(jq '.prefs | length' "$DB_PATH")
MEMOS_COUNT=$(jq '.memos | length' "$DB_PATH")
MODES_COUNT=$(jq '.channelModes | length' "$DB_PATH")

echo -e "${GREEN}Consent Entries:${NC} $PREFS_COUNT"
echo -e "${GREEN}Memos:${NC} $MEMOS_COUNT"
echo -e "${GREEN}Channel Modes:${NC} $MODES_COUNT"
echo ""

# Memos Breakdown
if [ "$MEMOS_COUNT" -gt 0 ]; then
    echo -e "${BLUE}━━━ Memos Breakdown ━━━${NC}"

    # Count by user
    echo "By User:"
    jq -r '.memos | group_by(.userId) | .[] | "\(.userId): \(length) memos"' "$DB_PATH" | \
        awk '{printf "  %s\n", $0}'

    echo ""

    # Count by guild vs DM
    GUILD_MEMOS=$(jq '.memos | map(select(.guildId != null)) | length' "$DB_PATH")
    DM_MEMOS=$(jq '.memos | map(select(.guildId == null)) | length' "$DB_PATH")
    echo -e "Context:"
    echo -e "  Guild memos: ${GUILD_MEMOS}"
    echo -e "  DM memos: ${DM_MEMOS}"
    echo ""

    # Recent memos
    echo "Most Recent 5 Memos:"
    jq -r '.memos | sort_by(.createdAt) | reverse | .[:5] | .[] | "  [\(.createdAt | todate)] \(.userId): \(.content | .[0:50])"' "$DB_PATH"
    echo ""
fi

# Data Integrity Checks
echo -e "${BLUE}━━━ Data Integrity Checks ━━━${NC}"

# Check for duplicate memo IDs
DUPLICATE_IDS=$(jq '.memos | group_by(._id) | map(select(length > 1)) | length' "$DB_PATH")
if [ "$DUPLICATE_IDS" -gt 0 ]; then
    echo -e "${RED}✗ Found $DUPLICATE_IDS duplicate memo IDs!${NC}"
    jq '.memos | group_by(._id) | map(select(length > 1)) | .[] | .[0]._id' "$DB_PATH"
else
    echo -e "${GREEN}✓ All memo IDs are unique${NC}"
fi

# Check for missing required fields in memos
INVALID_MEMOS=$(jq '.memos | map(select(.userId == null or ._id == null or .content == null or .createdAt == null)) | length' "$DB_PATH")
if [ "$INVALID_MEMOS" -gt 0 ]; then
    echo -e "${RED}✗ Found $INVALID_MEMOS memos with missing required fields${NC}"
else
    echo -e "${GREEN}✓ All memos have required fields (userId, _id, content, createdAt)${NC}"
fi

# Check for orphaned consent entries (no corresponding memos)
ORPHANED_CONSENT=$(jq '
    (.prefs | map({userId, guildId})) as $prefs |
    (.memos | map({userId, guildId})) as $memos |
    [$prefs[] | select(. as $p | $memos | any(. == $p) | not)] | length
' "$DB_PATH")
if [ "$ORPHANED_CONSENT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $ORPHANED_CONSENT consent entries with no memos (may be normal)${NC}"
else
    echo -e "${GREEN}✓ No orphaned consent entries${NC}"
fi

echo ""

# ID Collision Risk Check
echo -e "${BLUE}━━━ ID Collision Risk Analysis ━━━${NC}"
if [ "$MEMOS_COUNT" -gt 0 ]; then
    # Check for IDs with same timestamp prefix
    SAME_TIMESTAMP=$(jq -r '.memos | group_by(._id[0:13]) | map(select(length > 1)) | length' "$DB_PATH")
    if [ "$SAME_TIMESTAMP" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Found $SAME_TIMESTAMP groups of memos created in the same millisecond${NC}"
        echo "   (Potential ID collision risk)"
        jq -r '.memos | group_by(._id[0:13]) | map(select(length > 1)) | .[] | "  Timestamp \(.[0]._id[0:13]): \(length) memos"' "$DB_PATH"
    else
        echo -e "${GREEN}✓ No timestamp collisions detected${NC}"
    fi
else
    echo "  No memos to analyze"
fi
echo ""

# Recent Activity
echo -e "${BLUE}━━━ Recent Activity ━━━${NC}"
if [ "$MEMOS_COUNT" -gt 0 ]; then
    OLDEST=$(jq -r '.memos | min_by(.createdAt) | .createdAt | todate' "$DB_PATH")
    NEWEST=$(jq -r '.memos | max_by(.createdAt) | .createdAt | todate' "$DB_PATH")
    echo "First memo: $OLDEST"
    echo "Latest memo: $NEWEST"

    # Activity in last 24 hours
    NOW=$(date +%s)
    YESTERDAY=$((NOW - 86400))
    RECENT=$(jq --arg since "$YESTERDAY" '.memos | map(select(.createdAt > ($since | tonumber))) | length' "$DB_PATH")
    echo "Last 24 hours: $RECENT new memos"
else
    echo "  No memo activity"
fi
echo ""

# Advanced Queries
echo -e "${BLUE}━━━ Advanced Queries ━━━${NC}"
echo "1. Largest memo:"
jq -r '.memos | max_by(.content | length) | "   \(.userId): \(.content | length) chars"' "$DB_PATH" 2>/dev/null || echo "   No memos"

echo "2. Average memo length:"
AVG_LENGTH=$(jq '.memos | if length > 0 then (map(.content | length) | add / length) else 0 end | floor' "$DB_PATH")
echo "   $AVG_LENGTH characters"

echo "3. Users with consent:"
CONSENT_USERS=$(jq '.prefs | map(select(.value == "1")) | length' "$DB_PATH")
echo "   $CONSENT_USERS users"

echo ""

# Database Health Score
echo -e "${BLUE}━━━ Database Health Score ━━━${NC}"
SCORE=100

# Deduct points for issues
[ "$DUPLICATE_IDS" -gt 0 ] && SCORE=$((SCORE - 30))
[ "$INVALID_MEMOS" -gt 0 ] && SCORE=$((SCORE - 20))
[ "$SAME_TIMESTAMP" -gt 5 ] && SCORE=$((SCORE - 10))

if [ "$SCORE" -ge 90 ]; then
    echo -e "${GREEN}✓ Excellent ($SCORE/100)${NC}"
elif [ "$SCORE" -ge 70 ]; then
    echo -e "${YELLOW}⚠️  Good ($SCORE/100)${NC}"
elif [ "$SCORE" -ge 50 ]; then
    echo -e "${YELLOW}⚠️  Fair ($SCORE/100) - Issues detected${NC}"
else
    echo -e "${RED}✗ Poor ($SCORE/100) - Critical issues!${NC}"
fi

echo ""

# Recommendations
if [ "$DUPLICATE_IDS" -gt 0 ] || [ "$INVALID_MEMOS" -gt 0 ]; then
    echo -e "${YELLOW}━━━ Recommendations ━━━${NC}"
    [ "$DUPLICATE_IDS" -gt 0 ] && echo "  • Fix duplicate IDs immediately (data corruption risk)"
    [ "$INVALID_MEMOS" -gt 0 ] && echo "  • Clean up invalid memos"
    [ "$SAME_TIMESTAMP" -gt 5 ] && echo "  • Consider using UUID-based IDs instead of timestamp+random"
    echo ""
fi

# Export Options
echo -e "${BLUE}━━━ Export Options ━━━${NC}"
echo "Export full database:"
echo "  cat $DB_PATH | jq '.' > database_export.json"
echo ""
echo "Export only memos:"
echo "  cat $DB_PATH | jq '.memos' > memos_export.json"
echo ""
echo "Backup database:"
echo "  cp $DB_PATH ${DB_FILE}.backup_\$(date +%Y%m%d_%H%M%S)"
echo ""

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Inspection Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
