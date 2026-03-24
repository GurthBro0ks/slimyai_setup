// commands/farming.js
// Discord commands for airdrop farming automation
// Calls trading bot API at http://localhost:8510

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const TRADING_BOT_API = process.env.TRADING_BOT_API || 'http://localhost:8510';

// Helper: call trading bot API
async function callFarmingAPI(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const resp = await fetch(`${TRADING_BOT_API}${endpoint}`, options);
        return await resp.json();
    } catch (error) {
        return { status: 'error', message: `API unreachable: ${error.message}` };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('farm')
        .setDescription('Airdrop farming commands')
        .addSubcommand(sub =>
            sub.setName('trigger')
                .setDescription('Trigger a Base farming action')
                .addStringOption(opt =>
                    opt.setName('mode')
                        .setDescription('Run mode')
                        .addChoices(
                            { name: 'Simulation (dry run)', value: 'dry' },
                            { name: 'Live (real gas)', value: 'live' }
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Show farming dashboard with quality score')
        )
        .addSubcommand(sub =>
            sub.setName('log')
                .setDescription('Show recent farming actions')
                .addIntegerOption(opt =>
                    opt.setName('count')
                        .setDescription('Number of entries to show')
                        .setMinValue(1)
                        .setMaxValue(50)
                )
        )
        .addSubcommand(sub =>
            sub.setName('airdrops')
                .setDescription('Show tiered airdrop targets')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'trigger') {
            return this.handleTrigger(interaction);
        } else if (subcommand === 'status') {
            return this.handleStatus(interaction);
        } else if (subcommand === 'log') {
            return this.handleLog(interaction);
        } else if (subcommand === 'airdrops') {
            return this.handleAirdrops(interaction);
        }
    },

    async handleTrigger(interaction) {
        const mode = interaction.options.getString('mode') || 'dry';
        const dryRun = mode === 'dry';

        const modeEmoji = dryRun ? '🧪' : '🚀';
        const modeText = dryRun ? 'SIMULATION' : 'LIVE';

        await interaction.deferReply();

        try {
            const result = await callFarmingAPI('/api/farming/trigger', 'POST', {
                dry_run: dryRun
            });

            if (result.status === 'success') {
                const r = result.report;
                const embed = new EmbedBuilder()
                    .setTitle(`${modeEmoji} Base Farming — ${modeText}`)
                    .setColor(dryRun ? 0x3498db : 0x2ecc71)
                    .addFields(
                        { name: 'Total Actions', value: `${r.total_actions || 0}`, inline: true },
                        { name: 'Weekly Spend', value: `${(r.weekly_spend_usd || 0).toFixed(2)} / ${(r.weekly_budget_usd || 5).toFixed(2)}`, inline: true },
                        { name: 'Quality', value: r.farming_quality || 'N/A', inline: true },
                        { name: 'Protocols Used', value: (r.protocols_used_ever || []).join(', ') || 'None yet', inline: false }
                    )
                    .setFooter({ text: dryRun ? 'Dry run — no real gas spent' : '⚠️ LIVE — real transactions executed' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply(`❌ Farming failed: ${result.message}`);
            }
        } catch (error) {
            await interaction.editReply(`❌ Error: ${error.message}`);
        }
    },

    async handleStatus(interaction) {
        await interaction.deferReply();

        const result = await callFarmingAPI('/api/farming/status');

        if (result.status === 'success') {
            const f = result.farming;

            let description = `**📊 Farming Quality:** ${f.farming_quality || 'N/A'}\n`;
            description += `**🔄 Actions (30d):** ${f.actions_last_30d || 0}\n`;
            description += `**💰 Weekly Spend:** ${(f.weekly_spend_usd || 0).toFixed(2)} / ${(f.weekly_budget_usd || 5).toFixed(2)}\n`;
            description += `**🔗 Protocols (30d):** ${f.unique_protocols_30d || 0}\n`;
            description += `**🪙 Pairs (30d):** ${f.unique_pairs_30d || 0}\n\n`;

            // Airdrop targets
            if (result.airdrops && result.airdrops.length > 0) {
                description += '**🎯 Airdrop Targets:**\n';
                for (const a of result.airdrops) {
                    const emoji = a.tier === 'S' ? '🔥' : a.tier === 'A' ? '✅' : a.tier === 'F' ? '❌' : '❓';
                    description += `${emoji} **${a.protocol}** (${a.token}) — ${a.status} — ${a.est_value}\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🌾 Airdrop Farming Dashboard')
                .setDescription(description)
                .setColor(0x2ecc71)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply(`❌ Status check failed: ${result.message}`);
        }
    },

    async handleLog(interaction) {
        const count = interaction.options.getInteger('count') || 5;
        await interaction.deferReply();

        const result = await callFarmingAPI(`/api/farming/log?n=${count}`);

        if (result.status === 'success' && result.entries.length > 0) {
            let log = '';
            for (const entry of result.entries) {
                const time = new Date(entry.timestamp).toLocaleString();
                const status = entry.status === 'simulated' ? '🧪' : '🚀';
                const amount = entry.amount_usd ? `${entry.amount_usd.toFixed(2)}` : '';
                log += `${status} \`${time}\` — **${entry.type}** on ${entry.protocol} ${amount}\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`📋 Last ${result.entries.length} Farming Actions (${result.total} total)`)
                .setDescription(log)
                .setColor(0x3498db)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply('No farming actions recorded yet.');
        }
    },

    async handleAirdrops(interaction) {
        await interaction.deferReply();

        const result = await callFarmingAPI('/api/farming/airdrop-targets');

        if (result.status === 'success') {
            let tierS = '', tierA = '', tierF = '';

            for (const [key, data] of Object.entries(result.targets)) {
                const line = `**${key}** (${data.token}) — ${data.est_value}\n  _${data.note}_\n`;
                if (data.tier === 'S') tierS += line;
                else if (data.tier === 'A') tierA += line;
                else if (data.tier === 'F') tierF += line;
            }

            const embed = new EmbedBuilder()
                .setTitle('🎯 Airdrop Targets — March 2026')
                .setColor(0xf1c40f)
                .addFields(
                    { name: '🔥 Tier S — CONFIRMED (Farm NOW)', value: tierS || 'None', inline: false },
                    { name: '✅ Tier A — SEASON LIVE', value: tierA || 'None', inline: false },
                    { name: '❌ Tier F — COMPLETED (Stop)', value: tierF || 'None', inline: false }
                )
                .setFooter({ text: 'Status: /farm status | Trigger: /farm trigger' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply(`❌ Failed to fetch targets: ${result.message}`);
        }
    }
};

// Export daily summary function for scheduler
module.exports.postDailySummary = async (channel) => {
    const status = await callFarmingAPI('/api/farming/status');
    if (status.status !== 'success') return;

    const f = status.farming;
    const today = new Date().toLocaleDateString();

    let summary = `**Daily Farming Report — ${today}**\n\n`;
    summary += `📊 Quality: **${f.farming_quality}**\n`;
    summary += `🔄 Actions (30d): **${f.actions_last_30d}**\n`;
    summary += `💰 Weekly: ${(f.weekly_spend_usd || 0).toFixed(2)} / ${(f.weekly_budget_usd || 5).toFixed(2)}\n`;
    summary += `🔗 Protocols: **${f.unique_protocols_30d}** unique\n\n`;

    // Airdrop targets summary
    if (status.airdrops) {
        const active = status.airdrops.filter(a => a.tier !== 'F');
        summary += `🎯 **${active.length} active airdrop targets**\n`;
        for (const a of active) {
            summary += `  ${a.tier === 'S' ? '🔥' : '✅'} ${a.protocol} (${a.token}) — ${a.status}\n`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🌾 Daily Farming Summary')
        .setDescription(summary)
        .setColor(0x2ecc71)
        .setTimestamp();

    await channel.send({ embeds: [embed] });
};