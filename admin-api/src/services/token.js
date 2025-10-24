"use strict";

const jwt = require("jsonwebtoken");
const { nanoid } = require("nanoid");

const config = require("../config");

function getCookieOptions() {
  const options = {
    httpOnly: true,
    secure: Boolean(config.jwt.cookieSecure),
    sameSite: config.jwt.cookieSameSite || "lax",
    path: "/",
    maxAge: Number(config.jwt.maxAgeSeconds || 12 * 60 * 60) * 1000,
  };

  if (config.jwt.cookieDomain) {
    options.domain = config.jwt.cookieDomain;
  }

  if (options.sameSite === "none" && !options.secure) {
    // SameSite=None requires Secure; enforce for safety
    options.secure = true;
  }

  return options;
}

function signSession(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

function createSessionToken({ user, guilds, role }) {
  const csrfToken = nanoid(32);
  const session = {
    sub: user.id,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    role,
    guilds,
    csrfToken,
  };

  const token = signSession(session);
  return { token, csrfToken, session };
}

function verifySessionToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  getCookieOptions,
};
