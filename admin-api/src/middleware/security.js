"use strict";

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

/**
 * Security middleware configuration
 * Implements comprehensive security headers and rate limiting
 */

// Security headers middleware using helmet
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://discord.com", "https://api.openai.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' }, // X-Frame-Options: DENY
  noSniff: true, // X-Content-Type-Options: nosniff
  xssFilter: true,
  referrerPolicy: { policy: "origin-when-cross-origin" },
  permissionsPolicy: {
    directives: {
      camera: [],
      microphone: [],
    },
  },
});

// Rate limiting configurations
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth attempts per windowMs
  message: {
    error: "Too many authentication attempts, please try again later",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and metrics
    return req.path === "/health" || req.path === "/metrics";
  },
});

const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests, please try again later",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and metrics
    return req.path === "/health" || req.path === "/metrics";
  },
});

const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 chat requests per minute
  message: {
    error: "Too many chat requests, please slow down",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for sensitive operations
const sensitiveOpsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // Very strict limit for sensitive operations
  message: {
    error: "Too many sensitive operations, please try again later",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input sanitization middleware with comprehensive protection
const sanitizeInput = (req, res, next) => {
  // Comprehensive string sanitization
  const sanitizeString = (str) => {
    if (typeof str !== "string") return str;

    let sanitized = str;

    // Remove null bytes and control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");

    // Remove path traversal attempts
    sanitized = sanitized.replace(/\.\.[\/\\]/g, "");

    // Remove script tags and their contents (case insensitive)
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

    // Remove iframe tags
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");

    // Remove object, embed, and form tags
    sanitized = sanitized.replace(/<(object|embed|form)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "");

    // Remove javascript: and vbscript: protocols
    sanitized = sanitized.replace(/(javascript|vbscript|data):/gi, "");

    // Remove event handlers (on* attributes)
    sanitized = sanitized.replace(/on\w+\s*=\s*"[^"]*"/gi, "");
    sanitized = sanitized.replace(/on\w+\s*=\s*'[^']*'/gi, "");
    sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]+/gi, "");

    // Remove style tags with javascript
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

    // Remove meta refresh and other redirect attempts
    sanitized = sanitized.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");

    // Basic SQL injection patterns (basic protection - not comprehensive)
    sanitized = sanitized.replace(/(;|--|#|\/\*|\*\/)/g, "");

    // Remove potential template injection
    sanitized = sanitized.replace(/\{\{.*?\}\}/g, "");

    // Trim whitespace and normalize
    sanitized = sanitized.trim();

    return sanitized;
  };

  // Recursively sanitize object properties
  const sanitizeObject = (obj, maxDepth = 10, currentDepth = 0) => {
    // Prevent infinite recursion
    if (currentDepth > maxDepth) {
      return "[RECURSION_LIMIT_EXCEEDED]";
    }

    if (typeof obj === "string") {
      return sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      // Limit array size to prevent DoS
      if (obj.length > 1000) {
        return obj.slice(0, 1000);
      }
      return obj.map(item => sanitizeObject(item, maxDepth, currentDepth + 1));
    }

    if (obj && typeof obj === "object") {
      // Limit object keys to prevent DoS
      const keys = Object.keys(obj);
      if (keys.length > 100) {
        const limitedObj = {};
        keys.slice(0, 100).forEach(key => {
          // Sanitize key names too
          const cleanKey = sanitizeString(key).substring(0, 100);
          limitedObj[cleanKey] = sanitizeObject(obj[key], maxDepth, currentDepth + 1);
        });
        return limitedObj;
      }

      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize key names to prevent injection through keys
        const cleanKey = sanitizeString(key).substring(0, 100);
        sanitized[cleanKey] = sanitizeObject(value, maxDepth, currentDepth + 1);
      }
      return sanitized;
    }

    return obj;
  };

  // Sanitize request body, query, and params
  try {
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body);
    }
    if (req.query && typeof req.query === "object") {
      req.query = sanitizeObject(req.query);
    }
    if (req.params && typeof req.params === "object") {
      req.params = sanitizeObject(req.params);
    }
  } catch (error) {
    console.warn("[SECURITY] Error during input sanitization:", error.message);
    // Continue processing even if sanitization fails
  }

  next();
};

// Request size limiting middleware
const requestSizeLimit = (req, res, next) => {
  const contentLength = parseInt(req.headers["content-length"]);

  // Limit request body size to 2MB (matching existing config)
  if (contentLength && contentLength > 2 * 1024 * 1024) {
    return res.status(413).json({
      error: "Request entity too large",
      maxSize: "2MB",
    });
  }

  next();
};

// Security logging middleware
const securityLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log security-relevant information
  const securityInfo = {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    method: req.method,
    path: req.path,
    timestamp: new Date().toISOString(),
  };

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i,  // Script injection
    /union.*select/i,  // SQL injection
    /eval\(/i,  // Code injection
    /base64/i,  // Potential encoded attacks
  ];

  const requestString = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestString));

  if (isSuspicious) {
    console.warn("[SECURITY] Suspicious request detected:", {
      ...securityInfo,
      suspicious: true,
    });
  }

  // Log response
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log("[SECURITY] Request completed:", {
      ...securityInfo,
      statusCode: res.statusCode,
      duration,
      userId: req.user?.id || "anonymous",
    });
  });

  next();
};

module.exports = {
  securityHeaders,
  authRateLimit,
  apiRateLimit,
  chatRateLimit,
  sensitiveOpsRateLimit,
  sanitizeInput,
  requestSizeLimit,
  securityLogger,
};
