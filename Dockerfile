FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDeps for build)
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Standard Railway environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Default command (can be overridden in Railway)
CMD ["node", "dist/main-bot/index.js"]
