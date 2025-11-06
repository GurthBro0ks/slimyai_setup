"use strict";

const request = require("supertest");
const app = require("../app");
const { signSession } = require("../../lib/jwt");
const { storeSession, clearSession } = require("../../lib/session-store");

const COOKIE_NAME = "slimy_admin";
const TEST_GUILD_ID = "1234567890";

// Set up test environment variables
process.env.DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "test-client-id";
process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "test-secret";
process.env.DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "https://example.com/callback";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

describe("Chat Routes", () => {
  let memberCookie, adminCookie, clubCookie;

  beforeAll(() => {
    // Create test sessions
    storeSession("test-member", {
      guilds: [{ id: TEST_GUILD_ID, name: "Test Guild" }], // Note: no role field in guild entry
      role: "member",
      accessToken: "test-access",
      refreshToken: "test-refresh",
    });

    storeSession("test-admin", {
      guilds: [{ id: TEST_GUILD_ID, name: "Test Guild" }],
      role: "admin",
      accessToken: "test-access",
      refreshToken: "test-refresh",
    });

    storeSession("test-club", {
      guilds: [{ id: TEST_GUILD_ID, name: "Test Guild" }],
      role: "club",
      accessToken: "test-access",
      refreshToken: "test-refresh",
    });

    // Create auth tokens
    const memberToken = signSession({
      user: {
        id: "test-member",
        username: "TestMember",
        globalName: "Test Member",
        role: "member",
        guilds: [{ id: TEST_GUILD_ID }],
      },
    });

    const adminToken = signSession({
      user: {
        id: "test-admin",
        username: "TestAdmin",
        globalName: "Test Admin",
        role: "admin",
        guilds: [{ id: TEST_GUILD_ID }],
      },
    });

    const clubToken = signSession({
      user: {
        id: "test-club",
        username: "TestClub",
        globalName: "Test Club",
        role: "club",
        guilds: [{ id: TEST_GUILD_ID }],
      },
    });

    memberCookie = `${COOKIE_NAME}=${memberToken}`;
    adminCookie = `${COOKIE_NAME}=${adminToken}`;
    clubCookie = `${COOKIE_NAME}=${clubToken}`;
  });

  afterAll(() => {
    clearSession("test-member");
    clearSession("test-admin");
    clearSession("test-club");
  });

  describe("POST /api/chat/bot", () => {
    it("should allow member to send chat message", () => {
      return request(app)
        .post("/api/chat/bot")
        .set("Cookie", memberCookie)
        .send({ prompt: "Hello bot", guildId: TEST_GUILD_ID })
        .expect(200)
        .then(res => {
          expect(res.body.ok).toBe(true);
          expect(res.body.reply).toBe("Test reply");
        });
    });

    it("should allow admin to send chat message", () => {
      return request(app)
        .post("/api/chat/bot")
        .set("Cookie", adminCookie)
        .send({ prompt: "Hello bot", guildId: TEST_GUILD_ID })
        .expect(200);
    });

    it("should allow club member to send chat message", () => {
      return request(app)
        .post("/api/chat/bot")
        .set("Cookie", clubCookie)
        .send({ prompt: "Hello bot", guildId: TEST_GUILD_ID })
        .expect(200);
    });

    it("should reject unauthenticated user", () => {
      return request(app)
        .post("/api/chat/bot")
        .send({ prompt: "Hello bot", guildId: TEST_GUILD_ID })
        .expect(401);
    });

    it("should handle missing prompt", () => {
      // Mock the askChatBot to throw missing_prompt error
      const { askChatBot } = require("../services/chat-bot");
      askChatBot.mockRejectedValueOnce({ code: "missing_prompt" });

      return request(app)
        .post("/api/chat/bot")
        .set("Cookie", memberCookie)
        .send({ guildId: TEST_GUILD_ID }) // No prompt
        .expect(400)
        .then(res => {
          expect(res.body.error).toBe("missing_prompt");
        });
    });

    it("should handle empty prompt", () => {
      const { askChatBot } = require("../services/chat-bot");
      askChatBot.mockRejectedValueOnce({ code: "missing_prompt" });

      return request(app)
        .post("/api/chat/bot")
        .set("Cookie", memberCookie)
        .send({ prompt: "", guildId: TEST_GUILD_ID })
        .expect(400);
    });

    it("should handle OpenAI errors", () => {
      const { askChatBot } = require("../services/chat-bot");
      askChatBot.mockRejectedValueOnce({
        code: "openai_error",
        status: 429,
        detail: "Rate limited"
      });

      return request(app)
        .post("/api/chat/bot")
        .set("Cookie", memberCookie)
        .send({ prompt: "Hello", guildId: TEST_GUILD_ID })
        .expect(429)
        .then(res => {
          expect(res.body.error).toBe("openai_error");
          expect(res.body.detail).toBe("Rate limited");
        });
    });

    it("should handle server errors", () => {
      const { askChatBot } = require("../services/chat-bot");
      askChatBot.mockRejectedValueOnce(new Error("Unexpected error"));

      return request(app)
        .post("/api/chat/bot")
        .set("Cookie", memberCookie)
        .send({ prompt: "Hello", guildId: TEST_GUILD_ID })
        .expect(500)
        .then(res => {
          expect(res.body.error).toBe("server_error");
        });
    });

    it("should trim whitespace from prompt", () => {
      return request(app)
        .post("/api/chat/bot")
        .set("Cookie", memberCookie)
        .send({ prompt: "  Hello bot  ", guildId: TEST_GUILD_ID })
        .expect(200);
    });
  });

  describe("GET /api/chat/:guildId/history", () => {
    beforeEach(() => {
      // Reset mocks
      const database = require("../../../lib/database");
      database.isConfigured.mockReturnValue(true);
      database.getChatMessages.mockResolvedValue([
        {
          message_id: "msg-1",
          guild_id: TEST_GUILD_ID,
          user_id: "user-1",
          username: "TestUser",
          global_name: "Test User",
          user_role: "member",
          text: "Hello world",
          admin_only: false,
          created_at: new Date("2023-01-01T00:00:00Z"),
        },
        {
          message_id: "msg-2",
          guild_id: TEST_GUILD_ID,
          user_id: "user-2",
          username: "AdminUser",
          global_name: "Admin User",
          user_role: "admin",
          text: "Admin message",
          admin_only: true,
          created_at: new Date("2023-01-01T00:01:00Z"),
        },
      ]);
    });

    it("should reject member from viewing guild chat history", () => {
      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .set("Cookie", memberCookie)
        .expect(403)
        .then(res => {
          expect(res.body.error).toBe("forbidden");
          expect(res.body.hint).toBe("insufficient role to view chat history");
        });
    });

    it("should allow admin to view all messages including admin-only", () => {
      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .set("Cookie", adminCookie)
        .expect(200)
        .then(res => {
          expect(res.body.ok).toBe(true);
          expect(res.body.messages.length).toBe(2); // Should see all messages
          expect(res.body.messages[1].adminOnly).toBe(true);
        });
    });

    it("should allow club member to view guild chat history", () => {
      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .set("Cookie", clubCookie)
        .expect(200);
    });

    it("should reject member from viewing admin room", () => {
      return request(app)
        .get("/api/chat/admin-global/history")
        .set("Cookie", memberCookie)
        .expect(403)
        .then(res => {
          expect(res.body.error).toBe("forbidden");
          expect(res.body.hint).toBe("admin room is available to admins only");
        });
    });

    it("should allow admin to view admin room", () => {
      return request(app)
        .get("/api/chat/admin-global/history")
        .set("Cookie", adminCookie)
        .expect(200);
    });

    it("should reject member from guild they're not in", () => {
      return request(app)
        .get("/api/chat/other-guild/history")
        .set("Cookie", memberCookie)
        .expect(403)
        .then(res => {
          expect(res.body.error).toBe("forbidden"); // Role check happens before guild membership check
        });
    });

    it("should allow admin to view any guild history", () => {
      return request(app)
        .get("/api/chat/other-guild/history")
        .set("Cookie", adminCookie)
        .expect(200);
    });

    it("should reject unauthenticated user", () => {
      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .expect(401);
    });

    it("should handle missing guildId parameter", () => {
      return request(app)
        .get("/api/chat/undefined/history") // Undefined guildId becomes string "undefined"
        .set("Cookie", memberCookie)
        .expect(403) // Will fail role check first
        .then(res => {
          expect(res.body.error).toBe("forbidden");
        });
    });

    it("should handle limit parameter", () => {
      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history?limit=10`)
        .set("Cookie", clubCookie) // Use club member who can access
        .expect(200);
    });

    it("should cap limit at 200", () => {
      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history?limit=500`)
        .set("Cookie", clubCookie) // Use club member who can access
        .expect(200);
    });

    it("should return empty messages when database not configured", () => {
      const database = require("../../../lib/database");
      database.isConfigured.mockReturnValue(false);

      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .set("Cookie", clubCookie) // Use club member who can access
        .expect(200)
        .then(res => {
          expect(res.body.ok).toBe(true);
          expect(res.body.messages).toEqual([]);
        });
    });

    it("should handle database errors", () => {
      const database = require("../../../lib/database");
      database.getChatMessages.mockRejectedValue(new Error("Database error"));

      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .set("Cookie", clubCookie) // Use club member who can access
        .expect(500)
        .then(res => {
          expect(res.body.error).toBe("server_error");
        });
    });

    it("should format messages correctly", () => {
      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .set("Cookie", adminCookie)
        .expect(200)
        .then(res => {
          const message = res.body.messages[0];
          expect(message).toHaveProperty("messageId");
          expect(message).toHaveProperty("guildId");
          expect(message).toHaveProperty("userId");
          expect(message).toHaveProperty("username");
          expect(message).toHaveProperty("from");
          expect(message).toHaveProperty("text");
          expect(message).toHaveProperty("adminOnly");
          expect(message).toHaveProperty("ts");
          expect(message.from).toHaveProperty("id");
          expect(message.from).toHaveProperty("name");
          expect(message.from).toHaveProperty("role");
          expect(message.from).toHaveProperty("color");
        });
    });
  });

  describe("getColorForRole utility", () => {
    it("should return correct colors for roles", () => {
      // Import the function directly for testing
      const chatRoutes = require("./chat");

      // Test the getColorForRole function indirectly through message formatting
      const database = require("../../../lib/database");
      database.getChatMessages.mockResolvedValue([
        {
          message_id: "msg-1",
          guild_id: TEST_GUILD_ID,
          user_id: "user-1",
          username: "MemberUser",
          global_name: "Member User",
          user_role: "member",
          text: "Member message",
          admin_only: false,
          created_at: new Date(),
        },
        {
          message_id: "msg-2",
          guild_id: TEST_GUILD_ID,
          user_id: "user-2",
          username: "ClubUser",
          global_name: "Club User",
          user_role: "club",
          text: "Club message",
          admin_only: false,
          created_at: new Date(),
        },
        {
          message_id: "msg-3",
          guild_id: TEST_GUILD_ID,
          user_id: "user-3",
          username: "AdminUser",
          global_name: "Admin User",
          user_role: "admin",
          text: "Admin message",
          admin_only: false,
          created_at: new Date(),
        },
        {
          message_id: "msg-4",
          guild_id: TEST_GUILD_ID,
          user_id: "user-4",
          username: "BotUser",
          global_name: "Bot User",
          user_role: "bot",
          text: "Bot message",
          admin_only: false,
          created_at: new Date(),
        },
      ]);

      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .set("Cookie", adminCookie)
        .expect(200)
        .then(res => {
          expect(res.body.messages[0].from.color).toBe("#3b82f6"); // member
          expect(res.body.messages[1].from.color).toBe("#f59e0b"); // club
          expect(res.body.messages[2].from.color).toBe("#ef4444"); // admin
          expect(res.body.messages[3].from.color).toBe("#22c55e"); // bot
        });
    });

    it("should return default color for unknown role", () => {
      const database = require("../../../lib/database");
      database.getChatMessages.mockResolvedValue([
        {
          message_id: "msg-1",
          guild_id: TEST_GUILD_ID,
          user_id: "user-1",
          username: "UnknownUser",
          global_name: "Unknown User",
          user_role: "unknown",
          text: "Unknown role message",
          admin_only: false,
          created_at: new Date(),
        },
      ]);

      return request(app)
        .get(`/api/chat/${TEST_GUILD_ID}/history`)
        .set("Cookie", adminCookie)
        .expect(200)
        .then(res => {
          expect(res.body.messages[0].from.color).toBe("#3b82f6"); // default member color
        });
    });
  });
});
