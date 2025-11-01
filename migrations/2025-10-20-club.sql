CREATE TABLE IF NOT EXISTS club_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  name_canonical VARCHAR(120) NOT NULL,
  name_display VARCHAR(120) NOT NULL,
  last_seen DATETIME NOT NULL,
  UNIQUE KEY uniq_member (guild_id, name_canonical)
);

CREATE TABLE IF NOT EXISTS club_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  created_by VARCHAR(20) NOT NULL,
  snapshot_at DATETIME NOT NULL,
  notes VARCHAR(255) NULL,
  KEY guild_time (guild_id, snapshot_at)
);

CREATE TABLE IF NOT EXISTS club_metrics (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  snapshot_id INT NOT NULL,
  member_id INT NOT NULL,
  metric ENUM('sim','total') NOT NULL,
  value BIGINT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES club_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES club_members(id) ON DELETE CASCADE,
  KEY member_metric (member_id, metric)
);

CREATE TABLE IF NOT EXISTS club_latest (
  guild_id VARCHAR(20) NOT NULL,
  member_id INT NOT NULL,
  name_display VARCHAR(120) NOT NULL,
  sim_power BIGINT DEFAULT NULL,
  total_power BIGINT DEFAULT NULL,
  sim_prev BIGINT DEFAULT NULL,
  total_prev BIGINT DEFAULT NULL,
  sim_pct_change DECIMAL(7,2) DEFAULT NULL,
  total_pct_change DECIMAL(7,2) DEFAULT NULL,
  latest_at DATETIME NOT NULL,
  PRIMARY KEY (guild_id, member_id)
);

CREATE TABLE IF NOT EXISTS club_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(20) NOT NULL,
  member_id INT NOT NULL,
  alias_canonical VARCHAR(120) NOT NULL,
  UNIQUE KEY uniq_alias (guild_id, alias_canonical),
  FOREIGN KEY (member_id) REFERENCES club_members(id) ON DELETE CASCADE
);
