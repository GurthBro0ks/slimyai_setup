-- Migration: Add correction tracking columns to club_latest
-- Date: 2025-10-23
-- Purpose: Track which metrics were corrected and why

ALTER TABLE club_latest
  ADD COLUMN sim_corrected BOOLEAN DEFAULT FALSE AFTER sim_pct_change,
  ADD COLUMN total_corrected BOOLEAN DEFAULT FALSE AFTER total_pct_change,
  ADD COLUMN sim_correction_reason VARCHAR(255) NULL AFTER sim_corrected,
  ADD COLUMN total_correction_reason VARCHAR(255) NULL AFTER total_corrected;
