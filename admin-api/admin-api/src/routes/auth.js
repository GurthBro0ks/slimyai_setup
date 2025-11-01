"use strict";
const express = require("express");
const crypto  = require("crypto");
const { signSession, setAuthCookie, clearAuthCookie } = require("../../lib/jwt");

const router = express.Router();

const DISCORD = { API:"https://discord.com/api/v10", TOKEN_URL:"https://discord.com/api/oauth2/token" };
function env(n){ const v = process.env[n]; if(!v) throw new Error("Missing env "+n); return v; }
const CLIENT_ID     = env("DISCORD_CLIENT_ID");            // OAuth app (slimy.ai admin)
const CLIENT_SECRET = env("DISCORD_CLIENT_SECRET");
const REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI || "https://admin.slimyai.xyz/api/auth/callback";
const SCOPES        = "identify guilds";

function issueState(res){
  const state = crypto.randomBytes(16).toString("base64url");
  res.cookie("oauth_state", state, {
    httpOnly:true, secure:true, sameSite:"lax",
    domain:(process.env.COOKIE_DOMAIN||".slimyai.xyz"), path:"/",
    maxAge:5*60*1000
  });
  return state;
}

router.get("/login", (req,res)=>{
  const state = issueState(res);
  const p = new URLSearchParams({
    client_id:CLIENT_ID, redirect_uri:REDIRECT_URI,
    response_type:"code", scope:SCOPES, state, prompt:"consent"
  });
  const url = `https://discord.com/oauth2/authorize?${p.toString()}`;
  const accept = String(req.headers.accept||'');
  if (accept.includes('text/html') || 'redirect' in req.query) return res.redirect(url);
  return res.json({ url, state });
});

router.get("/callback", async (req,res)=>{
  try{
    const { code, state } = req.query;
    const saved = req.cookies && req.cookies.oauth_state;
    if(!code || !state || !saved || state !== saved) return res.redirect("/?error=state_mismatch");

    const body = new URLSearchParams({
      client_id:CLIENT_ID, client_secret:CLIENT_SECRET,
      grant_type:"authorization_code", code:String(code), redirect_uri:REDIRECT_URI
    });
    const tk = await fetch(DISCORD.TOKEN_URL, { method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" }, body });
    if(!tk.ok) return res.redirect("/?error=token_exchange_failed");
    const tokens = await tk.json();

    const me     = await fetch(`${DISCORD.API}/users/@me`,        { headers:{ Authorization:`Bearer ${tokens.access_token}` } }).then(r=>r.json());
    const guilds = await fetch(`${DISCORD.API}/users/@me/guilds`, { headers:{ Authorization:`Bearer ${tokens.access_token}` } }).then(r=>r.json());

    const user = {
      id: me.id, username: me.username, globalName: me.global_name || me.username, avatar: me.avatar || null,
      guilds: Array.isArray(guilds) ? guilds.map(g=>({ id:g.id, name:g.name, icon:g.icon, owner:g.owner, permissions:g.permissions })) : []
    };

    const token = signSession({ user });
    setAuthCookie(res, token);
    res.clearCookie("oauth_state", { httpOnly:true, secure:true, sameSite:"lax", domain:(process.env.COOKIE_DOMAIN||".slimyai.xyz"), path:"/" });

    return res.redirect("/guilds");
  }catch(err){
    console.error("[auth/callback]", err);
    return res.redirect("/?error=server_error");
  }
});

router.get("/me", (req,res)=>{ if(!req.user) return res.status(401).json({error:"unauthorized"}); res.json(req.user); });
router.post("/logout", (req,res)=>{ clearAuthCookie(res); res.json({ ok:true }); });

module.exports = router;
