// lib/snail-vision.js
const { analyzeImage, urlToBase64 } = require("./vision");

const SNAIL_SYSTEM_PROMPT = `You are a Super Snail game stats analyzer. Extract data from screenshots with precision.

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
- Extract numbers exactly as shown (no commas in output)
- Use null for any stat you cannot clearly read
- Be conservative: if unsure, use null and note it
- Common stat locations: HP/ATK/DEF/RUSH in bottom section, pentagon shows FAME/TECH/ART/CIV/FTH`;

async function analyzeSnailScreenshot(discordAttachmentUrl) {
  // Convert to base64
  const base64Image = await urlToBase64(discordAttachmentUrl);

  const prompt = `Analyze this Super Snail screenshot and extract all visible stats.
Return ONLY the JSON object, no other text.`;

  const result = await analyzeImage({
    imageUrl: base64Image,
    prompt,
    systemPrompt: SNAIL_SYSTEM_PROMPT,
  });

  // Parse JSON response
  try {
    // Strip markdown code blocks if present
    let cleaned = result.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/```\n?/g, "");
    }

    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (err) {
    console.error("Failed to parse vision response:", result);
    throw new Error(`Vision returned invalid JSON: ${err.message}`);
  }
}

function formatSnailAnalysis(analysis) {
  // eslint-disable-next-line no-unused-vars
  const { stats, equipment, confidence, notes } = analysis;

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
};
