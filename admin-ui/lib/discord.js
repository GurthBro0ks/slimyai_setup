/**
 * Discord bot invite URL builder
 */
export function buildBotInviteUrl({ clientId, scopes, permissions = "0", guildId, lockGuild = false }) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,                 // e.g. "bot applications.commands"
    permissions,                   // string integer
  });
  if (guildId) params.set("guild_id", guildId);
  if (lockGuild) params.set("disable_guild_select", "true");
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
