'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const helmet     = require('helmet');
const cors       = require('cors');
const path       = require('path');

const { connectDB }    = require('./src/config/db');
const logger           = require('./src/config/logger');
const { limiter }      = require('./src/middleware/rateLimiter');
const errorHandler     = require('./src/middleware/errorHandler');
const { getSystemHealth } = require('./src/services/healthService');
const monitorService   = require('./src/services/monitorService');
const healthMonitor    = require('./src/services/systemHealthService');

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes      = require('./src/routes/auth');
const signalRoutes    = require('./src/routes/signals');
const tradeRoutes     = require('./src/routes/trades');
const marketRoutes    = require('./src/routes/market');
const riskRoutes      = require('./src/routes/risk');
const brokerRoutes    = require('./src/routes/broker');
const mlRoutes        = require('./src/routes/ml');
const backtestRoutes  = require('./src/routes/backtest');
const sentimentRoutes = require('./src/routes/sentiment');
const regimeRoutes    = require('./src/routes/regime');
const reportRoutes    = require('./src/routes/reports');
const marketIntelRoutes = require('./src/routes/marketIntelligence');
const newsMarketRoutes  = require('./src/routes/newsMarket');
const investRoutes    = require('./src/routes/invest');
const systemRoutes    = require('./src/routes/systemStatus');

const app    = express();
const server = http.createServer(app);

// ── Security & Middleware ─────────────────────────────────────────────────────
app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'https://alphadesk-eakgqieoq-ragavenditras-projects.vercel.app',
  'https://alphadesk.vercel.app',
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.some(o => origin.startsWith(o))) return true;
  // Allow any Vercel preview deployment for this project
  if (/^https:\/\/alphadesk-[a-z0-9]+-ragavenditras-projects\.vercel\.app$/.test(origin)) return true;
  return false;
};

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('CORS blocked'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(limiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/signals',   signalRoutes);
app.use('/api/trades',    tradeRoutes);
app.use('/api/market',    marketRoutes);
app.use('/api/risk',      riskRoutes);
app.use('/api/broker',    brokerRoutes);
app.use('/api/ml',        mlRoutes);
app.use('/api/backtest',  backtestRoutes);
app.use('/api/sentiment', sentimentRoutes);
app.use('/api/regime',    regimeRoutes);
app.use('/api/reports',      reportRoutes);
app.use('/api/market-intel', marketIntelRoutes);
app.use('/api/news-market',  newsMarketRoutes);
app.use('/api/invest',       investRoutes);
app.use('/api/system',       systemRoutes);

// ── Root ping — lightweight keep-alive for cloud platforms ───────────────────
const _startedAt = Date.now();
app.get('/', (req, res) => {
  const uptimeSecs = Math.floor((Date.now() - _startedAt) / 1000);
  const h = Math.floor(uptimeSecs / 3600);
  const m = Math.floor((uptimeSecs % 3600) / 60);
  res.json({
    status:     'ok',
    uptime:     `${h}h ${m}m`,
    activeJobs: global._activeJobCount || 0,
  });
});

// ── Health endpoint ───────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const health = await getSystemHealth();
  res.json(health);
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info(`WS client connected: ${socket.id}`, { module: 'ws' });

  socket.on('subscribe:symbol', (symbol) => {
    socket.join(`symbol:${symbol}`);
  });

  socket.on('disconnect', () => {
    logger.info(`WS client disconnected: ${socket.id}`, { module: 'ws' });
  });
});

// Attach io to app for use in services
app.set('io', io);
global.io = io;

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
// Railway uses PORT env var dynamically; fallback to BACKEND_PORT then 4000
const PORT = process.env.PORT || process.env.BACKEND_PORT || 4000;

async function start() {
  await connectDB();
  server.listen(PORT, () => {
    logger.info(`🚀 AlphaDesk backend running on port ${PORT}`, { module: 'server' });
    // Start trade monitor
    monitorService.start(io);
    // Start system health monitor (30s interval)
    healthMonitor.start(io);
    // Start scheduler
    require('../scheduler').start();
    logger.info('✅ All services started', { module: 'server' });

    // Notify Telegram that the monitor is live
    const _tgToken  = process.env.TELEGRAM_BOT_TOKEN;
    const _tgChatId = process.env.TELEGRAM_CHAT_ID;
    if (_tgToken && _tgChatId) {
      const https = require('https');
      const msg   = encodeURIComponent('✅ Monitor is LIVE on cloud. Resuming pending jobs...');
      const url   = `https://api.telegram.org/bot${_tgToken}/sendMessage?chat_id=${_tgChatId}&text=${msg}`;
      https.get(url, () => {}).on('error', () => {});
    }

    // ── Self-ping keep-alive (prevents Render free-tier sleep) ───────────────
    // Render sleeps services after 15 min of no traffic; a self-request every
    // 14 min keeps the process alive so cron jobs never miss their schedule.
    const _selfUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    setInterval(() => {
      const mod = _selfUrl.startsWith('https') ? require('https') : require('http');
      mod.get(`${_selfUrl}/`, () => {}).on('error', () => {});
      logger.info('Keep-alive ping sent', { module: 'server' });
    }, 14 * 60 * 1000); // every 14 minutes
  });
}

start().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`, { module: 'server' });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully', { module: 'server' });
  monitorService.stop();
  healthMonitor.stop();
  server.close(() => process.exit(0));
});

module.exports = { app, io };
