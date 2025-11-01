"use strict";

const fallbackReply =
  "OpenAI integration is not configured yet, but your message was received.";

const MENTION_PROMPT = (guildId) =>
  guildId
    ? `You are Slimy AI, helping guild ${guildId}. Keep replies short and avoid sensitive data.`
    : "You are Slimy AI, a concise assistant for Slimy guilds.";

async function askChatBot({ prompt, guildId }) {
  const text = String(prompt || "").trim();
  if (!text) {
    const error = new Error("missing_prompt");
    error.code = "missing_prompt";
    throw error;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { reply: fallbackReply, usedFallback: true };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: MENTION_PROMPT(guildId) },
        { role: "user", content: text },
      ],
      max_tokens: 180,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error("openai_error");
    error.code = "openai_error";
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  const data = await response.json();
  const reply =
    data?.choices?.[0]?.message?.content?.trim() ||
    "I'm not sure how to reply just yet, but I'm listening.";

  return { reply, usedFallback: false };
}

module.exports = { askChatBot };
