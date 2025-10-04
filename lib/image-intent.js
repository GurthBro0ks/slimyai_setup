const OPENAI_KEY_MISSING = !process.env.OPENAI_API_KEY;

const TRIGGERS = [
  /\bcreate (an? )?(image|picture|art|poster|logo|banner|icon)\b/i,
  /\bmake (an? )?(image|picture|art|poster|logo|banner|icon)\b/i,
  /\bimage prompt:/i,
  /\bdraw\b/i,
  /\billustrate\b/i,
  /\bgenerate\b.*\bimage\b/i,
];

function detectImageIntent(text = '') {
  const t = text.toLowerCase();
  if (!t || OPENAI_KEY_MISSING) return false;
  return TRIGGERS.some((regex) => regex.test(text));
}

module.exports = {
  detectImageIntent,
};
