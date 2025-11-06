"use strict";

function validateBody(schema) {
  return (req, res, next) => {
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "validation-error",
        details: parseResult.error.errors.map((err) => ({
          path: err.path,
          message: err.message,
        })),
      });
    }

    req.validated = req.validated || {};
    req.validated.body = parseResult.data;
    return next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const parseResult = schema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "validation-error",
        details: parseResult.error.errors.map((err) => ({
          path: err.path,
          message: err.message,
        })),
      });
    }

    req.validated = req.validated || {};
    req.validated.query = parseResult.data;
    return next();
  };
}

module.exports = {
  validateBody,
  validateQuery,
};
