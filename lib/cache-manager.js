const { createClient } = require("redis");

let client;
let connecting;

const CONNECT_TIMEOUT = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 1000);
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("redis connect timeout")), ms),
    ),
  ]);
}

async function ensureClient() {
  if (client?.isOpen) return client;

  if (connecting) {
    try {
      await connecting;
    } catch {
      // swallow; we'll return null below
    }
    return client?.isOpen ? client : null;
  }

  client = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: () => false,
    },
  });

  client.on("error", (err) => {
    console.warn("[redis] client error:", err.message || err);
  });

  connecting = withTimeout(
    client.connect().then(() => {
      console.log("[redis] connected");
      return true;
    }),
    CONNECT_TIMEOUT,
  )
    .catch((err) => {
      console.warn("[redis] connect failed:", err.message || err);
      if (client?.isOpen) {
        client.quit().catch(() => {});
      }
      client = null;
      return false;
    })
    .finally(() => {
      connecting = null;
    });

  const ok = await connecting;
  return ok ? client : null;
}

async function getCachedOrFetch(key, fetchFn, ttlSeconds = 3600) {
  const cli = await ensureClient();
  if (!cli) {
    return fetchFn();
  }

  try {
    const hit = await cli.get(key);
    if (hit) return JSON.parse(hit);

    const value = await fetchFn();
    await cli.setEx(key, ttlSeconds, JSON.stringify(value));
    return value;
  } catch (err) {
    console.warn("[redis] cache access failed:", err.message || err);
    return fetchFn();
  }
}

module.exports = {
  getCachedOrFetch,
};
