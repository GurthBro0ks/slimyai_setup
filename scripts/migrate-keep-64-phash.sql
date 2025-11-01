ALTER TABLE snail_item_icons
  MODIFY phash CHAR(64) NOT NULL;

-- Optional metrics table (safe, used only if FEATURE_ANALYZE_METRICS=true)
CREATE TABLE IF NOT EXISTS analyze_metrics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  coverage TINYINT NOT NULL,             -- 0..3
  icon_conf_weapon TINYINT NULL,
  icon_conf_armor  TINYINT NULL,
  icon_conf_acc1   TINYINT NULL,
  icon_conf_acc2   TINYINT NULL,
  icon_conf_FAME   TINYINT NULL,
  icon_conf_ART    TINYINT NULL,
  icon_conf_CIV    TINYINT NULL,
  icon_conf_TECH   TINYINT NULL,
  icon_conf_FTH    TINYINT NULL,
  radar_conf TINYINT NULL,               -- 0..100
  first_run BOOL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
