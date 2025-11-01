-- Migration: Add club_corrections table for admin overrides
-- Date: 2025-10-23
-- Purpose: Enable bidirectional corrections flow for fixing bad OCR

CREATE TABLE IF NOT EXISTS club_corrections (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  guild_id VARCHAR(32) NOT NULL,
  week_id VARCHAR(16) NOT NULL,            -- e.g. 2025-W43 (use anchor)
  member_key VARCHAR(120) NOT NULL,        -- normalized name
  display_name VARCHAR(120) NOT NULL,      -- for reference
  metric ENUM('total','sim') NOT NULL,
  value BIGINT NOT NULL,
  reason VARCHAR(255) NULL,
  source ENUM('sheet','command','rescan') NOT NULL DEFAULT 'command',
  created_by VARCHAR(64) NULL,             -- discord user id or 'sheet:<email>'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_corr (guild_id, week_id, member_key, metric),
  KEY idx_guild_week (guild_id, week_id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
