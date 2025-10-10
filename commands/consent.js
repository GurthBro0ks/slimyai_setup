// commands/consent.js - Server-wide consent system (v2.0)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../lib/database');
const sheetsCreator = require('../lib/sheets-creator');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('consent')
    .setDescription('Manage your memory and sheets consent preferences')
    .addSubcommand(sc =>
      sc.setName('status')
        .setDescription('View your current consent settings')
    )
    .addSubcommand(sc =>
      sc.setName('memory')
        .setDescription('Allow or revoke server-wide memory consent')
        .addBooleanOption(o =>
          o.setName('enable')
            .setDescription('Enable or disable memory consent for this server')
            .setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc.setName('sheets')
        .setDescription('Set up Google Sheets auto-save for Super Snail stats')
        .addBooleanOption(o =>
          o.setName('enable')
            .setDescription('Enable or disable Google Sheets integration')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    // Check database configuration
    if (!db.isConfigured()) {
      return interaction.reply({
        content: '❌ Database not configured. Please contact the bot administrator.',
        flags: MessageFlags.Ephemeral
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'status') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        // Get memory consent
        const memoryConsent = await db.getUserConsent(userId);

        // Get sheets consent
        const sheetsData = await db.getSheetsConsent(userId, guildId);

        // Build embed
        const embed = new EmbedBuilder()
          .setColor(memoryConsent ? 0x00FF00 : 0xFF0000)
          .setTitle('📋 Your Consent Settings')
          .setDescription(`Server: **${interaction.guild?.name || 'Unknown'}**`)
          .setTimestamp();

        // Memory consent field
        embed.addFields({
          name: '🧠 Memory Consent',
          value: memoryConsent
            ? '✅ **Enabled** - The bot can save your notes server-wide'
            : '❌ **Disabled** - The bot will not save your notes',
          inline: false
        });

        // Sheets consent field
        const sheetsEnabled = sheetsData.sheets_consent;
        const sheetId = sheetsData.sheet_id;
        embed.addFields({
          name: '📊 Google Sheets Integration',
          value: sheetsEnabled && sheetId
            ? `✅ **Enabled**\n[View Spreadsheet](https://docs.google.com/spreadsheets/d/${sheetId})`
            : '❌ **Disabled** - Super Snail stats are not being saved to sheets',
          inline: false
        });

        embed.setFooter({ text: 'Use /consent memory or /consent sheets to change settings' });

        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === 'memory') {
        const enable = interaction.options.getBoolean('enable', true);
        const userId = interaction.user.id;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        await db.setUserConsent(userId, enable);

        const embed = new EmbedBuilder()
          .setColor(enable ? 0x00FF00 : 0xFF0000)
          .setTitle(enable ? '✅ Memory Enabled' : '🧽 Memory Disabled')
          .setDescription(
            enable
              ? `Your notes will be saved **server-wide** in **${interaction.guild?.name}**.\n\nYou can now use:\n• \`/remember\` to save notes\n• \`/export\` to view saved notes\n• \`/forget\` to delete notes`
              : `Memory has been disabled for **${interaction.guild?.name}**.\n\nNew notes will NOT be saved, but existing notes remain until you delete them with \`/forget all\`.`
          )
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      if (subcommand === 'sheets') {
        const enable = interaction.options.getBoolean('enable', true);
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        if (enable) {
          // Check if Google Sheets is configured
          if (!sheetsCreator.hasCredentials()) {
            return interaction.reply({
              content: '❌ Google Sheets is not configured by the bot administrator.\n\nPlease ask them to set up Google Sheets integration.',
              flags: MessageFlags.Ephemeral
            });
          }

          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          const existingSheets = await db.getSheetsConsent(userId, guildId);

          try {
            const sheetData = await sheetsCreator.ensureSnailStatsSheet({
              title: `${interaction.guild?.name} - Super Snail Stats - ${interaction.user.username}`,
              userId,
              username: interaction.user.username,
              guildId,
              guildName: interaction.guild?.name
            });
            await db.setSheetsConsent(userId, guildId, true, sheetData.spreadsheetId);

            const embed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle(sheetData.existed && existingSheets.sheets_consent ? '✅ Google Sheets Already Enabled' : '✅ Google Sheets Enabled!')
              .setDescription(
                `Your Super Snail stats spreadsheet is ready!\n\n` +
                `📊 [Open Spreadsheet](${sheetData.url})\n\n` +
                `**What happens now?**\n` +
                `• Every time you use \`/snail analyze\`, stats are automatically saved\n` +
                `• Track your progress over time\n` +
                `• View detailed analysis logs\n\n` +
                `**Note:** The spreadsheet is owned by the bot's service account.\n` +
                `Service Account: \`${sheetData.serviceAccountEmail}\``
              )
              .setTimestamp();

            return interaction.editReply({ embeds: [embed] });

          } catch (err) {
            console.error('[consent] Error creating spreadsheet:', err);

            return interaction.editReply({
              content: `❌ Failed to create Google Sheet: ${err.message}\n\nPlease try again or contact the bot administrator.`
            });
          }

        } else {
          // Disable sheets
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          await db.setSheetsConsent(userId, guildId, false, null);

          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('📊 Google Sheets Disabled')
            .setDescription(
              `Google Sheets integration has been disabled for **${interaction.guild?.name}**.\n\n` +
              `Your spreadsheet will remain intact but new stats will not be saved automatically.\n\n` +
              `You can re-enable it anytime with \`/consent sheets enable:true\``
            )
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        }
      }

    } catch (err) {
      console.error('[consent] Error:', err);

      const errorMsg = '❌ An error occurred while updating consent settings. Please try again.';

      if (interaction.deferred) {
        return interaction.editReply({ content: errorMsg });
      } else {
        return interaction.reply({
          content: errorMsg,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};
