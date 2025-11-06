"use strict";
const path = require("path");
const fs = require("fs");
const database = require("../../lib/database");

const DEFAULT_PERSONA_PATH = process.env.PERSONALITY_DEFAULT_PATH || path.join(__dirname, "../bot-personality.md");

// Minimal default prompt (fallback if neither DB nor file are present)
const FALLBACK_PROMPT = `You are a helpful, friendly assistant focused on club stats and gaming. Keep answers clear, brief, and supportive.`;

const PRESETS = [
  {
    key: "friendly",
    label: "Friendly Helper",
    description: "Warm, supportive, and encouraging",
    system_prompt: `You are a warm, friendly guide helping players with their club and game stats. Be concise, supportive, and upbeat. Encourage questions and celebrate progress.`,
    temperature: 0.7,
    top_p: 1.0,
    tone: "friendly",
    formality: "neutral",
    humor: 1,
    emojis: 0
  },
  {
    key: "playful-nerd",
    label: "Playful Nerd",
    description: "Nerdy, playful mentor with gaming enthusiasm",
    system_prompt: `You are a nerdy, playful mentor who loves gaming stats and optimization. Encourage curiosity, explain mechanics clearly, avoid condescension. Use gaming terminology naturally.`,
    temperature: 0.8,
    top_p: 0.95,
    tone: "playful",
    formality: "casual",
    humor: 1,
    emojis: 0
  },
  {
    key: "professional",
    label: "Professional Analyst",
    description: "Precise, data-focused, minimal fluff",
    system_prompt: `You are a precise, professional analyst focused on data accuracy. Avoid fluff or unnecessary elaboration. Prioritize clarity, accuracy, and actionable insights.`,
    temperature: 0.6,
    top_p: 0.9,
    tone: "serious",
    formality: "formal",
    humor: 0,
    emojis: 0
  },
  {
    key: "enthusiastic",
    label: "Enthusiastic Gamer",
    description: "High energy, lots of emojis, very casual",
    system_prompt: `You're an enthusiastic gamer who LOVES helping with stats and strategies! Keep energy high, use emojis freely, and make everything feel exciting. Be genuinely hyped about progress!`,
    temperature: 0.9,
    top_p: 0.95,
    tone: "playful",
    formality: "casual",
    humor: 1,
    emojis: 1
  }
];

function readDefaultFile() {
  try {
    if (fs.existsSync(DEFAULT_PERSONA_PATH)) {
      const txt = fs.readFileSync(DEFAULT_PERSONA_PATH, "utf8");
      return txt.trim();
    }
  } catch (e) {
    console.warn("[guild-personality] Could not read default persona file:", e.message);
  }
  return FALLBACK_PROMPT;
}

async function ensureTableColumns() {
  if (!database.isConfigured()) return;
  try {
    const sql = fs.readFileSync(path.join(__dirname, "guild-personality.sql"), "utf8");
    await database.query(sql);
  } catch (e) {
    console.warn("[guild-personality] Could not alter table:", e.message);
  }
}

function defaultsFor(guildId) {
  const preset = PRESETS[0]; // friendly
  return {
    guild_id: guildId,
    preset: preset.key,
    system_prompt: readDefaultFile(),
    temperature: preset.temperature,
    top_p: preset.top_p,
    tone: preset.tone,
    formality: preset.formality,
    humor: preset.humor,
    emojis: preset.emojis
  };
}

async function getGuildPersona(guildId) {
  if (!database.isConfigured()) {
    return defaultsFor(guildId);
  }

  await ensureTableColumns();

  const rows = await database.query(
    `SELECT * FROM guild_personality WHERE guild_id = ? LIMIT 1`,
    [guildId]
  );

  if (!rows.length) return defaultsFor(guildId);

  const r = rows[0];

  // If new columns don't exist yet, return defaults with profile_json merged
  if (r.system_prompt === undefined) {
    const defaults = defaultsFor(guildId);
    // Try to extract from profile_json if it exists
    if (r.profile_json) {
      try {
        const profile = JSON.parse(r.profile_json);
        if (profile.system_prompt) defaults.system_prompt = profile.system_prompt;
      } catch {}
    }
    return defaults;
  }

  // Coerce tinyint to boolean-like numbers
  r.humor = Number(r.humor) ? 1 : 0;
  r.emojis = Number(r.emojis) ? 1 : 0;

  // Use default prompt if system_prompt is null
  if (!r.system_prompt) {
    r.system_prompt = readDefaultFile();
  }

  return r;
}

async function upsertGuildPersona(guildId, patch, updatedBy) {
  if (!database.isConfigured()) {
    throw new Error("Database not configured");
  }

  await ensureTableColumns();

  const curr = await getGuildPersona(guildId);
  const next = { ...curr, ...patch, guild_id: guildId, updated_by: updatedBy || null };

  // If preset is being changed, apply preset defaults but allow overrides
  if (patch.preset && patch.preset !== curr.preset) {
    const presetData = PRESETS.find(p => p.key === patch.preset);
    if (presetData) {
      // Apply preset defaults but allow specific overrides from patch
      Object.keys(presetData).forEach(key => {
        if (key !== 'key' && key !== 'label' && key !== 'description' && !(key in patch)) {
          next[key] = presetData[key];
        }
      });
    }
  }

  const sql = `
    INSERT INTO guild_personality (
      guild_id, updated_by, preset, system_prompt, temperature, top_p,
      tone, formality, humor, emojis, profile_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      updated_by = VALUES(updated_by),
      preset = VALUES(preset),
      system_prompt = VALUES(system_prompt),
      temperature = VALUES(temperature),
      top_p = VALUES(top_p),
      tone = VALUES(tone),
      formality = VALUES(formality),
      humor = VALUES(humor),
      emojis = VALUES(emojis),
      profile_json = VALUES(profile_json),
      updated_at = CURRENT_TIMESTAMP
  `;

  await database.query(sql, [
    next.guild_id,
    next.updated_by,
    next.preset || null,
    next.system_prompt || null,
    Number(next.temperature) || 0.7,
    Number(next.top_p) || 1.0,
    next.tone || "friendly",
    next.formality || "neutral",
    Number(next.humor) ? 1 : 0,
    Number(next.emojis) ? 1 : 0,
    JSON.stringify({}) // Keep profile_json for backwards compat
  ]);

  return getGuildPersona(guildId);
}

async function resetToPreset(guildId, presetKey, updatedBy) {
  const preset = PRESETS.find(p => p.key === presetKey) || PRESETS[0];
  return upsertGuildPersona(guildId, {
    preset: preset.key,
    system_prompt: preset.system_prompt,
    temperature: preset.temperature,
    top_p: preset.top_p,
    tone: preset.tone,
    formality: preset.formality,
    humor: preset.humor,
    emojis: preset.emojis
  }, updatedBy);
}

module.exports = {
  PRESETS,
  getGuildPersona,
  upsertGuildPersona,
  resetToPreset,
  defaultsFor
};
