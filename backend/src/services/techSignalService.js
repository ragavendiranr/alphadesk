'use strict';
const axios  = require('axios');
const logger = require('../config/logger');

// ── IST market hours helpers ───────────────────────────────────────────────────
function getIST() {
  // Reliable IST: add UTC+5:30 offset directly, use getUTC* methods
  const utcMs = Date.now();
  const istMs = utcMs + (5 * 60 + 30) * 60 * 1000;
  return new Date(istMs);
}

function isMarketOpen() {
  const ist = getIST();
  const day = ist.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const h = ist.getUTCHours(), m = ist.getUTCMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

// ── Technical indicator calculations ──────────────────────────────────────────
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgG = gains / period, avgL = losses / period;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function calcMACD(closes) {
  if (closes.length < 26) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macd  = ema12 - ema26;
  // Signal = 9-period EMA of MACD (approximate with recent values)
  const macdLine = [];
  for (let i = 26; i <= closes.length; i++) {
    const e12 = calcEMA(closes.slice(0, i), 12);
    const e26 = calcEMA(closes.slice(0, i), 26);
    macdLine.push(e12 - e26);
  }
  const signal = macdLine.length >= 9 ? calcEMA(macdLine, 9) : macd;
  return { macd, signal, hist: macd - signal };
}

function calcBollingerBands(closes, period = 20, stdMultiplier = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean  = slice.reduce((s, v) => s + v, 0) / period;
  const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  return { upper: mean + stdMultiplier * std, middle: mean, lower: mean - stdMultiplier * std, std };
}

function calcVWAP(candles) {
  // candles: array of {high, low, close, volume}
  let totalPV = 0, totalV = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    totalPV += typical * (c.volume || 1);
    totalV  += (c.volume || 1);
  }
  return totalV > 0 ? totalPV / totalV : null;
}

function calcVolumeMA(volumes, period = 20) {
  if (volumes.length < period) return null;
  return volumes.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const { high, low, close: prevClose } = { ...candles[i], close: candles[i - 1].close };
    trs.push(Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - prevClose), Math.abs(candles[i].low - prevClose)));
  }
  return trs.slice(-period).reduce((s, v) => s + v, 0) / period;
}

// ── Yahoo Finance symbol mapping for indices (not .NS suffix) ─────────────────
const YF_INDEX_MAP = {
  'NIFTY':      '^NSEI',
  'BANKNIFTY':  '^NSEBANK',
  'FINNIFTY':   'NIFTYFIN.NS',
  'NIFTY 50':   '^NSEI',
  'NIFTY BANK': '^NSEBANK',
  'MIDCPNIFTY': 'NIFTYMIDCAP50.NS',
};

function toYFSymbol(symbol) {
  return YF_INDEX_MAP[symbol] || (symbol + '.NS');
}

// ── Fetch OHLC data from DB or Yahoo Finance fallback ─────────────────────────
async function fetchCandles(symbol, timeframe = '5m', limit = 60) {
  try {
    const { OHLC } = require('../../../database/schemas');
    const candles = await OHLC.find({ symbol, timeframe })
      .sort({ timestamp: -1 }).limit(limit).lean();
    if (candles.length >= 20) {
      return candles.reverse().map(c => ({
        open: c.open, high: c.high, low: c.low, close: c.close,
        volume: c.volume, timestamp: c.timestamp,
      }));
    }
  } catch {}

  // Fallback: Yahoo Finance v8/chart (uses correct symbol mapping for indices)
  try {
    const tfMap = { '5m': '5m', '15m': '15m', '1h': '60m', '1D': '1d' };
    const yfTf  = tfMap[timeframe] || '5m';
    const yfSym = toYFSymbol(symbol);
    const { data } = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/' + yfSym, {
      params: { interval: yfTf, range: yfTf === '5m' ? '5d' : '60d' },
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000,
    });
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const ts   = result.timestamp || [];
    const q    = result.indicators?.quote?.[0] || {};
    return ts.map((t, i) => ({
      open: q.open?.[i], high: q.high?.[i], low: q.low?.[i],
      close: q.close?.[i], volume: q.volume?.[i],
      timestamp: new Date(t * 1000),
    })).filter(c => c.close != null).slice(-limit);
  } catch {
    return null;
  }
}

// ── Log activity to MongoDB ────────────────────────────────────────────────────
async function logActivity(level, message, module = 'signalEngine', meta = null) {
  try {
    const { ActivityLog } = require('../../../database/schemas');
    await ActivityLog.create({ level, message, module, meta });
  } catch {}
  logger.info(`[${level}] ${message}`, { module });
}

// ── Analyse one symbol and generate a signal if ≥3 confirmations ──────────────
async function analyseSymbol(symbol, timeframe = '5m') {
  const candles = await fetchCandles(symbol, timeframe, 80);
  if (!candles || candles.length < 30) return null;

  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume || 0);
  const latest  = candles[candles.length - 1];
  const price   = latest.close;

  // ── Indicators ──
  const ema9   = calcEMA(closes, 9);
  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const rsi    = calcRSI(closes, 14);
  const macdR  = calcMACD(closes);
  const bb     = calcBollingerBands(closes, 20);
  const vwap   = calcVWAP(candles);
  const volMA  = calcVolumeMA(volumes, 20);
  const atr    = calcATR(candles, 14) || price * 0.005;
  const curVol = latest.volume || 0;

  // ── Confirmations for BUY ──
  const buyConf  = [];
  const sellConf = [];

  // 1. EMA trend
  if (ema9 && ema20 && ema50) {
    if (ema9 > ema20 && ema20 > ema50) buyConf.push('EMA_TREND_UP (9>20>50)');
    if (ema9 < ema20 && ema20 < ema50) sellConf.push('EMA_TREND_DOWN (9<20<50)');
  }

  // 2. EMA crossover (recent)
  if (ema9 && ema20) {
    const prevCloses = closes.slice(0, -1);
    const prevEma9  = calcEMA(prevCloses, 9);
    const prevEma20 = calcEMA(prevCloses, 20);
    if (prevEma9 && prevEma20) {
      if (prevEma9 <= prevEma20 && ema9 > ema20) buyConf.push('EMA_CROSSOVER_BULLISH (9 crossed above 20)');
      if (prevEma9 >= prevEma20 && ema9 < ema20) sellConf.push('EMA_CROSSOVER_BEARISH (9 crossed below 20)');
    }
  }

  // 3. RSI momentum
  if (rsi != null) {
    if (rsi > 55 && rsi < 75) buyConf.push(`RSI_BULLISH (${rsi.toFixed(1)})`);
    if (rsi < 45 && rsi > 25) sellConf.push(`RSI_BEARISH (${rsi.toFixed(1)})`);
    if (rsi < 35)              buyConf.push(`RSI_OVERSOLD (${rsi.toFixed(1)})`);
    if (rsi > 65)              sellConf.push(`RSI_OVERBOUGHT (${rsi.toFixed(1)})`);
  }

  // 4. MACD
  if (macdR) {
    if (macdR.macd > macdR.signal && macdR.hist > 0) buyConf.push('MACD_BULLISH');
    if (macdR.macd < macdR.signal && macdR.hist < 0) sellConf.push('MACD_BEARISH');
    if (macdR.macd > 0 && macdR.signal > 0)           buyConf.push('MACD_ABOVE_ZERO');
    if (macdR.macd < 0 && macdR.signal < 0)           sellConf.push('MACD_BELOW_ZERO');
  }

  // 5. Volume spike
  if (volMA && curVol > volMA * 1.5) {
    buyConf.push(`VOLUME_SPIKE (${(curVol / volMA).toFixed(1)}x avg)`);
    sellConf.push(`VOLUME_SPIKE (${(curVol / volMA).toFixed(1)}x avg)`);
  }

  // 6. Price vs VWAP
  if (vwap) {
    if (price > vwap) buyConf.push(`ABOVE_VWAP (${vwap.toFixed(2)})`);
    else              sellConf.push(`BELOW_VWAP (${vwap.toFixed(2)})`);
  }

  // 7. Bollinger Bands
  if (bb) {
    const bbPct = (price - bb.lower) / (bb.upper - bb.lower);
    if (bbPct < 0.15) buyConf.push(`BB_LOWER_BOUNCE (${(bbPct * 100).toFixed(0)}%)`);
    if (bbPct > 0.85) sellConf.push(`BB_UPPER_REJECT (${(bbPct * 100).toFixed(0)}%)`);
    if (bbPct > 0.7 && bbPct < 0.95) buyConf.push(`BB_UPPER_BREAKOUT`);
    if (price > bb.upper) buyConf.push(`BB_BREAKOUT_UP`);
    if (price < bb.lower) sellConf.push(`BB_BREAKDOWN`);
  }

  // ── Decide direction ──
  let direction = null;
  let confirmations = [];

  if (buyConf.length >= 3 && buyConf.length > sellConf.length) {
    direction    = 'BUY';
    confirmations = buyConf.slice(0, 6);
  } else if (sellConf.length >= 3 && sellConf.length > buyConf.length) {
    direction    = 'SELL';
    confirmations = sellConf.slice(0, 6);
  }

  if (!direction) return null;

  // ── Entry / SL / Targets ──
  const entry   = price;
  let stoploss, target1, target2, rr;

  if (direction === 'BUY') {
    stoploss = +(entry - 1.5 * atr).toFixed(2);
    target1  = +(entry + 2.0 * atr).toFixed(2);
    target2  = +(entry + 3.0 * atr).toFixed(2);
  } else {
    stoploss = +(entry + 1.5 * atr).toFixed(2);
    target1  = +(entry - 2.0 * atr).toFixed(2);
    target2  = +(entry - 3.0 * atr).toFixed(2);
  }
  rr = +(Math.abs(target1 - entry) / Math.abs(stoploss - entry)).toFixed(2);

  // ── Confidence score (50 base + 10 per confirmation above 3) ──
  const confidence = Math.min(95, 50 + confirmations.length * 10);

  const strategy = direction === 'BUY'
    ? (confirmations.some(c => c.includes('CROSSOVER')) ? 'EMA_CROSSOVER' : 'MOMENTUM_LONG')
    : (confirmations.some(c => c.includes('CROSSOVER')) ? 'EMA_CROSSOVER' : 'MOMENTUM_SHORT');

  return {
    symbol, direction, entry, stoploss, target1, target2, rr,
    confirmations, confidence, strategy, timeframe,
    indicators: { ema9, ema20, ema50, rsi, macd: macdR?.macd, vwap, bb: bb?.middle },
  };
}

// ── Symbols to scan ────────────────────────────────────────────────────────────
const SCAN_SYMBOLS = [
  'NIFTY', 'BANKNIFTY', 'FINNIFTY',
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL',
  'BAJFINANCE', 'ITC', 'LT', 'MARUTI', 'SUNPHARMA', 'TITAN', 'KOTAKBANK',
  'AXISBANK', 'WIPRO', 'TATAMOTORS', 'TATASTEEL', 'ADANIENT', 'ZOMATO',
  'HCLTECH', 'TECHM', 'PERSISTENT', 'DIXON', 'TRENT',
];

// ── Main scan cycle ────────────────────────────────────────────────────────────
async function runTASignalScan(symbols = SCAN_SYMBOLS, timeframes = ['5m', '15m']) {
  if (!isMarketOpen()) {
    await logActivity('INFO', 'Signal scan skipped — market closed', 'signalEngine');
    return [];
  }

  const { Signal } = require('../../../database/schemas');
  const signals    = [];

  await logActivity('INFO', `TA scan started — ${symbols.length} symbols x ${timeframes.length} timeframes`, 'signalEngine');

  for (const symbol of symbols) {
    for (const tf of timeframes) {
      try {
        const result = await analyseSymbol(symbol, tf);
        if (!result) continue;

        // Check for recent duplicate signal (same symbol+direction in last 30 min)
        const since = new Date(Date.now() - 30 * 60 * 1000);
        const dupe  = await Signal.findOne({
          symbol, type: result.direction, timeframe: tf,
          createdAt: { $gte: since }, status: { $in: ['PENDING', 'APPROVED', 'EXECUTED'] },
        }).lean();
        if (dupe) continue;

        const sig = await Signal.create({
          symbol:       result.symbol,
          exchange:     'NSE',
          strategy:     result.strategy,
          type:         result.direction,
          timeframe:    result.timeframe,
          entry:        result.entry,
          stoploss:     result.stoploss,
          target1:      result.target1,
          target2:      result.target2,
          riskReward:   result.rr,
          confidence:   result.confidence,
          confirmations: result.confirmations,
          reasons:      result.confirmations,
          status:       'PENDING',
          regime:       'TA_GENERATED',
          expiry:       new Date(Date.now() + 10 * 60 * 1000),
        });

        signals.push(sig);

        await logActivity('SIGNAL',
          `${result.direction} ${symbol} @ ₹${result.entry} [${result.confidence}% conf, ${result.confirmations.length} conf] TF:${tf}`,
          'signalEngine', { signalId: sig._id, confirmations: result.confirmations }
        );

        // Broadcast via Socket.IO if available
        if (global.io) {
          global.io.emit('signal:new', sig);
        }

      } catch (err) {
        logger.warn(`TA scan error for ${symbol}/${tf}: ${err.message}`, { module: 'techSignal' });
      }
    }
  }

  await logActivity('INFO',
    `TA scan complete — ${signals.length} new signals generated`,
    'signalEngine', { count: signals.length }
  );

  return signals;
}

// ── Get today's signal stats ───────────────────────────────────────────────────
async function getTodaySignalStats() {
  try {
    const { Signal } = require('../../../database/schemas');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [total, approved, pending, executed] = await Promise.all([
      Signal.countDocuments({ createdAt: { $gte: today } }),
      Signal.countDocuments({ createdAt: { $gte: today }, status: 'APPROVED' }),
      Signal.countDocuments({ createdAt: { $gte: today }, status: 'PENDING' }),
      Signal.countDocuments({ createdAt: { $gte: today }, status: 'EXECUTED' }),
    ]);
    const lastSig = await Signal.findOne({ createdAt: { $gte: today } }).sort({ createdAt: -1 }).lean();
    return { total, approved, pending, executed, ignored: total - approved - executed, lastSignalAt: lastSig?.createdAt || null };
  } catch {
    return { total: 0, approved: 0, pending: 0, executed: 0, ignored: 0, lastSignalAt: null };
  }
}

module.exports = { runTASignalScan, getTodaySignalStats, analyseSymbol, isMarketOpen, getIST, SCAN_SYMBOLS, logActivity };
