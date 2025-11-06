"use strict";
const jwt = require('jsonwebtoken');
const config = require('../src/lib/config');

const COOKIE_NAME = config.session.cookieName;
const MAX_AGE_SEC = config.session.maxAgeSec;
const DEFAULT_DOMAIN = config.session.cookieDomain;

function key() {
  const secret = config.session.secret;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is required for security');
  }
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long');
  }
  return secret;
}

function signSession(payload) {
  return jwt.sign(payload, key(), { algorithm: 'HS256', expiresIn: MAX_AGE_SEC });
}

function verifySession(token) {
  return jwt.verify(token, key(), { algorithms: ['HS256'] });
}

function setAuthCookie(res, token) {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: DEFAULT_DOMAIN,
    path: '/',
    maxAge: MAX_AGE_SEC * 1000,
  };

  // Security: Don't log sensitive token information
  res.cookie(COOKIE_NAME, token, cookieOptions);
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    domain: DEFAULT_DOMAIN,
    path: '/',
  });
}

module.exports = {
  COOKIE_NAME,
  signSession,
  verifySession,
  setAuthCookie,
  clearAuthCookie,
};
