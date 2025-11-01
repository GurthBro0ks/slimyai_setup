-- Migration: Admin API tables and indexes
-- Date: 2025-10-28

CREATE TABLE IF NOT EXISTS guild_personality (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  profile_json JSON NOT NULL,
  updated_by VARCHAR(32) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS channel_settings (
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  channel_name VARCHAR(120) NULL,
  modes_json JSON NOT NULL,
  allowlist_json JSON NOT NULL,
  updated_by VARCHAR(32) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  admin_id VARCHAR(32) NULL,
  guild_id VARCHAR(32) NULL,
  action VARCHAR(120) NOT NULL,
  payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin (admin_id),
  KEY idx_guild (guild_id),
  KEY idx_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id CHAR(36) NOT NULL PRIMARY KEY,
  admin_id VARCHAR(32) NOT NULL,
  csrf_token CHAR(64) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  KEY idx_admin (admin_id),
  KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
