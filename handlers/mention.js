// handlers/mention.js
const { Events } = require('discord.js');
const chat = require('../commands/chat');
const { maybeReplyWithImage } = require('../lib/auto-image');

const COOLDOWN_MS = 5000;
const mentionCooldown = new Map(); // key = `${guildId}:${userId}` -> ts

function attachMentionHandler(client) {
  if (client._mentionHandlerAttached) return;
  client._mentionHandlerAttached = true;

  const markReady = () => {
    client.mentionHandlerReady = true;
  };
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
          content: '👋 Drop a message or question with your mention so I can help.',
          allowedMentions: { repliedUser: false },
        });
      }

      if (!process.env.OPENAI_API_KEY) {
        return message.reply({
          content: '❌ OPENAI_API_KEY not set.',
          allowedMentions: { repliedUser: false },
        });
      }

      const parentId = message.channel?.parentId || message.channel?.parent?.id;
      const effectiveModes = chat.getEffectiveModesForChannel(message.guild, message.channel);
      
      // FIX: Use the new mode keys
      const rating = effectiveModes.unrated
        ? 'unrated'
        : effectiveModes.rated
        ? 'rated'
        : 'default';

      const handledImage = await maybeReplyWithImage({ message, prompt: clean, rating });
      if (handledImage) return;

      const result = await chat.runConversation({
        userId: message.author.id,
        channelId: message.channelId,
        guildId: message.guildId || undefined,
        parentId,
        userMsg: clean,
        context: 'mention',
        effectiveOverride: effectiveModes,
      });

      return message.reply({
        content: result.response,
        allowedMentions: { repliedUser: false },
      });
    } catch (err) {
      console.error('Mention handler error:', err);
      const msg = err?.response?.data?.error?.message || err.message || String(err);
      return message
        .reply({
          content: `❌ OpenAI error: ${msg}`,
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    }
  });
}

module.exports = { attachMentionHandler };
