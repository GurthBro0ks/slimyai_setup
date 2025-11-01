-- Enhanced personality schema with structured fields
-- Note: These ALTER statements may fail if columns already exist, which is okay
ALTER TABLE guild_personality ADD COLUMN preset VARCHAR(64) NULL AFTER profile_json;
ALTER TABLE guild_personality ADD COLUMN system_prompt TEXT NULL AFTER preset;
ALTER TABLE guild_personality ADD COLUMN temperature FLOAT NOT NULL DEFAULT 0.7 AFTER system_prompt;
ALTER TABLE guild_personality ADD COLUMN top_p FLOAT NOT NULL DEFAULT 1.0 AFTER temperature;
ALTER TABLE guild_personality ADD COLUMN tone ENUM('neutral','friendly','playful','serious') DEFAULT 'friendly' AFTER top_p;
ALTER TABLE guild_personality ADD COLUMN formality ENUM('casual','neutral','formal') DEFAULT 'neutral' AFTER tone;
ALTER TABLE guild_personality ADD COLUMN humor TINYINT(1) NOT NULL DEFAULT 1 AFTER formality;
ALTER TABLE guild_personality ADD COLUMN emojis TINYINT(1) NOT NULL DEFAULT 0 AFTER humor;
