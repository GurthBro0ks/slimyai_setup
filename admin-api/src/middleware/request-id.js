"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * Request ID middleware
 * Generates a unique request ID and adds it to request/response
 */
function requestIdMiddleware(req, res, next) {
  // Get request ID from header or generate new one
  const requestId = req.headers["x-request-id"] || uuidv4();
  
  // Add to request
  req.id = requestId;
  
  // Add to response headers
  res.setHeader("X-Request-ID", requestId);
  
  next();
}

module.exports = requestIdMiddleware;

