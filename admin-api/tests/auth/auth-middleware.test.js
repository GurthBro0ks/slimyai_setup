const { requireAuth, requireRole, requireGuildMember, resolveUser } = require("../../src/middleware/auth");

describe("Auth Middleware", () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      cookies: {},
      params: {},
      query: {},
      body: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();

    // Clear cached user
    delete mockReq._cachedUser;
    delete mockReq.user;
    delete mockReq.session;
  });

  describe("resolveUser", () => {
    test("should return null when no token in cookies", () => {
      const result = resolveUser(mockReq);
      expect(result).toBeNull();
      expect(mockReq._cachedUser).toBeNull();
    });

    test("should return null when token is invalid", () => {
      mockReq.cookies.slimy_admin = "invalid-token";
      const result = resolveUser(mockReq);
      expect(result).toBeNull();
      expect(mockReq._cachedUser).toBeNull();
    });

    test("should return hydrated user when session exists", () => {
      mockReq.cookies.slimy_admin = "valid-token";
      // Mock will return session data from jest.setup.js

      const result = resolveUser(mockReq);
      expect(result).toEqual({
        id: expect.any(String),
        username: expect.any(String),
        globalName: expect.any(String),
        avatar: null,
        role: expect.any(String),
        guilds: expect.any(Array),
      });
      expect(mockReq.session).toBeDefined();
      expect(mockReq.user).toBe(result);
    });

    test("should return fallback user when no session exists", () => {
      // Use a valid token but mock getSession to return null
      mockReq.cookies.slimy_admin = "valid-token";

      // Temporarily mock getSession to return null
      const originalGetSession = require("../../lib/session-store").getSession;
      require("../../lib/session-store").getSession.mockReturnValueOnce(null);

      const result = resolveUser(mockReq);

      // Restore original mock
      require("../../lib/session-store").getSession = originalGetSession;

      expect(result).toEqual({
        id: expect.any(String),
        username: expect.any(String),
        globalName: expect.any(String),
        avatar: null,
        role: "member",
        guilds: expect.any(Array),
      });
    });

    test("should cache user resolution", () => {
      mockReq.cookies.slimy_admin = "valid-token";
      const result1 = resolveUser(mockReq);
      const result2 = resolveUser(mockReq);

      expect(result1).toBe(result2);
      expect(mockReq._cachedUser).toBe(result1);
    });
  });

  describe("requireAuth", () => {
    test("should call next when user is authenticated", () => {
      mockReq.cookies.slimy_admin = "valid-token";

      requireAuth(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.session).toBeDefined();
    });

    test("should return 401 when user is not authenticated", () => {
      requireAuth(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: false,
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    });
  });

  describe("requireRole", () => {
    const requireMemberRole = requireRole("member");
    const requireClubRole = requireRole("club");
    const requireAdminRole = requireRole("admin");

    test("should call next when user has required role (member)", () => {
      mockReq.cookies.slimy_admin = "valid-token";

      requireMemberRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
    });

    test("should call next when user has higher role than required", () => {
      mockReq.cookies.slimy_admin = "admin-token";

      requireMemberRole(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test("should return 403 when user has insufficient role", () => {
      mockReq.cookies.slimy_admin = "member-token";

      requireAdminRole(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: false,
        code: "FORBIDDEN",
        message: "Insufficient role",
      });
    });

    test("should return 401 when user is not authenticated", () => {
      requireMemberRole(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe("requireGuildMember", () => {
    const middleware = requireGuildMember("guildId");

    test("should call next for admin user regardless of guild membership", () => {
      mockReq.cookies.slimy_admin = "admin-token";
      mockReq.params.guildId = "guild-123";

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test("should call next when user is member of the guild", () => {
      mockReq.cookies.slimy_admin = "member-token";
      mockReq.params.guildId = "guild-123";

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test("should return 403 when user is not member of the guild", () => {
      mockReq.cookies.slimy_admin = "member-token";
      mockReq.params.guildId = "different-guild-456";

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: false,
        code: "FORBIDDEN",
        message: "You are not a member of this guild",
      });
    });

    test("should return 400 when guildId parameter is missing", () => {
      mockReq.cookies.slimy_admin = "member-token";

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        ok: false,
        code: "BAD_REQUEST",
        message: "Missing guildId parameter",
      });
    });

    test("should return 401 when user is not authenticated", () => {
      mockReq.params.guildId = "guild-123";

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    test("should use custom parameter name", () => {
      const customMiddleware = requireGuildMember("customGuildId");
      mockReq.cookies.slimy_admin = "member-token";
      mockReq.params.customGuildId = "guild-123";

      customMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
