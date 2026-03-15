# ── Backend Dockerfile ────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy source
COPY backend/ ./backend/
COPY database/ ./database/
COPY execution/ ./execution/
COPY risk-manager/ ./risk-manager/
COPY scheduler/ ./scheduler/
COPY strategies/ ./strategies/
COPY telegram-bot/ ./telegram-bot/
COPY .env .env

# Create logs directory
RUN mkdir -p logs

EXPOSE 4000

CMD ["node", "backend/server.js"]
