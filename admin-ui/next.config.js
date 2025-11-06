"use strict";

const { randomUUID } = require("crypto");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  generateBuildId: async () => {
    if (process.env.NEXT_BUILD_ID) {
      return process.env.NEXT_BUILD_ID;
    }
    const timestamp = Date.now().toString(36);
    const entropy = randomUUID().replace(/-/g, "").slice(0, 12);
    return `slimy-${timestamp}-${entropy}`;
  },
  env: {
    // Use empty string in production for relative paths (Caddy proxies /api/* to 127.0.0.1:3080)
    NEXT_PUBLIC_ADMIN_API_BASE:
      process.env.NEXT_PUBLIC_ADMIN_API_BASE !== undefined
        ? process.env.NEXT_PUBLIC_ADMIN_API_BASE
        : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3080'),
  },
};

module.exports = nextConfig;
