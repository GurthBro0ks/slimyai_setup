# Static Assets & CDN Configuration

This directory contains static assets served with CDN optimization headers.

## CDN Configuration

Static assets are served with the following headers for optimal CDN performance:

- `Cache-Control: public, max-age=31536000, immutable` (1 year cache for static files)
- `Cache-Control: public, max-age=86400` (1 day cache for uploads)
- `ETag` headers for conditional requests
- `Last-Modified` headers for cache validation
- `X-Content-Type-Options: nosniff` for security
- CORS headers for cross-origin access

## Environment Variables

Configure CDN behavior with these environment variables:

- `CDN_ENABLED=true` - Enable CDN headers
- `CDN_URL=https://cdn.example.com` - CDN base URL
- `STATIC_MAX_AGE=31536000` - Cache duration for static assets (seconds)
- `UPLOADS_MAX_AGE=86400` - Cache duration for uploads (seconds)

## CDN Setup

To use a CDN:

1. Set `CDN_URL` to your CDN distribution URL
2. Configure your CDN to:
   - Forward requests to `/assets/*` and `/uploads/*`
   - Respect cache headers
   - Enable compression
   - Set appropriate CORS headers

## File Organization

- `/assets/*` - Static application assets (JS, CSS, images)
- `/uploads/*` - User-uploaded content
- `/.cdn-config.json` - CDN configuration reference
