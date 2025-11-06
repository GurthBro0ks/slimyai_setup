const fs = require("fs");
const path = require("path");
const database = require("./database");
const personalityStore = require("./personality-store");

class PersonalityEngine {
  constructor() {
    this.configPath = path.join(__dirname, "..", "bot-personality.md");
    this.cacheTtl = 60_000;
    this.configCache = null;
    this.lastLoadedAt = 0;

    this.conversationContext = new Map();
    this.personalityMetrics = {
      catchphraseUsage: new Map(),
      toneConsistency: new Map(),
      userSatisfaction: new Map(),
    };
  }

  loadPersonalityConfig(force = false) {
    const now = Date.now();
    if (!force && this.configCache && now - this.lastLoadedAt < this.cacheTtl) {
      return personalityStore.mergeAdjustments(this.configCache);
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        console.warn(
          "[personality] Missing bot-personality.md, using defaults",
        );
        this.configCache = personalityStore.mergeAdjustments(
          this.getFallbackConfig(),
        );
        this.lastLoadedAt = now;
        return this.configCache;
      }

      const markdown = fs.readFileSync(this.configPath, "utf8");
      this.configCache = personalityStore.mergeAdjustments(
        this.parsePersonalityMarkdown(markdown),
      );
      this.lastLoadedAt = now;
      return this.configCache;
    } catch (err) {
      console.error("[personality] Failed loading config:", err.message);
      this.configCache = personalityStore.mergeAdjustments(
        this.getFallbackConfig(),
      );
      this.lastLoadedAt = now;
      return this.configCache;
    }
  }

  reloadConfig() {
    this.configCache = null;
    this.lastLoadedAt = 0;
    return this.loadPersonalityConfig(true);
  }

  parsePersonalityMarkdown(markdown) {
    return {
      traits: this.extractTraits(markdown),
      catchphrases: this.extractCatchphrases(markdown),
      toneGuidelines: this.extractToneGuidelines(markdown),
      contextBehaviors: this.extractContextBehaviors(markdown),
      adaptationRules: this.extractAdaptationRules(markdown),
      basePrompt: this.extractBasePrompt(markdown),
    };
  }

  extractSection(markdown, header) {
    const pattern = new RegExp(`##\\s+${header}[\\s\\S]*?(?=\\n##\\s+|$)`, "i");
    const match = markdown.match(pattern);
    return match ? match[0] : "";
  }

  extractList(section) {
    return section
      .split("\n")
      .filter((line) => /^[-*]/.test(line.trim()))
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }

  extractTraits(markdown) {
    const section = this.extractSection(markdown, "Traits");
    const items = this.extractList(section);
    const result = {};
    items.forEach((item) => {
      const [key, ...rest] = item.split(":");
      if (rest.length > 0) {
        result[key.trim().toLowerCase().replace(/\s+/g, "_")] = rest
          .join(":")
          .trim();
      } else {
        result[key.trim()] = true;
      }
    });
    return result;
  }

  extractCatchphrases(markdown) {
    const section = this.extractSection(markdown, "Catchphrases");
    const items = this.extractList(section);
    return items.length > 0
      ? items
      : [
          "Let's dive in",
          "Quick breakdown",
          "Here's the vibe",
          "Real talk",
          "Plot twist",
        ];
  }

  extractToneGuidelines(markdown) {
    const section = this.extractSection(markdown, "Tone Guidelines");
    const items = this.extractList(section);
    return items.length > 0
      ? items
      : [
          "Warm and approachable",
          "Brevity paired with clarity",
          "Active voice and natural phrasing",
        ];
  }

  extractContextBehaviors(markdown) {
    const section = this.extractSection(markdown, "Context Behaviors");
    if (!section) return [];
    const blocks = section.split(/^###\s+/m).slice(1);
    return blocks.map((block) => {
      const [heading, ...rest] = block.trim().split("\n");
      return {
        scenario: heading.trim(),
        guidance: rest.join("\n").trim(),
      };
    });
  }

  extractAdaptationRules(markdown) {
    const section = this.extractSection(markdown, "Adaptation Rules");
    const items = this.extractList(section);
    return items.length > 0
      ? items
      : [
          "Mirror the user's energy level within reason",
          "Offer encouragement when user shows frustration",
          "Scale technical depth to match user vocabulary",
        ];
  }

  extractBasePrompt(markdown) {
    const section = this.extractSection(markdown, "Base Personality");
    if (!section) return this.getFallbackConfig().basePrompt;
    return (
      section.split("\n").slice(1).join("\n").trim() ||
      this.getFallbackConfig().basePrompt
    );
  }

  getFallbackConfig() {
    return {
      traits: {
        warm: "Warm and approachable",
        adaptable: "Matches user energy",
        encouraging: "Celebrates progress",
        authentic: "Speaks naturally",
      },
      catchphrases: [
        "Let's dive in",
        "Quick breakdown",
        "Here's the vibe",
        "Real talk",
        "Plot twist",
      ],
      toneGuidelines: [
        "Conversational but clear",
        "Mix short and long sentences",
        "Use active voice and practical language",
      ],
      contextBehaviors: [],
      adaptationRules: [
        "Mirror the user's energy level within reason",
        "Offer encouragement when user shows frustration",
        "Scale technical depth to match user vocabulary",
      ],
      basePrompt: `You are Slimy.ai, a friendly and enthusiastic AI assistant. You provide accurate, concise, and encouraging help while keeping responses approachable.`,
    };
  }

  buildPersonalityPrompt({
    mode = "",
    rating = "default",
    context = {},
    userHistory = null,
  } = {}) {
    const config = this.loadPersonalityConfig();
    const modeString = typeof mode === "string" ? mode : "";
    const hasPersonality =
      modeString.includes("personality") &&
      !modeString.includes("no_personality");
    const isPG13 = rating === "pg13";
    const isSnailMode = modeString.includes("super_snail");

    let prompt = config.basePrompt || this.getFallbackConfig().basePrompt;

    prompt += "\n\n";
    prompt += this.getBasePersonality(hasPersonality);

    if (isSnailMode) {
      prompt += "\n\n";
      prompt += this.getSnailPersonalityLayer(hasPersonality);
    }

    prompt += "\n\n";
    prompt += this.getRatingLayer(isPG13);

    if (userHistory) {
      prompt += "\n\n";
      prompt += this.getUserAdaptationLayer(userHistory);
    }

    prompt += "\n\n";
    prompt += this.getConsistencyLayer(context);

    if (config.toneGuidelines?.length) {
      prompt += "\n\nTONE NOTES:\n";
      config.toneGuidelines.forEach((line) => {
        prompt += `• ${line}\n`;
      });
    }

    if (config.adaptationRules?.length) {
      prompt += "\nADAPTATION RULES:\n";
      config.adaptationRules.forEach((rule) => {
        prompt += `• ${rule}\n`;
      });
    }

    return prompt.trim();
  }

  getBasePersonality(hasPersonality) {
    if (hasPersonality) {
      return (
        "You are Slimy.ai, a friendly and enthusiastic AI assistant with personality!\n" +
        "\n" +
        "CORE TRAITS:\n" +
        "• Warm and approachable - You genuinely care about helping\n" +
        "• Playful but not obnoxious - Light humor, not forced jokes\n" +
        "• ADHD-friendly - Break things into digestible chunks with clear next steps\n" +
        "• Encouraging - Celebrate small wins, acknowledge effort\n" +
        "• Authentic - Speak naturally, not like a corporate bot\n" +
        "• Adaptable - Match the user's energy and communication style\n" +
        "\n" +
        "TONE:\n" +
        "• Conversational and casual (but not unprofessional)\n" +
        '• Use "you" and "I" naturally - we\'re having a conversation\n' +
        "• Occasional emoji use (1-2 max) when it adds value\n" +
        "• Varied sentence structure\n" +
        "• Active voice preferred\n" +
        "\n" +
        "PERSONALITY EXPRESSION:\n" +
        "• Show enthusiasm through word choice, not just exclamation marks\n" +
        '• Use natural transitions: "Alright," "So," "Here\'s the thing"\n' +
        "• Be concise but warm\n" +
        "• Acknowledge when things are tricky\n" +
        "• Celebrate successes sincerely\n" +
        "\n" +
        "DO NOT:\n" +
        "• Overuse exclamation marks\n" +
        "• Abuse the same catchphrase repeatedly\n" +
        "• Be overly verbose\n" +
        "• Speak in corporate jargon\n" +
        "• Patronize or talk down to users\n" +
        "• Use emoji instead of clarity"
      );
    }

    return (
      "You are Slimy.ai in technical/professional mode.\n" +
      "\n" +
      "CORE APPROACH:\n" +
      "• Direct and concise responses\n" +
      "• Focus on information delivery\n" +
      "• Minimal pleasantries\n" +
      "• Professional but not robotic\n" +
      "• Technical accuracy first\n" +
      "\n" +
      "TONE:\n" +
      "• Neutral and objective\n" +
      "• Clear technical language\n" +
      "• Structured delivery\n" +
      "• Brief acknowledgments only when needed\n" +
      "\n" +
      "FORMAT:\n" +
      "• Lead with the answer\n" +
      "• Support with relevant details\n" +
      "• Offer next steps only when requested"
    );
  }

  getSnailPersonalityLayer(hasPersonality) {
    if (hasPersonality) {
      return (
        "SUPER SNAIL MODE ENHANCEMENTS:\n" +
        "• Match gaming enthusiasm\n" +
        "• Use gaming vernacular naturally (build, meta, optimization)\n" +
        "• Celebrate player progress\n" +
        "• Frame recommendations as strategic choices\n" +
        "• Acknowledge the grind and keep energy supportive\n" +
        "\n" +
        "GAMING VOICE:\n" +
        '• "Let\'s theory-craft this" not "Let us analyze"\n' +
        '• "Worth farming for" not "Recommended to acquire"\n' +
        "• Sound like a genuine co-op buddy"
      );
    }

    return (
      "SUPER SNAIL MODE (TECHNICAL):\n" +
      "• Provide data-driven analysis\n" +
      "• Focus on numerical optimization\n" +
      "• Present strategic paths objectively\n" +
      "• Minimize commentary, maximize actionable information"
    );
  }

  getRatingLayer(isPG13) {
    if (isPG13) {
      return (
        "CONTENT RATING: PG-13\n" +
        "• Keep language family-friendly\n" +
        "• Avoid profanity or explicit content\n" +
        "• Maintain positive, constructive tone"
      );
    }

    return (
      "CONTENT RATING: UNRATED\n" +
      "• Authentic language permitted\n" +
      "• Mature themes acceptable within policy\n" +
      "• Stay respectful and helpful"
    );
  }

  getUserAdaptationLayer(userHistory) {
    const signals = this.analyzeUserSignals(userHistory);
    const notes = ["USER ADAPTATION:"];

    if (signals.prefersBrevity)
      notes.push("• This user prefers concise responses - keep it tight");
    if (signals.prefersTechnical)
      notes.push("• This user values technical depth - include specifics");
    if (signals.usesEmoji)
      notes.push("• This user uses emoji - mirror sparingly");
    if (signals.needsEncouragement)
      notes.push(
        "• This user benefits from encouragement - acknowledge effort",
      );

    return notes.join("\n");
  }

  analyzeUserSignals(history) {
    const defaultSignals = {
      prefersBrevity: false,
      prefersTechnical: false,
      usesEmoji: false,
      needsEncouragement: false,
    };

    if (!history) return defaultSignals;

    if (!Array.isArray(history) && typeof history === "object") {
      return {
        prefersBrevity: Boolean(
          history.avgMessageLength && history.avgMessageLength < 50,
        ),
        prefersTechnical: Boolean(
          history.technicalTerms && history.technicalTerms > 5,
        ),
        usesEmoji: Boolean(history.emojiCount && history.emojiCount > 3),
        needsEncouragement: Boolean(history.frustratedTone),
      };
    }

    if (!Array.isArray(history) || history.length === 0) return defaultSignals;

    const text = history
      .map((item) => (typeof item === "string" ? item : item?.content || ""))
      .filter(Boolean);

    if (text.length === 0) return defaultSignals;

    const totalLength = text.reduce((sum, entry) => sum + entry.length, 0);
    const avgLength = totalLength / text.length;

    const technicalTerms = text
      .join(" ")
      .match(
        /\b(api|sdk|async|await|promise|database|query|optimize|refactor|regex|thread|memory)\b/gi,
      );
    const emojis = text.join(" ").match(/[\u{1F300}-\u{1FAFF}]/gu);
    const frustration = text
      .join(" ")
      .match(/\b(stuck|frustrated|lost|help|confused|ugh)\b/gi);

    return {
      prefersBrevity: avgLength < 50,
      prefersTechnical: Boolean(technicalTerms && technicalTerms.length > 5),
      usesEmoji: Boolean(emojis && emojis.length > 3),
      needsEncouragement: Boolean(frustration && frustration.length > 0),
    };
  }

  getConsistencyLayer(context = {}) {
    const notes = [
      "CONSISTENCY RULES:",
      "• Maintain this personality throughout the conversation",
      "• Adapt immediately if the user requests tone changes",
      "• Remember earlier context in this thread or channel",
      "• Stay true to core traits while staying flexible",
    ];

    if (context.previousToneShift) {
      notes.push("• User requested a tone shift recently - honor that request");
    }

    return notes.join("\n");
  }

  trackUsage(userId, messageType, response) {
    if (!userId || !response) return;

    const catchphrases = this.detectCatchphrases(response);
    const currentUsage =
      this.personalityMetrics.catchphraseUsage.get(userId) || {};

    catchphrases.forEach((phrase) => {
      currentUsage[phrase] = (currentUsage[phrase] || 0) + 1;
    });

    if (catchphrases.length > 0) {
      this.personalityMetrics.catchphraseUsage.set(userId, currentUsage);
    }

    if (database.isConfigured?.()) {
      catchphrases.forEach((phrase) => {
        database
          .trackPersonalityUsage(userId, messageType || "unknown", phrase)
          .catch(() => {});
      });
    }

    if (this.isOverusingCatchphrases(currentUsage)) {
      console.warn(
        `[personality] User ${userId} received the same catchphrase too often`,
      );
    }
  }

  detectCatchphrases(response) {
    const config = this.loadPersonalityConfig();
    const haystack = response.toLowerCase();
    return (config.catchphrases || []).filter((phrase) =>
      haystack.includes(phrase.toLowerCase()),
    );
  }

  isOverusingCatchphrases(usageMap) {
    const counts = Object.values(usageMap || {});
    if (counts.length === 0) return false;
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) return false;
    return counts.some((count) => count / total > 0.2);
  }

  recordToneSample(userId, score) {
    if (!userId || typeof score !== "number") return;
    const history = this.personalityMetrics.toneConsistency.get(userId) || [];
    history.push(score);
    if (history.length > 50) history.shift();
    this.personalityMetrics.toneConsistency.set(userId, history);
  }

  recordUserSatisfaction(userId, score) {
    if (!userId || typeof score !== "number") return;
    const history = this.personalityMetrics.userSatisfaction.get(userId) || [];
    history.push(score);
    if (history.length > 50) history.shift();
    this.personalityMetrics.userSatisfaction.set(userId, history);
  }

  calculateCatchphraseFrequency() {
    const totals = {};
    for (const usage of this.personalityMetrics.catchphraseUsage.values()) {
      Object.entries(usage).forEach(([phrase, count]) => {
        totals[phrase] = (totals[phrase] || 0) + count;
      });
    }
    return totals;
  }

  calculateToneConsistency() {
    const samples = Array.from(this.personalityMetrics.toneConsistency.values())
      .flat()
      .filter((score) => typeof score === "number");
    if (samples.length === 0) return 0.85;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return Math.max(0, Math.min(1, avg));
  }

  calculateUserSatisfaction() {
    const samples = Array.from(
      this.personalityMetrics.userSatisfaction.values(),
    )
      .flat()
      .filter((score) => typeof score === "number");
    if (samples.length === 0) return 0.9;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return Math.max(0, Math.min(1, avg));
  }

  getAnalytics() {
    return {
      catchphraseFrequency: this.calculateCatchphraseFrequency(),
      toneConsistency: this.calculateToneConsistency(),
      userSatisfaction: this.calculateUserSatisfaction(),
    };
  }

  async evaluatePersonalityQuality() {
    console.log("=== Personality Quality Evaluation ===");

    const scenarios = [
      {
        name: "Enthusiastic User",
        input:
          "OMG this is so cool!!! Can you help me build something awesome?",
        mode: "personality",
        rating: "default",
      },
      {
        name: "Technical User",
        input:
          "I need assistance optimizing the API call rate limiting implementation.",
        mode: "personality",
        rating: "default",
      },
      {
        name: "Brief User",
        input: "how do i do this",
        mode: "personality",
        rating: "default",
      },
      {
        name: "Gaming Enthusiast",
        input: "What's the meta build for late-game progression?",
        mode: "super_snail_personality",
        rating: "default",
      },
    ];

    scenarios.forEach((scenario) => {
      console.log(`\n📋 Scenario: ${scenario.name}`);
      console.log(`Input: "${scenario.input}"`);
      const prompt = this.buildPersonalityPrompt({
        mode: scenario.mode,
        rating: scenario.rating,
        context: { userMessage: scenario.input },
      });
      console.log("\nGenerated Personality Prompt:");
      console.log(`${prompt.substring(0, 300)}...`);
    });

    console.log("\n=== Analytics Snapshot ===");
    console.log(JSON.stringify(this.getAnalytics(), null, 2));

    return { scenarios, analytics: this.getAnalytics() };
  }
}

module.exports = new PersonalityEngine();
