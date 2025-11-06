"use strict";

const request = require("supertest");
const app = require("../app");
const { signSession } = require("../../lib/jwt");
const { storeSession, clearSession, getSession } = require("../../lib/session-store");

// Set up test environment variables
process.env.DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "test-client-id";
process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "test-secret";
process.env.DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "https://example.com/callback";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

const COOKIE_NAME = "slimy_admin";
const TEST_GUILD_ID = "1234567890";

describe("Auth Middleware", () => {
  beforeEach(() => {
    // Clear all sessions before each test
    clearSession("test-member");
    clearSession("test-admin");
    clearSession("test-club");
  });

  afterAll(() => {
    clearSession("test-member");
    clearSession("test-admin");
    clearSession("test-club");
  });

  describe("resolveUser middleware", () => {
    it("should resolve user from valid session cookie", () => {
      // Create a test session
      storeSession("test-user", {
        guilds: [{ id: TEST_GUILD_ID, name: "Test Guild" }],
        role: "member",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "test-user",
          username: "TestUser",
          globalName: "Test User",
          role: "member",
          guilds: [{ id: TEST_GUILD_ID }],
        },
      });

      // Test the middleware directly by creating a mock request/response
      const mockReq = {
        cookies: { [COOKIE_NAME]: token },
        _cachedUser: undefined
      };
      const mockRes = {};
      const mockNext = jest.fn();

      // Import and test resolveUser directly
      const { resolveUser } = require("./auth");
      const result = resolveUser(mockReq);

      expect(result).toBeDefined();
      expect(result.id).toBe("test-user");
      expect(result.role).toBe("member");
      expect(result.username).toBe("TestUser");
    });

    it("should return null for missing cookie", () => {
      const mockReq = {
        cookies: {},
        _cachedUser: undefined
      };

      const { resolveUser } = require("./auth");
      const result = resolveUser(mockReq);

      expect(result).toBeNull();
    });

    it("should return null for invalid token", () => {
      const mockReq = {
        cookies: { [COOKIE_NAME]: "invalid-token" },
        _cachedUser: undefined
      };

      const { resolveUser } = require("./auth");
      const result = resolveUser(mockReq);

      expect(result).toBeNull();
    });
  });

  describe("requireAuth middleware", () => {
    // Create a test route that uses requireAuth
    const authRoute = require("express").Router();
    const { requireAuth } = require("./auth");

    authRoute.get("/protected", requireAuth, (req, res) => {
      res.json({ ok: true, user: req.user });
    });

    app.use("/test-auth", authRoute);

    it("should allow authenticated users", () => {
      storeSession("auth-test-user", {
        guilds: [{ id: TEST_GUILD_ID }],
        role: "member",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "auth-test-user",
          username: "AuthTest",
          globalName: "Auth Test",
          role: "member",
        },
      });

      return request(app)
        .get("/test-auth/protected")
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(200)
        .then(res => {
          expect(res.body.ok).toBe(true);
          expect(res.body.user.id).toBe("auth-test-user");
        });
    });

    it("should reject unauthenticated users", () => {
      return request(app)
        .get("/test-auth/protected")
        .expect(401);
    });
  });

  describe("requireRole middleware", () => {
    const roleRoute = require("express").Router();
    const { requireRole } = require("./auth");

    roleRoute.get("/admin-only", requireRole("admin"), (req, res) => {
      res.json({ ok: true, user: req.user });
    });

    roleRoute.get("/club-only", requireRole("club"), (req, res) => {
      res.json({ ok: true, user: req.user });
    });

    app.use("/test-role", roleRoute);

    it("should allow admin to access admin-only route", () => {
      storeSession("admin-test", {
        guilds: [{ id: TEST_GUILD_ID }],
        role: "admin",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "admin-test",
          username: "AdminTest",
          globalName: "Admin Test",
          role: "admin",
        },
      });

      return request(app)
        .get("/test-role/admin-only")
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(200)
        .then(res => {
          expect(res.body.ok).toBe(true);
          expect(res.body.user.role).toBe("admin");
        });
    });

    it("should allow admin to access club-only route", () => {
      storeSession("admin-test2", {
        guilds: [{ id: TEST_GUILD_ID }],
        role: "admin",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "admin-test2",
          username: "AdminTest2",
          globalName: "Admin Test 2",
          role: "admin",
        },
      });

      return request(app)
        .get("/test-role/club-only")
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(200);
    });

    it("should allow club member to access club-only route", () => {
      storeSession("club-test", {
        guilds: [{ id: TEST_GUILD_ID }],
        role: "club",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "club-test",
          username: "ClubTest",
          globalName: "Club Test",
          role: "club",
        },
      });

      return request(app)
        .get("/test-role/club-only")
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(200);
    });

    it("should reject member from admin-only route", () => {
      storeSession("member-test", {
        guilds: [{ id: TEST_GUILD_ID }],
        role: "member",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "member-test",
          username: "MemberTest",
          globalName: "Member Test",
          role: "member",
        },
      });

      return request(app)
        .get("/test-role/admin-only")
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(403);
    });

    it("should reject member from club-only route", () => {
      storeSession("member-test2", {
        guilds: [{ id: TEST_GUILD_ID }],
        role: "member",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "member-test2",
          username: "MemberTest2",
          globalName: "Member Test 2",
          role: "member",
        },
      });

      return request(app)
        .get("/test-role/club-only")
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(403);
    });
  });

  describe("requireGuildMember middleware", () => {
    const guildRoute = require("express").Router();
    const { requireGuildMember } = require("./auth");

    guildRoute.get("/guild/:guildId/protected", requireGuildMember(), (req, res) => {
      res.json({ ok: true, user: req.user, guildId: req.params.guildId });
    });

    app.use("/test-guild", guildRoute);

    it("should allow admin to access any guild", () => {
      storeSession("admin-guild-test", {
        guilds: [], // Admin doesn't need to be in guild
        role: "admin",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "admin-guild-test",
          username: "AdminGuildTest",
          globalName: "Admin Guild Test",
          role: "admin",
        },
      });

      return request(app)
        .get(`/test-guild/guild/${TEST_GUILD_ID}/protected`)
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(200);
    });

    it("should allow member to access their guild", () => {
      storeSession("member-guild-test", {
        guilds: [{ id: TEST_GUILD_ID, name: "Test Guild" }],
        role: "member",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "member-guild-test",
          username: "MemberGuildTest",
          globalName: "Member Guild Test",
          role: "member",
        },
      });

      return request(app)
        .get(`/test-guild/guild/${TEST_GUILD_ID}/protected`)
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(200);
    });

    it("should reject member from guild they're not in", () => {
      storeSession("member-guild-test2", {
        guilds: [{ id: "different-guild", name: "Different Guild" }],
        role: "member",
        accessToken: "test-access",
        refreshToken: "test-refresh",
      });

      const token = signSession({
        user: {
          id: "member-guild-test2",
          username: "MemberGuildTest2",
          globalName: "Member Guild Test 2",
          role: "member",
        },
      });

      return request(app)
        .get(`/test-guild/guild/${TEST_GUILD_ID}/protected`)
        .set("Cookie", [`${COOKIE_NAME}=${token}`])
        .expect(403);
    });

    it("should reject unauthenticated user", () => {
      return request(app)
        .get(`/test-guild/guild/${TEST_GUILD_ID}/protected`)
        .expect(401);
    });
  });
});
