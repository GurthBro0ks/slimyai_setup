// commands/snail.js
// CommonJS – discord.js v14
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
// lazy-load in execute()

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

function formatValue(value) {
  return value === null || value === undefined ? '???' : Number(value).toLocaleString();
}

function formatStatsBlock(stats = {}) {
  const primary = [
    `HP: ${formatValue(stats.hp)}`,
    `ATK: ${formatValue(stats.atk)}`,
    `DEF: ${formatValue(stats.def)}`,
    `RUSH: ${formatValue(stats.rush)}`
  ];

  const pentagon = [
    `FAME: ${formatValue(stats.fame)}`,
    `TECH: ${formatValue(stats.tech)}`,
    `ART: ${formatValue(stats.art)}`,
    `CIV: ${formatValue(stats.civ)}`,
    `FTH: ${formatValue(stats.fth)}`
  ];

  return `**Primary**\n${primary.join(' \u2022 ')}\n\n**Pentagon**\n${pentagon.join(' \u2022 ')}`;
}

function formatStatsLine(stats = {}) {
  const fields = ['hp', 'atk', 'def', 'rush', 'fame', 'tech', 'art', 'civ', 'fth'];
  return fields
    .map(key => `${key.toUpperCase()}: ${formatValue(stats[key])}`)
    .join(' \u2022 ');
}

function formatConfidenceBlock(confidence, notes) {
  const emoji = {
    high: '✅',
    medium: '⚠️',
    low: '❌'
  }[confidence] || 'ℹ️';

  let text = `${emoji} ${confidence ? confidence.toUpperCase() : 'UNKNOWN'}`;
  if (notes) {
    text += `\nNotes: ${notes}`;
  }
  return text;
}

function formatEquipmentBlock(equipment) {
  if (!equipment) return null;
  const lines = Object.entries(equipment)
    .filter(([, value]) => value)
    .map(([slot, value]) => `• ${slot.toUpperCase()}: ${value}`);
  return lines.length ? lines.join('\n') : null;
}

async function ensureSheetForUser({ userId, username, guildId, guildName }) {
  if (!sheetsCreator.hasCredentials()) {
    return { consent: false, sheetId: null, sheetUrl: null, created: false };
  }

  try {
    const consentRecord = await database.getSheetsConsent(userId, guildId);

    if (!consentRecord.sheets_consent) {
      return { consent: false, sheetId: null, sheetUrl: null, created: false };
    }

    let sheetId = consentRecord.sheet_id;
    let sheetUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : null;
    let created = false;

    if (!sheetId) {
      const sheet = await sheetsCreator.ensureSnailStatsSheet({
        userId,
        username,
        guildId,
        guildName
      });

      sheetId = sheet?.spreadsheetId || null;
      sheetUrl = sheet?.url || (sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : null);

      if (sheetId) {
        created = !sheet?.existed;
        await database.setSheetsConsent(userId, guildId, true, sheetId);
      }
    }

    return { consent: true, sheetId, sheetUrl, created };

  } catch (err) {
    console.error('[snail] Failed to ensure user sheet:', err);
    return { consent: true, sheetId: null, sheetUrl: null, created: false, error: err };
  }
}

function buildAnalysisSummary(analysis) {
  const missing = Object.entries(analysis.stats || {})
    .filter(([, value]) => value === null)
    .map(([key]) => key.toUpperCase());

  const pieces = ['Automated analysis complete.'];
  if (missing.length) {
    pieces.push(`Missing stats: ${missing.join(', ')}.`);
  }
  if (analysis.notes) {
    pieces.push(analysis.notes);
  }

  return pieces.join(' ');
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
    )
    .addSubcommand(sc =>
      sc.setName('analyze')
        .setDescription('Analyze a Super Snail screenshot using GPT-4 Vision')
        .addAttachmentOption(o =>
          o.setName('screenshot')
            .setDescription('Upload a Super Snail stats screenshot')
            .setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName('sheet')
        .setDescription('View saved Super Snail stats from Google Sheets')
        .addUserOption(o =>
          o.setName('user')
            .setDescription('User to view stats for (leave empty for your own stats)')
            .setRequired(false))
        .addIntegerOption(o =>
          o.setName('limit')
            .setDescription('Number of entries to show (default: 5, max: 10)')
            .setRequired(false))
    )
    .addSubcommand(sc =>
      sc.setName('sheet-setup')
        .setDescription('Show instructions for setting up Google Sheets integration')
    ),

  async execute(interaction) {
    // normalized lazy-load of supersnail-costs
    let costs = { levelCostCalc: ()=>0, nodeTimeCostSum: ()=>0 };
    try {
      costs = require("../supersnail-costs");
    } catch (e) { /* stub fallback */ }
    try {
    } catch (e) {
    }
    try {
    } catch (e) {
    }
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
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.options.getSubcommand() === 'analyze') {
        const attachment = interaction.options.getAttachment('screenshot', true);

        if (!attachment.contentType?.startsWith('image/')) {
          return interaction.reply({
            content: '⚠️ Please provide an image file (PNG, JPG, WEBP).',
            ephemeral: true
          });
        }

        await interaction.deferReply();

        try {
          const analysis = await analyzeSnailScreenshot(attachment.url);
          const summary = buildAnalysisSummary(analysis);
          const statsField = formatStatsBlock(analysis.stats || {});
          const confidenceField = formatConfidenceBlock(analysis.confidence, analysis.notes);
          const equipmentField = formatEquipmentBlock(analysis.equipment);

          const userId = interaction.user.id;
          const guildId = interaction.guildId;
          const username = interaction.user.username;
          const guildName = interaction.guild?.name || 'Unknown';

          // Track usage in MCP analytics (non-blocking)
          mcpClient.getUserStats(userId, guildId, '30d')
            .then(() => console.log(`[MCP] Tracked snail analysis for user ${userId}`))
            .catch(err => console.error('[MCP] Analytics tracking failed:', err.message));

          let savedToSheet = false;
          const sheetDetails = await ensureSheetForUser({
            userId,
            username,
            guildId,
            guildName
          });

          if (sheetDetails.error) {
            console.error('[snail] Auto-save disabled due to sheet error:', sheetDetails.error.message);
          }

          let sheetIdForSave = sheetDetails.sheetId;

          const attemptSheetSave = async (spreadsheetId) => {
            await sheetsCreator.saveStats({
              spreadsheetId,
              userId,
              username,
              stats: analysis.stats || {},
              screenshotUrl: attachment.url,
              notes: analysis.notes || ''
            });
            savedToSheet = true;
          };

          if (sheetIdForSave) {
            try {
              await attemptSheetSave(sheetIdForSave);
            } catch (err) {
              const isNotFound = err?.code === 404 || err?.status === 404 || err?.errors?.some(e => e.reason === 'notFound');
              if (isNotFound) {
                console.warn('[snail] Stored sheet missing, creating a new one...');
                try {
                  const recreated = await sheetsCreator.ensureSnailStatsSheet({
                    userId,
                    username,
                    guildId,
                    guildName
                  });
                  const newSheetId = recreated?.spreadsheetId;
                  if (newSheetId && newSheetId !== sheetIdForSave) {
                    sheetIdForSave = newSheetId;
                    await database.setSheetsConsent(userId, guildId, true, newSheetId);
                    sheetDetails.sheetId = newSheetId;
                    sheetDetails.sheetUrl = recreated?.url || `https://docs.google.com/spreadsheets/d/${newSheetId}`;
                    sheetDetails.created = !recreated?.existed;
                    await attemptSheetSave(newSheetId);
                  }
                } catch (createErr) {
                  console.error('[snail] Failed to recreate sheet:', createErr);
                }
              } else {
                console.error('[snail] Failed to auto-save stats:', err.message);
              }
            }
          }

          const statId = await database.saveSnailStat({
            userId,
            guildId,
            username,
            guildName,
            screenshotUrl: attachment.url,
            stats: analysis.stats || {},
            confidence: { level: analysis.confidence, notes: analysis.notes || null },
            analysisText: summary,
            savedToSheet
          });

          const embed = new EmbedBuilder()
            .setTitle('📊 Super Snail Analysis')
            .setDescription(summary)
            .setColor(0x00FF00)
            .setImage(attachment.url)
            .addFields(
              { name: 'Stats', value: statsField, inline: true },
              { name: 'Confidence', value: confidenceField, inline: true }
            );

          if (equipmentField) {
            embed.addFields({ name: 'Equipment', value: equipmentField, inline: false });
          }

          let content = '✅ Screenshot analyzed!';
          const components = [];

          if (savedToSheet) {
            const sheetMessages = [];
            if (sheetDetails.sheetUrl) {
              sheetMessages.push(`📊 Saved to Google Sheet: ${sheetDetails.sheetUrl}`);
            }
            if (sheetDetails.created) {
              sheetMessages.push('🆕 A new sheet was provisioned for you automatically.');
            }
            if (sheetMessages.length) {
              content += `\n\n${sheetMessages.join('\n')}`;
            }
            embed.setFooter({ text: '✅ Auto-saved to your Google Sheet • Analyzed with gpt-4o' });
            await interaction.editReply({ content, embeds: [embed], components });
            return;
          }

          if (sheetsCreator.hasCredentials()) {
            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`enable-sheets-${statId}`)
                .setLabel('📊 Enable Google Sheets Tracking')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎮')
            );
            components.push(row);
          } else {
            content += '\n\n⚙️ Sheets integration is not configured by the bot administrator.';
          }

          const reply = await interaction.editReply({
            content,
            embeds: [embed],
            components
          });

          if (components.length === 0) {
            return;
          }

          const collector = reply.createMessageComponentCollector({
            filter: i => i.customId === `enable-sheets-${statId}` && i.user.id === userId,
            time: 60_000,
            max: 1
          });

          collector.on('collect', async (i) => {
            await i.deferUpdate();

            try {
              const sheet = await sheetsCreator.ensureSnailStatsSheet({
                title: `${guildName} - Super Snail Stats - ${username}`,
                userId,
                username,
                guildId,
                guildName
              });

              await database.setSheetsConsent(userId, guildId, true, sheet.spreadsheetId);

              await sheetsCreator.saveStats({
                spreadsheetId: sheet.spreadsheetId,
                userId,
                username,
                stats: analysis.stats || {},
                screenshotUrl: attachment.url,
                notes: analysis.notes || ''
              });

              await database.markSnailStatSaved(statId);

              embed.setFooter({
                text: '✅ Auto-saved to your new Google Sheet • Analyzed with gpt-4o'
              });

              const provisionNote = sheet.existed ? '📊 **Google Sheets re-enabled!**' : '📊 **Google Sheets enabled!**';
              await i.editReply({
                content: `✅ Screenshot analyzed and saved!\n\n${provisionNote} [View your sheet](${sheet.url})`,
                embeds: [embed],
                components: []
              });
            } catch (err) {
              console.error('[snail] enable sheets error:', err);
              await i.editReply({
                content: `✅ Screenshot analyzed!\n\n❌ Failed to enable sheets: ${err.message}`,
                embeds: [embed],
                components: []
              });
            }
          });

          collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
              await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
            }
          });

        } catch (err) {
          console.error('[snail] vision error:', err);
          await interaction.editReply({
            content: `❌ Analysis failed: ${err.message}`
          });
        }

        return;
      }

      if (interaction.options.getSubcommand() === 'sheet') {
        await interaction.deferReply({ ephemeral: true });

        try {
          const targetUser = interaction.options.getUser('user') || interaction.user;
          const limit = Math.min(interaction.options.getInteger('limit') || 5, 10);
          const entries = await database.getRecentSnailStats(targetUser.id, interaction.guildId, limit);

          if (entries.length === 0) {
            return interaction.editReply({
              content: `📊 No saved stats found for **${targetUser.username}** yet.\n\nUse \`/snail analyze\` to record new data.`
            });
          }

          const embed = new EmbedBuilder()
            .setColor(0x00AE86)
            .setTitle(`🐌 Super Snail Stats - ${targetUser.username}`)
            .setDescription(`Showing ${entries.length} most recent ${entries.length === 1 ? 'entry' : 'entries'}`)
            .setTimestamp();

          entries.forEach(entry => {
            const date = entry.createdAt ? new Date(entry.createdAt) : new Date();
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            embed.addFields({
              name: `📅 ${dateStr}`,
              value: formatStatsLine(entry.stats),
              inline: false
            });
          });

          const sheetsInfo = await database.getSheetsConsent(targetUser.id, interaction.guildId);
          if (sheetsInfo.sheets_consent && sheetsInfo.sheet_id) {
            embed.setFooter({ text: 'Google Sheets connected' });
            return interaction.editReply({
              embeds: [embed],
              content: `📊 Stored in database. Google Sheet: https://docs.google.com/spreadsheets/d/${sheetsInfo.sheet_id}`
            });
          }

          return interaction.editReply({ embeds: [embed] });

        } catch (err) {
          console.error('[snail] Error fetching stats:', err);
          return interaction.editReply({
            content: `❌ Failed to load stats: ${err.message}`
          });
        }
      }

      if (interaction.options.getSubcommand() === 'sheet-setup') {
        return interaction.reply({
          content: '📊 **Sheet Setup**\n\nUse `/consent sheets enable:true` to generate a personal Google Sheet automatically. The bot will create the sheet, share it with the service account, and sync stats from `/snail analyze`. Make sure the bot administrator has configured Google credentials first.',
          ephemeral: true
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
        return interaction.reply({ content: `❌ Invalid values: ${bad.join(', ')}`, flags: MessageFlags.Ephemeral });
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

      return interaction.reply({ content: reply, flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error('[snail] error:', err);
      return interaction.reply({
        content: `❌ Error: ${err.message || err}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
