-- snapshots per analyze session
CREATE TABLE IF NOT EXISTS account_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- parts captured from images (one row per type in the snapshot)
CREATE TABLE IF NOT EXISTS snapshot_parts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  snapshot_id INT NOT NULL,
  part_type ENUM('STATS_MAIN','LOADOUT_GEAR','COMPASS_RELICS') NOT NULL,
  image_url TEXT,
  fields_json JSON,
  quality_score TINYINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_snapshot_part (snapshot_id, part_type),
  INDEX idx_snapshot (snapshot_id),
  FOREIGN KEY (snapshot_id) REFERENCES account_snapshots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- icon atlas for gear & relics
CREATE TABLE IF NOT EXISTS snail_item_icons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_type ENUM('gear','relic') NOT NULL,
  item_slot VARCHAR(32) NULL,
  canonical_name VARCHAR(128) NOT NULL,
  wiki_page VARCHAR(200) NULL,
  phash CHAR(64) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  notes VARCHAR(255) NULL,
  UNIQUE KEY uniq_item (item_type, canonical_name),
  INDEX idx_phash (phash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- user loadouts (A/B/C)
CREATE TABLE IF NOT EXISTS user_loadouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  slot ENUM('A','B','C') NOT NULL,
  name VARCHAR(64) DEFAULT NULL,
  last_detected_at TIMESTAMP NULL,
  UNIQUE KEY uniq_user_slot (user_id, slot),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- loadout items snapshot
CREATE TABLE IF NOT EXISTS user_loadout_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  loadout_id INT NOT NULL,
  item_type ENUM('gear','relic') NOT NULL,
  item_slot VARCHAR(32) NOT NULL,
  canonical_name VARCHAR(128) NOT NULL,
  confidence TINYINT NOT NULL,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loadout_id) REFERENCES user_loadouts(id) ON DELETE CASCADE,
  INDEX idx_loadout (loadout_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- enrich snail_stats if not yet done
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'snail_stats'
    AND column_name = 'wiki_enrichment'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE snail_stats ADD COLUMN wiki_enrichment JSON',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'snail_stats'
    AND column_name = 'active_loadout'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE snail_stats ADD COLUMN active_loadout ENUM(''A'',''B'',''C'')',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'snail_stats'
    AND column_name = 'loadout_snapshot_id'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE snail_stats ADD COLUMN loadout_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ensure phash column can store 64-char hashes
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'snail_item_icons'
    AND column_name = 'phash'
    AND character_maximum_length = 64
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE snail_item_icons MODIFY phash CHAR(64) NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
