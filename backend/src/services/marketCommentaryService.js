'use strict';
const axios  = require('axios');
const logger = require('../config/logger');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Claude helper ──────────────────────────────────────────────────────────────
async function callClaude(prompt, maxTokens = 700) {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: `You are AlphaDesk Market Analyst — an expert in Indian stock markets (NSE/BSE).
Specialties: price action, market structure, ICT/SMC liquidity concepts, EMA/RSI/MACD/VWAP.
Write for a live trader. Be specific with price levels. No filler words. Plain text for Telegram.`,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        timeout: 50000,
      }
    );
    return data?.content?.[0]?.text || null;
  } catch (err) {
    logger.error(`Claude commentary failed: ${err.message}`, { module: 'commentary' });
    return null;
  }
}

// ── EMA helper ────────────────────────────────────────────────────────────────
function simpleEMA(values, period) {
  const v = values.filter(x => x != null);
  if (v.length < period) return null;
  const k = 2 / (period + 1);
  let ema = v.slice(0, period).reduce((s, x) => s + x, 0) / period;
  for (let i = period; i < v.length; i++) ema = v[i] * k + ema * (1 - k);
  return ema;
}

// ── Current NIFTY snapshot (5-min intraday) ───────────────────────────────────
async function fetchNIFTYSnapshot() {
  try {
    const { data } = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/^NSEI', {
      params: { interval: '5m', range: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000,
    });
    const r = data?.chart?.result?.[0];
    if (!r) return null;
    const q      = r.indicators?.quote?.[0] || {};
    const closes = (q.close  || []).filter(c => c != null);
    const highs  = (q.high   || []).filter(h => h != null);
    const lows   = (q.low    || []).filter(l => l != null);
    const vols   = (q.volume || []).filter(v => v != null);
    if (closes.length < 5) return null;

    const last    = closes[closes.length - 1];
    const open    = closes[0];
    const dayHigh = Math.max(...highs);
    const dayLow  = Math.min(...lows);
    const prev    = r.meta?.chartPreviousClose || closes[0];
    const change  = prev ? ((last - prev) / prev * 100).toFixed(2) : '0.00';
    const totalVol = vols.reduce((s, v) => s + v, 0);
    const vwap    = totalVol > 0
      ? (closes.reduce((s, c, i) => s + c * (vols[i] || 0), 0) / totalVol).toFixed(2)
      : last.toFixed(2);

    const ema9  = simpleEMA(closes, 9);
    const ema21 = simpleEMA(closes, 21);
    const trend = ema9 && ema21
      ? (ema9 > ema21 ? 'UPTREND' : ema9 < ema21 ? 'DOWNTREND' : 'SIDEWAYS')
      : 'SIDEWAYS';

    // Identify key levels: today's high/low + round numbers near price
    const roundLevel = Math.round(last / 50) * 50;
    const nearResist = last < dayHigh ? dayHigh.toFixed(0) : (roundLevel + 50).toString();
    const nearSupport = last > dayLow ? dayLow.toFixed(0) : (roundLevel - 50).toString();

    return {
      price: last.toFixed(2), change, open: open.toFixed(2), dayHigh: dayHigh.toFixed(2),
      dayLow: dayLow.toFixed(2), vwap, trend,
      ema9: ema9?.toFixed(2), ema21: ema21?.toFixed(2),
      nearResist, nearSupport,
      aboveVWAP: parseFloat(last) > parseFloat(vwap),
      candleCount: closes.length,
    };
  } catch (err) {
    logger.warn(`NIFTY snapshot failed: ${err.message}`, { module: 'commentary' });
    return null;
  }
}

// ── 1. MARKET COMMENTARY (every 15 min) ──────────────────────────────────────
async function generateMarketCommentary() {
  const { Signal, Trade, SentimentScore } = require('../../../database/schemas');
  const snap  = await fetchNIFTYSnapshot();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [signals, trades, sentiment] = await Promise.all([
    Signal.find({ createdAt: { $gte: today } }).sort({ createdAt: -1 }).limit(5).lean(),
    Trade.find({ entryTime: { $gte: today } }).lean(),
    SentimentScore.findOne({ symbol: 'MARKET' }).sort({ date: -1 }).lean(),
  ]);

  const timeIST  = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  const sigCount = signals.length;
  const lastSig  = sigCount > 0 ? `${signals[0].type} on ${signals[0].symbol} (${signals[0].strategy})` : 'None';

  if (!snap) {
    return [
      `📊 MARKET COMMENTARY — ${timeIST} IST`,
      ``,
      `Market data feed unavailable. Monitoring continues.`,
      `Signals today: ${sigCount} | Trades: ${trades.length}`,
      `System is waiting for data reconnection before scanning.`,
    ].join('\n');
  }

  const prompt = `Market snapshot at ${timeIST} IST:
NIFTY 50: ${snap.price} (${snap.change}%)
Open: ${snap.open} | High: ${snap.dayHigh} | Low: ${snap.dayLow}
VWAP: ${snap.vwap} (price is ${snap.aboveVWAP ? 'ABOVE' : 'BELOW'} VWAP)
EMA 9: ${snap.ema9} | EMA 21: ${snap.ema21} | Trend: ${snap.trend}
Near resistance: ${snap.nearResist} | Near support: ${snap.nearSupport}
Sentiment: ${sentiment?.label || 'NEUTRAL'} (${sentiment?.score || 50}/100)
Signals generated today: ${sigCount} (last: ${lastSig})
Trades executed today: ${trades.length}

Write a 15-minute market commentary (max 200 words):
1. MARKET STRUCTURE: Trending / Ranging / Choppy? Why?
2. KEY LEVELS: Current support/resistance with exact prices
3. LIQUIDITY: Where is liquidity building? Any sweeps today?
4. SIGNAL STATUS: ${sigCount === 0 ? 'NO signals today — explain exactly what conditions are missing and what would trigger a trade' : `${sigCount} signal(s) generated — brief status`}
5. NEXT SETUP: What price action would trigger the next trade?

Be specific. Use exact price levels. Educational tone for live trader.`;

  const text = await callClaude(prompt, 700);
  if (!text) {
    // Fallback — no AI
    const chg = parseFloat(snap.change);
    const mode = Math.abs(chg) < 0.3 ? 'sideways/consolidation' : chg > 0 ? 'mild uptrend' : 'mild downtrend';
    return [
      `📊 MARKET COMMENTARY — ${timeIST} IST`,
      ``,
      `NIFTY 50: ${snap.price} (${chg >= 0 ? '+' : ''}${snap.change}%)`,
      `Range: ${snap.dayLow} — ${snap.dayHigh} | VWAP: ${snap.vwap}`,
      `Trend: ${snap.trend} (EMA9 ${snap.ema9} / EMA21 ${snap.ema21})`,
      ``,
      `Market in ${mode}.`,
      sigCount === 0
        ? `NO SIGNAL YET: Waiting for price to break ${snap.nearResist} (long) or below ${snap.nearSupport} (short) with volume and RSI confirmation.`
        : `Signals today: ${sigCount}. Last: ${lastSig}`,
      ``,
      `Signals today: ${sigCount} | Trades: ${trades.length}`,
    ].join('\n');
  }

  return `📊 MARKET COMMENTARY — ${timeIST} IST\n\n${text}`;
}

// ── 2. SIGNAL EXPLANATION (why this trade was taken) ─────────────────────────
async function generateSignalExplanation(signal) {
  const timeIST = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  const rrNum   = signal.riskReward?.toFixed(2) || 'N/A';
  const riskPts = signal.entry && signal.stoploss ? Math.abs(signal.entry - signal.stoploss).toFixed(2) : 'N/A';
  const rewPts  = signal.entry && signal.target1  ? Math.abs(signal.target1 - signal.entry).toFixed(2)  : 'N/A';

  const prompt = `Explain this NSE trading signal to a learning trader:

${signal.type} signal on ${signal.symbol}
Strategy: ${signal.strategy} | Timeframe: ${signal.timeframe || '5m'}
Entry: ₹${signal.entry} | Stop Loss: ₹${signal.stoploss} | Target 1: ₹${signal.target1}${signal.target2 ? ` | Target 2: ₹${signal.target2}` : ''}
Risk: ₹${riskPts}/unit | Reward: ₹${rewPts}/unit | R:R = ${rrNum}
Confidence: ${signal.confidence}%
Confirmations: ${(signal.confirmations || signal.reasons || []).join(', ') || 'TA-based'}

Write a signal explanation (max 180 words):
1. PATTERN: What exact chart pattern/setup triggered this?
2. MARKET STRUCTURE: Why is this a valid entry point?
3. LIQUIDITY: Was there a sweep, breakout, or retest involved?
4. CONFIRMATION: Which indicators lined up to confirm this signal?
5. HIGH PROBABILITY REASON: Why does this trade have statistical edge?

End with a single line: "Trade thesis: [one sentence summary]"`;

  const text = await callClaude(prompt, 550);
  const header = [
    `🔔 ${signal.type} SIGNAL — ${signal.symbol} | ${timeIST} IST`,
    ``,
    `Entry:   ₹${signal.entry}`,
    `SL:      ₹${signal.stoploss}  (risk ₹${riskPts}/unit)`,
    `Target 1: ₹${signal.target1}  (reward ₹${rewPts}/unit)`,
    signal.target2 ? `Target 2: ₹${signal.target2}` : null,
    `R:R: ${rrNum} | Confidence: ${signal.confidence}% | Strategy: ${signal.strategy}`,
    ``,
  ].filter(Boolean).join('\n');

  return text ? `${header}WHY THIS TRADE:\n${text}` : header;
}

// ── 3. NO-SIGNAL SCAN RESULT (explain why scan found nothing) ─────────────────
async function generateNoSignalExplanation(scannedSymbols = [], snap = null) {
  const timeIST  = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
  const snapshot = snap || await fetchNIFTYSnapshot();

  if (!snapshot) {
    return `🔍 SCAN COMPLETE — ${timeIST} IST\nScanned: ${scannedSymbols.length} symbols\nResult: No valid setups found.\nReason: Market data unavailable — cannot evaluate conditions.`;
  }

  const prompt = `AlphaDesk signal scanner ran on ${scannedSymbols.length} NSE symbols and found NO valid trade setups.

Current NIFTY context:
Price: ${snapshot.price} (${snapshot.change}%) | Trend: ${snapshot.trend}
VWAP: ${snapshot.vwap} | Price ${snapshot.aboveVWAP ? 'above' : 'below'} VWAP
Day Range: ${snapshot.dayLow} — ${snapshot.dayHigh}
EMA 9: ${snapshot.ema9} | EMA 21: ${snapshot.ema21}

In 80-100 words, explain to the trader:
1. What is the current market structure (consolidation/chop/narrow range)?
2. Specifically what conditions are MISSING for a valid setup
3. What the system is WAITING for (exact price level or indicator condition)
4. One specific setup that WOULD trigger a signal (entry level, direction)

Be concrete with price numbers. No vague statements.`;

  const text = await callClaude(prompt, 350);
  const lines = [
    `🔍 SCAN — ${timeIST} IST | ${scannedSymbols.length} symbols`,
    `NIFTY: ${snapshot.price} (${snapshot.change}%) | ${snapshot.trend}`,
    ``,
  ];

  if (text) {
    lines.push('NO SETUP FOUND — HERE IS WHY:', text);
  } else {
    const chg = parseFloat(snapshot.change);
    if (Math.abs(chg) < 0.25) {
      lines.push(`Market is in tight consolidation (${snapshot.dayLow}–${snapshot.dayHigh}).`);
      lines.push(`Conditions missing: No breakout, volume confirmation, or RSI direction.`);
      lines.push(`Waiting for: Break above ${snapshot.nearResist} (bullish) or below ${snapshot.nearSupport} (bearish) with volume.`);
    } else {
      lines.push(`Trend exists but no clean entry setup on scanned symbols.`);
      lines.push(`System waiting for: pullback to VWAP (${snapshot.vwap}) or EMA 21 (${snapshot.ema21}) with reversal candle.`);
    }
  }
  return lines.join('\n');
}

// ── 4. POST-TRADE ANALYSIS ────────────────────────────────────────────────────
async function generatePostTradeAnalysis(trade) {
  const result  = (trade.pnl || 0) >= 0 ? 'PROFIT' : 'LOSS';
  const emoji   = result === 'PROFIT' ? '✅' : '❌';
  const pnl     = trade.pnl?.toFixed(2) || '0';
  const netPnl  = trade.netPnl?.toFixed(2) || pnl;
  const dur     = trade.exitTime
    ? `${Math.round((new Date(trade.exitTime) - new Date(trade.entryTime)) / 60000)} min`
    : 'unknown';

  const prompt = `Post-trade analysis for AlphaDesk system:

${trade.type} on ${trade.symbol}
Entry: ₹${trade.entryPrice} → Exit: ₹${trade.exitPrice || 'N/A'}
Result: ${trade.status} | P&L: ₹${pnl} | Duration: ${dur}
Strategy: ${trade.strategy || 'TA-based'} | Timeframe: ${trade.timeframe || '5m'}
SL was: ₹${trade.stoploss} | Target was: ₹${trade.target}

Analyze in 120 words:
1. TRADE VALIDITY: Was this a rule-based entry or a marginal setup?
2. WHAT WENT RIGHT: Positive aspects of entry/execution
3. WHAT WENT WRONG: Any rule violations, missed exits, or poor timing?
4. ROOT CAUSE: Was the outcome from the system signal, market conditions, or execution?
5. ONE LESSON: The single most important improvement for next similar trade

End with: "Learning: [one actionable sentence]"`;

  const text = await callClaude(prompt, 500);
  const header = [
    `${emoji} POST-TRADE: ${trade.symbol} — ${result}`,
    ``,
    `${trade.type} | Entry ₹${trade.entryPrice} → Exit ₹${trade.exitPrice || 'N/A'}`,
    `Status: ${trade.status} | Duration: ${dur}`,
    `Gross P&L: ₹${pnl} | Net P&L: ₹${netPnl}`,
    ``,
  ].join('\n');

  return text ? `${header}ANALYSIS:\n${text}` : header;
}

// ── 5. LEARNING REPORT (weekly — identifies repeated patterns) ────────────────
async function generateLearningReport(trades = []) {
  if (trades.length < 3) return null;

  const wins  = trades.filter(t => (t.pnl || 0) > 0);
  const loss  = trades.filter(t => (t.pnl || 0) <= 0);
  const wr    = ((wins.length / trades.length) * 100).toFixed(0);
  const byStrat = {};
  for (const t of trades) {
    const s = t.strategy || 'UNKNOWN';
    if (!byStrat[s]) byStrat[s] = { wins: 0, losses: 0, pnl: 0 };
    t.pnl > 0 ? byStrat[s].wins++ : byStrat[s].losses++;
    byStrat[s].pnl += t.pnl || 0;
  }
  const stratSummary = Object.entries(byStrat)
    .map(([s, d]) => `${s}: ${d.wins}W/${d.losses}L ₹${d.pnl.toFixed(0)}`)
    .join(', ');

  const prompt = `AlphaDesk weekly trading performance review:
Total trades: ${trades.length} | Win rate: ${wr}% | Wins: ${wins.length} | Losses: ${loss.length}
Strategy breakdown: ${stratSummary}
Worst 3 trades: ${loss.slice(0, 3).map(t => `${t.symbol}(${t.strategy}):₹${t.pnl?.toFixed(0)}`).join(', ')}
Best 3 trades: ${wins.slice(0, 3).map(t => `${t.symbol}(${t.strategy}):₹${t.pnl?.toFixed(0)}`).join(', ')}

Provide a 150-word learning report:
1. PATTERNS IN LOSSES: What do the losing trades have in common?
2. WEAK CONDITIONS: In what market conditions does the system fail?
3. STRONG EDGE: Where does the system perform best?
4. TOP 3 IMPROVEMENTS: Specific rule changes to improve the system

Be direct. This is a system improvement review.`;

  const text = await callClaude(prompt, 600);
  if (!text) return null;
  return `📚 WEEKLY LEARNING REPORT\n\nTrades: ${trades.length} | Win Rate: ${wr}%\n\n${text}`;
}

module.exports = {
  generateMarketCommentary,
  generateSignalExplanation,
  generateNoSignalExplanation,
  generatePostTradeAnalysis,
  generateLearningReport,
  fetchNIFTYSnapshot,
};
