# Arbeitszeit-Tracker Docker Image
# Multi-stage build for smaller image size

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built assets and server files
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node server.js database.js migrate-db.js ./
COPY --chown=node:node db ./db

# Copy initialization script
COPY --chown=node:node docker-init.js ./

# Create data directory for SQLite database
RUN mkdir -p /data && chown -R node:node /data /app

# Environment variables with defaults
ENV PORT=3000
ENV DATABASE_PATH=/data/arbeitszeit.db
ENV NODE_ENV=production

# Run as non-root user
USER node

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start with initialization
CMD ["node", "docker-init.js"]
