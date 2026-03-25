# ── AlphaDesk Backend — Production Dockerfile ─────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install PM2 globally for process management
RUN npm install -g pm2

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy source files
COPY backend/   ./backend/
COPY database/  ./database/
COPY execution/ ./execution/
COPY ecosystem.config.js ./ecosystem.config.js

# Create logs directory
RUN mkdir -p logs

# Expose port (Railway sets PORT dynamically)
EXPOSE 4000

# Start with PM2 runtime (keeps process alive + auto-restart)
CMD ["pm2-runtime", "ecosystem.config.js", "--only", "alphadesk-api"]
