const fs = require('fs');
const path = require('path');

const PERSONA_PATH = path.join(__dirname, '..', 'config', 'slimy_ai.persona.json');
let cache = null;
let lastMTime = 0;

function loadPersona() {
  try {
    const stat = fs.statSync(PERSONA_PATH);
    if (!cache || stat.mtimeMs !== lastMTime) {
      const raw = fs.readFileSync(PERSONA_PATH, 'utf8');
      cache = JSON.parse(raw);
      lastMTime = stat.mtimeMs;
    }
  } catch (err) {
    console.error('[persona] Failed to load persona file:', err);
    cache = null;
  }
  return cache;
}

function getPersona(mode) {
  const base = loadPersona() || {
    name: 'slimy.ai',
    tagline: 'slimy.ai default persona',
    modes: {},
    tone_and_voice: {},
    catchphrases: [],
  };

  // Mode-specific prompt modifications
  if (mode === 'no_personality' && base.prompt) {
    return {
      ...base,
      name: 'slimy.ai (no personality)',
      prompt: base.prompt.replace('Playful banter with meme-flavored sass', 'Professional and concise')
        .replace('**Personality & Tone**:', '**Tone**: Neutral and direct. Minimal personality.')
        .replace(/\*\*Catchphrases\*\*[^\n]+\n/, '')  // Remove catchphrases
    };
  }

  return base;
}

module.exports = {
  getPersona,
  PERSONA_PATH,
};
