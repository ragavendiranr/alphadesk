'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');
const logger      = require('../backend/src/config/logger');

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID    = process.env.TELEGRAM_CHAT_ID;
const AUTH_USERS = (process.env.TELEGRAM_AUTHORIZED_USERS || '').split(',').map(s => s.trim());
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ── Pending signal approval tracker (10-min timeout) ─────────────────────────
const pendingApprovals = new Map();

// ── Auth guard ────────────────────────────────────────────────────────────────
const isAuthorized = (msg) => AUTH_USERS.includes(String(msg.from?.id));
const unauthorized = (chatId) => bot.sendMessage(chatId, '🚫 Unauthorized.');

// ── Safe reply helper ─────────────────────────────────────────────────────────
async function safeReply(chatId, text, opts = {}) {
  try {
    if (text.length > 4096) {
      const chunks = [];
      for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
      let last;
      for (const chunk of chunks) {
        last = await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown', ...opts });
        await new Promise(r => setTimeout(r, 300));
      }
      return last;
    }
    return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...opts });
  } catch (err) {
    try {
      return await bot.sendMessage(chatId, text.replace(/[*_`[\]()~>#+=|{}.!]/g, ''), opts);
    } catch (e2) {
      logger.error(`Telegram send failed: ${e2.message}`, { module: 'telegramBot' });
    }
  }
}

// ── Claude AI chat helper ─────────────────────────────────────────────────────
async function askClaude(userMessage, systemCtx) {
  if (!ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY not configured.';
  try {
    const system = systemCtx || `You are AlphaDesk AI, an expert trading assistant specializing in Indian stock markets (NSE/BSE). Help with market analysis, trading strategies, portfolio advice, technical and fundamental analysis. Be concise, specific, actionable. Use Indian market context (NIFTY, SENSEX, INR, crores).`;
    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-sonnet-4-6', max_tokens: 1500, system, messages: [{ role: 'user', content: userMessage }] },
      { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 55000 }
    );
    return data?.content?.[0]?.text || 'No response.';
  } catch (err) {
    return `AI error: ${err.response?.data?.error?.message || err.message}`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

bot.onText(/\/start|\/help/, (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, [
    '🚀 *AlphaDesk AI Trading Assistant*',
    '',
    '*Trading Mentor*',
    '/commentary — Live market structure + signal explanation',
    '/learning — Weekly pattern analysis + improvement tips',
    '',
    '*System*',
    '/status — Quick system health',
    '/syshealth — Full autonomous status report',
    '/repair [component] — Trigger auto-repair',
    '',
    '*Trading*',
    '/pnl — Today P&L',
    '/positions — Open trades',
    '/signals — Last 5 signals',
    '/halt — Emergency stop',
    '/resume — Resume trading',
    '/pause [min] — Pause scan',
    '',
    '*Market*',
    '/markets — Live global markets',
    '/watchlist — Today watchlist (AI)',
    '/fii — FII/DII activity',
    '/news — Latest news',
    '/regime — Market regime',
    '/sentiment — News sentiment',
    '',
    '*Investment*',
    '/invest [SYMBOL] — AI stock deep dive',
    '/portfolio — Your holdings',
    '/longterm — AI long-term picks',
    '',
    '*Reports*',
    '/report — Daily report',
    '/weekly — Weekly performance',
    '/monthly — Monthly review',
    '/budget [amount] — Set capital',
    '',
    '*AI Chat*',
    '/ask [question] — Ask AlphaDesk AI',
    'Or just type any question freely!',
  ].join('\n'));
});

bot.onText(/\/status/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const healthSvc = require('../backend/src/services/systemHealthService');
    const summary   = healthSvc.getHealthSummary();
    const c         = summary.components;
    const fmt       = (s) => s === 'online' || s === 'connected' || s === 'running' || s === 'authenticated' || s === 'active' ? '✅' : '⚠️';
    safeReply(msg.chat.id, [
      '📡 *System Status — AlphaDesk*',
      ``,
      `${fmt(c.database?.status)} Database: ${c.database?.status}`,
      `${fmt(c.aiEngine?.status)} AI Engine: ${c.aiEngine?.status}`,
      `${fmt(c.brokerApi?.status)} Broker: ${c.brokerApi?.status}`,
      `${fmt(c.strategyEngine?.status)} Strategy: ${c.strategyEngine?.status}`,
      `${fmt(c.marketData?.status)} Market Data: ${c.marketData?.status}`,
      `${fmt(c.newsFeed?.status)} News Feed: ${c.newsFeed?.status}`,
      ``,
      `📝 *Signal Status:*`,
      summary.noSignalReason || 'Unknown',
      ``,
      summary.alerts?.length
        ? `🚨 Active Alerts: ${summary.alerts.length}\n` + summary.alerts.map(a => `• ${a.title}`).join('\n')
        : `✅ No active alerts`,
    ].join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Health check error: ${err.message}`); }
});

bot.onText(/\/syshealth/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const healthSvc = require('../backend/src/services/systemHealthService');
    safeReply(msg.chat.id, healthSvc.generateStatusReport());
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/commentary/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, 'Generating market commentary...');
  try {
    const { generateMarketCommentary } = require('../backend/src/services/marketCommentaryService');
    safeReply(msg.chat.id, await generateMarketCommentary());
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/learning/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, 'Generating weekly learning report...');
  try {
    const { Trade } = require('../database/schemas');
    const since = new Date(); since.setDate(since.getDate() - 7);
    const trades = await Trade.find({ entryTime: { $gte: since }, status: { $ne: 'OPEN' } }).lean();
    if (!trades.length) return safeReply(msg.chat.id, 'No closed trades in the last 7 days.');
    const { generateLearningReport } = require('../backend/src/services/marketCommentaryService');
    const report = await generateLearningReport(trades);
    safeReply(msg.chat.id, report || 'Learning report could not be generated.');
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/repair(?:\s+(\w+))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  const component = match?.[1];
  const valid = ['aiEngine', 'database', 'marketData', 'brokerApi', 'strategyEngine', 'newsFeed'];
  if (!component) {
    return safeReply(msg.chat.id, `Usage: /repair [component]\nComponents: ${valid.join(', ')}`);
  }
  if (!valid.includes(component)) {
    return safeReply(msg.chat.id, `Unknown component. Valid: ${valid.join(', ')}`);
  }
  safeReply(msg.chat.id, `🔧 Running repair on *${component}*...`);
  try {
    const healthSvc = require('../backend/src/services/systemHealthService');
    const steps     = await healthSvc.repairComponent(component);
    safeReply(msg.chat.id, `🔧 *Repair Complete — ${component}*\n\n` + steps.map(s => `• ${s}`).join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Repair failed: ${err.message}`); }
});

bot.onText(/\/pnl/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Trade } = require('../database/schemas');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const trades = await Trade.find({ entryTime: { $gte: today }, status: { $in: ['CLOSED', 'SL_HIT', 'TARGET_HIT'] } });
    const gross = trades.reduce((s, t) => s + (t.pnl || 0), 0);
    const ch    = trades.reduce((s, t) => s + (t.charges?.total || 0), 0);
    const net   = gross - ch;
    const won   = trades.filter(t => (t.pnl || 0) > 0).length;
    safeReply(msg.chat.id, [
      `📊 *Today P&L — ${new Date().toLocaleDateString('en-IN')}*`,
      `Trades: ${trades.length} | Win: ${won} | Loss: ${trades.length - won}`,
      `Win Rate: ${trades.length ? ((won / trades.length) * 100).toFixed(0) : 0}%`,
      `Gross: Rs.${gross.toFixed(2)} | Charges: Rs.${ch.toFixed(2)}`,
      `${net >= 0 ? '✅' : '❌'} *Net P&L: Rs.${net.toFixed(2)}*`,
    ].join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/positions/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Trade } = require('../database/schemas');
    const open = await Trade.find({ status: 'OPEN' });
    if (!open.length) return safeReply(msg.chat.id, '📭 No open positions');
    safeReply(msg.chat.id, `📈 *Open Positions (${open.length})*\n\n` +
      open.map(t => `• *${t.symbol}* ${t.type} x${t.qty} @ Rs.${t.entryPrice} | SL: Rs.${t.stoploss}`).join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/signals/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Signal } = require('../database/schemas');
    const signals = await Signal.find().sort({ createdAt: -1 }).limit(5);
    if (!signals.length) return safeReply(msg.chat.id, '📭 No recent signals');
    safeReply(msg.chat.id, `📡 *Last 5 Signals*\n\n` +
      signals.map(s => `• *${s.symbol}* ${s.type} [${s.strategy}] ${s.confidence}% — ${s.status}`).join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/markets/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, 'Fetching live markets...');
  try {
    const { fetchGlobalSnapshot } = require('../backend/src/services/morningBriefService');
    const markets = await fetchGlobalSnapshot();
    const glMap = {};
    for (const q of markets) glMap[q.name] = q;
    const arrow = (ch) => parseFloat(ch) >= 0 ? 'UP' : 'DOWN';
    const fmt = (q) => q ? `${q.price?.toLocaleString('en-IN')} (${arrow(q.change)} ${Math.abs(q.change)}%)` : 'N/A';
    const lines = ['🌍 *Live Markets*', ''];
    for (const g of ['S&P 500','NASDAQ','Dow Jones','FTSE 100','Nikkei 225']) {
      const q = glMap[g]; if (q) lines.push(`${g}: ${fmt(q)}`);
    }
    lines.push('');
    for (const g of ['NIFTY 50','BANK NIFTY','SENSEX','India VIX']) {
      const q = glMap[g]; if (q) lines.push(`${g}: ${fmt(q)}`);
    }
    lines.push('');
    for (const g of ['Brent Oil','Gold','USD/INR']) {
      const q = glMap[g]; if (q) lines.push(`${g}: ${fmt(q)}`);
    }
    safeReply(msg.chat.id, lines.join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/watchlist/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, 'Scanning pre-market data with Claude AI...');
  try {
    const { generatePreMarketWatchlist } = require('../backend/src/services/preMarketService');
    const { message } = await generatePreMarketWatchlist();
    safeReply(msg.chat.id, message);
  } catch (err) { safeReply(msg.chat.id, `❌ Watchlist error: ${err.message}`); }
});

bot.onText(/\/fii/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { FiiDiiData } = require('../database/schemas');
    const data = await FiiDiiData.find().sort({ date: -1 }).limit(5).lean();
    if (!data.length) return safeReply(msg.chat.id, '📊 No FII/DII data. Updates daily at 6 PM.');
    const lines = ['🏦 *FII/DII Activity (Rs. Crores)*', ''];
    for (const d of data) {
      lines.push(`*${d.date}*`);
      lines.push(`FII Net: ${d.fii?.net >= 0 ? '+' : ''}${d.fii?.net?.toFixed(0) || 'N/A'} Cr`);
      lines.push(`DII Net: ${d.dii?.net >= 0 ? '+' : ''}${d.dii?.net?.toFixed(0) || 'N/A'} Cr`);
      lines.push('');
    }
    safeReply(msg.chat.id, lines.join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/news/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { MarketNews } = require('../database/schemas');
    const articles = await MarketNews.find({ category: 'INDIA' }).sort({ publishedAt: -1 }).limit(8).lean();
    if (!articles.length) return safeReply(msg.chat.id, '📰 No news yet. Updates every 30 min.');
    const sentEmoji = { BULLISH: 'BULL', BEARISH: 'BEAR', NEUTRAL: 'FLAT' };
    const lines = ['📰 *Latest Market News*', ''];
    for (const a of articles) {
      lines.push(`[${sentEmoji[a.sentiment] || 'FLAT'}] ${a.headline}`);
      if (a.sentimentNote) lines.push(`  ${a.sentimentNote}`);
      lines.push('');
    }
    safeReply(msg.chat.id, lines.join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/invest(?:\s+(.+))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  const symbol = match?.[1]?.trim().toUpperCase();
  if (!symbol) {
    return safeReply(msg.chat.id, '/invest SYMBOL — Get AI deep dive\nExample: /invest INFY\n\n/portfolio — Your holdings\n/longterm — AI long-term picks');
  }
  safeReply(msg.chat.id, `Analyzing ${symbol} with Claude AI... (20-30 sec)`);
  try {
    const { getStockDeepDive } = require('../backend/src/services/investmentService');
    const result = await getStockDeepDive(symbol);
    safeReply(msg.chat.id, `📊 *${symbol} Deep Dive*\n\n${result.analysis}`);
  } catch {
    const analysis = await askClaude(
      `Comprehensive investment analysis for ${symbol} (NSE India): business model, financials, growth drivers, risks, valuation, 12-month outlook. Be specific.`,
      'You are an expert equity analyst for Indian markets.'
    );
    safeReply(msg.chat.id, `📊 *${symbol} AI Analysis*\n\n${analysis}`);
  }
});

bot.onText(/\/portfolio/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { getPortfolio } = require('../backend/src/services/investmentService');
    const holdings = await getPortfolio();
    if (!holdings.length) return safeReply(msg.chat.id, '📭 No holdings. Add via the AlphaDesk web app.');
    let invested = 0, current = 0;
    const lines = ['📂 *Investment Portfolio*', ''];
    for (const h of holdings) {
      invested += h.buyPrice * h.quantity;
      current  += (h.currentPrice || h.buyPrice) * h.quantity;
      const gain = parseFloat(h.gainPct || 0);
      lines.push(`${gain >= 0 ? 'UP' : 'DN'} *${h.symbol}* x${h.quantity} @ Rs.${h.buyPrice}`);
      if (h.currentPrice) lines.push(`  Now: Rs.${h.currentPrice} | ${gain >= 0 ? '+' : ''}${gain}%`);
    }
    const totalGain = current - invested;
    const pct = invested ? ((totalGain / invested) * 100).toFixed(1) : 0;
    lines.push(`\nInvested: Rs.${invested.toLocaleString('en-IN')}`);
    lines.push(`Current: Rs.${current.toLocaleString('en-IN')}`);
    lines.push(`*Gain/Loss: ${totalGain >= 0 ? '+' : ''}Rs.${totalGain.toFixed(0)} (${pct}%)*`);
    safeReply(msg.chat.id, lines.join('\n'));
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/longterm/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, 'Claude is analyzing long-term picks... (30-60 sec)');
  try {
    const { generateLongTermScan } = require('../backend/src/services/preMarketService');
    const result = await generateLongTermScan();
    safeReply(msg.chat.id, result);
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/regime/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { MarketRegime } = require('../database/schemas');
    const regime = await MarketRegime.findOne({ symbol: 'NIFTY 50' }).sort({ timestamp: -1 });
    if (!regime) return safeReply(msg.chat.id, '📊 No regime data yet');
    safeReply(msg.chat.id, `Market Regime\n\n*${regime.regime}*\nConfidence: ${regime.confidence}%\nUpdated: ${new Date(regime.timestamp).toLocaleTimeString('en-IN')}`);
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/sentiment/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { MarketNews } = require('../database/schemas');
    const recent = await MarketNews.find().sort({ publishedAt: -1 }).limit(20).lean();
    const bull = recent.filter(n => n.sentiment === 'BULLISH').length;
    const bear = recent.filter(n => n.sentiment === 'BEARISH').length;
    const score = recent.length ? Math.round((bull / recent.length) * 100) : 50;
    const label = score >= 55 ? 'BULLISH' : score <= 45 ? 'BEARISH' : 'NEUTRAL';
    safeReply(msg.chat.id, `Market Sentiment\n\nLabel: *${label}*\nScore: ${score}/100\nBullish: ${bull} | Bearish: ${bear} | Neutral: ${recent.length - bull - bear}\nBased on ${recent.length} news articles`);
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/budget(?:\s+(\d+))?/, async (msg, match) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  const amount = match?.[1];
  if (!amount) return safeReply(msg.chat.id, 'Usage: /budget 50000');
  try {
    const { Budget } = require('../database/schemas');
    const date = new Date().toISOString().slice(0, 10);
    await Budget.findOneAndUpdate({ date }, { capital: Number(amount), setBy: String(msg.from.id) }, { upsert: true, new: true });
    safeReply(msg.chat.id, `✅ Daily capital set to Rs.${Number(amount).toLocaleString('en-IN')}`);
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/halt/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Budget } = require('../database/schemas');
    await Budget.findOneAndUpdate({ date: new Date().toISOString().slice(0, 10) }, { halted: true, haltReason: 'Manual Telegram halt' }, { upsert: true });
    safeReply(msg.chat.id, '🛑 *Trading HALTED* — Use /resume to restart.');
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/resume/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const { Budget } = require('../database/schemas');
    await Budget.findOneAndUpdate({ date: new Date().toISOString().slice(0, 10) }, { halted: false, haltReason: null }, { upsert: true });
    safeReply(msg.chat.id, '▶️ *Trading RESUMED*');
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/pause(?:\s+(\d+))?/, (msg, match) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  const minutes = parseInt(match?.[1]) || 30;
  try {
    require('../scheduler').pauseSignals(minutes);
    safeReply(msg.chat.id, `⏸️ Signal scan paused for ${minutes} minutes`);
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/report/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const reportService = require('../backend/src/services/reportService');
    const report = await reportService.generateDailyReport();
    const text   = reportService.formatReportMessage('daily', report);
    safeReply(msg.chat.id, text);
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/weekly/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const reportService = require('../backend/src/services/reportService');
    const report = await reportService.generateWeeklyReport();
    const text   = reportService.formatReportMessage('weekly', report);
    safeReply(msg.chat.id, text);
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/monthly/, async (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  try {
    const reportService = require('../backend/src/services/reportService');
    const report = await reportService.generateMonthlyReport();
    const text   = reportService.formatReportMessage('monthly', report);
    safeReply(msg.chat.id, text);
  } catch (err) { safeReply(msg.chat.id, `❌ Error: ${err.message}`); }
});

bot.onText(/\/settings/, (msg) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  safeReply(msg.chat.id, [
    'AlphaDesk Configuration',
    `Capital: Rs.${Number(process.env.DAILY_CAPITAL).toLocaleString('en-IN')}`,
    `Risk/Trade: ${(Number(process.env.MAX_RISK_PER_TRADE) * 100).toFixed(1)}%`,
    `Daily Limit: ${(Number(process.env.DAILY_LOSS_LIMIT) * 100).toFixed(1)}%`,
    `Max Trades: ${process.env.MAX_CONCURRENT_TRADES}`,
    `ML Confidence: ${process.env.ML_MIN_CONFIDENCE}%`,
    `Product: ${process.env.PRODUCT_TYPE}`,
    `Markets: ${process.env.MARKETS}`,
  ].join('\n'));
});

bot.onText(/\/ask\s+(.+)/s, async (msg, match) => {
  if (!isAuthorized(msg)) return unauthorized(msg.chat.id);
  const question = match[1].trim();
  bot.sendChatAction(msg.chat.id, 'typing').catch(() => {});
  const answer = await askClaude(question);
  safeReply(msg.chat.id, `AlphaDesk AI\n\n${answer}`);
});

// ── AI Chat: any non-command message ─────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!isAuthorized(msg)) return;
  if (!msg.text || msg.text.startsWith('/')) return;
  bot.sendChatAction(msg.chat.id, 'typing').catch(() => {});
  const answer = await askClaude(msg.text);
  safeReply(msg.chat.id, `AlphaDesk AI\n\n${answer}`);
});

// ══════════════════════════════════════════════════════════════════════════════
// INLINE CALLBACKS
// ══════════════════════════════════════════════════════════════════════════════
bot.on('callback_query', async (query) => {
  if (!AUTH_USERS.includes(String(query.from.id))) {
    return bot.answerCallbackQuery(query.id, { text: 'Unauthorized' });
  }
  const [action, id] = (query.data || '').split(':');
  try {
    if (action === 'approve_signal') {
      const pending = pendingApprovals.get(id);
      if (pending?.timer) clearTimeout(pending.timer);
      pendingApprovals.delete(id);
      const signalService = require('../backend/src/services/signalService');
      const result = await signalService.approveSignal(id, String(query.from.id));
      await bot.answerCallbackQuery(query.id, { text: '✅ Approved & executed!' });
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id });
      await sendTradeOpenAlert(result.trade);
    }
    if (action === 'reject_signal') {
      const pending = pendingApprovals.get(id);
      if (pending?.timer) clearTimeout(pending.timer);
      pendingApprovals.delete(id);
      const { Signal } = require('../database/schemas');
      await Signal.findByIdAndUpdate(id, { status: 'REJECTED' });
      await bot.answerCallbackQuery(query.id, { text: '❌ Rejected' });
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id });
    }
    if (action === 'close_trade') {
      const executionService = require('../backend/src/services/executionService');
      await executionService.closeTrade(id, 'MANUAL');
      await bot.answerCallbackQuery(query.id, { text: '✅ Trade closed' });
    }
    if (action === 'risk_halt') {
      const { Budget } = require('../database/schemas');
      await Budget.findOneAndUpdate({ date: new Date().toISOString().slice(0, 10) }, { halted: true, haltReason: 'Risk alert halt' }, { upsert: true });
      await bot.answerCallbackQuery(query.id, { text: '🛑 Halted' });
    }
    if (action === 'risk_continue') {
      await bot.answerCallbackQuery(query.id, { text: '▶️ Continuing' });
    }
  } catch (err) {
    bot.answerCallbackQuery(query.id, { text: `Error: ${err.message}` });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ALERT SENDERS (called by scheduler / other modules)
// ══════════════════════════════════════════════════════════════════════════════
async function sendSignalAlert(signal) {
  const dir = signal.type === 'BUY' ? 'BUY' : 'SELL';
  const text = [
    `Trade Signal Alert`,
    ``,
    `Stock: ${signal.symbol}`,
    `Direction: ${dir}`,
    `Entry: Rs.${signal.entry}`,
    `Stop Loss: Rs.${signal.stoploss}`,
    `Target 1: Rs.${signal.target1} | Target 2: Rs.${signal.target2}`,
    `Risk Reward: ${signal.riskReward?.toFixed(2)}`,
    `Confidence: ${signal.confidence}%`,
    `Strategy: ${signal.strategy}`,
    ``,
    `Setup:`,
    ...(signal.reasons || []).slice(0, 3).map(r => `- ${r}`),
    ``,
    `Auto-expires in 10 minutes if no response`,
  ].join('\n');

  const sent = await safeReply(CHAT_ID, text, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ APPROVE & EXECUTE', callback_data: `approve_signal:${signal._id}` },
        { text: '❌ REJECT',            callback_data: `reject_signal:${signal._id}` },
      ]],
    },
  });

  // 10-minute auto-expiry
  if (sent) {
    const timer = setTimeout(async () => {
      if (!pendingApprovals.has(String(signal._id))) return;
      pendingApprovals.delete(String(signal._id));
      try {
        const { Signal } = require('../database/schemas');
        await Signal.findByIdAndUpdate(signal._id, { status: 'EXPIRED' });
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: CHAT_ID, message_id: sent.message_id });
        await safeReply(CHAT_ID, `Signal ${signal.symbol} auto-expired (no response in 10 min)`);
      } catch {}
    }, 10 * 60 * 1000);
    pendingApprovals.set(String(signal._id), { messageId: sent.message_id, timer });
  }
  return sent;
}

async function sendTradeOpenAlert(trade) {
  const dir = trade.type === 'BUY' ? 'BUY' : 'SELL';
  return safeReply(CHAT_ID,
    `Trade Opened: ${trade.symbol}\n\n${dir} x${trade.qty} @ Rs.${trade.entryPrice}\nStop Loss: Rs.${trade.stoploss}\nTarget: Rs.${trade.target}\nRisk: Rs.${trade.riskAmount}`,
    { reply_markup: { inline_keyboard: [[{ text: 'Close Trade', callback_data: `close_trade:${trade._id}` }]] } }
  );
}

async function sendTradeCloseAlert(trade) {
  const pnl = trade.netPnl || 0;
  // Send basic close alert immediately
  await safeReply(CHAT_ID,
    `Trade Closed: ${trade.symbol}\n\nStatus: ${trade.status}\nEntry: Rs.${trade.entryPrice} Exit: Rs.${trade.exitPrice}\nQty: ${trade.qty}\nGross P&L: Rs.${trade.pnl?.toFixed(2)}\nCharges: Rs.${trade.charges?.total?.toFixed(2)}\nNet P&L: Rs.${pnl.toFixed(2)}`
  );
  // Then send post-trade analysis (async — don't block)
  setImmediate(async () => {
    try {
      const { generatePostTradeAnalysis } = require('../backend/src/services/marketCommentaryService');
      const analysis = await generatePostTradeAnalysis(trade);
      await safeReply(CHAT_ID, analysis);
    } catch {}
  });
}

async function sendRiskAlert(msg) {
  return safeReply(CHAT_ID, `Risk Alert\n\n${msg}`, {
    reply_markup: { inline_keyboard: [[{ text: 'CONTINUE', callback_data: 'risk_continue' }, { text: 'HALT', callback_data: 'risk_halt' }]] },
  });
}

async function sendSystemAlert(msg) {
  return safeReply(CHAT_ID, msg);
}

bot.on('polling_error', (err) => {
  logger.error(`Telegram polling error: ${err.message}`, { module: 'telegramBot' });
});

logger.info('Telegram bot started', { module: 'telegramBot' });

module.exports = {
  bot,
  sendMessage:        (chatId, text, opts) => safeReply(chatId || CHAT_ID, text, opts),
  sendSignalAlert,
  sendTradeOpenAlert,
  sendTradeCloseAlert,
  sendRiskAlert,
  sendSystemAlert,
};
