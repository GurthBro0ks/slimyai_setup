"use strict";
const express = require("express");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();
router.use(requireAuth);

router.get("/", async (req,res)=>{
  try{
    const userGuilds = (req.user && req.user.guilds) || [];
    if(!userGuilds.length) return res.json({ guilds: [] });
    const botToken = process.env.DISCORD_BOT_TOKEN;  // the bot (slimy.ai) token
    if(!botToken){
      return res.json({
        guilds: userGuilds.map(g=>({ id:g.id, name:g.name, icon:g.icon, owner:g.owner, permissions:g.permissions, installed:false })),
        note:"bot_token_missing"
      });
    }
    const API = "https://discord.com/api/v10";
    const out = [];
    for (const g of userGuilds){
      try{
        const r = await fetch(`${API}/guilds/${g.id}`, { headers:{ Authorization:`Bot ${botToken}`, "User-Agent":"slimy-admin (guild-check)" }});
        out.push({ id:g.id, name:g.name, icon:g.icon, owner:g.owner, permissions:g.permissions, installed:r.ok });
      }catch{
        out.push({ id:g.id, name:g.name, icon:g.icon, owner:g.owner, permissions:g.permissions, installed:false });
      }
    }
    res.json({ guilds: out });
  }catch(e){ console.error("[guilds]", e); res.status(500).json({ error:"server_error" }); }
});
module.exports = router;
