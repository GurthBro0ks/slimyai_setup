// commands/snail.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// pull in your math
const {
  formT5Calc,
  formT6Calc,
  formT7Calc,
  formT8Calc,
} = require('../supersnail-costs.js');

// small helpers
const fmt = (n) => Number(n).toLocaleString();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('snail')
    .setDescription('Supersnail utilities')

    // === TOP ===
    .addSubcommand(sc =>
      sc
        .setName('top')
        .setDescription('Compute resource/time totals from current levels to max')
        .addIntegerOption(o =>
          o.setName('tier')
            .setDescription('Which tier?')
            .addChoices(
              { name: 'T5', value: 5 },
              { name: 'T6', value: 6 },
              { name: 'T7', value: 7 },
              { name: 'T8', value: 8 },
            )
            .setRequired(true)
        )
        // current levels (we’ll compute remaining to max)
        .addIntegerOption(o => o.setName('left1').setDescription('Left-1 node level (0-10)').setMinValue(0).setMaxValue(10))
        .addIntegerOption(o => o.setName('right1').setDescription('Right-1 node level (0-10)').setMinValue(0).setMaxValue(10))
        .addIntegerOption(o => o.setName('left2').setDescription('Left-2 node level (0-10)').setMinValue(0).setMaxValue(10))
        .addIntegerOption(o => o.setName('compass').setDescription('Compass node level').setMinValue(0).setMaxValue(10))
        .addIntegerOption(o => o.setName('right2').setDescription('Right-2 node level (0-10)').setMinValue(0).setMaxValue(10))
        .addIntegerOption(o => o.setName('left3').setDescription('Left-3 node level (0-10)').setMinValue(0).setMaxValue(10))
        .addIntegerOption(o => o.setName('right3').setDescription('Right-3 node level (0-10)').setMinValue(0).setMaxValue(10))
        .addBooleanOption(o => o.setName('ritual_done').setDescription('Has the ritual been done? (default: true)'))
        // timing & modifiers
        .addNumberOption(o => o.setName('time_mod_a').setDescription('Time multiplier A (default: 1.0)'))
        .addIntegerOption(o => o.setName('time_mod_b').setDescription('Flat time reduction (seconds, default: 0)'))
        .addIntegerOption(o => o.setName('flat_time').setDescription('Flat time per level (seconds, default: 0)'))
        .addNumberOption(o => o.setName('btad_mod').setDescription('BTAD multiplier (default: 1.0)'))
        .addNumberOption(o => o.setName('cell_mod').setDescription('Cell multiplier (default: 1.0)'))
        .addBooleanOption(o => o.setName('dragon').setDescription('Show per-dragon cell costs (default: false)'))
        .addBooleanOption(o => o.setName('ephemeral').setDescription('Reply privately (default: true)'))
    )

    // === ALIVE ===
    .addSubcommand(sc =>
      sc
        .setName('alive')
        .setDescription('Health check')
        .addBooleanOption(o =>
          o.setName('ephemeral').setDescription('Reply privately (default: true)')
        )
    )

    // === SUM ===
    .addSubcommand(sc =>
      sc
        .setName('sum')
        .setDescription('Add two numbers')
        .addNumberOption(o => o.setName('a').setDescription('First number').setRequired(true))
        .addNumberOption(o => o.setName('b').setDescription('Second number').setRequired(true))
        .addBooleanOption(o => o.setName('ephemeral').setDescription('Reply privately (default: true)'))
    )

    // === ECHO ===
    .addSubcommand(sc =>
      sc
        .setName('echo')
        .setDescription('Echo back some text')
        .addStringOption(o => o.setName('text').setDescription('What should I say?').setRequired(true))
        .addBooleanOption(o => o.setName('ephemeral').setDescription('Reply privately (default: true)'))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;

    try {
      if (sub === 'top') {
        await interaction.deferReply({ ephemeral });

        // inputs with sane defaults
        const tier = interaction.options.getInteger('tier', true);
        const left1   = clamp(interaction.options.getInteger('left1')   ?? 0, 0, 10);
        const right1  = clamp(interaction.options.getInteger('right1')  ?? 0, 0, 10);
        const left2   = clamp(interaction.options.getInteger('left2')   ?? 0, 0, 10);
        const compass = clamp(interaction.options.getInteger('compass') ?? 0, 0, 10);
        const right2  = clamp(interaction.options.getInteger('right2')  ?? 0, 0, 10);
        const left3   = clamp(interaction.options.getInteger('left3')   ?? 0, 0, 10);
        const right3  = clamp(interaction.options.getInteger('right3')  ?? 0, 0, 10);

        // ritual: your calc treats 0 as “needs the ritual cost”, >0 as already done
        const ritualDone = interaction.options.getBoolean('ritual_done') ?? true;
        const ritualLv = ritualDone ? 1 : 0;

        // timing / multipliers (defaults match your functions’ expectations)
        const timeModA = interaction.options.getNumber('time_mod_a') ?? 1.0;
        const timeModB = interaction.options.getInteger('time_mod_b') ?? 0; // seconds
        const flatTime = interaction.options.getInteger('flat_time') ?? 0;   // seconds
        const btadMod  = interaction.options.getNumber('btad_mod') ?? 1.0;
        const cellMod  = interaction.options.getNumber('cell_mod') ?? 1.0;
        const dragon   = interaction.options.getBoolean('dragon') ?? false;

        // dispatch to the right tier calc
        let out;
        if (tier === 5) {
          out = formT5Calc(left1, right1, left2, compass, right2, left3, right3,
                           ritualLv, timeModA, timeModB, flatTime, btadMod, cellMod, dragon);
        } else if (tier === 6) {
          out = formT6Calc(left1, right1, left2, compass, right2, left3, right3,
                           ritualLv, timeModA, timeModB, flatTime, btadMod, cellMod, dragon);
        } else if (tier === 7) {
          out = formT7Calc(left1, right1, left2, compass, right2, left3, right3,
                           ritualLv, timeModA, timeModB, flatTime, btadMod, cellMod, dragon);
        } else if (tier === 8) {
          out = formT8Calc(left1, right1, left2, compass, right2, left3, right3,
                           ritualLv, timeModA, timeModB, flatTime, btadMod, cellMod, dragon);
        } else {
          throw new Error('Unsupported tier');
        }

        // format output
        let description;
        if (dragon) {
          // [zombie, demon, angel, mutant, mecha, btads, hours]
          const [z, d, a, m, me, bt, hrs] = out;
          description =
            `**From current → max (T${tier})**\n` +
            `• 🧟 Zombie Cells: \`${fmt(z)}\`\n` +
            `• 😈 Demon Cells:  \`${fmt(d)}\`\n` +
            `• 😇 Angel Cells:  \`${fmt(a)}\`\n` +
            `• 🧬 Mutant Cells: \`${fmt(m)}\`\n` +
            `• 🤖 Mecha Cells:  \`${fmt(me)}\`\n` +
            `• 🔷 BTADs:        \`${fmt(bt)}\`\n` +
            `• ⏱️ Hours:         \`${fmt(hrs)}\``;
        } else {
          // [formCells, btads, hours]
          const [cells, bt, hrs] = out;
          description =
            `**From current → max (T${tier})**\n` +
            `• 🧪 Form Cells: \`${fmt(cells)}\`\n` +
            `• 🔷 BTADs:      \`${fmt(bt)}\`\n` +
            `• ⏱️ Hours:       \`${fmt(hrs)}\``;
        }

        const embed = new EmbedBuilder()
          .setTitle(`🐌 Supersnail — T${tier} totals`)
          .setDescription(description)
          .addFields(
            { name: 'Levels',
              value:
                `L1 **${left1}**, R1 **${right1}**, L2 **${left2}**, ` +
                `Compass **${compass}**, R2 **${right2}**, L3 **${left3}**, R3 **${right3}**` },
            { name: 'Flags', value: `Ritual ${ritualDone ? '✅ done' : '❌ pending'} · Dragon mode ${dragon ? '✅' : '❌'}` },
            { name: 'Modifiers',
              value: `timeA=${timeModA} · timeB=${timeModB}s · flat=${flatTime}s · btad×${btadMod} · cell×${cellMod}` }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (sub === 'alive') {
        const mem = process.memoryUsage();
        const mb = (n) => (n / 1024 / 1024).toFixed(1);
        const s = Math.floor(process.uptime());
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        await interaction.reply({
          ephemeral,
          content:
            `🐌 I live!\n` +
            `• Node: \`${process.version}\`\n` +
            `• Uptime: \`${h}h ${m}m ${sec}s\`\n` +
            `• Memory: rss=${mb(mem.rss)}MB heapUsed=${mb(mem.heapUsed)}MB\n` +
            `• PM2 id: \`${process.env.pm_id ?? 'n/a'}\`\n` +
            `• Time: \`${new Date().toLocaleString()}\``,
        });
        return;
      }

      if (sub === 'sum') {
        const a = interaction.options.getNumber('a', true);
        const b = interaction.options.getNumber('b', true);
        await interaction.reply({ ephemeral, content: `🧮 ${a} + ${b} = **${a + b}**` });
        return;
      }

      if (sub === 'echo') {
        const text = interaction.options.getString('text', true);
        const safe = text.replace(/@everyone|@here/g, '@\u200beveryone');
        await interaction.reply({ ephemeral, content: `🗣️ ${safe}` });
        return;
      }

      await interaction.reply({ ephemeral: true, content: 'Unknown subcommand.' });
    } catch (err) {
      console.error('snail command error:', err);
      const msg = '⚠️ Error while processing command.';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: msg }).catch(() => {});
      } else {
        await interaction.reply({ ephemeral: true, content: msg }).catch(() => {});
      }
    }
  },
};

