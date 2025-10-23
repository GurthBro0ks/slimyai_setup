// lib/usage-openai.js
const openai = require("./openai");
const database = require("./database");

// Pricing in USD (allow env overrides)
// DALL-E 3 actual pricing: standard=$0.040, hd=$0.080 for 1024x1024
const PRICING = {
  "gpt-4o-mini-2024-07-18": {
    input_per_million: Number(process.env.PRICE_4OMINI_IN || 0.15),
    output_per_million: Number(process.env.PRICE_4OMINI_OUT || 0.6),
  },
  "gpt-4o-mini": {
    // alias for convenience
    input_per_million: Number(process.env.PRICE_4OMINI_IN || 0.15),
    output_per_million: Number(process.env.PRICE_4OMINI_OUT || 0.6),
  },
  "dall-e-3": {
    standard: Number(process.env.PRICE_DALLE3_STANDARD || 0.04),
    hd: Number(process.env.PRICE_DALLE3_HD || 0.08),
    // Legacy tier names for compatibility
    low: Number(process.env.PRICE_DALLE3_LOW || 0.04),
    medium: Number(process.env.PRICE_DALLE3_MED || 0.04),
    high: Number(process.env.PRICE_DALLE3_HIGH || 0.08),
  },
};

/**
 * Calculate cost for token-based models
 */
function calculateTokenCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model];
  if (!pricing || !pricing.input_per_million) {
    return null; // Unknown model
  }

  const inputCost = (inputTokens / 1e6) * pricing.input_per_million;
  const outputCost = (outputTokens / 1e6) * pricing.output_per_million;

  return inputCost + outputCost;
}

/**
 * Calculate cost for DALL-E 3 images
 */
function calculateImageCost(quality, count) {
  const pricing = PRICING["dall-e-3"];
  const tierPrice = pricing[quality] || pricing.standard;
  return tierPrice * count;
}

/**
 * Fetch usage data from OpenAI API
 * Returns null if endpoint is not available or fails
 */
async function fetchOpenAIUsage(startDate, endDate) {
  if (!openai.isConfigured) return null;

  try {
    // Try v1/usage endpoint
    const url = `https://api.openai.com/v1/usage?start_date=${startDate}&end_date=${endDate}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    if (response.ok) {
      return await response.json();
    }

    // If 404/401, the endpoint may not be available
    if (response.status === 404 || response.status === 401) {
      console.warn(
        `[usage-openai] /v1/usage returned ${response.status}, endpoint may not be available`,
      );
      return null;
    }

    throw new Error(`OpenAI usage API returned ${response.status}`);
  } catch (err) {
    console.error("[usage-openai] Failed to fetch usage:", err.message);
    return null;
  }
}

/**
 * Get image generation stats from local database logs
 */
async function fetchLocalImageStats(guildId, startDate, endDate) {
  if (!database.isConfigured()) return null;

  try {
    const start = new Date(startDate + "T00:00:00Z");
    const end = new Date(endDate + "T23:59:59Z");

    const rows = await database.query(
      `SELECT
        model,
        quality,
        COUNT(*) as total_images,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_images
       FROM image_generation_log
       WHERE guild_id <=> ?
         AND created_at >= ?
         AND created_at <= ?
       GROUP BY model, quality`,
      [guildId || null, start.toISOString(), end.toISOString()],
    );

    return rows;
  } catch (err) {
    console.error("[usage-openai] Failed to fetch local image stats:", err);
    return null;
  }
}

/**
 * Parse window option and return start/end dates in YYYY-MM-DD format
 */
function parseWindow(window, customStart, customEnd) {
  const now = new Date();
  let startDate, endDate;

  switch (window) {
    case "today": {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case "7d": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      endDate = new Date(now);
      break;
    }
    case "30d": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      endDate = new Date(now);
      break;
    }
    case "this_month": {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now);
      break;
    }
    case "custom": {
      if (!customStart || !customEnd) {
        throw new Error("Custom window requires start and end dates");
      }
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
      break;
    }
    default:
      throw new Error(`Unknown window: ${window}`);
  }

  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

/**
 * Aggregate usage data and calculate costs
 */
function aggregateUsage(apiData, localImageStats) {
  const byModel = new Map();
  let totalCost = 0;
  let totalRequests = 0;

  // Process API data if available
  if (apiData && apiData.data) {
    for (const day of apiData.data) {
      for (const modelUsage of day.results || []) {
        const model = modelUsage.model || "unknown";
        const requests = modelUsage.n_requests || 0;
        const inputTokens = modelUsage.n_context_tokens_total || 0;
        const outputTokens = modelUsage.n_generated_tokens_total || 0;

        if (!byModel.has(model)) {
          byModel.set(model, {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
          });
        }

        const entry = byModel.get(model);
        entry.requests += requests;
        entry.inputTokens += inputTokens;
        entry.outputTokens += outputTokens;

        const cost = calculateTokenCost(model, inputTokens, outputTokens);
        if (cost !== null) {
          entry.cost += cost;
          totalCost += cost;
        }

        totalRequests += requests;
      }
    }
  }

  // Process local image stats
  if (localImageStats && localImageStats.length > 0) {
    for (const row of localImageStats) {
      const model = row.model || "dall-e-3";
      const count = row.successful_images || 0;
      const quality = row.quality || "standard";

      if (!byModel.has(model)) {
        byModel.set(model, {
          requests: 0,
          images: 0,
          cost: 0,
          byQuality: {},
        });
      }

      const modelEntry = byModel.get(model);

      // DALL-E 3 quality: "standard" or "hd"
      // Use quality directly as pricing tier
      const cost = calculateImageCost(quality, count);

      modelEntry.images = (modelEntry.images || 0) + count;
      modelEntry.requests += count;
      modelEntry.cost += cost;
      modelEntry.byQuality[quality] =
        (modelEntry.byQuality[quality] || 0) + count;

      totalCost += cost;
      totalRequests += count;
    }
  }

  return {
    byModel: Array.from(byModel.entries()).map(([model, data]) => ({
      model,
      ...data,
    })),
    totalCost,
    totalRequests,
  };
}

module.exports = {
  PRICING,
  calculateTokenCost,
  calculateImageCost,
  fetchOpenAIUsage,
  fetchLocalImageStats,
  parseWindow,
  aggregateUsage,
};
