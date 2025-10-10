#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { generateImageWithSafety } = require('../lib/images');
const dreamCommand = require('../commands/dream.js');

const OUTPUT_DIR = path.join(process.cwd(), 'test-outputs');
const DEFAULT_PROMPT = 'a friendly frog hero on an adventure';

async function run() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set. Cannot run style tests.');
    process.exit(1);
  }

  const prompt = process.argv[2] || process.env.DREAM_TEST_PROMPT || DEFAULT_PROMPT;
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`🎨 Testing /dream styles with base prompt: "${prompt}"`);
  console.log(`Outputs will be saved to ${OUTPUT_DIR}`);

  for (const [styleKey, style] of Object.entries(dreamCommand.styles)) {
    const enhancedPrompt = style.promptAddition ? `${prompt} ${style.promptAddition}` : prompt;
    console.log(`\n➡️  Style: ${style.name} (${styleKey})`);

    try {
      const result = await generateImageWithSafety({
        prompt: enhancedPrompt,
        originalPrompt: prompt,
        styleName: style.name,
        styleKey,
        dalleStyle: style.dalleStyle,
        rating: 'default',
        userId: 'style-tester'
      });

      if (result.success) {
        const filePath = path.join(OUTPUT_DIR, `dream-${styleKey}.png`);
        fs.writeFileSync(filePath, result.buffer);
        console.log(`   ✅ Saved ${filePath}`);
      } else {
        console.warn(`   ⚠️  ${result.message}`);
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
    }
  }

  console.log('\nAll styles processed.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
