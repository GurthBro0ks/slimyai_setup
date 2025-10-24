"use strict";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    NEXT_PUBLIC_ADMIN_API_BASE:
      process.env.NEXT_PUBLIC_ADMIN_API_BASE || "http://localhost:3080",
  },
};

module.exports = nextConfig;
