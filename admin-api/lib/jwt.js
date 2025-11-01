"use strict";
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'slimy_admin';
const MAX_AGE_SEC = 60 * 60 * 12; // 12h
const DEFAULT_DOMAIN = process.env.COOKIE_DOMAIN || '.slimyai.xyz';

function key() {
  return process.env.SESSION_SECRET || 'dev-secret-change-me';
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
  console.log('[jwt] Setting cookie:', COOKIE_NAME, 'with options:', JSON.stringify(cookieOptions));
  console.log('[jwt] Token length:', token ? token.length : 0);
  res.cookie(COOKIE_NAME, token, cookieOptions);
  console.log('[jwt] Cookie set successfully');
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
