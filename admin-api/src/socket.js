"use strict";

const { Server } = require("socket.io");
const { verifySession, COOKIE_NAME } = require("../lib/jwt");
const { getSession } = require("../lib/session-store");
const metrics = require("./lib/metrics");
const { askChatBot } = require("./services/chat-bot");

const ROLE_COLORS = {
  member: "#3b82f6",
  club: "#f59e0b",
  admin: "#ef4444",
  bot: "#22c55e",
};

function parseCookies(header = "") {
  return header.split(";").reduce((acc, pair) => {
    const [key, value] = pair.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(value || "");
    return acc;
  }, {});
}

function buildEmitterPayload(user, text) {
  return {
    from: {
      id: user.id,
      name: user.globalName || user.username,
      role: user.role || "member",
      color: ROLE_COLORS[user.role] || ROLE_COLORS.member,
    },
    text,
    ts: new Date().toISOString(),
  };
}

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "https://admin.slimyai.xyz",
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie || "");
      const token = cookies[COOKIE_NAME];
      if (!token) {
        return next(new Error("unauthorized"));
      }
      const session = verifySession(token);
      socket.user = session?.user;
      socket.session = getSession(socket.user?.id) || null;
      if (!socket.user) {
        return next(new Error("unauthorized"));
      }
      const guilds = socket.user.guilds || [];
      socket.guildIds = guilds.map((g) => String(g.id));
      socket.isAdmin = socket.user.role === "admin";
      return next();
    } catch (err) {
      return next(err);
    }
  });

  io.on("connection", (socket) => {
    if (!socket.user) {
      socket.disconnect(true);
      return;
    }

    for (const guildId of socket.guildIds) {
      socket.join(`guild:${guildId}`);
    }
    if (socket.isAdmin) {
      socket.join("admins");
    }

    socket.on("chat:message", async (payload = {}, respond) => {
      try {
        const text = typeof payload.text === "string" ? payload.text.trim() : "";
        const guildId = String(payload.guildId || "");
        const messageId =
          typeof payload.messageId === "string" && payload.messageId
            ? payload.messageId
            : `${Date.now().toString(36)}-${socket.id.slice(-4)}`;

        if (!text) {
          if (typeof respond === "function") {
            respond({ error: "Message cannot be empty." });
          }
          return;
        }

        if (!guildId) {
          if (typeof respond === "function") {
            respond({ error: "Missing guild." });
          }
          return;
        }

        if (!socket.guildIds.includes(guildId) && !socket.isAdmin) {
          if (typeof respond === "function") {
            respond({ error: "You do not have access to this guild." });
          }
          return;
        }

        // Check if message should be admin-only
        const adminOnly = Boolean(payload.adminOnly);

        // Only admins can send admin-only messages
        if (adminOnly && !socket.isAdmin) {
          if (typeof respond === "function") {
            respond({ error: "Only admins can send admin-only messages." });
          }
          return;
        }

        metrics.recordChatMessage();
        const message = buildEmitterPayload(socket.user, text);
        message.guildId = guildId;
        message.messageId = messageId;
        message.adminOnly = adminOnly;

        // Emit to appropriate audience
        if (adminOnly) {
          io.to("admins").emit("chat:message", message);
        } else {
          io.emit("chat:message", message);
        }

        if (typeof respond === "function") {
          respond({ ok: true });
        }

        const shouldAskBot =
          Boolean(payload.requestBot) || /@slimy(\.ai)?/i.test(text);
        if (shouldAskBot) {
          try {
            const { reply } = await askChatBot({ prompt: text, guildId });
            if (reply) {
              const botUser = {
                id: "bot",
                username: "slimy.ai",
                globalName: "slimy.ai",
                role: "bot",
              };
              const botMessage = buildEmitterPayload(botUser, reply);
              botMessage.guildId = guildId;
              botMessage.messageId = `${messageId}-bot`;
              metrics.recordChatMessage();
              io.emit("chat:message", botMessage);
            }
          } catch (err) {
            console.error("[chat] bot reply failed", err);
            socket.emit("chat:message", {
              guildId,
              messageId: `${messageId}-bot-error`,
              from: {
                id: "system",
                name: "Slime Chat",
                role: "bot",
                color: ROLE_COLORS.bot,
              },
              text: "We couldn't reach slimy.ai right now. Try again shortly.",
              ts: new Date().toISOString(),
              error: "bot_unavailable",
            });
          }
        }
      } catch (err) {
        console.error("[chat] failed to handle message", err);
        if (typeof respond === "function") {
          respond({ error: "server_error" });
        }
      }
    });
  });
}

module.exports = { initSocket };
