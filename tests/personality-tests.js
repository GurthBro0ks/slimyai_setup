const test = require('node:test');
const assert = require('node:assert');
const personalityEngine = require('../lib/personality-engine');

personalityEngine.reloadConfig();

test('Tone remains enthusiastic in personality mode', () => {
  const prompt = personalityEngine.buildPersonalityPrompt({
    mode: 'personality',
    rating: 'default',
    userHistory: {
      avgMessageLength: 120,
      technicalTerms: 2,
      emojiCount: 1,
      frustratedTone: false
    }
  });

  assert.ok(prompt.includes('Warm and approachable'), 'Prompt should reference warm tone');
  assert.ok(prompt.includes('PERSONALITY EXPRESSION'), 'Prompt should include personality section');
});

test('Catchphrase overuse detection triggers correctly', () => {
  const userId = 'test-user';
  const sampleResponse = "Let's dive in! Here's the vibe.";

  for (let i = 0; i < 5; i += 1) {
    personalityEngine.trackUsage(userId, 'chat', sampleResponse);
  }

  const usage = personalityEngine.personalityMetrics.catchphraseUsage.get(userId);
  assert.ok(personalityEngine.isOverusingCatchphrases(usage), 'Catchphrase overuse should be flagged');
});

test('Personality and non-personality prompts differ', () => {
  const friendly = personalityEngine.buildPersonalityPrompt({ mode: 'personality', rating: 'default' });
  const technical = personalityEngine.buildPersonalityPrompt({ mode: 'no_personality', rating: 'default' });

  assert.notStrictEqual(friendly, technical, 'Prompts should differ across modes');
  assert.ok(friendly.includes('friendly and enthusiastic'), 'Personality prompt should mention warmth');
  assert.ok(technical.includes('technical/professional mode'), 'Technical prompt should signal professional tone');
});

test('Rating layers adapt for PG-13 and unrated', () => {
  const pg13Prompt = personalityEngine.buildPersonalityPrompt({ mode: 'personality', rating: 'pg13' });
  const unratedPrompt = personalityEngine.buildPersonalityPrompt({ mode: 'personality', rating: 'unrated' });

  assert.ok(pg13Prompt.includes('PG-13'), 'PG-13 prompt should reference rating');
  assert.ok(pg13Prompt.includes('family-friendly'), 'PG-13 prompt should mention family-friendly language');
  assert.ok(unratedPrompt.includes('UNRATED'), 'Unrated prompt should mention relaxed filter');
});

test('User adaptation reacts to brief users', () => {
  const prompt = personalityEngine.buildPersonalityPrompt({
    mode: 'personality',
    rating: 'default',
    userHistory: {
      avgMessageLength: 20,
      technicalTerms: 0,
      emojiCount: 0,
      frustratedTone: false
    }
  });

  assert.ok(prompt.includes('concise responses'), 'Brief users should trigger concise reminder');
});

test('Super Snail personality includes gaming vernacular', () => {
  const prompt = personalityEngine.buildPersonalityPrompt({
    mode: 'super_snail_personality',
    rating: 'default'
  });

  assert.ok(prompt.includes('SUPER SNAIL MODE'), 'Prompt should include snail section');
  assert.ok(prompt.includes('gaming'), 'Prompt should reference gaming tone');
});
