# Screenshot → Sheet Mapping (Club Analytics)

This guide explains how Manage Members screenshots flow through vision parsing, QA, and persistence.

## Source screenshots

- **Sim Power pages** — Tabs with the `Sim Power` label on each member tile.
- **Total Power pages** — Tabs labeled `Power`.
- Upload 1–10 screenshots per `/club analyze` run. Mixed metric batches are supported; the bot auto-detects each page unless a forced metric is supplied.

## Vision JSON contract

`lib/club-vision.js` calls GPT-4o (or `CLUB_VISION_MODEL`) with the following schema:

```json
{
  "metric": "sim" | "total",
  "rows": [
    {
      "name": "Display name as shown on the tile",
      "value": 123456789,
      "confidence": 0.0-1.0
    }
  ]
}
```

Post-processing canonicalises names (lowercase, emoji/tag removal) and deduplicates by canonical, keeping the highest value + confidence.

### OCR boost

The **Re-parse (OCR boost)** button reruns the same images with a stricter prompt / model (`CLUB_VISION_STRICT_MODEL`). Only low-confidence or missing canonical names are replaced.

## QA pipeline

1. **Merge metrics** — Combine sim/total rows, keeping per-canonical aggregates and confidence scores.
2. **Last-week comparison** — Fetch `club_latest` to identify:
   - Missing members (`lastWeek \ current`)
   - New members (`current \ lastWeek`)
   - Suspicious WoW jumps (>|`CLUB_QA_SUSPICIOUS_JUMP_PCT`|) using previous total power.
3. **Guards** — If fewer than three rows or missing rate ≥20%, commit is blocked unless force-enabled.
4. **Manual fixes** — Modal accepts:
   - `Name = 123456789` (fills the missing metric for that name)
   - `Name, sim=...` / `Name, total=...`
   Canonical mapping is updated immediately; aliases are recorded when a manual entry matches an existing member.
5. **Approval** — On confirm:
   - Insert snapshot + metrics
   - Recompute `club_latest` (Friday 00:00 America/Detroit window, configurable via `CLUB_WEEKLY_BOUNDARY`)
   - Push the `Club Latest` tab

The preview embed surfaces all QA signals so admins can resolve issues before committing to the database or sheet.
