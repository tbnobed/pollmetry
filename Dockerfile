# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install ALL dependencies (need drizzle-kit for migrations)
COPY package*.json ./
RUN npm ci

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle config and shared schema for migrations
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json ./

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose the application port
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

# Start with entrypoint that runs migrations
ENTRYPOINT ["/entrypoint.sh"]
