"use strict";

const express = require("express");
const crypto = require("crypto");
const { signSession, setAuthCookie, clearAuthCookie } = require("../../lib/jwt");
const {
  storeSession,
  clearSession,
  getSession,
} = require("../../lib/session-store");
const { resolveRoleLevel } = require("../lib/roles");

const router = express.Router();

const DISCORD = {
  API: "https://discord.com/api/v10",
  TOKEN_URL: "https://discord.com/api/oauth2/token",
  AUTH_URL: "https://discord.com/oauth2/authorize",
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const CLIENT_ID = requiredEnv("DISCORD_CLIENT_ID");
const CLIENT_SECRET = requiredEnv("DISCORD_CLIENT_SECRET");
const REDIRECT_URI = requiredEnv("DISCORD_REDIRECT_URI");
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || null;
const COOKIE_DOMAIN = requiredEnv("COOKIE_DOMAIN");
const SCOPES = "identify guilds";

const ROLE_ORDER = { member: 0, club: 1, admin: 2 };

function issueState(res) {
  const payload = {
    nonce: crypto.randomBytes(16).toString("base64url"),
    ts: Date.now(),
  };
  res.cookie("oauth_state", payload.nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    domain: COOKIE_DOMAIN,
    path: "/",
    maxAge: 5 * 60 * 1000,
  });
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function parseState(value) {
  if (!value) return null;
  try {
    return JSON.parse(
      Buffer.from(String(value), "base64url").toString("utf8"),
    );
  } catch (err) {
    return null;
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`Request failed: ${response.status} ${text}`);
    error.status = response.status;
    error.raw = text;
    throw error;
  }
  return response.json();
}

router.get("/login", (_req, res) => {
  const state = issueState(res);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    state,
    prompt: "consent",
  });
  res.redirect(302, `${DISCORD.AUTH_URL}?${params.toString()}`);
});

router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const savedNonce = req.cookies?.oauth_state;
    const parsed = parseState(state);
    if (
      !code ||
      !parsed ||
      !parsed.nonce ||
      !savedNonce ||
      parsed.nonce !== savedNonce
    ) {
      return res.redirect("/?error=state_mismatch");
    }

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: REDIRECT_URI,
    });

    const tokenResponse = await fetch(DISCORD.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenResponse.ok) {
      return res.redirect("/?error=token_exchange_failed");
    }
    const tokens = await tokenResponse.json();

    const headers = { Authorization: `Bearer ${tokens.access_token}` };
    const me = await fetchJson(`${DISCORD.API}/users/@me`, { headers });
    const userGuilds = await fetchJson(`${DISCORD.API}/users/@me/guilds`, {
      headers,
    });

    const guilds = Array.isArray(userGuilds) ? userGuilds : [];
    const enrichedGuilds = [];
    let highestRole = "member";

    const MANAGE_GUILD = 0x0000000000000020n;
    const ADMINISTRATOR = 0x0000000000080000n;

    if (!BOT_TOKEN) {
      console.warn(
        "[auth] DISCORD_BOT_TOKEN not configured; skipping guild intersection",
      );
      for (const guild of guilds) {
        let roleLevel = "member";
        try {
          const perms = BigInt(guild.permissions || "0");
          if ((perms & ADMINISTRATOR) === ADMINISTRATOR || guild.owner) {
            roleLevel = "admin";
          } else if ((perms & MANAGE_GUILD) === MANAGE_GUILD) {
            roleLevel = "admin";
          }
        } catch {
          roleLevel = "member";
        }
        if (ROLE_ORDER[roleLevel] > ROLE_ORDER[highestRole]) {
          highestRole = roleLevel;
        }
        enrichedGuilds.push({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          roles: [],
          role: roleLevel,
          permissions: guild.permissions,
          installed: false,
        });
      }
    } else {
      // Parallel bot membership checks with timeout protection
      const TIMEOUT_MS = 2000; // 2 second timeout per guild check

      const checkGuild = async (guild) => {
        const botHeaders = { Authorization: `Bot ${BOT_TOKEN}` };

        // Timeout wrapper
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
        });

        const checkPromise = (async () => {
          const detail = await fetch(`${DISCORD.API}/guilds/${guild.id}`, {
            headers: botHeaders,
          });

          if (!detail.ok) {
            throw new Error(`guild_detail_${detail.status}`);
          }

          const memberRes = await fetch(
            `${DISCORD.API}/guilds/${guild.id}/members/${me.id}`,
            { headers: botHeaders },
          );

          let memberRoles = [];
          if (memberRes.ok) {
            const memberJson = await memberRes.json();
            memberRoles = Array.isArray(memberJson.roles)
              ? memberJson.roles
              : [];
          }

          return memberRoles;
        })();

        return Promise.race([checkPromise, timeoutPromise]);
      };

      const checks = guilds.map(async (guild) => {
        try {
          const memberRoles = await checkGuild(guild);
          let roleLevel = resolveRoleLevel(memberRoles);

          try {
            const perms = BigInt(guild.permissions || "0");
            if (roleLevel === "member") {
              if ((perms & ADMINISTRATOR) === ADMINISTRATOR || guild.owner) {
                roleLevel = "admin";
              } else if ((perms & MANAGE_GUILD) === MANAGE_GUILD) {
                roleLevel = "admin";
              }
            }
          } catch {
            /* ignore */
          }

          return {
            success: true,
            guild: {
              id: guild.id,
              name: guild.name,
              icon: guild.icon,
              roles: memberRoles,
              role: roleLevel,
              permissions: guild.permissions,
              installed: true,
            },
            roleLevel,
          };
        } catch (err) {
          console.warn(
            `[auth] Failed to verify guild ${guild.id}:`,
            err.message,
          );
          return { success: false, guild: null, roleLevel: null };
        }
      });

      const results = await Promise.all(checks);

      for (const result of results) {
        if (result.success) {
          if (ROLE_ORDER[result.roleLevel] > ROLE_ORDER[highestRole]) {
            highestRole = result.roleLevel;
          }
          enrichedGuilds.push(result.guild);
        }
      }
    }

    if (!enrichedGuilds.length && guilds.length && !BOT_TOKEN) {
      // Provide graceful fallback so members still see guilds even without bot token.
      for (const guild of guilds) {
        let roleLevel = "member";
        try {
          const perms = BigInt(guild.permissions || "0");
          if ((perms & ADMINISTRATOR) === ADMINISTRATOR || guild.owner) {
            roleLevel = "admin";
          } else if ((perms & MANAGE_GUILD) === MANAGE_GUILD) {
            roleLevel = "admin";
          }
        } catch {
          roleLevel = "member";
        }
        if (ROLE_ORDER[roleLevel] > ROLE_ORDER[highestRole]) {
          highestRole = roleLevel;
        }
        enrichedGuilds.push({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          roles: [],
          role: roleLevel,
          permissions: guild.permissions,
          installed: false,
        });
      }
    }

    const lightweightGuilds = enrichedGuilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      role: guild.role,
      installed: guild.installed,
      permissions: guild.permissions,
    }));

    const userRole = highestRole;
    const user = {
      id: me.id,
      username: me.username,
      globalName: me.global_name || me.username,
      avatar: me.avatar || null,
      role: userRole,
      guilds: lightweightGuilds,
    };

    storeSession(user.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      guilds: enrichedGuilds,
      role: userRole,
    });

    const signed = signSession({ user });
    setAuthCookie(res, signed);
    res.clearCookie("oauth_state", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      domain: COOKIE_DOMAIN,
      path: "/",
    });

    // Role-based redirect
    let redirectPath = "/guilds"; // default for admin
    if (userRole === "club") {
      redirectPath = "/club";
    } else if (userRole === "member") {
      redirectPath = "/snail";
    }
    return res.redirect(redirectPath);
  } catch (err) {
    console.error("[auth/callback] failed:", err);
    return res.redirect("/?error=server_error");
  }
});

router.get("/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const session = getSession(req.user.id);
  return res.json({
    ...req.user,
    guilds: req.user.guilds || [],
    sessionGuilds: session?.guilds || [],
  });
});

router.post("/logout", (req, res) => {
  if (req.user?.id) {
    clearSession(req.user.id);
  }
  clearAuthCookie(res);
  res.json({ ok: true });
});

module.exports = router;
