"use strict";

const request = require("supertest");
const app = require("../app");
const { signSession } = require("../../lib/jwt");
const { storeSession, clearSession } = require("../../lib/session-store");

const COOKIE_NAME = "slimy_admin";
const TEST_GUILD_ID = "guild-123456789";
const TEST_USER_ID = "user-123456789";

// Set up test environment variables
process.env.DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "test-client-id";
process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "test-secret";
process.env.DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "https://example.com/callback";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

describe("Guild Routes", () => {
  let adminCookie, memberCookie;

  beforeAll(() => {
    // Create test sessions
    storeSession("test-admin", {
      guilds: [{ id: TEST_GUILD_ID, name: "Test Guild", role: "admin" }],
      role: "admin",
      accessToken: "test-access",
      refreshToken: "test-refresh",
    });

    storeSession("test-member", {
      guilds: [{ id: TEST_GUILD_ID, name: "Test Guild", role: "member" }],
      role: "member",
      accessToken: "test-access",
      refreshToken: "test-refresh",
    });

    // Create auth tokens
    const adminToken = signSession({
      user: {
        id: "test-admin",
        username: "TestAdmin",
        globalName: "Test Admin",
        role: "admin",
        guilds: [{ id: TEST_GUILD_ID }],
      },
    });

    const memberToken = signSession({
      user: {
        id: "test-member",
        username: "TestMember",
        globalName: "Test Member",
        role: "member",
        guilds: [{ id: TEST_GUILD_ID }],
      },
    });

    adminCookie = `${COOKIE_NAME}=${adminToken}`;
    memberCookie = `${COOKIE_NAME}=${memberToken}`;
  });

  afterAll(() => {
    clearSession("test-admin");
    clearSession("test-member");
  });

  describe("GET /api/guilds", () => {
    it("should allow admin to list guilds", () => {
      return request(app)
        .get("/api/guilds")
        .set("Cookie", adminCookie)
        .expect(200)
        .then(res => {
          expect(Array.isArray(res.body.guilds)).toBe(true);
          expect(res.body).toHaveProperty("pagination");
        });
    });

    it("should reject non-admin users", () => {
      return request(app)
        .get("/api/guilds")
        .set("Cookie", memberCookie)
        .expect(403);
    });

    it("should reject unauthenticated users", () => {
      return request(app)
        .get("/api/guilds")
        .expect(401);
    });
  });

  describe("POST /api/guilds", () => {
    it("should allow admin to create guild", () => {
      return request(app)
        .post("/api/guilds")
        .set("Cookie", adminCookie)
        .send({
          discordId: "discord-123456789",
          name: "New Test Guild",
          settings: { theme: "dark" },
        })
        .expect(201)
        .then(res => {
          expect(res.body).toHaveProperty("id");
          expect(res.body.name).toBe("New Test Guild");
          expect(res.body.discordId).toBe("discord-123456789");
        });
    });

    it("should reject non-admin users", () => {
      return request(app)
        .post("/api/guilds")
        .set("Cookie", memberCookie)
        .send({
          discordId: "discord-123456789",
          name: "New Test Guild",
        })
        .expect(403);
    });

    it("should validate required fields", () => {
      return request(app)
        .post("/api/guilds")
        .set("Cookie", adminCookie)
        .send({})
        .expect(400)
        .then(res => {
          expect(res.body.error).toBe("VALIDATION_ERROR");
        });
    });
  });

  describe("GET /api/guilds/:id", () => {
    it("should allow member to view their guild", () => {
      return request(app)
        .get(`/api/guilds/${TEST_GUILD_ID}`)
        .set("Cookie", memberCookie)
        .expect(200)
        .then(res => {
          expect(res.body).toHaveProperty("id");
          expect(res.body).toHaveProperty("name");
        });
    });

    it("should allow admin to view any guild", () => {
      return request(app)
        .get(`/api/guilds/${TEST_GUILD_ID}`)
        .set("Cookie", adminCookie)
        .expect(200);
    });

    it("should reject member from viewing guild they're not in", () => {
      return request(app)
        .get("/api/guilds/other-guild-id")
        .set("Cookie", memberCookie)
        .expect(403);
    });

    it("should reject unauthenticated users", () => {
      return request(app)
        .get(`/api/guilds/${TEST_GUILD_ID}`)
        .expect(401);
    });
  });

  describe("PATCH /api/guilds/:id", () => {
    it("should allow admin to update guild", () => {
      return request(app)
        .patch(`/api/guilds/${TEST_GUILD_ID}`)
        .set("Cookie", adminCookie)
        .send({ name: "Updated Guild Name" })
        .expect(200)
        .then(res => {
          expect(res.body.name).toBe("Updated Guild Name");
        });
    });

    it("should reject non-admin users", () => {
      return request(app)
        .patch(`/api/guilds/${TEST_GUILD_ID}`)
        .set("Cookie", memberCookie)
        .send({ name: "Updated Guild Name" })
        .expect(403);
    });
  });

  describe("DELETE /api/guilds/:id", () => {
    it("should allow admin to delete guild", () => {
      return request(app)
        .delete(`/api/guilds/${TEST_GUILD_ID}`)
        .set("Cookie", adminCookie)
        .expect(200)
        .then(res => {
          expect(res.body.success).toBe(true);
        });
    });

    it("should reject non-admin users", () => {
      return request(app)
        .delete(`/api/guilds/${TEST_GUILD_ID}`)
        .set("Cookie", memberCookie)
        .expect(403);
    });
  });

  describe("GET /api/guilds/:id/members", () => {
    it("should allow member to view guild members", () => {
      return request(app)
        .get(`/api/guilds/${TEST_GUILD_ID}/members`)
        .set("Cookie", memberCookie)
        .expect(200)
        .then(res => {
          expect(Array.isArray(res.body.members)).toBe(true);
          expect(res.body).toHaveProperty("pagination");
        });
    });

    it("should allow admin to view guild members", () => {
      return request(app)
        .get(`/api/guilds/${TEST_GUILD_ID}/members`)
        .set("Cookie", adminCookie)
        .expect(200);
    });
  });

  describe("POST /api/guilds/:id/members", () => {
    it("should allow admin to add member", () => {
      return request(app)
        .post(`/api/guilds/${TEST_GUILD_ID}/members`)
        .set("Cookie", adminCookie)
        .send({ userId: TEST_USER_ID, roles: ["member"] })
        .expect(201)
        .then(res => {
          expect(res.body).toHaveProperty("userId");
          expect(res.body.roles).toEqual(["member"]);
        });
    });

    it("should reject non-admin users", () => {
      return request(app)
        .post(`/api/guilds/${TEST_GUILD_ID}/members`)
        .set("Cookie", memberCookie)
        .send({ userId: TEST_USER_ID, roles: ["member"] })
        .expect(403);
    });
  });

  describe("PATCH /api/guilds/:id/members/:userId", () => {
    it("should allow admin to update member roles", () => {
      return request(app)
        .patch(`/api/guilds/${TEST_GUILD_ID}/members/${TEST_USER_ID}`)
        .set("Cookie", adminCookie)
        .send({ roles: ["moderator"] })
        .expect(200)
        .then(res => {
          expect(res.body.roles).toEqual(["moderator"]);
        });
    });

    it("should reject non-admin users", () => {
      return request(app)
        .patch(`/api/guilds/${TEST_GUILD_ID}/members/${TEST_USER_ID}`)
        .set("Cookie", memberCookie)
        .send({ roles: ["moderator"] })
        .expect(403);
    });
  });

  describe("DELETE /api/guilds/:id/members/:userId", () => {
    it("should allow admin to remove member", () => {
      return request(app)
        .delete(`/api/guilds/${TEST_GUILD_ID}/members/${TEST_USER_ID}`)
        .set("Cookie", adminCookie)
        .expect(200)
        .then(res => {
          expect(res.body.success).toBe(true);
        });
    });

    it("should reject non-admin users", () => {
      return request(app)
        .delete(`/api/guilds/${TEST_GUILD_ID}/members/${TEST_USER_ID}`)
        .set("Cookie", memberCookie)
        .expect(403);
    });
  });

  describe("GET /api/guilds/user/:userId", () => {
    it("should allow users to view their own guilds", () => {
      return request(app)
        .get("/api/guilds/user/test-member")
        .set("Cookie", memberCookie)
        .expect(200)
        .then(res => {
          expect(Array.isArray(res.body.guilds)).toBe(true);
        });
    });

    it("should allow admin to view any user's guilds", () => {
      return request(app)
        .get("/api/guilds/user/test-member")
        .set("Cookie", adminCookie)
        .expect(200);
    });

    it("should reject users from viewing other users' guilds", () => {
      return request(app)
        .get("/api/guilds/user/test-admin")
        .set("Cookie", memberCookie)
        .expect(403);
    });
  });
});
