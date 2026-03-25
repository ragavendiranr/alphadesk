'use strict';
const axios  = require('axios');
const logger = require('../config/logger');

// ── Component status store ─────────────────────────────────────────────────────
const STATUS = {
  aiEngine:       { status: 'unknown', lastCheck: null, error: null, label: 'AI Engine' },
  database:       { status: 'unknown', lastCheck: null, error: null, label: 'Database' },
  marketData:     { status: 'unknown', lastCheck: null, error: null, label: 'Market Data', lastTick: null },
  brokerApi:      { status: 'unknown', lastCheck: null, error: null, label: 'Broker API' },
  strategyEngine: { status: 'unknown', lastCheck: null, error: null, label: 'Strategy Engine' },
  newsFeed:       { status: 'unknown', lastCheck: null, error: null, label: 'News Feed' },
  backtestEngine: { status: 'unknown', lastCheck: null, error: null, label: 'Backtest Engine' },
  webSocket:      { status: 'unknown', lastCheck: null, error: null, label: 'WebSocket', connections: 0 },
  scheduler:      { status: 'running', lastCheck: null, error: null, label: 'Scheduler' },
};

// Active alerts (deduplicated by component)
const activeAlerts = new Map();
// Repair attempt tracking: { component → { count, lastAttempt, escalated } }
const repairAttempts = new Map();
let   io            = null;
let   monitorLoop   = null;
let   lastCheckTime = null;
let   noSignalReason = 'System initializing';

// ── Start / Stop ───────────────────────────────────────────────────────────────
function start(socketIo) {
  io = socketIo;
  runHealthCheck();
  monitorLoop = setInterval(runHealthCheck, 30_000);
  logger.info('System health monitor started (30 s interval)', { module: 'healthMonitor' });
}

function stop() {
  if (monitorLoop) clearInterval(monitorLoop);
}

// ── Master health check ────────────────────────────────────────────────────────
async function runHealthCheck() {
  lastCheckTime = new Date();
  await Promise.allSettled([
    checkAiEngine(),
    checkDatabase(),
    checkMarketData(),
    checkBrokerApi(),
    checkStrategyEngine(),
    checkNewsFeed(),
    checkBacktestEngine(),
    checkWebSocket(),
    checkScheduler(),
  ]);
  if (io) io.emit('system:health', getHealthSummary());
}

// ── Individual checks ──────────────────────────────────────────────────────────

async function checkAiEngine() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return set('aiEngine', 'unconfigured', 'ANTHROPIC_API_KEY not set');
  try {
    await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-haiku-4-5-20251001', max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }] },
      { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, timeout: 12_000 }
    );
    set('aiEngine', 'online');
    clearAlert('aiEngine');
  } catch (err) {
    const msg  = err.response?.data?.error?.message || err.message || 'Unknown error';
    const code = err.response?.status;
    if (code === 529 || msg.includes('overloaded')) return set('aiEngine', 'degraded', 'API overloaded — retrying');
    if (code === 402 || msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('balance')) {
      set('aiEngine', 'credit_exhausted', msg);
      triggerAlert('aiEngine', 'AI_CREDIT_EXHAUSTED',
        'AI API Credit Exhausted',
        'Add credits at console.anthropic.com to restore AI features.');
    } else {
      set('aiEngine', 'offline', msg);
      triggerAlert('aiEngine', 'AI_OFFLINE', 'AI Engine Offline', msg);
    }
  }
}

async function checkDatabase() {
  try {
    const { mongoose } = require('../config/db');
    const state = mongoose.connection.readyState;
    if (state === 1) { set('database', 'connected'); clearAlert('database'); }
    else {
      set('database', 'disconnected', `State=${state}`);
      triggerAlert('database', 'DB_DISCONNECTED', 'Database Connection Lost', `ReadyState: ${state}`);
    }
  } catch (err) { set('database', 'error', err.message); }
}

async function checkMarketData() {
  try {
    const { OHLC }      = require('../../../database/schemas');
    const { isMarketOpen } = require('./techSignalService');
    const recent        = await OHLC.findOne().sort({ timestamp: -1 }).select('timestamp symbol').lean();

    if (!recent) {
      set('marketData', 'no_data', 'No OHLC records found');
      return;
    }
    STATUS.marketData.lastTick = recent.timestamp;
    const ageMs = Date.now() - new Date(recent.timestamp).getTime();

    if (isMarketOpen() && ageMs > 60_000) {
      const ageSec = Math.round(ageMs / 1000);
      set('marketData', 'stale', `Last tick ${ageSec}s ago`);
      triggerAlert('marketData', 'STALE_MARKET_DATA',
        'Market Data Feed Stale',
        `Last update was ${ageSec} seconds ago. Feed may be disconnected.`);
    } else {
      set('marketData', 'connected');
      clearAlert('marketData');
    }
  } catch (err) { set('marketData', 'error', err.message); }
}

async function checkBrokerApi() {
  try {
    const zerodha = require('../../../execution/zerodha');
    // Use getQuote on a liquid symbol as a lightweight auth probe
    await zerodha.getQuote('NIFTY 50');
    set('brokerApi', 'authenticated');
    clearAlert('brokerApi');
  } catch (err) {
    const msg  = err.message || '';
    const auth = /auth|token|session|403|401/i.test(msg) || err.response?.status === 403;
    if (auth) {
      set('brokerApi', 'auth_expired', 'Session expired — re-login required');
      triggerAlert('brokerApi', 'BROKER_AUTH_EXPIRED',
        'Zerodha Authentication Expired',
        'Session token has expired. Auto-login will be attempted.');
    } else {
      set('brokerApi', 'offline', msg);
    }
  }
}

async function checkStrategyEngine() {
  try {
    const { Signal }       = require('../../../database/schemas');
    const { isMarketOpen } = require('./techSignalService');

    if (!isMarketOpen()) {
      noSignalReason = 'Market is closed — signal scan paused';
      set('strategyEngine', 'paused', 'Market closed');
      clearAlert('strategyEngine');
      return;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todaySignals = await Signal.countDocuments({ createdAt: { $gte: today } });
    const last = await Signal.findOne({ createdAt: { $gte: today } }).sort({ createdAt: -1 }).lean();
    const ageMin = last ? (Date.now() - new Date(last.createdAt).getTime()) / 60_000 : Infinity;

    if (STATUS.database.status !== 'connected') {
      noSignalReason = 'Database disconnected — cannot fetch market data for scan';
    } else if (STATUS.brokerApi.status !== 'authenticated') {
      noSignalReason = 'Broker API offline — no live tick data for strategy engine';
    } else if (todaySignals === 0) {
      noSignalReason = 'No signals generated today — market opened but strategy scan found no qualifying setups';
    } else if (ageMin > 10) {
      noSignalReason = `Last signal was ${ageMin.toFixed(0)} minutes ago — engine running but no recent setups`;
    } else {
      noSignalReason = `${todaySignals} signal(s) generated today — engine running normally`;
    }

    if (ageMin > 10) {
      set('strategyEngine', 'idle', `Last scan ${ageMin.toFixed(0)}m ago`);
      triggerAlert('strategyEngine', 'STRATEGY_IDLE',
        'Strategy Engine Idle During Market Hours',
        `${noSignalReason}`);
    } else {
      set('strategyEngine', 'running', `${todaySignals} signals today`);
      clearAlert('strategyEngine');
    }
  } catch (err) { set('strategyEngine', 'unknown', err.message); }
}

async function checkNewsFeed() {
  try {
    const { MarketNews } = require('../../../database/schemas');
    // Check if we have recent news in the DB (within last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentCount = await MarketNews.countDocuments({ publishedAt: { $gte: twoHoursAgo } });
    const totalCount  = await MarketNews.countDocuments({});

    if (recentCount > 0) {
      set('newsFeed', 'active');
      clearAlert('newsFeed');
    } else if (totalCount > 0) {
      const latest = await MarketNews.findOne().sort({ publishedAt: -1 }).select('publishedAt').lean();
      const ageMin = latest ? Math.round((Date.now() - new Date(latest.publishedAt).getTime()) / 60000) : null;
      set('newsFeed', 'stale', ageMin ? `Last article ${ageMin}m ago` : 'No recent articles');
    } else {
      set('newsFeed', 'no_data', 'No news articles in DB yet');
      triggerAlert('newsFeed', 'NEWS_FEED_EMPTY', 'News Feed Empty', 'No articles in database');
    }
  } catch (err) {
    set('newsFeed', 'error', err.message);
  }
}

async function checkBacktestEngine() {
  try {
    const { BacktestResult } = require('../../../database/schemas');
    const count = await BacktestResult.countDocuments({});
    if (count > 0) { set('backtestEngine', 'ready'); clearAlert('backtestEngine'); }
    else { set('backtestEngine', 'no_data', 'No backtest results yet'); }
  } catch (err) { set('backtestEngine', 'error', err.message); }
}

async function checkWebSocket() {
  try {
    if (!io) return set('webSocket', 'offline', 'Socket.IO not ready');
    const count = io.engine?.clientsCount ?? 0;
    STATUS.webSocket.connections = count;
    set('webSocket', 'running');
  } catch (err) { set('webSocket', 'error', err.message); }
}

function checkScheduler() {
  set('scheduler', 'running');
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function set(name, status, error = null) {
  STATUS[name] = { ...STATUS[name], status, error, lastCheck: new Date().toISOString() };
}

function triggerAlert(component, code, title, detail) {
  const existing = activeAlerts.get(component);
  if (existing?.code === code) return; // deduplicate

  const alert = { component, code, title, detail, timestamp: new Date().toISOString(), repairInProgress: false };
  activeAlerts.set(component, alert);
  if (io) io.emit('system:alert', alert);

  logger.warn(`[HEALTH] ${code}: ${title}`, { module: 'healthMonitor' });

  // Auto-repair: attempt up to 3 times before escalating
  const rec = repairAttempts.get(component) || { count: 0, escalated: false };
  if (!rec.escalated && rec.count < 3) {
    rec.count++;
    repairAttempts.set(component, rec);
    const attemptNum = rec.count;
    logger.info(`[HEALTH] Auto-repair attempt ${attemptNum}/3 for ${component}`, { module: 'healthMonitor' });
    setImmediate(() => repairComponent(component, attemptNum));
  } else if (!rec.escalated) {
    rec.escalated = true;
    repairAttempts.set(component, rec);
    // Escalate to user after 3 failed repair attempts
    sendTelegramEscalation(title, detail, component).catch(() => {});
  }
}

function clearAlert(component) {
  if (activeAlerts.has(component)) {
    activeAlerts.delete(component);
    if (io) io.emit('system:alert_cleared', { component });
  }
}

async function sendTelegramAlert(title, detail, component, attempt = null) {
  try {
    const bot = require('../../../telegram-bot/bot');
    const attemptInfo = attempt ? ` (Auto-repair attempt ${attempt}/3)` : '';
    await bot.sendSystemAlert(
      `⚠️ *ERROR ALERT*${attemptInfo}\n\n` +
      `*Issue:* ${title}\n` +
      `*Component:* ${component}\n` +
      `*Status:* Failed\n` +
      `*Detail:* ${detail}\n\n` +
      `*Action Taken:*\n• Auto-repair triggered automatically\n\n` +
      `*Next Step:*\n• ${attempt && attempt < 3 ? `Retry ${attempt}/3 in progress` : 'Awaiting repair result'}`
    );
  } catch {}
}

async function sendTelegramEscalation(title, detail, component) {
  const MANUAL_FIX = {
    brokerApi:      'Run /repair broker in Telegram or re-login to Zerodha manually',
    aiEngine:       'Check Anthropic API credits at console.anthropic.com',
    database:       'Check MongoDB Atlas cluster status',
    marketData:     'Restart the backend server; check Zerodha WebSocket',
    strategyEngine: 'Send /resume in Telegram to restart signal scan',
    newsFeed:       'Check NEWS_API_KEY environment variable',
  };
  try {
    const bot = require('../../../telegram-bot/bot');
    await bot.sendSystemAlert(
      `🔴 *ESCALATION — 3 Auto-Repairs Failed*\n\n` +
      `*Component:* ${component}\n` +
      `*Issue:* ${title}\n` +
      `*Detail:* ${detail}\n\n` +
      `*⚠️ Manual Fix Required:*\n${MANUAL_FIX[component] || 'Check server logs for details'}`
    );
  } catch {}
}

// ── Auto-repair engine ─────────────────────────────────────────────────────────
async function repairComponent(component, attemptNum = null) {
  const steps = [];
  const push   = (msg) => { steps.push(msg); logger.info(`[REPAIR] ${msg}`, { module: 'healthMonitor' }); };
  const label  = attemptNum ? ` [Attempt ${attemptNum}/3]` : '';

  try {
    switch (component) {

      case 'aiEngine': {
        push('Checking Anthropic API connection...');
        await checkAiEngine();
        const s = STATUS.aiEngine;
        if (s.status === 'online')           { push('AI Engine is back online.'); clearAlert('aiEngine'); }
        else if (s.status === 'credit_exhausted') push('Credit exhausted — add credits at console.anthropic.com');
        else                                  push(`Still offline: ${s.error}`);
        break;
      }

      case 'marketData': {
        push('Restarting market data stream...');
        try {
          const zerodha = require('../../../execution/zerodha');
          if (typeof zerodha.reconnect === 'function') {
            await zerodha.reconnect();
            push('WebSocket reconnected to Zerodha.');
          } else {
            push('Reconnect method not available — manual restart may be needed.');
          }
          await checkMarketData();
          push(`Market data status: ${STATUS.marketData.status}`);
        } catch (e) { push(`Failed: ${e.message}`); }
        break;
      }

      case 'brokerApi': {
        push('Attempting Zerodha re-authentication...');
        try {
          const zerodha = require('../../../execution/zerodha');
          await zerodha.autoLogin();
          push('Zerodha TOTP auto-login successful.');
          set('brokerApi', 'authenticated');
          clearAlert('brokerApi');
        } catch (e) {
          push(`Auto-login failed: ${e.message}`);
          push('Manual Zerodha login required.');
        }
        break;
      }

      case 'strategyEngine': {
        push('Triggering signal scan...');
        try {
          const { runTASignalScan } = require('./techSignalService');
          runTASignalScan(); // fire-and-forget
          push('Signal scan triggered successfully.');
          set('strategyEngine', 'running');
          clearAlert('strategyEngine');
        } catch (e) { push(`Failed: ${e.message}`); }
        break;
      }

      case 'database': {
        push('Attempting database reconnect...');
        try {
          const { connectDB } = require('../config/db');
          await connectDB();
          push('Database reconnected.');
          set('database', 'connected');
          clearAlert('database');
        } catch (e) { push(`Failed: ${e.message}`); }
        break;
      }

      case 'newsFeed': {
        push('Re-testing news feed...');
        await checkNewsFeed();
        push(`News feed status: ${STATUS.newsFeed.status}`);
        break;
      }

      default:
        push(`No auto-repair available for: ${component}`);
    }

    // Full re-check after repair
    await runHealthCheck();

    // Check if repair succeeded — if so, reset counters
    const newStatus = STATUS[component]?.status;
    const succeeded = ['online', 'connected', 'running', 'authenticated', 'active', 'ready'].includes(newStatus);
    if (succeeded && repairAttempts.has(component)) {
      repairAttempts.delete(component);
      logger.info(`[REPAIR] ${component} repaired successfully — counters reset`, { module: 'healthMonitor' });
    }

    // Notify via Telegram
    try {
      const bot = require('../../../telegram-bot/bot');
      await bot.sendSystemAlert(
        `🔧 *Auto-Repair Report${label}*\n\n*Component:* ${component}\n*Result:* ${succeeded ? '✅ Fixed' : '❌ Still failing'}\n\n` +
        steps.map(s => `• ${s}`).join('\n')
      );
    } catch {}

  } catch (err) {
    push(`Repair engine error: ${err.message}`);
  }

  return steps;
}

// ── Status report formatter ─────────────────────────────────────────────────────
function generateStatusReport() {
  const fmt = (s) => {
    if (!s) return '❓ UNKNOWN';
    const ok = ['online', 'connected', 'running', 'authenticated', 'active', 'ready'];
    const warn = ['degraded', 'stale', 'paused', 'idle', 'no_data', 'unconfigured'];
    if (ok.includes(s.status))   return `✅ ${s.status.toUpperCase()}`;
    if (warn.includes(s.status)) return `⚠️ ${s.status.toUpperCase()}`;
    return `❌ ${s.status?.toUpperCase() || 'UNKNOWN'}`;
  };

  const alerts = Array.from(activeAlerts.values());
  const { Signal, Trade } = (() => {
    try { return require('../../../database/schemas'); } catch { return {}; }
  })();

  return [
    `📊 *SYSTEM STATUS UPDATE*`,
    `_${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST_`,
    ``,
    `Market Data:      ${fmt(STATUS.marketData)}`,
    `AI Engine:        ${fmt(STATUS.aiEngine)}`,
    `Broker (Zerodha): ${fmt(STATUS.brokerApi)}`,
    `Strategy Engine:  ${fmt(STATUS.strategyEngine)}`,
    `News Feed:        ${fmt(STATUS.newsFeed)}`,
    `Database:         ${fmt(STATUS.database)}`,
    `WebSocket:        ${fmt(STATUS.webSocket)}`,
    ``,
    `📝 *Signal Status:*`,
    noSignalReason,
    ``,
    alerts.length
      ? `🚨 *Active Alerts (${alerts.length}):*\n` + alerts.map(a => `• ${a.title}`).join('\n')
      : `✅ No active alerts`,
  ].join('\n');
}

async function sendStatusReport() {
  try {
    const bot = require('../../../telegram-bot/bot');
    await bot.sendSystemAlert(generateStatusReport());
  } catch {}
}

async function sendDashboardLink(period = 'morning') {
  try {
    const bot    = require('../../../telegram-bot/bot');
    const url    = process.env.FRONTEND_URL || 'https://alphadesk-eakgqieoq-ragavenditras-projects.vercel.app';
    const alerts = Array.from(activeAlerts.values());
    const label  = period === 'morning' ? '🌅 Morning Report' : '🌆 Evening Report';
    const overall = alerts.length === 0 ? '✅ All systems operational' : `⚠️ ${alerts.length} active alert(s)`;
    const { isMarketOpen } = require('./techSignalService');
    const tradingStatus = isMarketOpen() ? '🟢 Trading Active' : '⏸️ Market Closed';

    await bot.sendSystemAlert([
      `${label} — AlphaDesk`,
      ``,
      `🔗 Dashboard: ${url}`,
      ``,
      `System: ${overall}`,
      `Trading: ${tradingStatus}`,
      `Signal Engine: ${STATUS.strategyEngine.status?.toUpperCase()}`,
      ``,
      noSignalReason,
    ].join('\n'));
  } catch {}
}

// ── Public API ─────────────────────────────────────────────────────────────────
function getHealthSummary() {
  return {
    components:    STATUS,
    alerts:        Array.from(activeAlerts.values()),
    lastCheck:     lastCheckTime?.toISOString() || null,
    wsConnections: STATUS.webSocket.connections,
    noSignalReason,
  };
}

module.exports = {
  start, stop, runHealthCheck, repairComponent, getHealthSummary,
  sendStatusReport, sendDashboardLink, generateStatusReport,
};
