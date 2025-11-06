const openai = require("./openai");
const { canonicalize } = require("./club-store");
const logger = require("./logger");
const { parsePower } = require("./numparse");

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
const ENSEMBLE_MODEL_A = process.env.CLUB_VISION_ENSEMBLE_A || "gpt-4o-mini";
const ENSEMBLE_MODEL_B = process.env.CLUB_VISION_ENSEMBLE_B || "gpt-4o";
const MAX_RETRIES = Number(process.env.CLUB_VISION_MAX_RETRIES || 4);
const BASE_RETRY_DELAY_MS = Number(
  process.env.CLUB_VISION_RETRY_BASE_DELAY_MS || 500,
);
const RETRY_JITTER_MS = Number(
  process.env.CLUB_VISION_RETRY_JITTER_MS || 250,
);

function shouldRetry(err) {
  if (!err) return false;
  const status = err.status || err.statusCode || err.httpStatus || err.code;
  if (status === 429 || status === "rate_limit_exceeded") return true;
  if (status === 500 || status === 502 || status === 503 || status === 504)
    return true;
  const message = String(err.message || "").toLowerCase();
  if (message.includes("rate limit") || message.includes("exceeded quota")) {
    return true;
  }
  return false;
}

async function executeWithRetry(fn, context = {}) {
  let attempt = 0;
  let lastError;

  while (attempt < MAX_RETRIES) {
    attempt += 1;
    try {
      const response = await fn();
      if (response?.usage) {
        logger.debug("[club-vision] Usage", {
          attempt,
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
          model: context.model,
        });
      }
      return response;
    } catch (err) {
      lastError = err;
      if (!shouldRetry(err) || attempt >= MAX_RETRIES) {
        logger.error("[club-vision] Vision request failed", {
          attempt,
          maxRetries: MAX_RETRIES,
          model: context.model,
          error: err.message,
        });
        throw err;
      }

      const backoff =
        BASE_RETRY_DELAY_MS * 2 ** (attempt - 1) +
        Math.random() * RETRY_JITTER_MS;
      logger.warn("[club-vision] Retry due to OpenAI rate limit", {
        attempt,
        model: context.model,
        waitMs: Math.round(backoff),
        message: err.message,
      });
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError || new Error("Vision request failed after retries");
}

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

/**
 * Classify page type based on image content
 * @param {string} imageUrl - Data URL or image URL
 * @param {string|null} filenameHint - Optional filename hint
 * @returns {Promise<"sim"|"total"|"unknown">} Page type
 */
async function classifyPage(imageUrl, filenameHint = null) {
  // Check filename hint first
  if (filenameHint) {
    const filename = String(filenameHint).toLowerCase();
    if (filename.includes("sim-") || filename.includes("sim_")) {
      return "sim";
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured for page classification");
  }

  const response = await executeWithRetry(
    () =>
      openai.chat.completions.create({
        model: DEFAULT_MODEL,
        temperature: 0,
        max_tokens: 50,
        messages: [
          {
            role: "system",
            content:
              'Determine if this Super Snail "Manage Members" screen shows "Sim Power" or "Power" (total). Respond with ONLY "sim", "total", or "unknown".',
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "What type of power is shown?",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "low", // Low detail for faster classification
                },
              },
            ],
          },
        ],
      }),
    { model: DEFAULT_MODEL, task: "classify" },
  );

  const rawContent = response?.choices?.[0]?.message?.content || "";
  const normalized = rawContent.trim().toLowerCase();

  // Look for "sim" in response (case-insensitive, tolerates minor OCR drift)
  if (normalized.includes("sim")) {
    return "sim";
  }

  // If contains "power" but not "sim", assume total
  if (normalized.includes("power") || normalized.includes("total")) {
    return "total";
  }

  return "unknown";
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

  const response = await executeWithRetry(
    () =>
      openai.chat.completions.create({
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
      }),
    { model, strict },
  );

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
  const rawValues = [];

  for (const row of rows) {
    const display = String(row?.name ?? "").trim();
    const canonical = canonicalize(display);

    // Use the new parsePower function
    const parseResult = parsePower(row?.value);
    const value = parseResult.value;
    const confidence = clampConfidence(row?.confidence ?? 0);

    if (!canonical || value === null) continue;

    // Track raw values for median calculation
    rawValues.push(value);

    const existing = deduped.get(canonical);
    if (!existing) {
      deduped.set(canonical, {
        name: display || canonical,
        display: display || canonical,
        canonical,
        value,
        confidence,
        corrected: parseResult.corrected || false,
        parseReason: parseResult.reason || null,
      });
      continue;
    }

    if (value > existing.value) {
      existing.value = value;
      existing.display = display || existing.display;
      existing.name = display || existing.name;
      existing.corrected = parseResult.corrected || existing.corrected;
      existing.parseReason = parseResult.reason || existing.parseReason;
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

/**
 * Compare two value strings digit by digit and return reconciled value with metadata
 */
function reconcileDigits(valueA, valueB, nameA, nameB) {
  const strA = String(valueA || "").padStart(12, "0");
  const strB = String(valueB || "").padStart(12, "0");
  let reconciled = "";
  let hasDisagreement = false;
  const disagreements = [];

  for (let i = 0; i < Math.max(strA.length, strB.length); i++) {
    const digitA = strA[i] || "0";
    const digitB = strB[i] || "0";

    if (digitA === digitB) {
      reconciled += digitA;
    } else {
      hasDisagreement = true;
      disagreements.push({
        position: i,
        modelA: digitA,
        modelB: digitB,
      });
      // Default to model B (usually gpt-4o, the stronger model)
      reconciled += digitB;
    }
  }

  const finalValue = Number(reconciled);

  return {
    value: Number.isFinite(finalValue) ? finalValue : null,
    hasDisagreement,
    disagreements,
    valueA: Number(valueA),
    valueB: Number(valueB),
    sources: { modelA: nameA, modelB: nameB },
  };
}

/**
 * Parse image with two models and reconcile results using digit-level majority
 */
async function parseManageMembersImageEnsemble(imageUrl, forced = null) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured for vision parsing");
  }
  if (!imageUrl) {
    throw new Error("imageUrl is required");
  }

  logger.info("[club-vision] Running ensemble parse", {
    modelA: ENSEMBLE_MODEL_A,
    modelB: ENSEMBLE_MODEL_B,
  });

  // Parse with both models in parallel
  const [resultA, resultB] = await Promise.all([
    parseManageMembersImage(imageUrl, forced, {
      model: ENSEMBLE_MODEL_A,
      strict: false,
    }),
    parseManageMembersImage(imageUrl, forced, {
      model: ENSEMBLE_MODEL_B,
      strict: true,
    }),
  ]);

  // Ensure both results use the same metric
  let metric = resultA.metric || resultB.metric;
  if (forced && (forced === "sim" || forced === "total")) {
    metric = forced;
  }
  if (!metric) {
    throw new Error("Unable to determine metric for screenshot");
  }

  // Build maps for easier reconciliation
  const mapA = new Map(
    resultA.rows.map((row) => [row.canonical, { ...row, source: "A" }]),
  );
  const mapB = new Map(
    resultB.rows.map((row) => [row.canonical, { ...row, source: "B" }]),
  );

  // Reconcile all canonicals from both results
  const allCanonicals = new Set([...mapA.keys(), ...mapB.keys()]);
  const reconciledRows = [];
  const ensembleMetadata = {
    totalMembers: allCanonicals.size,
    disagreements: 0,
    onlyInA: 0,
    onlyInB: 0,
    bothModels: 0,
  };

  for (const canonical of allCanonicals) {
    const rowA = mapA.get(canonical);
    const rowB = mapB.get(canonical);

    if (!rowA && rowB) {
      // Only in model B (stronger model) - trust it
      ensembleMetadata.onlyInB++;
      reconciledRows.push({
        ...rowB,
        ensembleSource: "B",
        ensembleConfidence: rowB.confidence * 0.9, // Slightly reduced confidence
      });
      continue;
    }

    if (rowA && !rowB) {
      // Only in model A - lower confidence
      ensembleMetadata.onlyInA++;
      reconciledRows.push({
        ...rowA,
        ensembleSource: "A",
        ensembleConfidence: rowA.confidence * 0.7, // Significantly reduced confidence
      });
      continue;
    }

    // Both models found this member - reconcile digit by digit
    ensembleMetadata.bothModels++;
    const reconciled = reconcileDigits(
      rowA.value,
      rowB.value,
      ENSEMBLE_MODEL_A,
      ENSEMBLE_MODEL_B,
    );

    if (reconciled.hasDisagreement) {
      ensembleMetadata.disagreements++;
    }

    // Use display name from model B (stronger model) if available
    const display = rowB.display || rowA.display;

    reconciledRows.push({
      name: display,
      display,
      canonical,
      value: reconciled.value,
      confidence: Math.min(rowA.confidence, rowB.confidence),
      ensembleSource: "both",
      ensembleConfidence: reconciled.hasDisagreement ? 0.85 : 1.0,
      ensembleReconciled: reconciled,
    });
  }

  logger.info("[club-vision] Ensemble reconciliation complete", {
    ...ensembleMetadata,
  });

  return {
    metric,
    rows: reconciledRows,
    ensembleMetadata,
  };
}

module.exports = {
  parseManageMembersImage,
  parseManageMembersImageEnsemble,
  classifyPage,
};
