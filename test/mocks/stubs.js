const { AttachmentBuilder } = require("discord.js");

const memoryStore = new Map();
const consentStore = new Map();
const aliasStore = new Map();
const guildSettingStore = new Map();

function memoryKey(userId, guildId) {
  return `${userId || "global"}:${guildId || "global"}`;
}

function fixtureMemories(userId, guildId) {
  const key = memoryKey(userId, guildId);
  if (!memoryStore.has(key)) {
    memoryStore.set(key, []);
  }
  return memoryStore.get(key);
}

const database = {
  isConfigured() {
    return true;
  },

  async testConnection() {
    return true;
  },

  getPool() {
    return {
      async query() {
        return [[{ count: 3 }]];
      },
    };
  },

  async query() {
    return [];
  },

  async getUserConsent(userId) {
    return consentStore.get(userId) ?? true;
  },

  async setUserConsent(userId, allow) {
    consentStore.set(userId, Boolean(allow));
  },

  async saveMemory(userId, guildId, note, tags = [], context = {}) {
    const record = {
      id: `mem-${Date.now()}`,
      userId,
      guildId,
      note,
      tags,
      context,
      createdAt: new Date().toISOString(),
    };
    fixtureMemories(userId, guildId).push(record);
    return record;
  },

  async getMemories(userId, guildId, limit = 25) {
    const records = fixtureMemories(userId, guildId);
    return records.slice(-limit).reverse();
  },

  async ensureGuildRecord() {
    return true;
  },

  async deleteAllMemories(userId, guildId) {
    const key = memoryKey(userId, guildId);
    const count = fixtureMemories(userId, guildId).length;
    memoryStore.set(key, []);
    return count;
  },

  async deleteMemory(userId, guildId, id) {
    const records = fixtureMemories(userId, guildId);
    const index = records.findIndex((record) => record.id === id);
    if (index >= 0) {
      records.splice(index, 1);
      return true;
    }
    return false;
  },
};

const memory = {
  async getConsent({ userId }) {
    return consentStore.get(userId) ?? true;
  },

  async setConsent({ userId, allow }) {
    consentStore.set(userId, Boolean(allow));
    return true;
  },

  async listMemos({ userId, guildId, limit = 25 }) {
    const records = fixtureMemories(userId, guildId);
    return records
      .slice(-limit)
      .reverse()
      .map((record) => ({
        _id: record.id,
        content: record.note,
        tags: record.tags,
        context: record.context,
        createdAt: record.createdAt,
      }));
  },

  async addMemo({ userId, guildId, content, tags = [], context = {} }) {
    return database.saveMemory(userId, guildId, content, tags, context);
  },

  async deleteMemo({ id, userId, guildId }) {
    return database.deleteMemory(userId, guildId, id);
  },

  async deleteAllMemos({ userId, guildId }) {
    return database.deleteAllMemories(userId, guildId);
  },
};

const metricsState = {
  commands: {},
};

const metrics = {
  trackCommand(commandName, durationMs, success) {
    const entry = metricsState.commands[commandName] || {
      count: 0,
      successes: 0,
      totalTime: 0,
    };
    entry.count += 1;
    if (success) entry.successes += 1;
    entry.totalTime += durationMs || 0;
    metricsState.commands[commandName] = entry;
  },

  trackError(key) {
    metricsState.lastError = key;
  },

  getStats() {
    const summary = Object.entries(metricsState.commands).reduce(
      (acc, [, data]) => {
        acc.totalCommands += data.count;
        acc.totalSuccesses += data.successes;
        acc.totalDuration += data.totalTime;
        return acc;
      },
      {
        totalCommands: 0,
        totalSuccesses: 0,
        totalDuration: 0,
        totalErrors: metricsState.lastError ? 1 : 0,
      },
    );

    const successRate =
      summary.totalCommands === 0
        ? "0%"
        : `${Math.round((summary.totalSuccesses / summary.totalCommands) * 100)}%`;

    const commands = {};
    for (const [name, data] of Object.entries(metricsState.commands)) {
      const avg = data.count
        ? `${Math.round(data.totalTime / data.count)}ms`
        : "0ms";
      commands[name] = { count: data.count, avgTime: avg };
    }

    return {
      summary: {
        totalCommands: summary.totalCommands,
        successRate,
        totalErrors: summary.totalErrors,
      },
      commands,
    };
  },
};

function stubNormalizeSheetInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return { sheetId: null, url: null };
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  let sheetId = urlMatch?.[1] || null;
  if (!sheetId && /^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    sheetId = trimmed;
  }
  let url = null;
  if (/^https?:\/\//i.test(trimmed)) {
    url = trimmed;
  } else if (sheetId) {
    url = `https://docs.google.com/spreadsheets/d/${sheetId}`;
  }
  if (!sheetId && url) {
    const extracted = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
    sheetId = extracted?.[1] || null;
  }
  return { sheetId, url };
}

const guildSettings = {
  normalizeSheetInput: stubNormalizeSheetInput,
  async getSheetConfig(guildId) {
    const stored = guildSettingStore.get(guildId) || {};
    return {
      url: stored.url || null,
      sheetId: stored.sheetId || null,
    };
  },
  async setSheetConfig(guildId, config) {
    guildSettingStore.set(guildId, {
      url: config.url || null,
      sheetId: config.sheetId || null,
    });
  },
  async clearSheetConfig(guildId) {
    guildSettingStore.delete(guildId);
  },
  async setGuildSetting(guildId, key, value) {
    const existing = guildSettingStore.get(guildId) || {};
    existing[key] = value;
    guildSettingStore.set(guildId, existing);
  },
  async clearGuildSetting(guildId, key) {
    const existing = guildSettingStore.get(guildId) || {};
    delete existing[key];
    guildSettingStore.set(guildId, existing);
  },
};

const rateLimiter = {
  checkCooldown() {
    return { limited: false, remaining: 0 };
  },
};

const clubStoreState = {
  latest: [
    {
      member_id: 1,
      name_display: "Alice",
      name_canonical: "alice",
      sim_power: 123456,
      total_power: 234567,
      sim_pct_change: 5.2,
      total_pct_change: 4.1,
    },
    {
      member_id: 2,
      name_display: "Bob",
      name_canonical: "bob",
      sim_power: 113456,
      total_power: 214567,
      sim_pct_change: -1.4,
      total_pct_change: 0.5,
    },
    {
      member_id: 3,
      name_display: "Charlie",
      name_canonical: "charlie",
      sim_power: 104000,
      total_power: 204500,
      sim_pct_change: 3.8,
      total_pct_change: 6.7,
    },
  ],
};

function canonicalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

const clubStore = {
  canonicalize: canonicalizeName,

  async upsertMembers(guildId, rows = []) {
    const map = new Map();
    rows.forEach((row, index) => {
      const canonical = canonicalizeName(
        row.display || row.name || row.canonical || `member-${index}`,
      );
      map.set(canonical, index + 1);
    });
    return map;
  },

  async createSnapshot() {
    return { snapshotId: Date.now(), snapshotAt: new Date() };
  },

  async insertMetrics() {
    return true;
  },

  async recomputeLatestForGuild() {
    return true;
  },

  async getLatestForGuild() {
    return clubStoreState.latest.map((entry) => ({
      ...entry,
    }));
  },

  async getAggregates() {
    const members = clubStoreState.latest.length;
    return {
      members,
      membersWithTotals: members,
      totalPower: 10120000000,
      averagePower: members > 0 ? 184000000 : null,
    };
  },

  async getTopMovers(_guildId, metric, top = 5) {
    const data = clubStoreState.latest.slice(0, top).map((entry, _index) => ({
      name_display: entry.name_display,
      pct_change:
        metric === "total" ? entry.total_pct_change : entry.sim_pct_change,
      current_value: metric === "total" ? entry.total_power : entry.sim_power,
      previous_value:
        metric === "total" ? entry.total_power - 5000 : entry.sim_power - 4000,
    }));

    return {
      gainers: data.slice(0, Math.max(1, Math.ceil(data.length / 2))),
      losers: data
        .slice(Math.max(1, Math.ceil(data.length / 2)))
        .map((entry) => ({
          ...entry,
          pct_change: entry.pct_change ? entry.pct_change * -1 : -1,
        })),
    };
  },

  async addAlias(guildId, canonical, alias) {
    const key = `${guildId}:${canonical}`;
    aliasStore.set(key, alias);
    return true;
  },

  async findLikelyMemberId() {
    return null;
  },
};

const clubVision = {
  async parseManageMembersImage(_imageUrl, forcedMetric = null) {
    const metric = forcedMetric || "total";
    const rows = clubStoreState.latest.map((entry) => ({
      name: entry.name_display,
      display: entry.name_display,
      canonical: entry.name_canonical,
      value: metric === "sim" ? entry.sim_power : entry.total_power,
      confidence: 0.95,
    }));
    return {
      metric,
      rows,
    };
  },
};

const clubSheets = {
  async pushLatest() {
    return {
      ok: true,
      rowCount: 55,
      sheetName: "Club Latest",
      spreadsheetId: "mock-spreadsheet",
      sheetTabId: 0,
      sheetUrl: "https://example.com/sheets/mock",
    };
  },
};

const persona = {
  getPersona(mode = "default") {
    return {
      name: mode,
      prompt: `You are operating in ${mode} mode.`,
    };
  },
};

const autoImage = {
  async maybeReplyWithImage() {
    return false;
  },
};

const images = {
  async generateImageWithSafety({ prompt, styleName }) {
    const description = `Generated image for "${prompt}" in style "${styleName}"`;
    return {
      success: true,
      buffer: Buffer.from(description),
      metadata: { description },
    };
  },
};

const openai = {
  chat: {
    completions: {
      async create({ messages }) {
        const last = messages[messages.length - 1]?.content || "No prompt";
        return {
          choices: [
            {
              message: {
                content: `Stub response: ${last.slice(0, 60)}`,
              },
            },
          ],
        };
      },
    },
  },
};
openai.chatCompletion = async (messages) => {
  const last = messages[messages.length - 1]?.content || "No prompt";
  return {
    choices: [{ message: { content: `Stub response: ${last.slice(0, 60)}` } }],
  };
};
openai.isConfigured = true;
openai.ensureConfigured = () => true;

const modes = {
  MODE_KEYS: ["chat", "personality", "rating_pg13", "rating_unrated"],

  getEffectiveModesForChannel() {
    return {
      chat: true,
      personality: true,
      rating_pg13: true,
      rating_unrated: false,
    };
  },

  viewModes() {
    return {
      direct: { modes: { chat: true, personality: true, rating_pg13: true } },
      inherited: [],
      effective: {
        modes: {
          chat: true,
          personality: true,
          rating_pg13: true,
          rating_unrated: false,
        },
      },
    };
  },

  listModes() {
    return [];
  },

  setModes() {
    return true;
  },

  formatModeState(state) {
    const active = Object.entries(state || {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => key)
      .join(", ");
    return active || "none";
  },
};

const snail = {
  async analyze() {
    return {
      success: true,
      content: "Snail analysis stub.",
    };
  },
};

const personalityEngine = {
  loadPersonalityConfig() {
    return {
      traits: {
        friendliness: "high",
        energy: "moderate",
        curiosity: "elevated",
      },
      catchphrases: ["Stay slimy!"],
      toneGuidelines: ["Warm", "Supportive"],
      contextBehaviors: ["Answer concisely", "Ask clarifying questions"],
      adaptationRules: [],
      adjustments: {
        enthusiasm: { value: 7, updatedByTag: "Tester#0001" },
      },
    };
  },

  async evaluatePersonalityQuality() {
    return true;
  },

  getAnalytics() {
    return {
      catchphraseFrequency: { "Stay slimy!": 4, "Let us goo!": 2 },
      toneConsistency: 0.92,
      userSatisfaction: 0.87,
    };
  },

  reloadConfig() {
    return true;
  },
};

const personalityStore = {
  setAdjustment() {
    return true;
  },
};

function buildEphemeralBuffer(text) {
  return new AttachmentBuilder(Buffer.from(text, "utf8"), { name: "stub.txt" });
}

module.exports = {
  database,
  memory,
  metrics,
  rateLimiter,
  clubStore,
  clubVision,
  clubSheets,
  guildSettings,
  persona,
  autoImage,
  images,
  openai,
  modes,
  snail,
  personalityEngine,
  personalityStore,
  buildEphemeralBuffer,
};
