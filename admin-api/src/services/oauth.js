"use strict";

const config = require("../config");
const logger = require("../../lib/logger");

const DISCORD_API_BASE = "https://discord.com/api/v10";

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: config.discord.redirectUri,
    response_type: "code",
    scope: config.discord.scopes.join(" "),
    state,
    prompt: "consent",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.discord.redirectUri,
  });

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    logger.warn("[admin-api] Discord token exchange failed", {
      status: response.status,
      text,
    });
    throw new Error("Failed to exchange code with Discord");
  }

  return response.json();
}

async function fetchDiscord(endpoint, accessToken) {
  const response = await fetch(`${DISCORD_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    logger.warn("[admin-api] Discord API request failed", {
      endpoint,
      status: response.status,
      text,
    });
    throw new Error(`Discord API request failed (${response.status})`);
  }

  return response.json();
}

function transformUser(raw) {
  return {
    id: raw.id,
    username: raw.username,
    globalName: raw.global_name || null,
    avatar: raw.avatar || null,
    discriminator: raw.discriminator,
  };
}

function transformGuild(raw) {
  return {
    id: raw.id,
    name: raw.name,
    permissions: raw.permissions, // string bitfield
    owner: Boolean(raw.owner),
  };
}

async function fetchUserProfile(accessToken) {
  const raw = await fetchDiscord("/users/@me", accessToken);
  return transformUser(raw);
}

async function fetchUserGuilds(accessToken) {
  const rawGuilds = await fetchDiscord("/users/@me/guilds", accessToken);
  return rawGuilds.map(transformGuild);
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCode,
  fetchUserProfile,
  fetchUserGuilds,
};
