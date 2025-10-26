CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id               VARCHAR(32)  PRIMARY KEY,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Example settings (add more as needed)
  sheet_id               VARCHAR(128) NULL,
  sheet_tab              VARCHAR(128) NULL,
  view_mode              ENUM('baseline','latest') DEFAULT 'baseline',
  allow_public           TINYINT(1)   NOT NULL DEFAULT 0,
  -- Club Settings (screenshot uploads)
  screenshot_channel_id  VARCHAR(32)  NULL,
  uploads_enabled        TINYINT(1)   NOT NULL DEFAULT 1,
  notes                  TEXT         NULL
);
