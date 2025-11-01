"use strict";
const { COOKIE_NAME, verifySession } = require('../../lib/jwt');

function readAuth(req, _res, next){
  try{
    const tok = req.cookies && req.cookies[COOKIE_NAME];
    if (tok) {
      const dec = verifySession(tok);
      req.user = dec && dec.user ? dec.user : null;
    }
  }catch(_e){ /* ignore */ }
  next();
}
function requireAuth(req, res, next){
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}
module.exports = { readAuth, requireAuth };
