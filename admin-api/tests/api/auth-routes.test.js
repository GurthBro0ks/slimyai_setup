const request = require("supertest");
const app = require("../../src/app");
const { signSession } = require("../../lib/jwt");
const { storeSession, clearSession } = require("../../lib/session-store");

const COOKIE_NAME = "slimy_admin";

// Set up test environment variables
process.env.DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "test-client-id";
process.env.DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "test-secret";
process.env.DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "https://example.com/callback";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

describe("Auth Routes", () => {
  let memberCookie;

  beforeAll(() => {
    // Create test session
    storeSession("test-user", {
      guilds: [{ id: "guild-123", name: "Test Guild" }],
      role: "member",
      accessToken: "test-access-token",
      refreshToken: "test-refresh-token",
    });

    // Create auth token
    const token = signSession({
      user: {
        id: "test-user",
        username: "TestUser",
        globalName: "Test User",
        role: "member",
        guilds: [{ id: "guild-123" }],
      },
    });

    memberCookie = `${COOKIE_NAME}=${token}`;
  });

  afterAll(() => {
    clearSession("test-user");
  });

  describe("GET /api/auth/me", () => {
    it("should return current user info when authenticated", () => {
      return request(app)
        .get("/api/auth/me")
        .set("Cookie", memberCookie)
        .expect(200)
        .then(res => {
          expect(res.body.ok).toBe(true);
          expect(res.body.user).toHaveProperty("id", "test-user");
          expect(res.body.user).toHaveProperty("username", "TestUser");
          expect(res.body.user).toHaveProperty("globalName", "Test User");
          expect(res.body.user).toHaveProperty("role", "member");
          expect(res.body.user).toHaveProperty("guilds");
        });
    });

    it("should return 401 when not authenticated", () => {
      return request(app)
        .get("/api/auth/me")
        .expect(401)
        .then(res => {
          expect(res.body.ok).toBe(false);
          expect(res.body.code).toBe("UNAUTHORIZED");
          expect(res.body.message).toBe("Authentication required");
        });
    });
  });

  describe("POST /api/auth/refresh", () => {
    it("should refresh authentication token", () => {
      return request(app)
        .post("/api/auth/refresh")
        .set("Cookie", memberCookie)
        .expect(200)
        .then(res => {
          expect(res.body.ok).toBe(true);
          // Should set a new cookie
          expect(res.headers['set-cookie']).toBeDefined();
          expect(res.headers['set-cookie'][0]).toContain(COOKIE_NAME);
        });
    });

    it("should return 401 when not authenticated", () => {
      return request(app)
        .post("/api/auth/refresh")
        .expect(401)
        .then(res => {
          expect(res.body.ok).toBe(false);
          expect(res.body.code).toBe("UNAUTHORIZED");
        });
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should clear authentication cookie", () => {
      return request(app)
        .post("/api/auth/logout")
        .set("Cookie", memberCookie)
        .expect(200)
        .then(res => {
          expect(res.body.ok).toBe(true);
          // Should clear the cookie
          expect(res.headers['set-cookie']).toBeDefined();
          expect(res.headers['set-cookie'][0]).toContain(`${COOKIE_NAME}=;`);
        });
    });

    it("should return 401 when not authenticated", () => {
      return request(app)
        .post("/api/auth/logout")
        .expect(401)
        .then(res => {
          expect(res.body.ok).toBe(false);
          expect(res.body.code).toBe("UNAUTHORIZED");
        });
    });
  });

  describe("GET /api/auth/login", () => {
    it("should redirect to Discord OAuth", () => {
      return request(app)
        .get("/api/auth/login")
        .expect(302)
        .then(res => {
          expect(res.headers.location).toContain("discord.com/api/oauth2/authorize");
          expect(res.headers.location).toContain("client_id=test-client-id");
          expect(res.headers.location).toContain("redirect_uri=https%3A%2F%2Fexample.com%2Fcallback");
          expect(res.headers.location).toContain("scope=identify%20guilds");
          expect(res.headers.location).toContain("response_type=code");

          // Should set state cookie
          expect(res.headers['set-cookie']).toBeDefined();
          expect(res.headers['set-cookie'][0]).toContain("oauth_state=");
        });
    });

    it("should handle custom redirect parameter", () => {
      return request(app)
        .get("/api/auth/login?redirect=/dashboard")
        .expect(302)
        .then(res => {
          expect(res.headers.location).toContain("discord.com/api/oauth2/authorize");

          // Should set redirect cookie
          const redirectCookie = res.headers['set-cookie'].find(cookie =>
            cookie.includes("oauth_redirect=")
          );
          expect(redirectCookie).toContain("oauth_redirect=%2Fdashboard");
        });
    });
  });

  describe("GET /api/auth/callback", () => {
    beforeEach(() => {
      // Mock fetch for Discord API calls
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should handle successful OAuth callback", () => {
      // Mock successful token exchange
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            expires_in: 604800,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: "123456789",
            username: "TestUser",
            global_name: "Test User",
            avatar: "test-avatar-hash",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([
            {
              id: "guild-123",
              name: "Test Guild",
              permissions: "2147483647", // Administrator permission
            },
          ]),
        });

      return request(app)
        .get("/api/auth/callback?code=test-code&state=test-state")
        .set("Cookie", "oauth_state=test-state")
        .expect(302)
        .then(res => {
          // Should redirect to admin dashboard
          expect(res.headers.location).toBe("/admin");

          // Should set auth cookie
          const authCookie = res.headers['set-cookie'].find(cookie =>
            cookie.includes(COOKIE_NAME)
          );
          expect(authCookie).toBeDefined();
          expect(authCookie).toContain(`${COOKIE_NAME}=`);
        });
    });

    it("should handle OAuth callback with custom redirect", () => {
      // Mock successful token exchange
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            expires_in: 604800,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: "123456789",
            username: "TestUser",
            global_name: "Test User",
            avatar: "test-avatar-hash",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        });

      return request(app)
        .get("/api/auth/callback?code=test-code&state=test-state")
        .set("Cookie", ["oauth_state=test-state", "oauth_redirect=/custom-redirect"])
        .expect(302)
        .then(res => {
          expect(res.headers.location).toBe("/custom-redirect");
        });
    });

    it("should handle missing code parameter", () => {
      return request(app)
        .get("/api/auth/callback?state=test-state")
        .expect(400)
        .then(res => {
          expect(res.body.error).toBe("missing_code");
        });
    });

    it("should handle invalid state parameter", () => {
      return request(app)
        .get("/api/auth/callback?code=test-code&state=wrong-state")
        .set("Cookie", "oauth_state=different-state")
        .expect(400)
        .then(res => {
          expect(res.body.error).toBe("invalid_state");
        });
    });

    it("should handle Discord API errors during token exchange", () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "invalid_grant" }),
      });

      return request(app)
        .get("/api/auth/callback?code=invalid-code&state=test-state")
        .set("Cookie", "oauth_state=test-state")
        .expect(400)
        .then(res => {
          expect(res.body.error).toBe("token_exchange_failed");
        });
    });

    it("should handle Discord API errors during user fetch", () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            expires_in: 604800,
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

      return request(app)
        .get("/api/auth/callback?code=test-code&state=test-state")
        .set("Cookie", "oauth_state=test-state")
        .expect(500)
        .then(res => {
          expect(res.body.error).toBe("user_fetch_failed");
        });
    });
  });
});
