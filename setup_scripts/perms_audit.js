require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = require('discord.js');
const P = PermissionsBitField.Flags;

const WANT = {
  team_corner: { view: ['verified_exe'], send: ['verified_exe','testers.txt','coder.js','math_expert.7z','snail_team.iso'], denySend:['observers.zip'] },
  bot_lab:     { view: ['verified_exe'], create:['testers.txt','coder.js'], denySend:['observers.zip'] },
  testing_grounds: { view:['verified_exe'], create:['testers.txt','coder.js'], denySend:['observers.zip'] },
  dev_ops:     { view:['verified_exe'], send:['coder.js'] },
  about_slimyai:{ view:['verified_exe'], send:[], builders:['coder.js'] },
  snail_lab:   { view:['math_expert.7z','snail_team.iso','coder.js'], denyView:['verified_exe'] },
  chat:        { view:['verified_exe'], send:['verified_exe','testers.txt','coder.js','math_expert.7z','snail_team.iso'], denySend:['observers.zip'] }
};

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.channels.fetch(); await guild.roles.fetch();
  const roles = new Map(guild.roles.cache.map(r=>[r.name,r]));

  function ok(cond, msg) { console.log(cond ? `✅ ${msg}` : `❌ ${msg}`); }

  for (const [catName, want] of Object.entries(WANT)) {
    const cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === catName);
    if (!cat) { console.log(`⚠️ missing category: ${catName}`); continue; }

    console.log(`\n=== ${catName} ===`);
    const check = (roleName, perms) => {
      const r = roles.get(roleName); if (!r) return ok(false, `role missing: ${roleName}`);
      const p = cat.permissionsFor(r);
      return ok(perms.every(f => p?.has(f)), `${roleName} has ${perms.map(x=>Object.keys(PermissionsBitField.Flags).find(k=>PermissionsBitField.Flags[k]===x)).join('+')}`);
    };

    // view expectations
    (want.view || []).forEach(rn => check(rn, [P.ViewChannel]));
    // deny view
    (want.denyView || []).forEach(rn => {
      const r = roles.get(rn); const p = cat.permissionsFor(r);
      ok(p && !p.has(P.ViewChannel), `${rn} does NOT see`);
    });
    // send
    (want.send || []).forEach(rn => check(rn, [P.SendMessages]));
    (want.denySend || []).forEach(rn => {
      const r = roles.get(rn); const p = cat.permissionsFor(r);
      ok(p && !p.has(P.SendMessages), `${rn} cannot send`);
    });
    // create (forums)
    (want.create || []).forEach(rn => check(rn, [P.CreatePublicThreads]));
  }

  // spot-check forums exist
  const forums = ['bug_tracker_forum_exe','feature_requests_forum_exe','snail_math_den_forum_exe','snail_analysis_forum_exe','phase1_forum_exe','phase2_forum_exe','phase3_forum_exe','phase4_forum_exe'];
  console.log('\nForums present:');
  for (const f of forums) {
    const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildForum && c.name === f);
    ok(!!ch, f);
  }

  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
