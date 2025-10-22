// lib/snail-vision.js
const { analyzeImage, urlToBase64 } = require("./vision");

const SNAIL_SYSTEM_PROMPT = `You are a Super Snail game stats analyzer. Extract data from screenshots with precision and double-check every digit before responding.

Output ONLY valid JSON in this exact format:
{
  "stats": {
    "hp": number or null,
    "atk": number or null,
    "def": number or null,
    "rush": number or null,
    "fame": number or null,
    "tech": number or null,
    "art": number or null,
    "civ": number or null,
    "fth": number or null
  },
  "equipment": {
    "weapon": "description or null",
    "armor": "description or null",
    "accessory": "description or null"
  },
  "confidence": "high" | "medium" | "low",
  "notes": "any issues or unclear elements"
}

Rules:
- Extract numbers exactly as shown (no commas in output). Do not drop zeros or truncate values.
- Verify each stat twice before returning the JSON. If digits look unclear, set the field to null and explain in notes.
- Use null for any stat you cannot clearly read
- Be conservative: if unsure, use null and note it
- Common stat locations: HP/ATK/DEF/RUSH in bottom section, pentagon shows FAME/TECH/ART/CIV/FTH`;

const STAT_KEYS = [
  "hp",
  "atk",
  "def",
  "rush",
  "fame",
  "tech",
  "art",
  "civ",
  "fth",
];
const PRIMARY_KEYS = ["hp", "atk", "def", "rush"];
const PENTAGON_KEYS = ["fame", "tech", "art", "civ", "fth"];

function stripCodeFence(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

function normalizeStatValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  const cleaned = String(value).replace(/[^0-9]/g, "");
  if (!cleaned) return null;

  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function normalizeStatsInPlace(analysis) {
  if (!analysis.stats) analysis.stats = {};
  for (const key of STAT_KEYS) {
    analysis.stats[key] = normalizeStatValue(analysis.stats[key]);
  }
}

function findSuspiciousStats(stats) {
  const flagged = new Set();

  const evaluateGroup = (keys, threshold) => {
    const values = keys
      .map((k) => normalizeStatValue(stats[k]))
      .filter((v) => v !== null);
    if (!values.length) return;

    const max = Math.max(...values);
    keys.forEach((key) => {
      const val = normalizeStatValue(stats[key]);
      if (val === null) {
        flagged.add(key);
        return;
      }

      if (max >= threshold) {
        if (val < max * 0.1 || (max >= threshold * 10 && val < 100)) {
          flagged.add(key);
        }
      }
    });
  };

  evaluateGroup(PRIMARY_KEYS, 1000);
  evaluateGroup(PENTAGON_KEYS, 1000);

  return Array.from(flagged);
}

async function performAnalysis(base64Image, prompt) {
  const raw = await analyzeImage({
    imageUrl: base64Image,
    prompt,
    systemPrompt: SNAIL_SYSTEM_PROMPT,
  });

  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    if (!parsed.stats) parsed.stats = {};
    return parsed;
  } catch (err) {
    console.error("Failed to parse vision response:", raw);
    throw new Error(`Vision returned invalid JSON: ${err.message}`);
  }
}

async function refineStats(base64Image, analysis) {
  const flagged = findSuspiciousStats(analysis.stats || {});
  if (!flagged.length) return analysis;

  const focusList = flagged.map((k) => k.toUpperCase()).join(", ");
  const prompt = `Re-check the Super Snail screenshot and carefully verify these stats: ${focusList}.
Return the full JSON (same schema) and correct any mistakes. If a stat is illegible, set it to null and explain in notes.`;

  try {
    const secondPass = await performAnalysis(base64Image, prompt);
    if (secondPass?.stats) {
      for (const key of flagged) {
        const refined = normalizeStatValue(secondPass.stats[key]);
        if (refined !== null) {
          analysis.stats[key] = refined;
        }
      }
    }

    // Prefer higher confidence if provided
    if (secondPass?.confidence) {
      analysis.confidence = secondPass.confidence;
    }
    if (secondPass?.notes && secondPass.notes !== analysis.notes) {
      analysis.notes = secondPass.notes;
    }
  } catch (err) {
    console.warn("[snail] refine vision failed:", err.message);
  }

  return analysis;
}

async function analyzeSnailScreenshot(discordAttachmentUrl) {
  // Convert to base64
  const base64Image = await urlToBase64(discordAttachmentUrl);

  const prompt = `Analyze this Super Snail screenshot and extract all visible stats.
Return ONLY the JSON object, no other text.`;

  let analysis = await performAnalysis(base64Image, prompt);
  normalizeStatsInPlace(analysis);
  analysis = await refineStats(base64Image, analysis);
  normalizeStatsInPlace(analysis);

  return analysis;
}

function formatSnailAnalysis(analysis) {
  // eslint-disable-next-line no-unused-vars
  const { stats, equipment: _equipment, confidence, notes } = analysis;

  let output = "🐌 **Super Snail Stats Extracted**\n\n";

  // Stats section
  output += "**Primary Stats:**\n";
  output += `• HP: ${stats.hp?.toLocaleString() || "???"}\n`;
  output += `• ATK: ${stats.atk?.toLocaleString() || "???"}\n`;
  output += `• DEF: ${stats.def?.toLocaleString() || "???"}\n`;
  output += `• RUSH: ${stats.rush?.toLocaleString() || "???"}\n\n`;

  output += "**Pentagon Stats:**\n";
  output += `• FAME: ${stats.fame?.toLocaleString() || "???"}\n`;
  output += `• TECH: ${stats.tech?.toLocaleString() || "???"}\n`;
  output += `• ART: ${stats.art?.toLocaleString() || "???"}\n`;
  output += `• CIV: ${stats.civ?.toLocaleString() || "???"}\n`;
  output += `• FTH: ${stats.fth?.toLocaleString() || "???"}\n\n`;

  // Confidence indicator
  const confidenceEmoji = {
    high: "✅",
    medium: "⚠️",
    low: "❌",
  };
  output += `Confidence: ${confidenceEmoji[confidence]} ${confidence}\n`;

  if (notes) {
    output += `\n📝 Notes: ${notes}\n`;
  }

  // Check for missing data
  const missing = [];
  Object.entries(stats).forEach(([key, value]) => {
    if (value === null) missing.push(key.toUpperCase());
  });

  if (missing.length > 0) {
    output += `\n❓ Missing: ${missing.join(", ")}`;
    output += `\nPlease provide these manually or upload a clearer screenshot.`;
  }

  return output;
}

module.exports = {
  analyzeSnailScreenshot,
  formatSnailAnalysis,
  extractStatsWithGPT4oVision,
};

async function extractStatsWithGPT4oVision(discordAttachmentUrl) {
  const analysis = await analyzeSnailScreenshot(discordAttachmentUrl);
  const stats = analysis?.stats || {};

  const normalizedStats = {
    HP: normalizeStatValue(stats.hp) ?? 0,
    ATK: normalizeStatValue(stats.atk) ?? 0,
    DEF: normalizeStatValue(stats.def) ?? 0,
    RUSH: normalizeStatValue(stats.rush) ?? 0,
    FAME: normalizeStatValue(stats.fame) ?? 0,
    TECH: normalizeStatValue(stats.tech) ?? 0,
    ART: normalizeStatValue(stats.art) ?? 0,
    CIV: normalizeStatValue(stats.civ) ?? 0,
    FTH: normalizeStatValue(stats.fth) ?? 0,
  };

  return {
    stats: normalizedStats,
    analysis,
  };
}
