"use strict";

const adminIds = (process.env.ROLE_ADMIN_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const clubIds = (process.env.ROLE_CLUB_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

function resolveRoleLevel(memberRoleIds = []) {
  const set = new Set(memberRoleIds.map(String));
  if (adminIds.some((id) => set.has(id))) {
    return "admin";
  }
  if (clubIds.some((id) => set.has(id))) {
    return "club";
  }
  return "member";
}

module.exports = { resolveRoleLevel, adminIds, clubIds };
