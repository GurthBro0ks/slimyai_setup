#!/usr/bin/env node
// setup-multi-server.js - Run setup scripts for a specific server
require("dotenv").config();
const { execSync } = require("child_process");

const TARGET_GUILD_ID = process.argv[2];

if (!TARGET_GUILD_ID) {
  console.error("\n❌ Usage: node setup-multi-server.js <GUILD_ID>");
  console.error("Example: node setup-multi-server.js 1234567890\n");
  process.exit(1);
}

console.log(`\n🎯 Setting up server: ${TARGET_GUILD_ID}\n`);

const setupScripts = [
  "setup_roles_and_structure.js",
  "perms_apply.js",
  "seed_about_channels.js",
  "seed_more_channels.js",
];

for (const script of setupScripts) {
  try {
    console.log(`\n📦 Running ${script}...`);
    execSync(`node ${script}`, {
      stdio: "inherit",
      env: {
        ...process.env,
        GUILD_ID: TARGET_GUILD_ID,
        DISCORD_GUILD_ID: TARGET_GUILD_ID,
      },
    });
    console.log(`✅ ${script} completed`);
  } catch (err) {
    console.error(`❌ ${script} failed`);
  }
}

console.log(`\n✨ Setup complete for server ${TARGET_GUILD_ID}\n`);
