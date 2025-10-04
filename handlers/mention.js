// handlers/mention.js
const { Events } = require('discord.js');

const COOLDOWN_MS = 5000;
const mentionCooldown = new Map(); // key = `${guildId}:${userId}` -> ts

function attachMentionHandler(client) {
  if (client._mentionHandlerAttached) return;
  client._mentionHandlerAttached = true;

  const markReady = () => { client.mentionHandlerReady = true; };
  client.mentionHandlerReady = false;
  if (client.isReady?.()) {
    markReady();
  } else {
    client.once(Events.ClientReady, markReady);
  }

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!client.user) return;
      if (message.author.bot) return;

      // was the bot mentioned?
      if (!message.mentions.users.has(client.user.id)) return;

      // cooldown per user per guild/dm
      const key = `${message.guildId || 'dm'}:${message.author.id}`;
      const now = Date.now();
      const last = mentionCooldown.get(key) || 0;
      if (now - last < COOLDOWN_MS) return;
      mentionCooldown.set(key, now);

      // strip the mention(s)
      const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
      const clean = (message.content || '').replace(mentionRegex, '').trim();

      if (!clean) {
        return message.reply({
          content: `👋 You pinged me? Ask away or use \`/chat\`. Example: “<@${client.user.id}> what are you doing?”`,
          allowedMentions: { repliedUser: false }
        });
      }

      if (/^pingtest$/i.test(clean)) {
        return message.reply({
          content: '🏓 pong! If you still do not see replies, re-run `/diag` and double-check intents/perms.',
          allowedMentions: { repliedUser: false }
        });
      }

      if (/what('?|’)?\s+are\s+you\s+doing\??/i.test(clean)) {
        return message.reply({
          content: `Plotting world-saving shenanigans and monitoring snack levels. What’s up?`,
          allowedMentions: { repliedUser: false }
        });
      }

      return message.reply({
        content: `You called? You said: “${clean}”. For deeper answers, try \`/chat\` to keep longer threads organized.`,
        allowedMentions: { repliedUser: false }
      });
    } catch (err) {
      console.error('Mention handler error:', err);
    }
  });
}

module.exports = { attachMentionHandler };
