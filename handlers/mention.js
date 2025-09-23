// handlers/mention.js
// Robust @mention handler for guild text channels.
// - Replies to "@bot pingtest" with "pong"
// - Replies to "@bot <your message>" with an echo-style confirmation
// - Safe against double-firing and bot loops
// - Logs when DEBUG_MENTION=1

const ACTIVE = new Set(); // dedupe per-message

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    try {
      // Ignore bots, system messages, and DMs by default
      if (!message || message.author?.bot) return;
      if (!message.guild) return; // comment this line if you want DMs too

      const me = client.user;
      if (!me) return;

      // Must START with our mention to trigger
      const mentionAtStart = new RegExp(`^<@!?${me.id}>`);
      const raw = (message.content || '').trim();
      if (!mentionAtStart.test(raw)) return;

      // Avoid double-processing the same message id
      if (ACTIVE.has(message.id)) return;
      ACTIVE.add(message.id);
      setTimeout(() => ACTIVE.delete(message.id), 10_000);

      // Extract the text after the mention
      const text = raw.replace(mentionAtStart, '').trim();

      if (process.env.DEBUG_MENTION) {
        console.log('[mention] hit', {
          guild: message.guild?.id,
          channel: message.channel?.id,
          author: message.author?.id,
          text,
        });
      }

      // Quick health check path
      if (/^pingtest$/i.test(text)) {
        await message.reply({
          content: 'pong',
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      // If no text after the mention, nudge the user
      if (!text) {
        await message.reply({
          content: "👋 I'm here. Try: `@slimy.ai pingtest` or `@slimy.ai hi there`",
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      // --- Simple default reply (safe & self-contained) ---
      // You can later swap this block to call your LLM/chat pipeline.
      await message.reply({
        content: `You said: **${text}**\n_(@mention path is live.)_`,
        allowedMentions: { repliedUser: false },
      });
    } catch (err) {
      console.error('[mention] error:', err);
      try {
        await message.reply({
          content: 'squeak? (mention handler errored)',
          allowedMentions: { repliedUser: false },
        });
      } catch {}
    }
  });
  client.mentionHandlerReady = true;
};
