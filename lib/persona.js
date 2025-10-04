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

function getPersona() {
  return loadPersona() || {
    name: 'slimy.ai',
    tagline: 'slimy.ai default persona',
    modes: {},
    tone_and_voice: {},
    catchphrases: [],
  };
}

module.exports = {
  getPersona,
  PERSONA_PATH,
};
