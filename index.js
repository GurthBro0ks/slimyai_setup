// index.js (smoke test)
require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.login(process.env.DISCORD_TOKEN);

