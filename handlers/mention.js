// handlers/mention.js
let attached = false;

function attachMentionHandler(client) {
  if (attached) {
    client.mentionHandlerReady = true;
    return; // already wired
  }

  const onMessage = async (msg) => {
    if (msg.author.bot) return;

    const self = client.user;
    if (!self) return; // client not logged in yet
    if (!msg.mentions.has(self)) return;

    const reSelf = new RegExp(`<@!?${self.id}>`, 'g');
    const text = msg.content.replace(reSelf, '').trim();
    if (/^pingtest\b/i.test(text)) {
      await msg.reply({ content: 'pong — @mention path is live.' });
      return;
    }
    // Minimal echo; your chat flow can replace this.
    await msg.reply({ content: `You said: ${text || '(no text)'}` });
  };

  client.on('messageCreate', onMessage);
  attached = true;
  client.mentionHandlerReady = true;
}

attachMentionHandler.isReady = (client) => {
  if (client && typeof client.mentionHandlerReady !== 'undefined') return Boolean(client.mentionHandlerReady);
  return attached;
};

module.exports = attachMentionHandler;
