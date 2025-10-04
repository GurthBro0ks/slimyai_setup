// handlers/mention.js
const { Events } = require('discord.js');
const mem = require('../lib/memory');
const personaStore = require('../lib/persona');

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

      const persona = personaStore.getPersona();
      const effective = message.guildId
        ? await mem.getEffectiveModes({
            guildId: message.guildId,
            channelId: message.channelId,
            parentId: message.channel?.parentId,
          })
        : { admin: false, personality: false, no_personality: false, super_snail: false };
      const playful = effective.personality && !effective.no_personality;
      const neutral = effective.no_personality;
      const catchphrases =
        persona?.tone_and_voice?.catchphrases || persona?.catchphrases || [];
      const tag = catchphrases.length && playful ? ` ${catchphrases[Math.floor(Math.random() * catchphrases.length)]}` : '';

      if (!clean) {
        return message.reply({
          content: neutral
            ? `You pinged me. Drop a question or use \`/chat\` for longer threads.`
            : `👋 You pinged me? Ask away or use \`/chat\` for deeper dives.${tag}`,
          allowedMentions: { repliedUser: false }
        });
      }

      if (/^pingtest$/i.test(clean)) {
        return message.reply({
          content: neutral
            ? 'pong. If you still do not see replies, run `/diag` and confirm intents/perms.'
            : '🏓 pong! If you still do not see replies, re-run `/diag` and double-check intents/perms.',
          allowedMentions: { repliedUser: false }
        });
      }

      if (/what('?|’)?\s+are\s+you\s+doing\??/i.test(clean)) {
        return message.reply({
          content: neutral
            ? `Currently monitoring the channels and queuing next actions. What do you need?`
            : `Plotting world-saving shenanigans and monitoring snack levels. What’s up?${tag}`,
          allowedMentions: { repliedUser: false }
        });
      }

      return message.reply({
        content: neutral
          ? `You said: “${clean}”. Use \`/chat\` for a fuller response or drop the next detail here.`
          : `You called? You said: “${clean}”. For deeper answers, try \`/chat\` to keep longer threads organized.${tag}`,
        allowedMentions: { repliedUser: false }
      });
    } catch (err) {
      console.error('Mention handler error:', err);
    }
  });
}

module.exports = { attachMentionHandler };
