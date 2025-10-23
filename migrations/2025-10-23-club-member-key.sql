-- Migration: Add member_key columns and unique constraints for club analytics
-- Date: 2025-10-23
-- Purpose: Enable one row per member with SIM+Total metrics using member_key

-- Add member_key to club_metrics (after member_id)
ALTER TABLE club_metrics
  ADD COLUMN member_key VARCHAR(120) AFTER member_id;

-- Add member_key to club_latest (after guild_id)
ALTER TABLE club_latest
  ADD COLUMN member_key VARCHAR(120) AFTER guild_id;

-- Drop old primary key on club_latest
ALTER TABLE club_latest
  DROP PRIMARY KEY;

-- Add new unique constraint on club_latest (guild_id, member_key)
ALTER TABLE club_latest
  ADD UNIQUE KEY uniq_latest (guild_id, member_key);

-- Add unique constraint on club_metrics (guild_id, snapshot_id, member_key, metric)
-- This prevents duplicate metrics for the same member in a snapshot
ALTER TABLE club_metrics
  ADD UNIQUE KEY uniq_metric (snapshot_id, member_key, metric);

-- Backfill member_key from canonical names for existing data
UPDATE club_metrics cm
JOIN club_members mb ON cm.member_id = mb.id
SET cm.member_key = mb.name_canonical
WHERE cm.member_key IS NULL;

UPDATE club_latest cl
JOIN club_members mb ON cl.member_id = mb.id
SET cl.member_key = mb.name_canonical
WHERE cl.member_key IS NULL;
