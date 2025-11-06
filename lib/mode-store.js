const fs = require("fs");
const path = require("path");
const db = require("./database");

const STORE_PATH = path.join(process.cwd(), "data_store.json");
const TARGET_TYPES = new Set(["channel", "category", "thread"]);

let memoryStore = null;

function ensureDir(filePath) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch {
    // ignore mkdir errors (likely existing dir)
  }
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cloneStore(store) {
  if (!store || typeof store !== "object") return { channelModes: [] };
  const entries = Array.isArray(store.channelModes) ? store.channelModes : [];
  return {
    channelModes: entries.map((entry) => ({
      guildId: entry.guildId,
      targetId: entry.targetId,
      targetType: entry.targetType,
      modes: { ...(entry.modes || {}) },
      updatedAt: entry.updatedAt || Date.now(),
    })),
  };
}

function setMemoryStore(store) {
  memoryStore = cloneStore(store);
}

function readStoreFromDisk() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = safeJsonParse(raw, null);
    if (parsed && typeof parsed === "object") {
      parsed.channelModes = Array.isArray(parsed.channelModes)
        ? parsed.channelModes
        : [];
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function getMemoryStore() {
  if (memoryStore) return cloneStore(memoryStore);
  const disk = readStoreFromDisk();
  if (disk) {
    memoryStore = cloneStore(disk);
    return cloneStore(memoryStore);
  }
  return null;
}

function cacheKey(guildId, targetType = "channel", targetId) {
  return `${guildId || "unknown"}:${targetType || "channel"}:${targetId || "unknown"}`;
}

function mapTargetColumns(targetType = "channel", targetId = null) {
  return {
    channelId: targetType === "channel" ? targetId : null,
    categoryId: targetType === "category" ? targetId : null,
    threadId: targetType === "thread" ? targetId : null,
  };
}

function rowToEntry(row) {
  const config = safeJsonParse(row.config, {});
  const payload = typeof config === "object" && config !== null ? config : {};
  const modes =
    payload.modes && typeof payload.modes === "object"
      ? payload.modes
      : payload;
  const updatedAt = Number(payload.updatedAt) || Date.now();

  let targetType = "channel";
  let targetId = row.channel_id || null;

  if (row.thread_id) {
    targetType = "thread";
    targetId = row.thread_id;
  } else if (row.category_id) {
    targetType = "category";
    targetId = row.category_id;
  }

  if (!targetId) return null;

  return {
    guildId: row.guild_id,
    targetId,
    targetType,
    modes: { ...(modes || {}) },
    updatedAt,
  };
}

function writeStoreToDisk(store) {
  try {
    ensureDir(STORE_PATH);
    fs.writeFileSync(STORE_PATH, JSON.stringify(cloneStore(store), null, 2));
  } catch (err) {
    console.warn("[mode-store] Failed to write disk snapshot:", err.message);
  }
}

function refreshClientCache(client, entries) {
  if (!client) return;
  const map = new Map();
  for (const entry of entries) {
    if (!entry?.guildId || !entry?.targetId) continue;
    map.set(cacheKey(entry.guildId, entry.targetType, entry.targetId), {
      guildId: entry.guildId,
      targetType: entry.targetType,
      targetId: entry.targetId,
      modes: { ...(entry.modes || {}) },
      updatedAt: entry.updatedAt || Date.now(),
    });
  }
  client.slimeModeCache = map;
}

function cacheSet(client, entry) {
  if (!client || !entry?.guildId || !entry?.targetId) return;
  if (!client.slimeModeCache || !(client.slimeModeCache instanceof Map)) {
    client.slimeModeCache = new Map();
  }
  client.slimeModeCache.set(
    cacheKey(entry.guildId, entry.targetType, entry.targetId),
    {
      guildId: entry.guildId,
      targetType: entry.targetType,
      targetId: entry.targetId,
      modes: { ...(entry.modes || {}) },
      updatedAt: entry.updatedAt || Date.now(),
    },
  );
}

function cacheDelete(client, guildId, targetType, targetId) {
  if (!client?.slimeModeCache) return;
  client.slimeModeCache.delete(cacheKey(guildId, targetType, targetId));
}

function cacheGet(client, guildId, targetType = "channel", targetId) {
  if (!client?.slimeModeCache) return null;
  const entry = client.slimeModeCache.get(
    cacheKey(guildId, targetType, targetId),
  );
  return entry ? { ...(entry.modes || {}) } : null;
}

async function persistStore(store, client = null) {
  const snapshot = cloneStore(store);
  setMemoryStore(snapshot);

  if (!db.isConfigured()) return;

  try {
    const entries = snapshot.channelModes.filter(
      (entry) =>
        entry.guildId && entry.targetId && TARGET_TYPES.has(entry.targetType),
    );
    const desiredMap = new Map();
    for (const entry of entries) {
      desiredMap.set(
        cacheKey(entry.guildId, entry.targetType, entry.targetId),
        {
          guildId: entry.guildId,
          targetId: entry.targetId,
          targetType: entry.targetType,
          modes: { ...(entry.modes || {}) },
          updatedAt: entry.updatedAt || Date.now(),
        },
      );
    }

    const rows = await db.query(
      "SELECT id, guild_id, channel_id, category_id, thread_id FROM mode_configs",
    );
    const toDelete = [];
    for (const row of rows) {
      const entry = rowToEntry(row);
      if (!entry) {
        toDelete.push(row.id);
        continue;
      }
      const key = cacheKey(entry.guildId, entry.targetType, entry.targetId);
      if (!desiredMap.has(key)) {
        toDelete.push(row.id);
      }
    }

    if (toDelete.length) {
      const placeholders = toDelete.map(() => "?").join(",");
      await db.query(
        `DELETE FROM mode_configs WHERE id IN (${placeholders})`,
        toDelete,
      );
    }

    for (const entry of desiredMap.values()) {
      await db.ensureGuildRecord(entry.guildId);
      const columns = mapTargetColumns(entry.targetType, entry.targetId);
      const payload = {
        modes: entry.modes,
        updatedAt: entry.updatedAt || Date.now(),
      };

      await db.query(
        `INSERT INTO mode_configs (guild_id, channel_id, category_id, thread_id, config)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE config = VALUES(config), updated_at = NOW()`,
        [
          entry.guildId,
          columns.channelId,
          columns.categoryId,
          columns.threadId,
          JSON.stringify(payload),
        ],
      );
    }

    const effectiveClient = client || global.client || null;
    if (effectiveClient) {
      refreshClientCache(effectiveClient, desiredMap.values());
    }
  } catch (err) {
    console.warn("[mode-store] Failed to persist mode configs:", err.message);
  }
}

async function loadGuildModesIntoCache(client = null) {
  if (!db.isConfigured()) return new Map();

  try {
    const rows = await db.query(
      "SELECT guild_id, channel_id, category_id, thread_id, config FROM mode_configs",
    );

    const entries = [];
    const cache = new Map();
    for (const row of rows) {
      const entry = rowToEntry(row);
      if (!entry) continue;
      entries.push(entry);
      cache.set(
        cacheKey(entry.guildId, entry.targetType, entry.targetId),
        entry,
      );
    }

    const snapshot = { channelModes: entries };
    setMemoryStore(snapshot);
    writeStoreToDisk(snapshot);

    const effectiveClient = client || global.client || null;
    if (effectiveClient) {
      refreshClientCache(effectiveClient, cache.values());
      return effectiveClient.slimeModeCache;
    }

    return cache;
  } catch (err) {
    console.warn("[mode-store] Failed to hydrate cache:", err.message);
    return new Map();
  }
}

module.exports = {
  STORE_PATH,
  loadGuildModesIntoCache,
  persistStore,
  setMemoryStore,
  getMemoryStore,
  cacheGet,
  cacheSet,
  cacheDelete,
  refreshClientCache,
  writeStoreToDisk,
};
