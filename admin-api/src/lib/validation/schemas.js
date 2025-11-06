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
const guildListQuerySchema = z.object({
  limit: positiveInteger.max(200, "Limit cannot exceed 200").optional().default(50),
  offset: positiveInteger.optional().default(0),
  search: z.string().max(100, "Search term too long").optional(),
  includeMembers: z.enum(["true", "false"]).optional().default("false"),
}).strict();

const guildCreateSchema = z.object({
  discordId: guildIdSchema,
  name: nonEmptyString.max(100, "Guild name too long (max 100 characters)"),
  settings: z.record(z.any()).optional().default({}),
}).strict();

const guildUpdateSchema = z.object({
  name: nonEmptyString.max(100, "Guild name too long (max 100 characters)").optional(),
  settings: z.record(z.any()).optional(),
}).strict().refine(
  (data) => data.name !== undefined || data.settings !== undefined,
  "At least one field (name or settings) must be provided"
);

const guildMembersQuerySchema = z.object({
  limit: positiveInteger.max(200, "Limit cannot exceed 200").optional().default(50),
  offset: positiveInteger.optional().default(0),
  search: z.string().max(100, "Search term too long").optional(),
}).strict();

const memberAddSchema = z.object({
  userId: userIdSchema,
  roles: z.array(z.string().max(50, "Role name too long")).optional().default([]),
}).strict();

const memberUpdateSchema = z.object({
  roles: z.array(z.string().max(50, "Role name too long")),
}).strict();

const bulkMembersAddSchema = z.object({
  members: z.array(z.object({
    userId: userIdSchema,
    roles: z.array(z.string().max(50, "Role name too long")).optional().default([]),
  })).max(100, "Cannot add more than 100 members at once"),
}).strict();

const bulkMembersUpdateSchema = z.object({
  updates: z.array(z.object({
    userId: userIdSchema,
    roles: z.array(z.string().max(50, "Role name too long")),
  })).max(100, "Cannot update more than 100 members at once"),
}).strict();

const bulkMembersRemoveSchema = z.object({
  userIds: z.array(userIdSchema).max(100, "Cannot remove more than 100 members at once"),
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

const personalityPresetsQuerySchema = z.object({
  // No query params needed
}).strict();

const personalityResetSchema = z.object({
  preset: z.string().max(100, "Preset name too long").optional(),
}).strict();

const personalityTestSchema = z.object({
  prompt: z.string().max(500, "Test prompt too long").optional(),
}).strict();

// Snail validation schemas
const snailUploadSchema = z.object({
  guildId: guildIdSchema,
  prompt: z.string().max(1000, "Prompt too long").optional(),
}).strict();

const snailCalcSchema = z.object({
  sim: z.number().min(0, "SIM value cannot be negative").max(999999999, "SIM value too large"),
  total: z.number().min(0, "Total value cannot be negative").max(999999999, "Total value too large"),
}).strict();

const snailCodesQuerySchema = z.object({
  scope: z.enum(["active", "past7", "all"]).optional().default("active"),
}).strict();

const snailStatsQuerySchema = z.object({
  // No query params needed for basic stats retrieval
}).strict();

const snailHelpQuerySchema = z.object({
  // No query params needed
}).strict();

const snailSettingsSchema = z.object({
  enabled: z.boolean(),
  triggerWords: z.array(nonEmptyString.max(50)).max(20, "Too many trigger words").optional(),
  responseChance: z.number().min(0).max(1, "Response chance must be between 0 and 1").optional(),
  cooldownMinutes: positiveInteger.max(1440, "Cooldown too long (max 24 hours)").optional(),
}).strict();

const snailSettingsUpdateSchema = z.object({
  settings: snailSettingsSchema,
}).strict();

// Stats validation schemas
const statsSummaryQuerySchema = z.object({
  title: z.string().max(200, "Title too long").optional(),
  tab: z.enum(["baseline", "latest"]).optional(),
}).strict();

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

// Image file validation - check file signatures for actual image content
const validateImageFile = (file) => {
  // Allowed MIME types
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff'
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type: ${file.mimetype}. Only image files are allowed.`);
  }

  // Check file extension matches MIME type
  const mimeFromExtension = mime.lookup(file.originalname);
  if (mimeFromExtension && !allowedMimeTypes.includes(mimeFromExtension)) {
    throw new Error('File extension does not match allowed image types.');
  }

  // Basic file signature validation for common image formats
  if (file.buffer && file.buffer.length > 0) {
    const buffer = file.buffer;
    const firstBytes = buffer.slice(0, 12);

    // JPEG signature
    if (file.mimetype === 'image/jpeg' && !firstBytes.slice(0, 2).equals(Buffer.from([0xFF, 0xD8]))) {
      throw new Error('Invalid JPEG file signature.');
    }

    // PNG signature
    if (file.mimetype === 'image/png' && !firstBytes.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
      throw new Error('Invalid PNG file signature.');
    }

    // GIF signature
    if (file.mimetype === 'image/gif') {
      const gif87a = Buffer.from('GIF87a', 'ascii');
      const gif89a = Buffer.from('GIF89a', 'ascii');
      if (!firstBytes.slice(0, 6).equals(gif87a) && !firstBytes.slice(0, 6).equals(gif89a)) {
        throw new Error('Invalid GIF file signature.');
      }
    }

    // WebP signature
    if (file.mimetype === 'image/webp' && !firstBytes.slice(0, 4).equals(Buffer.from('RIFF', 'ascii'))) {
      throw new Error('Invalid WebP file signature.');
    }
  }

  return true;
};

// Enhanced file upload validation middleware
const validateFileUploads = async (req, res, next) => {
  try {
    if (!req.files || !Array.isArray(req.files)) {
      return next();
    }

    const fs = require('fs').promises;

    for (const file of req.files) {
      // Validate file using schema
      fileUploadSchema.parse(file);

      // For disk-stored files, read the content to validate
      if (file.path) {
        try {
          const buffer = await fs.readFile(file.path);
          file.buffer = buffer; // Add buffer for validation
        } catch (readError) {
          throw new Error(`Failed to read uploaded file: ${readError.message}`);
        }
      }

      // Additional image validation
      validateImageFile(file);
    }

    next();
  } catch (error) {
    // Clean up uploaded files on validation failure
    if (req.files) {
      const fs = require('fs');
      req.files.forEach(file => {
        if (file.path) {
          try {
            fs.unlinkSync(file.path);
          } catch (cleanupError) {
            console.warn('Failed to cleanup file after validation error:', cleanupError.message);
          }
        }
      });
    }

    return res.status(400).json({
      error: "File validation failed",
      message: error.message,
      details: error.errors?.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      })) || [{ message: error.message }],
    });
  }
};

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
    list: validateRequest({ query: guildListQuerySchema }),
    create: validateRequest({ body: guildCreateSchema }),
    update: validateRequest({ params: z.object({ id: z.string() }), body: guildUpdateSchema }),
    members: validateRequest({ params: z.object({ id: z.string() }), query: guildMembersQuerySchema }),
    addMember: validateRequest({ params: z.object({ id: z.string() }), body: memberAddSchema }),
    updateMember: validateRequest({ params: z.object({ id: z.string(), userId: userIdSchema }), body: memberUpdateSchema }),
    bulkAddMembers: validateRequest({ params: z.object({ id: z.string() }), body: bulkMembersAddSchema }),
    bulkUpdateMembers: validateRequest({ params: z.object({ id: z.string() }), body: bulkMembersUpdateSchema }),
    bulkRemoveMembers: validateRequest({ params: z.object({ id: z.string() }), body: bulkMembersRemoveSchema }),
    userGuilds: validateRequest({ params: z.object({ userId: userIdSchema }) }),
  },

  personality: {
    get: validateRequest({ params: z.object({ guildId: guildIdSchema }) }),
    update: validateRequest({ params: z.object({ guildId: guildIdSchema }), body: personalityUpdateSchema }),
    presets: validateRequest({ params: z.object({ guildId: guildIdSchema }), query: personalityPresetsQuerySchema }),
    reset: validateRequest({ params: z.object({ guildId: guildIdSchema }), body: personalityResetSchema }),
    test: validateRequest({ params: z.object({ guildId: guildIdSchema }), body: personalityTestSchema }),
  },

  snail: {
    upload: validateRequest({ params: z.object({ guildId: guildIdSchema }), body: snailUploadSchema }),
    settings: validateRequest({ params: z.object({ guildId: guildIdSchema }), body: snailSettingsUpdateSchema }),
    calc: validateRequest({ params: z.object({ guildId: guildIdSchema }), body: snailCalcSchema }),
    codes: validateRequest({ params: z.object({ guildId: guildIdSchema }), query: snailCodesQuerySchema }),
    stats: validateRequest({ params: z.object({ guildId: guildIdSchema }), query: snailStatsQuerySchema }),
    help: validateRequest({ params: z.object({ guildId: guildIdSchema }), query: snailHelpQuerySchema }),
  },

  stats: {
    summary: validateRequest({ query: statsSummaryQuerySchema }),
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
  validateFileUploads,
  validateImageFile,
};
