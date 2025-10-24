/**
 * Minimal logger used by the Admin API.
 * If you later want structured logs, swap this for pino/winston.
 */
const ts = () => new Date().toISOString();

const base = {
  info: (...args) => console.log(`[INFO ${ts()}]`, ...args),
  warn: (...args) => console.warn(`[WARN ${ts()}]`, ...args),
  error: (...args) => console.error(`[ERR  ${ts()}]`, ...args),
  debug: (...args) => {
    if (process.env.DEBUG) console.log(`[DBG  ${ts()}]`, ...args);
  },
  child: () => base
};

module.exports = base;
