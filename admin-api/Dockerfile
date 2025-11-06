FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p data/snail data/codes data/settings uploads/snail

# Expose port
EXPOSE 3080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3080/api/health', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));"

# Start server
CMD ["node", "server.js"]

