'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const TelegramBot = require('node-telegram-bot-api');
const logger      = require('../backend/src/config/logger');

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID      = process.env.TELEGRAM_CHAT_ID;
const AUTH_USERS   = (process.env.TELEGRAM_AUTHORIZED_USERS || '').split(',').map(s => s.trim());

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Auth guard ────────────────────────────────────────────────────────────────
function isAuthorized(msg) {
  return AUTH_USERS.includes(String(msg.from?.id));
}

function unauthorized(chatId) {
  bot.sendMessage(chatId, '🚫 Unauthorized. Your ID is not in the allowed list.');
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function safeReply(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...opts });
  } catch (err) {
    logger.error(`Telegram send failed: ${err.message}`, { module: 'telegramBot' });
  }
}

// ── Commands ─────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, [
    '🚀 *AlphaDesk Trading System*',
    '',
    'Available commands:',
    '/status — System health',
    '/pnl — Today\'s P&L',
    '/weekly — Weekly performance',
    '/monthly — Monthly review',
    '/positions — Open trades',
    '/signals — Last 5 signals',
    '/budget [amount] — Set capital',
    '/halt — Emergency stop',
    '/resume — Resume trading',
    '/pause [minutes] — Pause signal scan',
    '/report — Generate daily report',
    '/backtest [strategy] — Quick backtest',
    '/regime — Market regime',
    '/sentiment — News sentiment',
    '/settings — View config',
    '/help — This message',
  ].join('\n'));
});

bot.onText(/\/help/, (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  bot.emit('text', Object.assign(msg, { text: '/start' }));
});

bot.onText(/\/status/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const axios  = require('axios');
    const { data } = await axios.get('http://localhost:4000/health', { timeout: 5000 });
    safeReply(msg.chat.id, [
      '📡 *System Status*',
      `Backend: ${data.status === 'ok' ? '✅' : '❌'} ${data.status}`,
      `Database: ${data.db === 'connected' ? '✅' : '❌'} ${data.db}`,
      `ML Engine: ${data.ml === 'online' ? '✅' : '❌'} ${data.ml}`,
      `CPU: ${data.cpu} | RAM: ${data.memory}`,
      `Uptime: ${Math.floor(data.uptime / 60)}m`,
    ].join('\n'));
  } catch {
    safeReply(msg.chat.id, '❌ Backend unreachable');
  }
});

bot.onText(/\/pnl/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Trade } = require('../database/schemas');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const trades = await Trade.find({
      entryTime: { $gte: today },
      status:    { $in: ['CLOSED', 'SL_HIT', 'TARGET_HIT'] },
    });
    const gross = trades.reduce((s, t) => s + (t.pnl || 0), 0);
    const ch    = trades.reduce((s, t) => s + (t.charges?.total || 0), 0);
    const net   = gross - ch;
    const won   = trades.filter(t => (t.pnl || 0) > 0).length;
    safeReply(msg.chat.id, [
      `📊 *Today's P&L — ${new Date().toLocaleDateString('en-IN')}*`,
      '',
      `Trades: ${trades.length} | ✅ ${won} | ❌ ${trades.length - won}`,
      `Win Rate: ${trades.length ? ((won / trades.length) * 100).toFixed(0) : 0}%`,
      `Gross P&L: ₹${gross.toFixed(2)}`,
      `Charges:  -₹${ch.toFixed(2)}`,
      `*Net P&L: ₹${net.toFixed(2)}*`,
    ].join('\n'));
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/positions/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Trade } = require('../database/schemas');
    const open = await Trade.find({ status: 'OPEN' });
    if (!open.length) return safeReply(msg.chat.id, '📭 No open positions');
    const lines = open.map(t =>
      `• *${t.symbol}* ${t.type} x${t.qty} @ ₹${t.entryPrice} | SL: ₹${t.stoploss}`
    );
    safeReply(msg.chat.id, `📈 *Open Positions (${open.length})*\n\n${lines.join('\n')}`);
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/signals/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Signal } = require('../database/schemas');
    const signals = await Signal.find().sort({ createdAt: -1 }).limit(5);
    if (!signals.length) return safeReply(msg.chat.id, '📭 No recent signals');
    const lines = signals.map(s =>
      `• *${s.symbol}* ${s.type} [${s.strategy}] ${s.confidence}% conf — ${s.status}`
    );
    safeReply(msg.chat.id, `📡 *Last 5 Signals*\n\n${lines.join('\n')}`);
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/budget(?:\s+(\d+))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  const amount = match?.[1];
  if (!amount) return safeReply(msg.chat.id, 'Usage: /budget 50000');
  try {
    const { Budget } = require('../database/schemas');
    const date = new Date().toISOString().slice(0, 10);
    const budget = await Budget.findOneAndUpdate(
      { date },
      { capital: Number(amount), setBy: String(msg.from.id) },
      { upsert: true, new: true }
    );
    safeReply(msg.chat.id, `✅ Daily capital set to *₹${Number(amount).toLocaleString('en-IN')}*`);
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/halt/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Budget } = require('../database/schemas');
    const date = new Date().toISOString().slice(0, 10);
    await Budget.findOneAndUpdate(
      { date },
      { halted: true, haltReason: 'Manual halt via Telegram' },
      { upsert: true }
    );
    safeReply(msg.chat.id, '🛑 *Trading HALTED*\nAll new signals blocked. Existing trades still monitored.\nUse /resume to restart.');
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/resume/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Budget } = require('../database/schemas');
    const date = new Date().toISOString().slice(0, 10);
    await Budget.findOneAndUpdate(
      { date },
      { halted: false, haltReason: null },
      { upsert: true }
    );
    safeReply(msg.chat.id, '▶️ *Trading RESUMED*\nSignal generation reactivated.');
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/regime/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { MarketRegime } = require('../database/schemas');
    const regime = await MarketRegime.findOne({ symbol: 'NIFTY 50' }).sort({ timestamp: -1 });
    if (!regime) return safeReply(msg.chat.id, '📊 No regime data available yet');
    const emoji = {
      TRENDING_UP: '📈', TRENDING_DOWN: '📉', RANGING: '↔️', VOLATILE: '⚡',
    }[regime.regime] || '❓';
    safeReply(msg.chat.id, `${emoji} *Market Regime*\n\nRegime: *${regime.regime}*\nConfidence: ${regime.confidence}%\nUpdated: ${new Date(regime.timestamp).toLocaleTimeString('en-IN')}`);
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/sentiment/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { SentimentScore } = require('../database/schemas');
    const score = await SentimentScore.findOne().sort({ createdAt: -1 });
    if (!score) return safeReply(msg.chat.id, '📰 No sentiment data yet');
    const emoji = score.label === 'BULLISH' ? '🟢' : score.label === 'BEARISH' ? '🔴' : '🟡';
    safeReply(msg.chat.id, `${emoji} *Market Sentiment*\n\nLabel: *${score.label}*\nScore: ${score.score}/100\n+ve: ${score.positiveCount} | -ve: ${score.negativeCount}\nArticles: ${score.articlesAnalyzed}`);
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/settings/, (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, [
    '⚙️ *AlphaDesk Configuration*',
    '',
    `Capital: ₹${Number(process.env.DAILY_CAPITAL).toLocaleString('en-IN')}`,
    `Risk/Trade: ${(Number(process.env.MAX_RISK_PER_TRADE) * 100).toFixed(1)}%`,
    `Daily Loss Limit: ${(Number(process.env.DAILY_LOSS_LIMIT) * 100).toFixed(1)}%`,
    `Max Open Trades: ${process.env.MAX_CONCURRENT_TRADES}`,
    `ML Min Confidence: ${process.env.ML_MIN_CONFIDENCE}%`,
    `Product: ${process.env.PRODUCT_TYPE}`,
    `Markets: ${process.env.MARKETS}`,
  ].join('\n'));
});

bot.onText(/\/report/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const reportService = require('../backend/src/services/reportService');
    const report = await reportService.generateDailyReport();
    const text   = reportService.formatReportMessage('daily', report);
    safeReply(msg.chat.id, text);
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error generating report: ${err.message}`);
  }
});

bot.onText(/\/weekly/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const reportService = require('../backend/src/services/reportService');
    const report = await reportService.generateWeeklyReport();
    const text   = reportService.formatReportMessage('weekly', report);
    safeReply(msg.chat.id, text);
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

bot.onText(/\/monthly/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const reportService = require('../backend/src/services/reportService');
    const report = await reportService.generateMonthlyReport();
    const text   = reportService.formatReportMessage('monthly', report);
    safeReply(msg.chat.id, text);
  } catch (err) {
    safeReply(msg.chat.id, `❌ Error: ${err.message}`);
  }
});

// ── Inline button callbacks ────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  if (!AUTH_USERS.includes(String(query.from.id))) {
    return bot.answerCallbackQuery(query.id, { text: 'Unauthorized' });
  }

  const [action, id] = query.data.split(':');

  try {
    if (action === 'approve_signal') {
      const signalService = require('../backend/src/services/signalService');
      const result = await signalService.approveSignal(id, String(query.from.id));
      await bot.answerCallbackQuery(query.id, { text: '✅ Signal approved & executed!' });
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id:    query.message.chat.id,
        message_id: query.message.message_id,
      });
      await sendTradeOpenAlert(result.trade);
    }

    if (action === 'reject_signal') {
      const { Signal } = require('../database/schemas');
      await Signal.findByIdAndUpdate(id, { status: 'REJECTED' });
      await bot.answerCallbackQuery(query.id, { text: '❌ Signal rejected' });
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id:    query.message.chat.id,
        message_id: query.message.message_id,
      });
    }

    if (action === 'close_trade') {
      const executionService = require('../backend/src/services/executionService');
      await executionService.closeTrade(id, 'MANUAL');
      await bot.answerCallbackQuery(query.id, { text: '✅ Trade closed' });
    }
  } catch (err) {
    bot.answerCallbackQuery(query.id, { text: `Error: ${err.message}` });
  }
});

// ── Alert senders (called by other modules) ───────────────────────────────
async function sendSignalAlert(signal) {
  const emoji = signal.type === 'BUY' ? '🟢' : '🔴';
  const text = [
    `${emoji} *New Signal: ${signal.symbol}*`,
    '',
    `Direction: *${signal.type}*`,
    `Strategy: ${signal.strategy}`,
    `Entry: ₹${signal.entry}`,
    `Stoploss: ₹${signal.stoploss}`,
    `Target: ₹${signal.target1} / ₹${signal.target2}`,
    `R:R = ${signal.riskReward?.toFixed(2)}`,
    `Confidence: *${signal.confidence}%*`,
    `Regime: ${signal.regime} | Sentiment: ${signal.sentimentScore}`,
    '',
    `📋 *Confirmations:*`,
    ...(signal.confirmations || []).map(c => `• ${c}`),
    '',
    `💡 *Reasons:*`,
    ...(signal.reasons || []).slice(0, 4).map(r => `• ${r}`),
  ].join('\n');

  return safeReply(CHAT_ID, text, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ APPROVE & EXECUTE', callback_data: `approve_signal:${signal._id}` },
        { text: '❌ REJECT',            callback_data: `reject_signal:${signal._id}` },
      ]],
    },
  });
}

async function sendTradeOpenAlert(trade) {
  const emoji = trade.type === 'BUY' ? '📈' : '📉';
  const text = [
    `${emoji} *Trade Opened: ${trade.symbol}*`,
    '',
    `${trade.type} x${trade.qty} @ ₹${trade.entryPrice}`,
    `Stoploss: ₹${trade.stoploss}`,
    `Target: ₹${trade.target}`,
    `Risk: ₹${trade.riskAmount}`,
    `Product: ${trade.product}`,
  ].join('\n');
  return safeReply(CHAT_ID, text, {
    reply_markup: {
      inline_keyboard: [[
        { text: '🔒 Close Trade', callback_data: `close_trade:${trade._id}` },
      ]],
    },
  });
}

async function sendTradeCloseAlert(trade) {
  const pnl   = trade.netPnl || 0;
  const emoji = pnl >= 0 ? '✅' : '❌';
  const text = [
    `${emoji} *Trade Closed: ${trade.symbol}*`,
    '',
    `Status: ${trade.status}`,
    `Entry: ₹${trade.entryPrice} → Exit: ₹${trade.exitPrice}`,
    `Qty: ${trade.qty} | Duration: ${trade.durationMin}m`,
    `Gross P&L: ₹${trade.pnl?.toFixed(2)}`,
    `Charges: ₹${trade.charges?.total?.toFixed(2)}`,
    `*Net P&L: ₹${pnl.toFixed(2)}*`,
    `R-Multiple: ${trade.rMultiple?.toFixed(2)}R`,
  ].join('\n');
  return safeReply(CHAT_ID, text);
}

async function sendRiskAlert(msg) {
  return safeReply(CHAT_ID, `⚠️ *Risk Alert*\n\n${msg}`, {
    reply_markup: {
      inline_keyboard: [[
        { text: '▶️ CONTINUE TRADING', callback_data: 'risk_continue' },
        { text: '🛑 HALT NOW',         callback_data: 'risk_halt' },
      ]],
    },
  });
}

async function sendSystemAlert(msg) {
  return safeReply(CHAT_ID, `🔔 *System Alert*\n\n${msg}`);
}

bot.on('polling_error', (err) => {
  logger.error(`Telegram polling error: ${err.message}`, { module: 'telegramBot' });
});

logger.info('✅ Telegram bot started', { module: 'telegramBot' });

module.exports = {
  bot,
  sendMessage:        (chatId, text, opts) => safeReply(chatId || CHAT_ID, text, opts),
  sendSignalAlert,
  sendTradeOpenAlert,
  sendTradeCloseAlert,
  sendRiskAlert,
  sendSystemAlert,
};
