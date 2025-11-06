"use strict";

const { z } = require("zod");

/**
 * Input validation schemas using Zod
 * Comprehensive validation for all API endpoints
 */

// Common validation patterns
const nonEmptyString = z.string().trim().min(1, "Field cannot be empty");
const optionalString = z.string().trim().optional();
const positiveInteger = z.number().int().positive();
const optionalPositiveInteger = z.number().int().positive().optional();

// Guild ID validation (Discord snowflake)
const guildIdSchema = z.string().regex(/^\d{17,19}$/, "Invalid Discord guild ID");

// User ID validation (Discord snowflake)
const userIdSchema = z.string().regex(/^\d{17,19}$/, "Invalid Discord user ID");

// UUID validation
const uuidSchema = z.string().uuid("Invalid UUID format");

// Email validation (if needed)
const emailSchema = z.string().email("Invalid email format");

// URL validation
const urlSchema = z.string().url("Invalid URL format");

// Role validation
const roleSchema = z.enum(["member", "club", "admin"], {
  errorMap: () => ({ message: "Role must be 'member', 'club', or 'admin'" })
});

// Chat validation schemas
const chatBotRequestSchema = z.object({
  prompt: nonEmptyString.max(2000, "Prompt too long (max 2000 characters)"),
  guildId: z.string().optional(),
}).strict();

const chatHistoryQuerySchema = z.object({
  limit: positiveInteger.max(200, "Limit cannot exceed 200").optional().default(50),
}).strict();

const chatMessageSchema = z.object({
  text: nonEmptyString.max(2000, "Message too long (max 2000 characters)"),
  adminOnly: z.boolean().optional().default(false),
}).strict();

const conversationCreateSchema = z.object({
  title: z.string().max(200, "Title too long (max 200 characters)").optional(),
  personalityMode: z.enum(["helpful", "creative", "professional", "casual"]).optional().default("helpful"),
}).strict();

const conversationUpdateSchema = z.object({
  title: z.string().max(200, "Title too long (max 200 characters)").optional(),
}).strict();

const conversationQuerySchema = z.object({
  limit: positiveInteger.max(100, "Limit cannot exceed 100").optional().default(20),
}).strict();

const addMessageSchema = z.object({
  conversationId: uuidSchema,
  message: z.object({
    content: nonEmptyString.max(4000, "Message too long"),
    role: z.enum(["user", "assistant"]),
    personalityMode: z.enum(["helpful", "creative", "professional", "casual"]).optional(),
  }),
}).strict();

// Auth validation schemas
const loginQuerySchema = z.object({
  redirect: optionalString,
  format: z.enum(["json"]).optional(),
}).strict();

const callbackQuerySchema = z.object({
  code: nonEmptyString,
  state: nonEmptyString,
  redirect: optionalString,
  format: z.enum(["json"]).optional(),
}).strict();

const refreshRequestSchema = z.object({
  // No body required for refresh
}).strict();

// Guild validation schemas
const guildQuerySchema = z.object({
  // No query params for basic guild list
}).strict();

// Personality validation schemas
const personalitySettingsSchema = z.object({
  enabled: z.boolean(),
  systemPrompt: z.string().max(4000, "System prompt too long (max 4000 characters)").optional(),
  personalityTraits: z.array(z.string().max(100, "Trait too long")).max(10, "Too many traits").optional(),
  responseStyle: z.enum(["casual", "formal", "humorous", "professional"]).optional(),
  maxTokens: positiveInteger.max(4000, "Max tokens too high").optional(),
}).strict();

const personalityUpdateSchema = z.object({
  personality: personalitySettingsSchema,
}).strict();

// Snail validation schemas
const snailUploadSchema = z.object({
  guildId: guildIdSchema,
  // File validation handled by multer
}).strict();

const snailSettingsSchema = z.object({
  enabled: z.boolean(),
  triggerWords: z.array(nonEmptyString.max(50)).max(20, "Too many trigger words").optional(),
  responseChance: z.number().min(0).max(1, "Response chance must be between 0 and 1").optional(),
  cooldownMinutes: positiveInteger.max(1440, "Cooldown too long (max 24 hours)").optional(),
}).strict();

// Stats validation schemas
const statsQuerySchema = z.object({
  guildId: guildIdSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: positiveInteger.max(1000, "Limit too high").optional().default(100),
}).strict();

// Diagnostics validation schemas
const diagQuerySchema = z.object({
  // Admin only endpoint - no additional validation needed
}).strict();

// Health check validation schemas
const healthQuerySchema = z.object({
  // No query params needed
}).strict();

// Metrics validation schemas
const metricsQuerySchema = z.object({
  // No query params needed
}).strict();

// File upload validation
const fileUploadSchema = z.object({
  fieldname: z.string(),
  originalname: nonEmptyString,
  encoding: z.string(),
  mimetype: z.string(),
  size: positiveInteger.max(10 * 1024 * 1024, "File too large (max 10MB)"), // 10MB limit
  buffer: z.any(), // Buffer validation not needed here
}).strict();

// Request validation middleware factory
const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      // Validate query parameters
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      // Validate route parameters
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      // Validate request body
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      next(error);
    }
  };
};

// Export validation schemas organized by route
module.exports = {
  // Common schemas
  guildIdSchema,
  userIdSchema,
  uuidSchema,
  emailSchema,
  urlSchema,
  roleSchema,
  nonEmptyString,
  optionalString,
  positiveInteger,
  optionalPositiveInteger,

  // Route-specific schemas
  chat: {
    bot: validateRequest({ body: chatBotRequestSchema }),
    history: validateRequest({ params: z.object({ guildId: z.string() }), query: chatHistoryQuerySchema }),
    message: validateRequest({ body: chatMessageSchema }),
    createConversation: validateRequest({ body: conversationCreateSchema }),
    listConversations: validateRequest({ query: conversationQuerySchema }),
    getConversation: validateRequest({ params: z.object({ conversationId: uuidSchema }) }),
    updateConversation: validateRequest({ params: z.object({ conversationId: uuidSchema }), body: conversationUpdateSchema }),
    deleteConversation: validateRequest({ params: z.object({ conversationId: uuidSchema }) }),
    addMessage: validateRequest({ body: addMessageSchema }),
  },

  auth: {
    login: validateRequest({ query: loginQuerySchema }),
    callback: validateRequest({ query: callbackQuerySchema }),
    refresh: validateRequest({ body: refreshRequestSchema }),
    me: validateRequest({}), // No validation needed
    logout: validateRequest({}), // No validation needed
  },

  guilds: {
    list: validateRequest({ query: guildQuerySchema }),
  },

  personality: {
    get: validateRequest({ params: z.object({ guildId: guildIdSchema }) }),
    update: validateRequest({ params: z.object({ guildId: guildIdSchema }), body: personalityUpdateSchema }),
  },

  snail: {
    upload: validateRequest({ params: z.object({ guildId: guildIdSchema }) }),
    settings: validateRequest({ params: z.object({ guildId: guildIdSchema }), body: z.object({ settings: snailSettingsSchema }) }),
  },

  stats: {
    get: validateRequest({ query: statsQuerySchema }),
  },

  diagnostics: {
    get: validateRequest({ query: diagQuerySchema }),
  },

  health: {
    check: validateRequest({ query: healthQuerySchema }),
  },

  metrics: {
    get: validateRequest({ query: metricsQuerySchema }),
  },

  // Utility functions
  validateRequest,
  fileUploadSchema,
};
