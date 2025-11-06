/**
 * Robust power number parser with anti-inflation heuristics
 * Handles OCR confusions and prevents common parsing errors
 */

/**
 * Normalize OCR confusions in text
 * @param {string} raw - Raw OCR text
 * @returns {string} Normalized text
 */
function normalizeOCR(raw) {
  if (!raw) return "";

  let text = String(raw).trim();

  // Normalize common OCR confusions
  text = text.replace(/O/gi, "0"); // O → 0
  text = text.replace(/[lI]/g, "1"); // l/I → 1

  // Normalize unicode commas and periods
  text = text.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ""); // Remove zero-width/nbsp
  text = text.replace(/[，]/g, ","); // Chinese comma → ASCII comma
  text = text.replace(/[。]/g, "."); // Chinese period → ASCII period

  return text;
}

/**
 * Parse power value with suffix notation (e.g., "10.1B", "325M", "1.5K")
 * @param {string} text - Normalized text
 * @returns {{value: number|null, suffix: string|null}} Parsed value and suffix
 */
function parseSuffixNotation(text) {
  const suffixPattern = /^([0-9]+(?:\.[0-9]+)?)\s*([KMB])$/i;
  const match = text.match(suffixPattern);

  if (!match) return { value: null, suffix: null };

  const numPart = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();

  const multipliers = {
    K: 1e3,
    M: 1e6,
    B: 1e9,
  };

  const multiplier = multipliers[suffix];
  if (!multiplier || !Number.isFinite(numPart)) {
    return { value: null, suffix: null };
  }

  return {
    value: Math.floor(numPart * multiplier),
    suffix,
  };
}

/**
 * Parse grouped number format (e.g., "218,010,208")
 * @param {string} text - Normalized text
 * @returns {number|null} Parsed value or null
 */
function parseGroupedNumber(text) {
  // Remove all separators (commas, periods, spaces)
  const cleaned = text.replace(/[,.\s]/g, "");

  // Must be 6-12 digits for valid power values
  if (!/^[0-9]{6,12}$/.test(cleaned)) {
    return null;
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Check if a number has bad grouping (e.g., "1,234,5678")
 * @param {string} text - Text with commas
 * @returns {boolean} True if grouping is suspicious
 */
function hasBadGrouping(text) {
  // Check for comma-separated groups
  const groups = text.split(",");
  if (groups.length < 2) return false;

  // First group can be 1-3 digits, rest must be exactly 3
  for (let i = 1; i < groups.length; i++) {
    if (groups[i].length !== 3) {
      return true;
    }
  }

  return false;
}

/**
 * Check if value has trailing extra digit (×10 lookalike)
 * @param {number} value - Candidate value
 * @returns {boolean} True if suspicious trailing digit
 */
function hasTrailingExtraDigit(value) {
  const str = String(value);

  // Check for patterns like "2180102088" (should be "218010208")
  // Heuristic: if last digit repeats or is 0/8 and value is unusually large
  if (str.length >= 9) {
    const lastDigit = str[str.length - 1];
    const secondLast = str[str.length - 2];

    // Suspicious if ends in 00, 88, or has repeated last two digits
    if (
      (lastDigit === "0" && secondLast === "0") ||
      (lastDigit === "8" && secondLast === "8") ||
      lastDigit === secondLast
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Apply anti-inflation correction to a value
 * @param {number} value - Original value
 * @param {string} originalText - Original text representation
 * @returns {{value: number, corrected: boolean, reason: string}} Corrected value with metadata
 */
function applyAntiInflation(value, originalText) {
  let corrected = false;
  let reason = "";
  let finalValue = value;

  // Check for bad grouping in original text FIRST (higher priority)
  if (hasBadGrouping(originalText)) {
    // Try to fix by removing the last problematic separator
    // e.g., "1,234,5678" → "1,2345678" → "12345678" (stripped) → needs fixing
    // We want: "1,234,5678" → "1234567" + "8" (bad last group)
    // Better approach: find the malformed group and correct it
    const groups = originalText.split(",");

    // Find first bad group (not exactly 3 digits, excluding first group)
    let needsFix = false;
    for (let i = 1; i < groups.length; i++) {
      if (groups[i].length !== 3) {
        needsFix = true;
        break;
      }
    }

    if (needsFix) {
      // Reconstruct by taking all but last digit if last group is 4 digits
      const lastGroup = groups[groups.length - 1];
      if (lastGroup.length === 4) {
        // Remove last digit: "1,234,5678" → "1,234,567"
        const fixed = originalText.slice(0, -1);
        const fixedValue = parseGroupedNumber(fixed);

        if (fixedValue !== null && fixedValue < finalValue) {
          finalValue = fixedValue;
          corrected = true;
          reason = "bad-grouping";
          return { value: finalValue, corrected, reason };
        }
      }
    }
  }

  // Check for trailing extra digit
  if (hasTrailingExtraDigit(value)) {
    finalValue = Math.floor(value / 10);
    corrected = true;
    reason = "trailing-extra-digit";
  }

  return {
    value: finalValue,
    corrected,
    reason,
  };
}

/**
 * Parse power value with anti-inflation heuristics
 *
 * @param {string|number} raw - Raw input (from OCR or user)
 * @param {{pageMedian?: number, allowOutliers?: boolean}} options - Parsing options
 * @returns {{value: number|null, corrected?: boolean, reason?: string}} Parsed result
 *
 * @example
 * parsePower("10.1B") // { value: 10100000000 }
 * parsePower("218,010,208") // { value: 218010208 }
 * parsePower("2180102088") // { value: 218010208, corrected: true, reason: "trailing-extra-digit" }
 */
function parsePower(raw, options = {}) {
  const { pageMedian = null, allowOutliers = false } = options;

  // Handle already-numeric input
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { value: null, reason: "non-finite" };
    }
    return { value: Math.floor(raw) };
  }

  // Normalize OCR issues
  const normalized = normalizeOCR(raw);

  if (!normalized) {
    return { value: null, reason: "empty-input" };
  }

  // Try suffix notation first (most specific)
  const suffixResult = parseSuffixNotation(normalized);
  if (suffixResult.value !== null) {
    return { value: suffixResult.value };
  }

  // Try grouped/plain number
  const groupedValue = parseGroupedNumber(normalized);
  if (groupedValue === null) {
    return { value: null, reason: "parse-failed" };
  }

  // Check against page median BEFORE correction (using original value)
  if (pageMedian !== null && pageMedian > 0 && !allowOutliers) {
    const originalRatio = groupedValue / pageMedian;

    // If ORIGINAL value is > 8x median and has correction issues, mark as outlier
    if (originalRatio > 8) {
      // If we detected issues in the original value, this is likely an outlier
      if (hasBadGrouping(normalized) || hasTrailingExtraDigit(groupedValue)) {
        return { value: null, reason: "outlier" };
      }
    }
  }

  // Apply anti-inflation heuristics
  const { value, corrected, reason } = applyAntiInflation(groupedValue, normalized);

  const result = { value };
  if (corrected) {
    result.corrected = true;
    result.reason = reason;
  }

  return result;
}

module.exports = {
  parsePower,
  // Export for testing
  _internal: {
    normalizeOCR,
    parseSuffixNotation,
    parseGroupedNumber,
    hasBadGrouping,
    hasTrailingExtraDigit,
    applyAntiInflation,
  },
};
