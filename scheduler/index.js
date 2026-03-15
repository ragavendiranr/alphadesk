'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const cron   = require('node-cron');
const logger = require('../backend/src/config/logger');

// Lazy imports to avoid circular deps at startup
const zerodha       = () => require('../execution/zerodha');
const signalService = () => require('../backend/src/services/signalService');
const reportService = () => require('../backend/src/services/reportService');
const riskMgr       = () => require('../risk-manager');
const telegramBot   = () => require('../telegram-bot/bot');
const { OHLC, DailySession, Budget, MarketRegime, SentimentScore } = require('../database/schemas');
const marketIntelSvc = () => require('../backend/src/services/marketIntelligenceService');
const investSvc      = () => require('../backend/src/services/investmentService');

const WATCHED_SYMBOLS = [
  'NIFTY 50', 'NIFTY BANK',
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'SBIN', 'BHARTIARTL', 'BAJFINANCE', 'ASIANPAINT',
  'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'MARUTI',
  'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'WIPRO',
];

// IST timezone offset
const IST = 'Asia/Kolkata';

let scanActive = false;
let pauseUntil = null;

// ── 1. 07:00 IST — Zerodha Auto Login ────────────────────────────────────────
cron.schedule('0 7 * * 1-5', async () => {
  logger.info('Scheduler: Zerodha auto-login', { module: 'scheduler' });
  try {
    await zerodha().autoLogin();
    await telegramBot().sendSystemAlert('✅ Zerodha auto-login successful');
  } catch (err) {
    logger.error(`Auto-login failed: ${err.message}`, { module: 'scheduler' });
    await telegramBot().sendSystemAlert(`❌ Zerodha auto-login FAILED: ${err.message}`);
  }
}, { timezone: IST });

// ── 2. 07:30 IST — Historical data fetch ─────────────────────────────────────
cron.schedule('30 7 * * 1-5', async () => {
  logger.info('Scheduler: Fetching historical data', { module: 'scheduler' });
  try {
    const kite = zerodha();
    const from = new Date();
    from.setDate(from.getDate() - 2);
    const to = new Date();
    let fetched = 0;
    for (const symbol of WATCHED_SYMBOLS.slice(0, 5)) { // fetch top 5 to avoid rate limits
      try {
        const candles = await kite.getHistoricalData(symbol, from, to, '5minute');
        for (const c of (candles || [])) {
          await OHLC.findOneAndUpdate(
            { symbol, timeframe: '5m', timestamp: new Date(c.date) },
            { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
            { upsert: true }
          );
        }
        fetched++;
      } catch {}
      await new Promise(r => setTimeout(r, 500)); // rate limit
    }
    logger.info(`Historical data fetched for ${fetched} symbols`, { module: 'scheduler' });
  } catch (err) {
    logger.error(`Historical fetch failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 3. 07:30 IST — ML retrain (background) ───────────────────────────────────
cron.schedule('35 7 * * 1-5', async () => {
  logger.info('Scheduler: Triggering ML retrain', { module: 'scheduler' });
  try {
    const axios = require('axios');
    await axios.post(`${process.env.ML_ENGINE_URL}/train`, {}, { timeout: 5000 });
  } catch {}
}, { timezone: IST });

// ── 4. 08:45 IST — Pre-market check ─────────────────────────────────────────
cron.schedule('45 8 * * 1-5', async () => {
  logger.info('Scheduler: Pre-market check', { module: 'scheduler' });
  try {
    const axios = require('axios');
    const { data: health } = await axios.get('http://localhost:4000/health', { timeout: 5000 }).catch(() => ({ data: {} }));

    // Fetch and store sentiment
    let sentiment = { label: 'NEUTRAL', score: 50 };
    try {
      const { data: sent } = await axios.get(`${process.env.ML_ENGINE_URL}/sentiment`, { timeout: 30000 });
      sentiment = sent;
      const date = new Date().toISOString().slice(0, 10);
      await SentimentScore.findOneAndUpdate(
        { date, symbol: 'MARKET' },
        { ...sentiment, date },
        { upsert: true }
      );
    } catch {}

    // Create today's budget if missing
    const date = new Date().toISOString().slice(0, 10);
    await Budget.findOneAndUpdate(
      { date },
      { $setOnInsert: { capital: Number(process.env.DAILY_CAPITAL) || 10000, riskPct: 0.01, lossLimit: 0.015 } },
      { upsert: true }
    );

    await telegramBot().sendSystemAlert([
      '📊 *Pre-Market Check — AlphaDesk*',
      '',
      `Backend: ${health.status === 'ok' ? '✅' : '❌'}`,
      `DB: ${health.db === 'connected' ? '✅' : '❌'}`,
      `ML: ${health.ml === 'online' ? '✅' : '❌'}`,
      `Sentiment: ${sentiment.label} (${sentiment.score})`,
      `Capital: ₹${Number(process.env.DAILY_CAPITAL).toLocaleString('en-IN')}`,
      '',
      'Market opens in 30 minutes.',
    ].join('\n'));
  } catch (err) {
    logger.error(`Pre-market check failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 5. 09:14 IST — Start live data stream ────────────────────────────────────
cron.schedule('14 9 * * 1-5', async () => {
  logger.info('Scheduler: Starting live ticker stream', { module: 'scheduler' });
  scanActive = true;
}, { timezone: IST });

// ── 6. 09:15 IST — Signal scan loop (every 3 min, 9:15–3:10) ─────────────────
cron.schedule('*/3 9-15 * * 1-5', async () => {
  if (!scanActive) return;
  if (pauseUntil && new Date() < pauseUntil) return;

  const now = new Date();
  const istH = (now.getUTCHours() + 5) % 24;
  const istM = (now.getUTCMinutes() + 30) % 60;
  if (istH < 9 || (istH === 9 && istM < 15)) return;
  if (istH > 15 || (istH === 15 && istM >= 10)) return;

  logger.info('Scheduler: Running signal scan', { module: 'scheduler' });
  try {
    const signals = await signalService().runScanCycle(WATCHED_SYMBOLS.slice(0, 10));
    for (const sig of signals) {
      await telegramBot().sendSignalAlert(sig);
    }
    // Expire stale pending signals
    await signalService().expireStaleSignals();
  } catch (err) {
    logger.error(`Signal scan error: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 7. 12:00 IST — Mid-day check ─────────────────────────────────────────────
cron.schedule('0 12 * * 1-5', async () => {
  logger.info('Scheduler: Mid-day performance check', { module: 'scheduler' });
  try {
    const rpt = await reportService().generateDailyReport();
    await telegramBot().sendSystemAlert(
      `📊 *Mid-Day Update*\nTrades: ${rpt.totalTrades} | Win Rate: ${rpt.winRate}%\nNet P&L: ₹${rpt.netPnl}`
    );
  } catch (err) {
    logger.error(`Mid-day check error: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 8. 15:10 IST — Stop new signals ──────────────────────────────────────────
cron.schedule('10 15 * * 1-5', async () => {
  logger.info('Scheduler: Stopping new signals (3:10 PM)', { module: 'scheduler' });
  scanActive = false;
  await telegramBot().sendSystemAlert('⏸️ Signal generation paused for today (3:10 PM cutoff)');
}, { timezone: IST });

// ── 9. 15:15 IST — Auto square off MIS ───────────────────────────────────────
cron.schedule('15 15 * * 1-5', async () => {
  logger.info('Scheduler: Auto square-off MIS positions', { module: 'scheduler' });
  try {
    const results = await zerodha().squareOffAll();
    logger.info(`Squared off ${results.length} positions`, { module: 'scheduler' });
    await telegramBot().sendSystemAlert(`🔒 Auto square-off: ${results.length} MIS positions closed`);
  } catch (err) {
    logger.error(`Square-off failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 10. 15:35 IST — Daily report ─────────────────────────────────────────────
cron.schedule('35 15 * * 1-5', async () => {
  logger.info('Scheduler: Generating daily report', { module: 'scheduler' });
  try {
    await reportService().sendTelegramReport('daily');

    // Save daily session
    const date   = new Date().toISOString().slice(0, 10);
    const report = await reportService().generateDailyReport();
    await DailySession.findOneAndUpdate(
      { date },
      {
        capital:     Number(process.env.DAILY_CAPITAL),
        grossPnl:    parseFloat(report.grossPnl),
        charges:     parseFloat(report.charges),
        netPnl:      parseFloat(report.netPnl),
        netPnlPct:   parseFloat(report.netPnl) / Number(process.env.DAILY_CAPITAL) * 100,
        tradesTotal: report.totalTrades,
        tradesWon:   report.won,
        tradesLost:  report.lost,
        winRate:     parseFloat(report.winRate),
        bestTrade:   parseFloat(report.bestTrade),
        worstTrade:  parseFloat(report.worstTrade),
      },
      { upsert: true }
    );
  } catch (err) {
    logger.error(`Daily report failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 11. Sunday 20:00 — Weekly report ─────────────────────────────────────────
cron.schedule('0 20 * * 0', async () => {
  logger.info('Scheduler: Weekly report', { module: 'scheduler' });
  try {
    await reportService().sendTelegramReport('weekly');
  } catch (err) {
    logger.error(`Weekly report failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 13. Every 30 min — News refresh (8 AM to 8 PM) ───────────────────────────
cron.schedule('*/30 8-20 * * *', async () => {
  logger.info('Scheduler: Refreshing India & Global news', { module: 'scheduler' });
  try {
    await Promise.all([
      marketIntelSvc().fetchIndiaNews(),
      marketIntelSvc().fetchGlobalNews(),
    ]);
  } catch (err) {
    logger.error(`News refresh failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 14. Daily 18:00 IST — FII/DII fetch ──────────────────────────────────────
cron.schedule('0 18 * * 1-5', async () => {
  logger.info('Scheduler: Fetching FII/DII data', { module: 'scheduler' });
  try {
    const results = await marketIntelSvc().fetchFiiDii();
    logger.info(`FII/DII stored: ${results.length} days`, { module: 'scheduler' });
  } catch (err) {
    logger.error(`FII/DII fetch failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 15. Sunday 07:00 — Investment stock fundamentals refresh ──────────────────
cron.schedule('0 7 * * 0', async () => {
  logger.info('Scheduler: Seeding/refreshing investment stocks', { module: 'scheduler' });
  try {
    await investSvc().seedStocks();
    await investSvc().refreshStockPrices();
    logger.info('Investment stocks refreshed', { module: 'scheduler' });
  } catch (err) {
    logger.error(`Investment refresh failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 16. Daily 08:00 IST — Investment price refresh ────────────────────────────
cron.schedule('0 8 * * 1-5', async () => {
  logger.info('Scheduler: Refreshing investment stock prices', { module: 'scheduler' });
  try {
    const count = await investSvc().refreshStockPrices();
    logger.info(`Investment prices refreshed: ${count}`, { module: 'scheduler' });
  } catch (err) {
    logger.error(`Investment price refresh failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 12. 1st of month 07:00 — Monthly review ──────────────────────────────────
cron.schedule('0 7 1 * *', async () => {
  logger.info('Scheduler: Monthly review', { module: 'scheduler' });
  try {
    await reportService().sendTelegramReport('monthly');
  } catch (err) {
    logger.error(`Monthly report failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── Pause control ────────────────────────────────────────────────────────────
function pauseSignals(minutes) {
  pauseUntil = new Date(Date.now() + minutes * 60 * 1000);
  logger.info(`Signal scan paused for ${minutes} minutes`, { module: 'scheduler' });
}

function start() {
  logger.info('✅ Scheduler started — all cron jobs active', { module: 'scheduler' });
}

module.exports = { start, pauseSignals, WATCHED_SYMBOLS };
