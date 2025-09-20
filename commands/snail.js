// commands/snail.js
// CommonJS – discord.js v14
const { SlashCommandBuilder } = require('discord.js');
const costs = require('../supersnail-costs.js');

// Small helper to pick the right tier function
function pickCalc(tier) {
  if (tier === 5) return costs.formT5Calc;
  if (tier === 6) return costs.formT6Calc;
  if (tier === 7) return costs.formT7Calc;
  if (tier === 8) return costs.formT8Calc;
  throw new Error('Tier must be 5, 6, 7, or 8');
}

// Parse comma list: "l1,r1,l2,compass,r2,l3,r3,ritual"
function parseLevels(csv) {
  const parts = csv.split(',').map(s => Number(String(s).trim()));
  if (parts.length !== 8 || parts.some(n => Number.isNaN(n))) {
    throw new Error('Levels must be 8 comma-separated numbers: l1,r1,l2,compass,r2,l3,r3,ritual');
  }
  const [l1, r1, l2, compass, r2, l3, r3, ritual] = parts;
  return { l1, r1, l2, compass, r2, l3, r3, ritual };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snail')
    .setDescription('Supersnail costs calculator (T5–T8)')
    .addSubcommand(sc =>
      sc.setName('test')
        .setDescription('Run a quick test example to verify the command is wired'))
    .addSubcommand(sc =>
      sc.setName('calc')
        .setDescription('Calculate costs from your levels')
        .addIntegerOption(o =>
          o.setName('tier')
            .setDescription('Tier 5–8')
            .setRequired(true)
            .addChoices(
              { name: 'T5', value: 5 },
              { name: 'T6', value: 6 },
              { name: 'T7', value: 7 },
              { name: 'T8', value: 8 },
            ))
        .addStringOption(o =>
          o.setName('levels')
            .setDescription('l1,r1,l2,compass,r2,l3,r3,ritual (e.g. "3,3,2,0,0,0,0,1")')
            .setRequired(true))
        .addNumberOption(o =>
          o.setName('timemoda').setDescription('Time mod A (default 1)').setRequired(false))
        .addNumberOption(o =>
          o.setName('timemodb').setDescription('Time mod B (seconds; default 0)').setRequired(false))
        .addNumberOption(o =>
          o.setName('flattime').setDescription('Flat time (minutes; default 0)').setRequired(false))
        .addNumberOption(o =>
          o.setName('btadmod').setDescription('BTAD multiplier (default 1)').setRequired(false))
        .addNumberOption(o =>
          o.setName('cellmod').setDescription('Cell multiplier (default 1)').setRequired(false))
        .addBooleanOption(o =>
          o.setName('dragon')
            .setDescription('If true, show per-species cells + BTADs + hours')
            .setRequired(false))
    ),

  async execute(interaction) {
    try {
      if (interaction.options.getSubcommand() === 'test') {
        // A simple, known-good T6 example:
        // l1=3, r1=3, l2=2, compass=0, r2=0, l3=0, r3=0, ritual=1
        const result = costs.formT6Calc(3, 3, 2, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, false);
        // result (non-dragon) is [formCells, btads, hours]
        const [formCells, btads, hours] = result;
        return interaction.reply({
          content:
            `✅ **/snail test**\n` +
            `**Tier:** 6\n` +
            `**Form Cells:** ${formCells.toLocaleString()}\n` +
            `**BTADs:** ${btads.toLocaleString()}\n` +
            `**Hours:** ${hours.toLocaleString()}`,
          ephemeral: true,
        });
      }

      // calc subcommand
      const tier = interaction.options.getInteger('tier', true);
      const csv = interaction.options.getString('levels', true);
      const dragon = interaction.options.getBoolean('dragon') ?? false;

      const timeModA = interaction.options.getNumber('timemoda') ?? 1;
      const timeModB = interaction.options.getNumber('timemodb') ?? 0;   // seconds
      const flatTime = interaction.options.getNumber('flattime') ?? 0;   // minutes
      const btadMod  = interaction.options.getNumber('btadmod')  ?? 1;
      const cellMod  = interaction.options.getNumber('cellmod')  ?? 1;

      const { l1, r1, l2, compass, r2, l3, r3, ritual } = parseLevels(csv);

      // Basic range checks
      const bad = [];
      const in01 = (n, max) => (n >= 0 && n <= max);
      if (!in01(l1, 10)) bad.push('l1');
      if (!in01(r1, 10)) bad.push('r1');
      if (!in01(l2, 10)) bad.push('l2');
      // Compass top differs by tier: T5/6 max 3, T7/8 max 5
      const compassMax = (tier <= 6) ? 3 : 5;
      if (!in01(compass, compassMax)) bad.push(`compass(0-${compassMax})`);
      if (!in01(r2, 10)) bad.push('r2');
      if (!in01(l3, 10)) bad.push('l3');
      if (!in01(r3, 10)) bad.push('r3');
      if (!in01(ritual, 1)) bad.push('ritual(0-1)');
      if (bad.length) {
        return interaction.reply({ content: `❌ Invalid values: ${bad.join(', ')}`, ephemeral: true });
      }

      const calc = pickCalc(tier);
      const res = calc(
        l1, r1, l2, compass, r2, l3, r3, ritual,
        timeModA, timeModB, flatTime,
        btadMod, cellMod, dragon
      );

      // Format output
      let reply;
      if (dragon) {
        // [zombie, demon, angel, mutant, mecha, btads, hours]
        const [z, d, a, m, me, bt, hrs] = res;
        reply =
          `🧮 **Supersnail T${tier} (dragon mode)**\n` +
          `• **Zombie Cells:** ${z.toLocaleString()}\n` +
          `• **Demon Cells:** ${d.toLocaleString()}\n` +
          `• **Angel Cells:** ${a.toLocaleString()}\n` +
          `• **Mutant Cells:** ${m.toLocaleString()}\n` +
          `• **Mecha Cells:** ${me.toLocaleString()}\n` +
          `• **BTADs:** ${bt.toLocaleString()}\n` +
          `• **Hours:** ${hrs.toLocaleString()}`;
      } else {
        // [formCells, btads, hours]
        const [formCells, btads, hours] = res;
        reply =
          `🧮 **Supersnail T${tier}**\n` +
          `• **Form Cells:** ${formCells.toLocaleString()}\n` +
          `• **BTADs:** ${btads.toLocaleString()}\n` +
          `• **Hours:** ${hours.toLocaleString()}`;
      }

      return interaction.reply({ content: reply, ephemeral: true });
    } catch (err) {
      console.error('[snail] error:', err);
      return interaction.reply({
        content: `❌ Error: ${err.message || err}`,
        ephemeral: true,
      });
    }
  },
};
