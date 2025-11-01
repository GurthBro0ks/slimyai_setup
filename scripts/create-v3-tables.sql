-- Snail Codes
CREATE TABLE IF NOT EXISTS snail_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  source VARCHAR(50),
  date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expiration_date TIMESTAMP NULL,
  status ENUM('active','expired','unknown') DEFAULT 'active',
  rewards TEXT,
  verified BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_expiration (status, expiration_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gear (Phase 2; creating now is harmless)
CREATE TABLE IF NOT EXISTS snail_gear (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  tier VARCHAR(20),
  slot VARCHAR(20),
  base_stats JSON,
  special_effects JSON,
  tier_ranking VARCHAR(10),
  crafting_location VARCHAR(50),
  crafting_materials JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tier_ranking (tier_ranking),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Relics (Phase 2)
CREATE TABLE IF NOT EXISTS snail_relics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_name VARCHAR(200) UNIQUE,
  name VARCHAR(100),
  `rank` VARCHAR(20),
  tier INT,
  affct_type VARCHAR(20),
  affct_stats JSON,
  skills TEXT,
  resonance_data JSON,
  location TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_affct_rank (affct_type, `rank`),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User relics (Phase 2/3)
CREATE TABLE IF NOT EXISTS user_relics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  relic_page_name VARCHAR(200),
  obtained_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  compass_slot VARCHAR(20) NULL,
  level INT DEFAULT 1,
  awakened BOOLEAN DEFAULT FALSE,
  UNIQUE KEY unique_user_relic (user_id, relic_page_name),
  INDEX idx_user_compass (user_id, compass_slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bosses (Phase 2)
CREATE TABLE IF NOT EXISTS snail_bosses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) UNIQUE,
  type VARCHAR(50),
  realm VARCHAR(50),
  hp BIGINT,
  atk INT,
  def INT,
  affct_requirements JSON,
  strategies TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_realm_type (realm, type),
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gene cost (Phase 3)
CREATE TABLE IF NOT EXISTS gene_research_costs (
  level INT PRIMARY KEY,
  partner_level INT,
  manual_cost INT,
  total_cost INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Snail recommendations (stores enrichment summaries)
CREATE TABLE IF NOT EXISTS snail_recommendations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  snail_stat_id INT NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  enrichment JSON,
  next_steps JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_snail_recs_user (user_id),
  INDEX idx_snail_recs_stat (snail_stat_id),
  CONSTRAINT fk_snail_recs_stat FOREIGN KEY (snail_stat_id) REFERENCES snail_stats(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Enrichment column
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'snail_stats'
    AND COLUMN_NAME = 'wiki_enrichment'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE snail_stats ADD COLUMN wiki_enrichment JSON AFTER screenshot_url',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
