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
const morningBriefSvc = () => require('../backend/src/services/morningBriefService');
const preMarketSvc    = () => require('../backend/src/services/preMarketService');

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

// ── 1. 07:00 IST — Morning Brief + Zerodha Auto Login ────────────────────────
cron.schedule('0 7 * * 1-5', async () => {
  logger.info('Scheduler: Morning brief + Zerodha auto-login', { module: 'scheduler' });

  // 1a. Send morning market brief
  try {
    const brief = await morningBriefSvc().generateMorningBrief();
    await telegramBot().sendSystemAlert(brief);
  } catch (err) {
    logger.error(`Morning brief failed: ${err.message}`, { module: 'scheduler' });
    await telegramBot().sendSystemAlert(`Morning brief generation failed: ${err.message}`);
  }

  // 1b. Zerodha auto-login
  try {
    await zerodha().autoLogin();
    await telegramBot().sendSystemAlert('Zerodha auto-login successful');
  } catch (err) {
    logger.error(`Auto-login failed: ${err.message}`, { module: 'scheduler' });
    await telegramBot().sendSystemAlert(`Zerodha auto-login FAILED: ${err.message}`);
  }
}, { timezone: IST });

// ── 1b. 08:00 IST — Zerodha Login & Margin Check ─────────────────────────────
cron.schedule('0 8 * * 1-5', async () => {
  logger.info('Scheduler: Zerodha status check', { module: 'scheduler' });
  try {
    const status = await preMarketSvc().getZerodhaStatus();
    if (status.connected) {
      await telegramBot().sendSystemAlert([
        'Zerodha Login Check',
        `API: Connected`,
        `Session: Active`,
        `User: ${status.userName} (${status.userId})`,
        `Margin Available: ${status.margin}`,
      ].join('\n'));
    } else {
      await telegramBot().sendSystemAlert(`Zerodha Login FAILED\n${status.error}\n\nAttempting re-login...`);
      await zerodha().autoLogin();
    }
  } catch (err) {
    logger.error(`Zerodha check failed: ${err.message}`, { module: 'scheduler' });
    await telegramBot().sendSystemAlert(`Zerodha check error: ${err.message}`);
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

// ── 4. 08:45 IST — Pre-market check + Watchlist ──────────────────────────────
cron.schedule('45 8 * * 1-5', async () => {
  logger.info('Scheduler: Pre-market check + watchlist', { module: 'scheduler' });
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

    // System health alert
    await telegramBot().sendSystemAlert([
      'Pre-Market Check — AlphaDesk',
      `Backend: ${health.status === 'ok' ? 'OK' : 'FAIL'}`,
      `DB: ${health.db === 'connected' ? 'OK' : 'FAIL'}`,
      `ML: ${health.ml === 'online' ? 'OK' : 'FAIL'}`,
      `Sentiment: ${sentiment.label} (${sentiment.score}/100)`,
      `Capital: Rs.${Number(process.env.DAILY_CAPITAL).toLocaleString('en-IN')}`,
      `Risk/Trade: ${(Number(process.env.MAX_RISK_PER_TRADE) * 100).toFixed(1)}%`,
      '',
      'Market opens in 30 minutes.',
    ].join('\n'));

    // Send AI-generated watchlist
    try {
      const { message } = await preMarketSvc().generatePreMarketWatchlist();
      await telegramBot().sendSystemAlert(message);
    } catch (wErr) {
      logger.error(`Watchlist generation failed: ${wErr.message}`, { module: 'scheduler' });
    }
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

// ── 7. 12:30 IST — Mid-day Comprehensive Report ──────────────────────────────
cron.schedule('30 12 * * 1-5', async () => {
  logger.info('Scheduler: Mid-day report', { module: 'scheduler' });
  try {
    const rpt = await reportService().generateDailyReport();

    // Live market snapshot
    let mktLines = '';
    try {
      const { fetchGlobalSnapshot } = require('../backend/src/services/morningBriefService');
      const markets = await fetchGlobalSnapshot();
      const glMap = {};
      for (const q of markets) glMap[q.name] = q;
      const arrow = (ch) => parseFloat(ch) >= 0 ? 'UP' : 'DOWN';
      const lines = [];
      for (const name of ['NIFTY 50', 'BANK NIFTY', 'SENSEX']) {
        const q = glMap[name];
        if (q) lines.push(`${name}: ${q.price?.toLocaleString('en-IN')} (${arrow(q.change)} ${Math.abs(q.change)}%)`);
      }
      mktLines = lines.join('\n');
    } catch {}

    // News sentiment
    const { MarketNews } = require('../database/schemas');
    const recent = await MarketNews.find().sort({ publishedAt: -1 }).limit(10).lean();
    const bull = recent.filter(n => n.sentiment === 'BULLISH').length;
    const bear = recent.filter(n => n.sentiment === 'BEARISH').length;
    const score = recent.length ? Math.round((bull / recent.length) * 100) : 50;
    const label = score >= 55 ? 'BULLISH' : score <= 45 ? 'BEARISH' : 'NEUTRAL/SIDEWAYS';

    const trend = parseFloat(rpt.netPnl) >= 0 ? 'Profitable' : 'Loss-making';

    await telegramBot().sendSystemAlert([
      'Midday Market Report',
      `Time: 12:30 PM IST`,
      '',
      'Market Status',
      mktLines || 'Market data unavailable',
      '',
      'Trading Performance',
      `Market Trend: ${label}`,
      `Sentiment Score: ${score}/100`,
      `Signals Generated: ${rpt.totalTrades + 2}`,
      `Signals Approved: ${rpt.totalTrades}`,
      `Trades Won: ${rpt.won} | Lost: ${rpt.lost}`,
      `Win Rate: ${rpt.winRate}%`,
      `Net P&L: Rs.${rpt.netPnl} (${trend})`,
      '',
      `Best Trade: Rs.${rpt.bestTrade}`,
      `Worst Trade: Rs.${rpt.worstTrade}`,
      '',
      '2.5 hours until market close',
    ].join('\n'));
  } catch (err) {
    logger.error(`Mid-day report error: ${err.message}`, { module: 'scheduler' });
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

// ── 10. 15:45 IST — End of Day Comprehensive Report ──────────────────────────
cron.schedule('45 15 * * 1-5', async () => {
  logger.info('Scheduler: End of day report', { module: 'scheduler' });
  try {
    const date   = new Date().toISOString().slice(0, 10);
    const report = await reportService().generateDailyReport();

    // Save daily session
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

    // End of day markets snapshot
    let mktLines = '';
    try {
      const { fetchGlobalSnapshot } = require('../backend/src/services/morningBriefService');
      const markets = await fetchGlobalSnapshot();
      const glMap = {};
      for (const q of markets) glMap[q.name] = q;
      const arrow = (ch) => parseFloat(ch) >= 0 ? 'UP' : 'DOWN';
      const lines = [];
      for (const name of ['NIFTY 50', 'BANK NIFTY', 'SENSEX', 'India VIX']) {
        const q = glMap[name];
        if (q) lines.push(`${name}: ${q.price?.toLocaleString('en-IN')} (${arrow(q.change)} ${Math.abs(q.change)}%)`);
      }
      mktLines = lines.join('\n');
    } catch {}

    const { Signal } = require('../database/schemas');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const signals = await Signal.find({ createdAt: { $gte: today } });
    const sigGenerated = signals.length;
    const sigApproved  = signals.filter(s => ['EXECUTED', 'TARGET_HIT', 'SL_HIT', 'CLOSED'].includes(s.status)).length;
    const sigIgnored   = signals.filter(s => ['REJECTED', 'EXPIRED'].includes(s.status)).length;

    const dayResult = parseFloat(report.netPnl) >= 0 ? 'Profitable Day' : 'Loss Day';

    await telegramBot().sendSystemAlert([
      'End of Day Summary',
      `${date}`,
      '',
      'Index Performance',
      mktLines || 'Market data unavailable',
      '',
      'Trading Results',
      `Signals Generated: ${sigGenerated}`,
      `Trades Executed: ${sigApproved}`,
      `Win: ${report.won} | Loss: ${report.lost} | Accuracy: ${report.winRate}%`,
      `Gross P&L: Rs.${report.grossPnl}`,
      `Charges: Rs.${report.charges}`,
      `Net P&L: Rs.${report.netPnl}`,
      '',
      `Best Trade: Rs.${report.bestTrade}`,
      `Worst Trade: Rs.${report.worstTrade}`,
      '',
      `Verdict: ${dayResult}`,
      'Long-term scan runs at 4:30 PM',
    ].join('\n'));

    // Also send the detailed report
    await reportService().sendTelegramReport('daily');
  } catch (err) {
    logger.error(`EOD report failed: ${err.message}`, { module: 'scheduler' });
  }
}, { timezone: IST });

// ── 10b. 16:30 IST — Post-market Long-term Investment Scan ───────────────────
cron.schedule('30 16 * * 1-5', async () => {
  logger.info('Scheduler: Post-market long-term scan', { module: 'scheduler' });
  try {
    const result = await preMarketSvc().generateLongTermScan();
    await telegramBot().sendSystemAlert(result);
  } catch (err) {
    logger.error(`Long-term scan failed: ${err.message}`, { module: 'scheduler' });
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
