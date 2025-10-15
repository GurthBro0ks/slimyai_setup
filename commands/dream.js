const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getEffectiveModesForChannel } = require('../lib/modes');
const { generateImageWithSafety } = require('../lib/images');
const rateLimiter = require('../lib/rate-limiter');
const metrics = require('../lib/metrics');
const logger = require('../lib/logger');

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
    .setDescription('Generate AI images - bring your dreams to life')
    .addStringOption(o =>
      o.setName('prompt')
        .setDescription('Describe your dream image')
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName('style')
        .setDescription('Art style (standard/poster/neon/photoreal/anime/watercolor/3d-render/pixel/sketch/cinematic)')
        .addChoices(...STYLE_CHOICES)
    ),

  async execute(interaction) {
    const startTime = Date.now();

    // Rate limiting - 10 second cooldown
    const check = rateLimiter.checkCooldown(interaction.user.id, 'dream', 10);
    if (check.limited) {
      metrics.trackCommand('dream', Date.now() - startTime, false);
      return interaction.reply({
        content: `⏳ Slow down! Please wait ${check.remaining}s before generating another image.`,
        flags: MessageFlags.Ephemeral
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      metrics.trackCommand('dream', Date.now() - startTime, false);
      return interaction.reply({
        content: '❌ OPENAI_API_KEY is not configured. Ask an admin to set it first.',
        flags: MessageFlags.Ephemeral
      });
    }

    const prompt = interaction.options.getString('prompt', true);

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
        metrics.trackCommand('dream', Date.now() - startTime, false);
        metrics.trackError('dream_generation', result.message || 'Unknown error');
        logger.error('Dream generation failed', { userId: interaction.user.id, error: result.message });
        return interaction.editReply({ content: result.message || '❌ Image generation failed.' });
      }

      const attachment = new AttachmentBuilder(result.buffer, {
        name: `dream-${styleKey}-${Date.now()}.png`
      });

      metrics.trackCommand('dream', Date.now() - startTime, true);
      return interaction.editReply({
        content: `${style.emoji} **Dream Created!**\n**Style:** ${style.name}\n**Prompt:** ${prompt.trim()}`,
        files: [attachment]
      });
    } catch (err) {
      metrics.trackCommand('dream', Date.now() - startTime, false);
      metrics.trackError('dream_command', err.message);
      logger.error('Dream command failed', { userId: interaction.user.id, error: err.message });
      console.error('[DREAM ERROR] Unexpected failure:', err);
      const message = err?.message ? `❌ Dream creation failed: ${err.message}` : '❌ Dream creation failed.';
      return interaction.editReply({ content: message });
    }
  },
  styles: DREAM_STYLES
};
