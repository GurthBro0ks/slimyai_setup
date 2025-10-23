// lib/week-anchor.js
const { DateTime } = require("luxon");

// Default anchor: Friday 04:30 America/Los_Angeles
const DEFAULT_DAY = process.env.CLUB_WEEK_ANCHOR_DAY || "FRI";
const DEFAULT_TIME = process.env.CLUB_WEEK_ANCHOR_TIME || "04:30";
const DEFAULT_TZ = process.env.CLUB_WEEK_ANCHOR_TZ || "America/Los_Angeles";

const DAY_MAP = {
  SUN: 7,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

/**
 * Parse time string (HH:mm) into hour and minute
 */
function parseTime(timeStr) {
  const [hour, minute] = timeStr.split(":").map(Number);
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time format: ${timeStr}. Expected HH:mm`);
  }
  return { hour, minute };
}

/**
 * Get anchor configuration (day, time, timezone)
 * Can be overridden per-guild in the future
 */
function getAnchorConfig(guildId = null) {
  // TODO: Support per-guild overrides from database
  // For now, use global defaults
  const day = DEFAULT_DAY.toUpperCase();
  const weekday = DAY_MAP[day];

  if (!weekday) {
    throw new Error(`Invalid anchor day: ${day}. Use SUN-SAT`);
  }

  const { hour, minute } = parseTime(DEFAULT_TIME);

  return {
    weekday,
    hour,
    minute,
    timezone: DEFAULT_TZ,
    displayDay: day,
    displayTime: DEFAULT_TIME,
  };
}

/**
 * Get the most recent anchor datetime (last occurrence)
 * Returns a luxon DateTime object
 */
function getLastAnchor(referenceTime = null, guildId = null) {
  const config = getAnchorConfig(guildId);
  const now = referenceTime
    ? DateTime.fromJSDate(referenceTime, { zone: config.timezone })
    : DateTime.now().setZone(config.timezone);

  // Start from current week's anchor day
  let anchor = now.set({
    weekday: config.weekday,
    hour: config.hour,
    minute: config.minute,
    second: 0,
    millisecond: 0,
  });

  // If anchor is in the future, go back one week
  if (anchor > now) {
    anchor = anchor.minus({ weeks: 1 });
  }

  return anchor;
}

/**
 * Get the next anchor datetime (future occurrence)
 * Returns a luxon DateTime object
 */
function getNextAnchor(referenceTime = null, guildId = null) {
  const config = getAnchorConfig(guildId);
  const now = referenceTime
    ? DateTime.fromJSDate(referenceTime, { zone: config.timezone })
    : DateTime.now().setZone(config.timezone);

  // Start from current week's anchor day
  let anchor = now.set({
    weekday: config.weekday,
    hour: config.hour,
    minute: config.minute,
    second: 0,
    millisecond: 0,
  });

  // If anchor is in the past or now, go forward one week
  if (anchor <= now) {
    anchor = anchor.plus({ weeks: 1 });
  }

  return anchor;
}

/**
 * Get the anchor datetime for the current week
 * This is the last anchor that has passed
 */
function getAnchor(referenceTime = null, guildId = null) {
  return getLastAnchor(referenceTime, guildId);
}

/**
 * Generate a unique week ID based on the anchor
 * Format: YYYY-Www (ISO week year and week number relative to anchor)
 * Example: "2025-W15"
 */
function getWeekId(referenceTime = null, guildId = null) {
  const anchor = getLastAnchor(referenceTime, guildId);

  // Use ISO week year and week number
  // This ensures consistent week IDs across years
  const year = anchor.weekYear;
  const week = anchor.weekNumber;

  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Format anchor time for display with timezone conversions
 * Returns formatted string showing anchor time in multiple timezones
 */
function formatAnchorDisplay(guildId = null) {
  const config = getAnchorConfig(guildId);
  const anchor = getLastAnchor(null, guildId);

  const timezones = [
    { tz: config.timezone, label: "PT" },
    { tz: "America/Detroit", label: "Detroit" },
    { tz: "UTC", label: "UTC" },
  ];

  const displays = timezones
    .map(({ tz, label }) => {
      const converted = anchor.setZone(tz);
      const dayName = converted.toFormat("EEE"); // Mon, Tue, etc.
      const time = converted.toFormat("HH:mm");
      return `${dayName} ${time} ${label}`;
    })
    .join(" • ");

  return displays;
}

/**
 * Get the week start ISO timestamp for a given reference time
 */
function getWeekStartISO(referenceTime = null, guildId = null) {
  const anchor = getLastAnchor(referenceTime, guildId);
  return anchor.toISO();
}

module.exports = {
  getAnchorConfig,
  getAnchor,
  getLastAnchor,
  getNextAnchor,
  getWeekId,
  formatAnchorDisplay,
  getWeekStartISO,
};
