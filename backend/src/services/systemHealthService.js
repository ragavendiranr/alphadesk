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
let   io            = null;
let   monitorLoop   = null;
let   lastCheckTime = null;

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
    const { ActivityLog } = require('../../../database/schemas');
    const { isMarketOpen } = require('./techSignalService');
    const last = await ActivityLog.findOne({ module: 'signalScan' }).sort({ time: -1 }).lean();

    if (!isMarketOpen()) { set('strategyEngine', 'paused', 'Market closed'); clearAlert('strategyEngine'); return; }

    if (!last) {
      set('strategyEngine', 'idle', 'No scan recorded yet');
      triggerAlert('strategyEngine', 'STRATEGY_IDLE',
        'Strategy Engine Idle During Market Hours',
        'No signal scan has been executed today.');
      return;
    }
    const ageMin = (Date.now() - new Date(last.time).getTime()) / 60_000;
    if (ageMin > 10) {
      set('strategyEngine', 'idle', `Last scan ${ageMin.toFixed(0)}m ago`);
      triggerAlert('strategyEngine', 'STRATEGY_IDLE',
        'Strategy Engine Idle During Market Hours',
        `Last scan was ${ageMin.toFixed(0)} minutes ago.`);
    } else {
      set('strategyEngine', 'running');
      clearAlert('strategyEngine');
    }
  } catch (err) { set('strategyEngine', 'unknown', err.message); }
}

async function checkNewsFeed() {
  const key = process.env.NEWS_API_KEY;
  if (!key) { set('newsFeed', 'unconfigured', 'NEWS_API_KEY not set'); return; }
  try {
    const { data } = await axios.get(
      `https://newsapi.org/v2/top-headlines?country=in&category=business&pageSize=1&apiKey=${key}`,
      { timeout: 8_000 }
    );
    if (data.status === 'ok') { set('newsFeed', 'active'); clearAlert('newsFeed'); }
    else { set('newsFeed', 'error', data.message); triggerAlert('newsFeed', 'NEWS_FEED_ERROR', 'News Feed Error', data.message); }
  } catch (err) {
    set('newsFeed', 'unavailable', err.message);
    triggerAlert('newsFeed', 'NEWS_FEED_OFFLINE', 'News Feed Unavailable', err.message);
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

  sendTelegramAlert(title, detail, component).catch(() => {});
  logger.warn(`[HEALTH] ${code}: ${title}`, { module: 'healthMonitor' });
}

function clearAlert(component) {
  if (activeAlerts.has(component)) {
    activeAlerts.delete(component);
    if (io) io.emit('system:alert_cleared', { component });
  }
}

async function sendTelegramAlert(title, detail, component) {
  try {
    const bot = require('../../../telegram-bot/bot');
    await bot.sendSystemAlert(
      `🚨 *SYSTEM ALERT*\n\n` +
      `*Issue:* ${title}\n` +
      `*Component:* ${component}\n` +
      `*Detail:* ${detail}\n\n` +
      `_AlphaDesk will attempt auto-repair_`
    );
  } catch {}
}

// ── Auto-repair engine ─────────────────────────────────────────────────────────
async function repairComponent(component) {
  const steps = [];
  const push   = (msg) => { steps.push(msg); logger.info(`[REPAIR] ${msg}`, { module: 'healthMonitor' }); };

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

    // Notify via Telegram
    try {
      const bot = require('../../../telegram-bot/bot');
      await bot.sendSystemAlert(
        `🔧 *Auto-Repair Report*\n\n*Component:* ${component}\n\n` +
        steps.map(s => `• ${s}`).join('\n')
      );
    } catch {}

  } catch (err) {
    push(`Repair engine error: ${err.message}`);
  }

  return steps;
}

// ── Public API ─────────────────────────────────────────────────────────────────
function getHealthSummary() {
  return {
    components:    STATUS,
    alerts:        Array.from(activeAlerts.values()),
    lastCheck:     lastCheckTime?.toISOString() || null,
    wsConnections: STATUS.webSocket.connections,
  };
}

module.exports = { start, stop, runHealthCheck, repairComponent, getHealthSummary };
