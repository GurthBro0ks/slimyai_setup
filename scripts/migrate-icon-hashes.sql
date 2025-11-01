CREATE TABLE IF NOT EXISTS snail_item_icon_hashes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  phash CHAR(64) NOT NULL,
  ahsv VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_item_hash (item_id, phash),
  INDEX idx_phash (phash),
  FOREIGN KEY (item_id) REFERENCES snail_item_icons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @idx_exists := (
  SELECT COUNT(1)
    FROM INFORMATION_SCHEMA.STATISTICS
   WHERE table_schema = DATABASE()
     AND table_name = 'snail_item_icons'
     AND index_name = 'idx_itemtype_name'
);

SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE snail_item_icons ADD INDEX idx_itemtype_name (item_type, canonical_name)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
