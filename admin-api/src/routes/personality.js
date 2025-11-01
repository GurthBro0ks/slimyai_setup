"use strict";
const express = require("express");
const { z } = require("zod");
const { requireRole, requireGuildMember, requireAuth } = require("../middleware/auth");
const {
  PRESETS,
  getGuildPersona,
  upsertGuildPersona,
  resetToPreset,
  defaultsFor
} = require("../../lib/guild-personality");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("admin"));

// Get available presets
router.get("/:guildId/personality/presets", (_req, res) => {
  res.json({
    ok: true,
    presets: PRESETS.map(p => ({
      key: p.key,
      label: p.label,
      description: p.description
    }))
  });
});

// Get current personality
router.get("/:guildId/personality", requireGuildMember("guildId"), async (req, res) => {
  const { guildId } = req.params;
  try {
    const persona = await getGuildPersona(guildId);
    return res.json({ ok: true, personality: persona });
  } catch (e) {
    console.error("[personality GET] server_error", { guildId, err: e && e.message });
    return res.status(500).json({
      error: "server_error",
      code: "P_GET",
      hint: "Check database connectivity"
    });
  }
});

const PatchSchema = z.object({
  preset: z.string().optional(),
  system_prompt: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  tone: z.enum(["neutral", "friendly", "playful", "serious"]).optional(),
  formality: z.enum(["casual", "neutral", "formal"]).optional(),
  humor: z.boolean().optional(),
  emojis: z.boolean().optional()
});

// Update personality
router.put("/:guildId/personality", requireGuildMember("guildId"), express.json(), async (req, res) => {
  const { guildId } = req.params;
  try {
    const parsed = PatchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      console.warn("[personality PUT] invalid_input", parsed.error.issues);
      return res.status(400).json({
        error: "invalid_input",
        details: parsed.error.issues
      });
    }
    const updated = await upsertGuildPersona(guildId, parsed.data, req.user?.id);
    return res.json({ ok: true, personality: updated });
  } catch (e) {
    console.error("[personality PUT] server_error", { guildId, err: e && e.message });
    return res.status(500).json({
      error: "server_error",
      code: "P_PUT",
      hint: "Check database access and table schema"
    });
  }
});

// Reset to default or specific preset
router.post("/:guildId/personality/reset", requireGuildMember("guildId"), express.json(), async (req, res) => {
  const { guildId } = req.params;
  const { preset } = req.body || {};

  try {
    const saved = preset
      ? await resetToPreset(guildId, preset, req.user?.id)
      : await upsertGuildPersona(guildId, defaultsFor(guildId), req.user?.id);

    return res.json({ ok: true, personality: saved });
  } catch (e) {
    console.error("[personality RESET] server_error", { guildId, err: e && e.message });
    return res.status(500).json({
      error: "server_error",
      code: "P_RESET"
    });
  }
});

// Test output - generate sample response
router.post("/:guildId/personality/test", requireGuildMember("guildId"), express.json(), async (req, res) => {
  const { guildId } = req.params;
  const { prompt } = req.body || {};

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.json({
        ok: true,
        output: "⚠️ Test output unavailable (OPENAI_API_KEY not configured)",
        note: "Configure OPENAI_API_KEY to enable test generation"
      });
    }

    const persona = await getGuildPersona(guildId);
    const testPrompt = prompt || "What's a fun fact about gaming?";

    // Call OpenAI with personality settings
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: persona.system_prompt },
          { role: "user", content: testPrompt }
        ],
        temperature: Number(persona.temperature) || 0.7,
        top_p: Number(persona.top_p) || 1.0,
        max_tokens: 150
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[personality TEST] OpenAI error:", error);
      return res.status(500).json({
        error: "openai_error",
        details: error
      });
    }

    const data = await response.json();
    const output = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "No response generated";

    return res.json({
      ok: true,
      output,
      prompt: testPrompt,
      settings: {
        temperature: persona.temperature,
        top_p: persona.top_p,
        tone: persona.tone,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini"
      }
    });
  } catch (e) {
    console.error("[personality TEST] error", { guildId, err: e && e.message });
    return res.status(500).json({
      error: "server_error",
      code: "P_TEST",
      hint: e.message
    });
  }
});

module.exports = router;
