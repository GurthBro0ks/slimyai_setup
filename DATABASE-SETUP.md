# Database Setup — Club Analytics

Club analytics extends the Slimy.AI schema with five tables that live alongside the existing memory/snail data. Apply the migration `migrations/2025-10-20-club.sql` once per environment after deploying the new release.

## Tables

- **`club_members`** — Canonical roster keyed by `(guild_id, name_canonical)`. Stores the latest display name and `last_seen` timestamp for QA.
- **`club_snapshots`** — Header row for each approved `/club analyze` run. Tracks who created the snapshot and when it was captured.
- **`club_metrics`** — Metric rows (`sim` or `total`) tied to a snapshot + member. Values are `BIGINT` to cover high-end power levels.
- **`club_latest`** — Materialized view of the latest snapshot per member, including previous-week values, WoW percentages, and the export timestamp.
- **`club_aliases`** — Optional mapping from alternate canonical names to a canonical member record. Driven by the manual-fix modal and auto-matching.

## Weekly comparison window

When `recomputeLatestForGuild` runs (triggered post-commit), the bot selects the prior reference snapshot **between 8 and 6 days before** the current one. This `[−8d .. −6d]` window smooths over late uploads while keeping comparisons aligned to the Friday 00:00 America/Detroit week boundary (configurable via `CLUB_WEEKLY_BOUNDARY`).

If no snapshot is found in that window, WoW percentages remain `NULL` and the totals still update.

## Alias behaviour

Manual fixes can map new OCR names onto existing members. During commit the bot:

1. Upserts every canonical name observed in the working set.
2. Writes metrics for `sim`/`total`.
3. Inserts alias rows for any unmatched canonical strings that were manually mapped to an existing `member_id`.

Aliases enforce uniqueness per `(guild_id, alias_canonical)`; reruns simply point the alias at the latest `member_id`.
