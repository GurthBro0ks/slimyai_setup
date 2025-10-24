"use strict";

const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const routes = require("./routes");
const config = require("./config");
const logger = require("../../lib/logger");
const { attachSession } = require("./middleware/auth");

function createApp() {
  const app = express();
  app.disable("x-powered-by");

  if (config.network.trustProxy) {
    app.set("trust proxy", 1);
  } else if (config.network.trustProxy === false) {
    app.set("trust proxy", false);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(helmet.frameguard({ action: "deny" }));
  app.use(helmet.referrerPolicy({ policy: "no-referrer" }));
  app.use(
    helmet.hsts({
      maxAge: Number(config.security.hstsMaxAge || 31536000),
      includeSubDomains: true,
      preload: true,
    }),
  );

  if (config.cors.enabled) {
    const cors = require("cors");
    const allowedOrigins = new Set(
      config.cors.allowedOrigin
        ? [config.cors.allowedOrigin]
        : config.ui.origins,
    );
    app.use(
      cors({
        origin(origin, callback) {
          if (!origin || allowedOrigins.has(origin)) {
            return callback(null, origin || true);
          }
          return callback(new Error("Origin not allowed"));
        },
        credentials: true,
      }),
    );
  }

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(config.jwt.secret));
  app.use((req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()",
    );
    next();
  });
  app.use(attachSession);

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", routes);

  app.use((req, res) => {
    res.status(404).json({ error: "not-found" });
  });

  app.use((err, _req, res, _next) => {
    if (err?.message === "Origin not allowed") {
      return res.status(403).json({ error: "cors-not-allowed" });
    }
    logger.error("[admin-api] Unhandled error", {
      err: err?.message || err,
    });
    res.status(500).json({ error: "internal-error" });
  });

  return app;
}

module.exports = { createApp };
