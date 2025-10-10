const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getEffectiveModesForChannel } = require('../lib/modes');
const { generateImageWithSafety } = require('../lib/images');

const COOLDOWN_MS = 10000;
const userCooldowns = new Map();

const DREAM_STYLES = {
  standard: {
    name: 'Standard',
    description: 'Clean, natural AI rendering',
    promptAddition: '',
    dalleStyle: 'natural',
    emoji: '✨'
  },
  poster: {
    name: 'Poster Art',
    description: 'Bold colors, graphic design aesthetic',
    promptAddition: 'in the style of a bold graphic design poster with vibrant colors and strong composition',
    dalleStyle: 'vivid',
    emoji: '🎨'
  },
  neon: {
    name: 'Neon Dreams',
    description: 'Cyberpunk, glowing neon aesthetics',
    promptAddition: 'in a cyberpunk style with glowing neon lights, dark backgrounds, and electric colors',
    dalleStyle: 'vivid',
    emoji: '🌟'
  },
  photoreal: {
    name: 'Photo-Real',
    description: 'Photorealistic, ultra-detailed',
    promptAddition: 'as a photorealistic image with ultra-detailed textures, natural lighting, and lifelike quality',
    dalleStyle: 'natural',
    emoji: '📷'
  },
  anime: {
    name: 'Anime',
    description: 'Japanese anime/manga style',
    promptAddition: 'in anime art style with expressive characters, vibrant colors, and dynamic composition typical of Japanese animation',
    dalleStyle: 'vivid',
    emoji: '🎌'
  },
  watercolor: {
    name: 'Watercolor',
    description: 'Soft watercolor painting aesthetic',
    promptAddition: 'as a delicate watercolor painting with soft edges, flowing colors, and artistic brush strokes',
    dalleStyle: 'natural',
    emoji: '🖌️'
  },
  '3d-render': {
    name: '3D Render',
    description: 'Modern 3D CGI rendering',
    promptAddition: 'as a high-quality 3D render with realistic materials, professional lighting, and polished CGI aesthetic',
    dalleStyle: 'vivid',
    emoji: '🎬'
  },
  pixel: {
    name: 'Pixel Art',
    description: 'Retro pixel art / 8-bit style',
    promptAddition: 'in detailed pixel art style with retro 8-bit or 16-bit aesthetic, crisp pixels, and nostalgic gaming vibes',
    dalleStyle: 'vivid',
    emoji: '🕹️'
  },
  sketch: {
    name: 'Pencil Sketch',
    description: 'Hand-drawn pencil sketch',
    promptAddition: 'as a detailed pencil sketch with crosshatching, shading, and artistic hand-drawn quality',
    dalleStyle: 'natural',
    emoji: '✏️'
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Movie poster / dramatic lighting',
    promptAddition: 'with cinematic composition, dramatic lighting, film grain, and Hollywood movie poster aesthetic',
    dalleStyle: 'vivid',
    emoji: '🎥'
  }
};

const STYLE_CHOICES = Object.entries(DREAM_STYLES).map(([value, style]) => ({
  name: style.name,
  value,
}));

function formatCooldownMessage(waitMs) {
  const seconds = Math.ceil(waitMs / 1000);
  return `⏳ Hold up! Try again in ${seconds}s.`;
}

function buildStylesEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🎨 Dream Styles Available')
    .setDescription('Choose from 10 unique artistic styles!')
    .setColor(0x7B68EE)
    .setFooter({ text: 'Try: /dream prompt:"a friendly robot" style:anime' });

  for (const style of Object.values(DREAM_STYLES)) {
    embed.addFields({
      name: `${style.emoji} ${style.name}`,
      value: style.description,
      inline: true
    });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dream')
    .setDescription('Generate images using AI - bring your dreams to life')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Generate an image with AI')
        .addStringOption(o =>
          o.setName('prompt')
            .setDescription('Describe your dream image')
            .setRequired(true)
        )
        .addStringOption(o =>
          o.setName('style')
            .setDescription('Art style for your dream')
            .addChoices(...STYLE_CHOICES)
        )
    )
    .addSubcommand(sub =>
      sub.setName('styles')
        .setDescription('View available dream styles with examples')
    ),

  async execute(interaction) {
    if (!process.env.OPENAI_API_KEY) {
      return interaction.reply({
        content: '❌ OPENAI_API_KEY is not configured. Ask an admin to set it first.',
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand(false);
    if (subcommand === 'styles') {
      return interaction.reply({
        embeds: [buildStylesEmbed()],
        ephemeral: true
      });
    }

    if (subcommand !== 'create') {
      return interaction.reply({
        content: '❓ Unsupported /dream subcommand. Try `/dream create` or `/dream styles`.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const prompt = interaction.options.getString('prompt', true);

    const now = Date.now();
    const lastUse = userCooldowns.get(interaction.user.id) || 0;
    if (now - lastUse < COOLDOWN_MS) {
      const waitMs = COOLDOWN_MS - (now - lastUse);
      return interaction.reply({
        content: formatCooldownMessage(waitMs),
        flags: MessageFlags.Ephemeral
      });
    }
    userCooldowns.set(interaction.user.id, now);

    const styleKey = interaction.options.getString('style') || 'standard';
    const style = DREAM_STYLES[styleKey] || DREAM_STYLES.standard;

    const enhancedPrompt = style.promptAddition
      ? `${prompt.trim()} ${style.promptAddition}`
      : prompt.trim();

    await interaction.deferReply();

    try {
      const effectiveModes =
        getEffectiveModesForChannel?.(interaction.guild, interaction.channel) || {};
      const rating = effectiveModes.rating_unrated
        ? 'unrated'
        : effectiveModes.rating_pg13
        ? 'pg13'
        : 'default';

      const result = await generateImageWithSafety({
        prompt: enhancedPrompt,
        originalPrompt: prompt.trim(),
        styleName: style.name,
        styleKey,
        dalleStyle: style.dalleStyle,
        rating,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      if (!result.success) {
        // Reset cooldown so user can retry if generation failed
        userCooldowns.delete(interaction.user.id);
        return interaction.editReply({ content: result.message || '❌ Image generation failed.' });
      }

      const attachment = new AttachmentBuilder(result.buffer, {
        name: `dream-${styleKey}-${Date.now()}.png`
      });

      return interaction.editReply({
        content: `${style.emoji} **Dream Created!**\n**Style:** ${style.name}\n**Prompt:** ${prompt.trim()}`,
        files: [attachment]
      });
    } catch (err) {
      console.error('[DREAM ERROR] Unexpected failure:', err);
      userCooldowns.delete(interaction.user.id);
      const message = err?.message ? `❌ Dream creation failed: ${err.message}` : '❌ Dream creation failed.';
      return interaction.editReply({ content: message });
    }
  },
  styles: DREAM_STYLES
};
