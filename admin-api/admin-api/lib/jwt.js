"use strict";
const jwt = require('jsonwebtoken');
const COOKIE_NAME = 'slimy_admin';
const MAX_AGE_SEC = 60*60*12;
function key(){ return process.env.SESSION_SECRET || 'dev-secret-change-me'; }
function signSession(payload){ return jwt.sign(payload, key(), { algorithm:'HS256', expiresIn: MAX_AGE_SEC }); }
function verifySession(tok){ return jwt.verify(tok, key(), { algorithms:['HS256'] }); }
function setAuthCookie(res, token){
  const domain = process.env.COOKIE_DOMAIN || '.slimyai.xyz'; // or 'admin.slimyai.xyz'
  res.cookie(COOKIE_NAME, token, { httpOnly:true, secure:true, sameSite:'lax', domain, path:'/', maxAge:MAX_AGE_SEC*1000 });
}
function clearAuthCookie(res){
  const domain = process.env.COOKIE_DOMAIN || '.slimyai.xyz';
  res.clearCookie(COOKIE_NAME, { httpOnly:true, secure:true, sameSite:'lax', domain, path:'/' });
}
module.exports = { COOKIE_NAME, signSession, verifySession, setAuthCookie, clearAuthCookie };
