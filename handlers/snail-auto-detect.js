// handlers/snail-auto-detect.js
const { Events } = require('discord.js');
const { analyzeSnailScreenshot, formatSnailAnalysis } = require('../lib/snail-vision');
const modeHelper = require('../lib/modes');

const COOLDOWN_MS = 10000; // 10 seconds per user
const visionCooldown = new Map();

function attachSnailAutoDetect(client) {
  if (client._snailAutoDetectAttached) return;
  client._snailAutoDetectAttached = true;

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.attachments.size) return;

      // Check if super_snail mode is active in this channel
      const effectiveModes = modeHelper.getEffectiveModesForChannel(message.guild, message.channel);
      if (!effectiveModes.super_snail) return;

      // Check if attachment is an image
      const imageAttachment = message.attachments.find(att =>
        att.contentType?.startsWith('image/')
      );

      if (!imageAttachment) return;

      // Cooldown check
      const key = `${message.guildId || 'dm'}:${message.author.id}`;
      const now = Date.now();
      const last = visionCooldown.get(key) || 0;
      if (now - last < COOLDOWN_MS) {
        return message.reply({
          content: '⏳ Vision analysis cooldown active. Please wait a moment.',
          allowedMentions: { repliedUser: false }
        }).catch(() => {});
      }
      visionCooldown.set(key, now);

      // Auto-analyze
      await message.channel.sendTyping();

      const analysis = await analyzeSnailScreenshot(imageAttachment.url);
      const response = formatSnailAnalysis(analysis);

      await message.reply({
        content: response,
        allowedMentions: { repliedUser: false }
      });

    } catch (err) {
      console.error('Snail auto-detect error:', err);
      const msg = err?.message || 'Failed to analyze screenshot';
      message.reply({
        content: `❌ Vision error: ${msg}`,
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
    }
  });
}

module.exports = { attachSnailAutoDetect };
