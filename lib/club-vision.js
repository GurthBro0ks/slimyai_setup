const openai = require("./openai");
const { canonicalize } = require("./club-store");
const logger = require("./logger");

const DEFAULT_SYSTEM_PROMPT = `
You read Super Snail "Manage Members" screens. Each member tile has a display name and either the label "Sim Power" or "Power" (total).
Return pure JSON in this exact schema:
{"metric":"sim"|"total","rows":[{"name":string,"value":integer,"confidence":number}]}
- "metric" must be "sim" or "total" inferred from the on-screen label.
- "value" is an integer. Strip commas, dots, spaces, and other formatting.
- "confidence" is between 0 and 1 describing your certainty the value is correct.
- Ignore tiles without a numeric value.
- Do not add commentary or trailing text. JSON only.
`.trim();

const STRICT_SYSTEM_PROMPT = `
You perform OCR on Super Snail "Manage Members" screens. Focus on precision.
Return ONLY JSON with schema {"metric":"sim"|"total","rows":[{"name":string,"value":integer,"confidence":number}]}.
Re-check every digit carefully. If unclear, omit the row rather than guessing.
`.trim();

const DEFAULT_MODEL = process.env.CLUB_VISION_MODEL || "gpt-4o-mini";
const STRICT_MODEL = process.env.CLUB_VISION_STRICT_MODEL || "gpt-4o-mini";

function stripCodeFence(text) {
  let cleaned = String(text || "").trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
  }
  return cleaned.trim();
}

function clampConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return Math.round(num * 1000) / 1000;
}

function parseValue(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  const cleaned = String(raw || "").replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.trunc(num) : null;
}

async function parseManageMembersImage(imageUrl, forced = null, options = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured for vision parsing");
  }
  if (!imageUrl) {
    throw new Error("imageUrl is required");
  }

  const strict = Boolean(options.strict);
  const model = options.model || (strict ? STRICT_MODEL : DEFAULT_MODEL);
  const systemPrompt = strict ? STRICT_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;

  const response = await openai.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Read this Manage Members screenshot and return the JSON.",
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const rawContent = response?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("Vision response was empty");
  }

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(rawContent));
  } catch (err) {
    logger.error("[club-vision] Failed to parse JSON", { raw: rawContent });
    throw new Error(`Vision returned invalid JSON: ${err.message}`);
  }

  let metric =
    typeof parsed?.metric === "string" ? parsed.metric.toLowerCase() : null;
  if (metric !== "sim" && metric !== "total") {
    metric = forced || null;
  }
  if (forced && (forced === "sim" || forced === "total")) {
    metric = forced;
  }
  if (!metric) {
    throw new Error("Unable to determine metric for screenshot");
  }

  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const deduped = new Map();

  for (const row of rows) {
    const display = String(row?.name ?? "").trim();
    const canonical = canonicalize(display);
    const value = parseValue(row?.value);
    const confidence = clampConfidence(row?.confidence ?? 0);

    if (!canonical || value === null) continue;

    const existing = deduped.get(canonical);
    if (!existing) {
      deduped.set(canonical, {
        name: display || canonical,
        display: display || canonical,
        canonical,
        value,
        confidence,
      });
      continue;
    }

    if (value > existing.value) {
      existing.value = value;
      existing.display = display || existing.display;
      existing.name = display || existing.name;
    }
    if (confidence > existing.confidence) {
      existing.confidence = confidence;
    }
  }

  return {
    metric,
    rows: Array.from(deduped.values()),
  };
}

module.exports = {
  parseManageMembersImage,
};
