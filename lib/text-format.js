function trimForDiscord(text, limit) {
  if (!text) return "";
  if (text.length <= limit) return text;
  return text.slice(0, Math.max(0, limit - 1)) + "…";
}

function formatChatDisplay({ userLabel, userMsg, persona, response }) {
  const personaName = persona?.name || "slimy.ai";
  const safeUser = trimForDiscord(userMsg || "(no input)", 400);
  const userLine = `**${userLabel || "You"}:** ${safeUser}`;
  const prefix = `**${personaName}:** `;
  const available = Math.max(50, 2000 - userLine.length - 2 - prefix.length);
  const safeResponse = trimForDiscord(response || "(no content)", available);
  const botLine = `${prefix}${safeResponse}`;
  return `${userLine}\n\n${botLine}`;
}

module.exports = {
  trimForDiscord,
  formatChatDisplay,
};
