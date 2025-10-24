"use strict";

const express = require("express");

const config = require("../config");
const oauth = require("../services/oauth");
const stateStore = require("../services/state-store");
const { determineRole, filterAllowedGuilds } = require("../services/rbac");
const { createSessionToken, getCookieOptions } = require("../services/token");
const { recordAudit } = require("../services/audit");
const { requireAuth } = require("../middleware/auth");
const { requireCsrf } = require("../middleware/csrf");

const STATE_COOKIE_NAME = process.env.ADMIN_STATE_COOKIE || "slimy_admin_state";

const router = express.Router();

router.get("/login", (_req, res) => {
  if (!config.discord.clientId || !config.discord.clientSecret) {
    return res.status(500).json({ error: "discord-oauth-not-configured" });
  }

  const state = stateStore.createState({});
  const authorizeUrl = oauth.buildAuthorizeUrl(state);

  res.cookie(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 5 * 60,
    path: "/",
  });

  return res.json({ url: authorizeUrl, state });
});

router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(config.ui.failureRedirect);
  }

  if (!code || !state) {
    return res.redirect(config.ui.failureRedirect);
  }

  const storedState = stateStore.consumeState(state);
  const cookieState = req.cookies?.[STATE_COOKIE_NAME];

  res.clearCookie(STATE_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (!storedState || cookieState !== state) {
    return res.redirect(config.ui.failureRedirect);
  }

  try {
    const tokenResponse = await oauth.exchangeCode(code);
    const accessToken = tokenResponse.access_token;

    const [user, guilds] = await Promise.all([
      oauth.fetchUserProfile(accessToken),
      oauth.fetchUserGuilds(accessToken),
    ]);

    const allowedGuilds = filterAllowedGuilds(guilds);
    const role = determineRole(user.id, guilds);

    if (!role || !allowedGuilds.length) {
      return res.redirect(`${config.ui.failureRedirect}?reason=unauthorized`);
    }

    const sanitizedGuilds = allowedGuilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      owner: guild.owner,
      permissions: guild.permissions,
    }));

    const { token, csrfToken, session } = createSessionToken({
      user,
      guilds: sanitizedGuilds,
      role,
    });

    const cookieOptions = getCookieOptions();
    res.cookie(config.jwt.cookieName, token, {
      ...cookieOptions,
    });

    await recordAudit({
      adminId: user.id,
      action: "login",
      payload: { role, guildIds: sanitizedGuilds.map((g) => g.id) },
    });

    // Expose CSRF token via fragment redirect for UI bootstrap
    const redirectUrl = new URL(config.ui.successRedirect);
    redirectUrl.hash = `csrf=${csrfToken}`;

    return res.redirect(redirectUrl.toString());
  } catch (err) {
    await recordAudit({
      adminId: null,
      action: "login-failed",
      payload: { error: err.message },
    });
    return res.redirect(`${config.ui.failureRedirect}?reason=oauth-error`);
  }
});

router.get("/me", requireAuth, (req, res) => {
  const user = req.user;
  return res.json({
    id: user.sub,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    role: user.role,
    guilds: user.guilds || [],
    csrfToken: user.csrfToken,
  });
});

router.post("/logout", requireAuth, requireCsrf, async (req, res) => {
  const cookieOptions = getCookieOptions();
  res.clearCookie(config.jwt.cookieName, cookieOptions);

  await recordAudit({
    adminId: req.user.sub,
    action: "logout",
  });

  return res.status(204).end();
});

module.exports = router;
