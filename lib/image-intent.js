const OPENAI_KEY_MISSING = !process.env.OPENAI_API_KEY;

const TRIGGERS = [
  /\bcreate (an? )?(image|picture|photo|art|poster|logo|banner|icon)\b/i,
  /\bmake (an? )?(image|picture|photo|art|poster|logo|banner|icon)\b/i,
  /\bimage prompt:/i,
  /\bdraw\b/i,
  /\billustrate\b/i,
  /\bgenerate\b.*\b(image|picture|photo)\b/i,
  /\b(render|paint|design)\b.*\b(image|picture|photo|art)\b/i,
  /\b(show|send|display|give|share)\b.*\b(photo|picture|image)\b/i,
  /\b(photo|picture|image)\b.*\bof\b/i,
];

function detectImageIntent(text = "") {
  const t = text.toLowerCase();
  if (!t || OPENAI_KEY_MISSING) return false;
  return TRIGGERS.some((regex) => regex.test(text));
}

module.exports = {
  detectImageIntent,
};
