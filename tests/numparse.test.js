#!/usr/bin/env node

/**
 * Tests for lib/numparse.js - Robust power number parser
 */

const { parsePower, _internal } = require("../lib/numparse");
const {
  normalizeOCR,
  parseSuffixNotation,
  parseGroupedNumber,
  hasBadGrouping,
  hasTrailingExtraDigit,
  applyAntiInflation,
} = _internal;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.error(`✗ ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  const isEqual = JSON.stringify(actual) === JSON.stringify(expected);
  if (isEqual) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${JSON.stringify(expected)}`);
    console.error(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

console.log("=== Testing numparse.js ===\n");

// Test OCR normalization
console.log("--- OCR Normalization ---");
assertEquals(normalizeOCR("O12345"), "012345", "O → 0 conversion");
assertEquals(normalizeOCR("l23456"), "123456", "l → 1 conversion");
assertEquals(normalizeOCR("I23456"), "123456", "I → 1 conversion");
assertEquals(normalizeOCR("，123"), ",123", "Chinese comma normalization");
assertEquals(normalizeOCR("123。456"), "123.456", "Chinese period normalization");
assertEquals(normalizeOCR("  123  "), "123", "Whitespace trimming");

// Test suffix notation parsing
console.log("\n--- Suffix Notation ---");
assertEquals(
  parseSuffixNotation("10.1B"),
  { value: 10100000000, suffix: "B" },
  "Parse 10.1B"
);
assertEquals(
  parseSuffixNotation("325M"),
  { value: 325000000, suffix: "M" },
  "Parse 325M"
);
assertEquals(
  parseSuffixNotation("1.5K"),
  { value: 1500, suffix: "K" },
  "Parse 1.5K"
);
assertEquals(
  parseSuffixNotation("100b"),
  { value: 100000000000, suffix: "B" },
  "Parse 100b (lowercase)"
);
assertEquals(
  parseSuffixNotation("123456"),
  { value: null, suffix: null },
  "Non-suffix number returns null"
);

// Test grouped number parsing
console.log("\n--- Grouped Numbers ---");
assertEquals(parseGroupedNumber("218,010,208"), 218010208, "Parse 218,010,208");
assertEquals(parseGroupedNumber("1,234,567"), 1234567, "Parse 1,234,567");
assertEquals(parseGroupedNumber("123456789"), 123456789, "Parse plain digits");
assertEquals(parseGroupedNumber("12.345.678"), 12345678, "Parse period separators");
assertEquals(parseGroupedNumber("12345"), null, "Reject < 6 digits");
assertEquals(parseGroupedNumber("1234567890123"), null, "Reject > 12 digits");

// Test bad grouping detection
console.log("\n--- Bad Grouping Detection ---");
assert(hasBadGrouping("1,234,5678"), "Detect bad grouping: 1,234,5678");
assert(hasBadGrouping("12,34,567"), "Detect bad grouping: 12,34,567");
assert(!hasBadGrouping("1,234,567"), "Accept good grouping: 1,234,567");
assert(!hasBadGrouping("218,010,208"), "Accept good grouping: 218,010,208");
assert(!hasBadGrouping("123456789"), "Accept no grouping");

// Test trailing extra digit detection
console.log("\n--- Trailing Extra Digit Detection ---");
assert(hasTrailingExtraDigit(2180102088), "Detect trailing 88: 2180102088");
assert(hasTrailingExtraDigit(2180102000), "Detect trailing 00: 2180102000");
assert(hasTrailingExtraDigit(2180102088), "Detect repeated digit");
assert(!hasTrailingExtraDigit(218010208), "Accept normal number: 218010208");
assert(!hasTrailingExtraDigit(123456789), "Accept normal number: 123456789");

// Test anti-inflation correction
console.log("\n--- Anti-Inflation Correction ---");
assertEquals(
  applyAntiInflation(2180102088, "2180102088"),
  { value: 218010208, corrected: true, reason: "trailing-extra-digit" },
  "Fix trailing-extra-digit: 2180102088 → 218010208"
);

assertEquals(
  applyAntiInflation(12345678, "1,234,5678"),
  { value: 1234567, corrected: true, reason: "bad-grouping" },
  "Fix bad-grouping: 1,234,5678 → 1234567"
);

assertEquals(
  applyAntiInflation(218010208, "218,010,208"),
  { value: 218010208, corrected: false, reason: "" },
  "No correction needed for good number"
);

// Test full parsePower function
console.log("\n--- Full parsePower Function ---");

// Suffix notation
assertEquals(parsePower("10.1B"), { value: 10100000000 }, "Parse suffix: 10.1B");
assertEquals(parsePower("325M"), { value: 325000000 }, "Parse suffix: 325M");
assertEquals(parsePower("1.5K"), { value: 1500 }, "Parse suffix: 1.5K");

// Grouped numbers
assertEquals(parsePower("218,010,208"), { value: 218010208 }, "Parse grouped: 218,010,208");
assertEquals(parsePower("1,234,567"), { value: 1234567 }, "Parse grouped: 1,234,567");

// Plain digits
assertEquals(parsePower("123456789"), { value: 123456789 }, "Parse plain: 123456789");

// OCR confusion handling
assertEquals(parsePower("O123456"), { value: 123456 }, "Handle O → 0");
assertEquals(parsePower("l234567"), { value: 1234567 }, "Handle l → 1");

// Anti-inflation: trailing extra digit
assertEquals(
  parsePower("2180102088"),
  { value: 218010208, corrected: true, reason: "trailing-extra-digit" },
  "Fix trailing extra digit"
);

// Anti-inflation: bad grouping
assertEquals(
  parsePower("1,234,5678"),
  { value: 1234567, corrected: true, reason: "bad-grouping" },
  "Fix bad grouping"
);

// Outlier detection with page median
assertEquals(
  parsePower("2180102088", { pageMedian: 100000000 }),
  { value: null, reason: "outlier" },
  "Reject outlier with median check"
);

assertEquals(
  parsePower("218010208", { pageMedian: 100000000 }),
  { value: 218010208 },
  "Accept reasonable value with median check"
);

assertEquals(
  parsePower("2180102088", { pageMedian: 100000000, allowOutliers: true }),
  { value: 218010208, corrected: true, reason: "trailing-extra-digit" },
  "Allow outlier when allowOutliers=true"
);

// Edge cases
assertEquals(parsePower(""), { value: null, reason: "empty-input" }, "Empty string");
assertEquals(parsePower(null), { value: null, reason: "empty-input" }, "Null input");
assertEquals(parsePower(undefined), { value: null, reason: "empty-input" }, "Undefined input");
assertEquals(parsePower("abc"), { value: null, reason: "parse-failed" }, "Non-numeric text");
assertEquals(parsePower("12345"), { value: null, reason: "parse-failed" }, "Too few digits");
assertEquals(
  parsePower("12345678901234"),
  { value: null, reason: "parse-failed" },
  "Too many digits"
);

// Already numeric input
assertEquals(parsePower(218010208), { value: 218010208 }, "Numeric input");
assertEquals(parsePower(10.5), { value: 10 }, "Numeric input with decimal (floors)");
assertEquals(parsePower(NaN), { value: null, reason: "non-finite" }, "NaN input");
assertEquals(parsePower(Infinity), { value: null, reason: "non-finite" }, "Infinity input");

// Real-world test cases
console.log("\n--- Real-World Test Cases ---");
const testCases = [
  { input: "218010208", expected: 218010208, description: "Clean 8-digit power" },
  { input: "2180102088", expected: 218010208, description: "Inflated by ×10" },
  { input: "325,123,456", expected: 325123456, description: "Well-grouped 9-digit" },
  { input: "10.5B", expected: 10500000000, description: "10.5 billion" },
  { input: "850M", expected: 850000000, description: "850 million" },
  { input: "1.2K", expected: 1200, description: "1.2 thousand" },
];

for (const testCase of testCases) {
  const result = parsePower(testCase.input);
  assertEquals(result.value, testCase.expected, testCase.description);
}

// Summary
console.log("\n=== Test Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\n✅ All tests passed!");
  process.exit(0);
}
