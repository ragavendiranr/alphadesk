'use strict';
const axios  = require('axios');
const logger = require('../config/logger');

// ── Yahoo Finance symbol mapping ──────────────────────────────────────────────
const YF_MAP = {
  'NIFTY 50':   '^NSEI',   'NIFTY BANK': '^NSEBANK', 'NIFTY':      '^NSEI',
  'BANKNIFTY':  '^NSEBANK','FINNIFTY':   'NIFTYFIN.NS',
  'RELIANCE':   'RELIANCE.NS', 'TCS':    'TCS.NS',    'HDFCBANK':   'HDFCBANK.NS',
  'INFY':       'INFY.NS',     'ICICIBANK': 'ICICIBANK.NS', 'SBIN': 'SBIN.NS',
  'BHARTIARTL': 'BHARTIARTL.NS','BAJFINANCE': 'BAJFINANCE.NS','ASIANPAINT':'ASIANPAINT.NS',
  'ITC':        'ITC.NS',  'KOTAKBANK':  'KOTAKBANK.NS', 'LT':      'LT.NS',
  'AXISBANK':   'AXISBANK.NS','MARUTI': 'MARUTI.NS', 'SUNPHARMA': 'SUNPHARMA.NS',
  'TITAN':      'TITAN.NS','ULTRACEMCO': 'ULTRACEMCO.NS','WIPRO':  'WIPRO.NS',
  'TATAMOTORS': 'TATAMOTORS.NS','ZOMATO':'ZOMATO.NS', 'ADANIENT': 'ADANIENT.NS',
};
function toYF(sym) { return YF_MAP[sym] || (sym.endsWith('.NS') || sym.startsWith('^') ? sym : sym + '.NS'); }

// ── Fetch 1 year of daily OHLCV from Yahoo Finance v8/chart ──────────────────
async function fetchHistory(symbol) {
  const ticker  = toYF(symbol);
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 400 * 86400; // ~13 months

  const { data } = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
    params: { interval: '1d', period1, period2 },
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 25000,
  });

  const r = data?.chart?.result?.[0];
  if (!r) throw new Error(`No Yahoo Finance data for ${symbol} (${ticker})`);

  const ts = r.timestamp || [];
  const q  = r.indicators?.quote?.[0] || {};
  const ac = r.indicators?.adjclose?.[0]?.adjclose;

  return ts.map((t, i) => ({
    date:   new Date(t * 1000),
    open:   q.open?.[i],
    high:   q.high?.[i],
    low:    q.low?.[i],
    close:  ac?.[i] ?? q.close?.[i],
    volume: q.volume?.[i] || 0,
  })).filter(c => c.close != null && c.open != null && !isNaN(c.close));
}

// ── Technical indicators ──────────────────────────────────────────────────────
function emaArr(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null || isNaN(values[i])) { out[i] = prev; continue; }
    prev = prev === null ? values[i] : values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiArr(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  let ag = gains / period, al = losses / period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

function atrArr(candles, period = 14) {
  const out = new Array(candles.length).fill(null);
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close)
    );
    out[i] = i < period ? null : (out[i - 1] == null ? tr : (out[i - 1] * (period - 1) + tr) / period);
  }
  return out;
}

// ── Strategy signal generation ────────────────────────────────────────────────
function getSignal(i, closes, highs, lows, ema9, ema21, ema50, rsi, atr, strategy) {
  if (i < 55) return null;
  const c = closes[i], h = highs[i], l = lows[i];
  const r = rsi[i], a = atr[i];
  if (r == null || a == null || ema9[i] == null || ema21[i] == null) return null;

  const strat = strategy.toUpperCase();

  // EMA CROSSOVER / MOMENTUM
  if (strat === 'ALL' || strat === 'MOMENTUM' || strat === 'EMA_CROSSOVER') {
    if (ema9[i - 1] <= ema21[i - 1] && ema9[i] > ema21[i] && r > 50 && r < 70 && c > ema50[i])
      return 'LONG';
    if (ema9[i - 1] >= ema21[i - 1] && ema9[i] < ema21[i] && r < 50 && r > 30 && c < ema50[i])
      return 'SHORT';
  }

  // BREAKOUT (20-day high/low)
  if (strat === 'ALL' || strat === 'BREAKOUT') {
    const high20 = Math.max(...highs.slice(i - 20, i));
    const low20  = Math.min(...lows.slice(i - 20, i));
    if (c > high20 * 1.001 && r > 55 && r < 80) return 'LONG';
    if (c < low20 * 0.999  && r < 45 && r > 20) return 'SHORT';
  }

  // MEAN REVERSION (oversold/overbought extremes)
  if (strat === 'ALL' || strat === 'MEAN_REVERSION') {
    if (r < 32 && closes[i] > closes[i - 1] && closes[i - 1] < closes[i - 2]) return 'LONG';
    if (r > 68 && closes[i] < closes[i - 1] && closes[i - 1] > closes[i - 2]) return 'SHORT';
  }

  // VWAP REVERSAL (approximate: price vs 50-day EMA as proxy)
  if (strat === 'VWAP_REVERSAL' || strat === 'ALL') {
    if (c < ema50[i] * 0.985 && r < 40 && closes[i] > closes[i - 1]) return 'LONG';
    if (c > ema50[i] * 1.015 && r > 60 && closes[i] < closes[i - 1]) return 'SHORT';
  }

  return null;
}

// ── Trade simulation ──────────────────────────────────────────────────────────
function simulate(candles, strategy, initialCapital) {
  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const ema9    = emaArr(closes, 9);
  const ema21   = emaArr(closes, 21);
  const ema50   = emaArr(closes, 50);
  const rsi14   = rsiArr(closes, 14);
  const atr14   = atrArr(candles, 14);

  const trades = [];
  let position = null;
  let capital  = initialCapital;
  const equity = [{ x: candles[0].date.toISOString().slice(0, 10), y: capital }];

  for (let i = 55; i < candles.length; i++) {
    if (position) {
      const { type, entry, sl, tp, qty } = position;
      const slHit = type === 'LONG' ? lows[i]  <= sl : highs[i] >= sl;
      const tpHit = type === 'LONG' ? highs[i] >= tp : lows[i]  <= tp;
      if (slHit || tpHit) {
        const exit = slHit ? sl : tp;
        const pnl  = type === 'LONG' ? (exit - entry) * qty : (entry - exit) * qty;
        capital += pnl;
        trades.push({ type, entry, exit, pnl, win: pnl > 0, date: candles[i].date });
        equity.push({ x: candles[i].date.toISOString().slice(0, 10), y: Math.round(capital) });
        position = null;
      }
    }

    if (!position) {
      const sig = getSignal(i, closes, highs, lows, ema9, ema21, ema50, rsi14, atr14, strategy);
      if (sig && atr14[i]) {
        const price = closes[i];
        const atr   = atr14[i];
        const riskPerTrade = initialCapital * 0.01;
        const slDist = Math.max(atr * 1.5, price * 0.005);
        const qty    = Math.max(1, Math.floor(riskPerTrade / slDist));
        position = {
          type: sig,
          entry: price,
          sl:   sig === 'LONG' ? price - slDist : price + slDist,
          tp:   sig === 'LONG' ? price + slDist * 2.0 : price - slDist * 2.0,
          qty,
        };
      }
    }

    if (i % 20 === 0) equity.push({ x: candles[i].date.toISOString().slice(0, 10), y: Math.round(capital) });
  }
  equity.push({ x: candles[candles.length - 1].date.toISOString().slice(0, 10), y: Math.round(capital) });
  return { trades, equity, finalCapital: capital };
}

// ── Performance metrics ───────────────────────────────────────────────────────
function metrics(trades, initialCapital, finalCapital, equity, days) {
  if (trades.length === 0) {
    return {
      total_trades: 0, win_rate: 0, profit_factor: 0, net_pnl: 0,
      sharpe_ratio: 0, max_drawdown: 0, expectancy: 0, cagr: 0,
      equity_curve: equity,
    };
  }

  const wins   = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const gp     = wins.reduce((s, t) => s + t.pnl, 0);
  const gl     = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf     = gl === 0 ? gp : gp / gl;
  const netPnl = finalCapital - initialCapital;
  const wr     = (wins.length / trades.length * 100).toFixed(1);
  const avgW   = wins.length   ? gp / wins.length   : 0;
  const avgL   = losses.length ? gl / losses.length : 0;
  const expect = avgW * (wins.length / trades.length) - avgL * (losses.length / trades.length);

  // Max drawdown
  let peak = initialCapital, maxDD = 0;
  for (const e of equity) {
    if (e.y > peak) peak = e.y;
    const dd = peak > 0 ? (peak - e.y) / peak * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe (annualised, per-trade returns)
  const rets = trades.map(t => t.pnl / initialCapital);
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const std  = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length);
  const tradesPerYear = (trades.length / days) * 252;
  const sharpe = std > 0 ? ((mean / std) * Math.sqrt(tradesPerYear)).toFixed(2) : 0;

  // CAGR
  const years = days / 365;
  const cagr  = years > 0 ? (((finalCapital / initialCapital) ** (1 / years) - 1) * 100).toFixed(1) : 0;

  // Monte Carlo (500 simulations)
  const mc = [];
  for (let s = 0; s < 500; s++) {
    let cap = initialCapital;
    for (let i = 0; i < trades.length; i++)
      cap += trades[Math.floor(Math.random() * trades.length)].pnl;
    mc.push(cap);
  }
  mc.sort((a, b) => a - b);

  return {
    total_trades:  trades.length,
    win_rate:      parseFloat(wr),
    profit_factor: parseFloat(pf.toFixed(2)),
    net_pnl:       parseFloat(netPnl.toFixed(2)),
    sharpe_ratio:  parseFloat(sharpe),
    max_drawdown:  parseFloat(maxDD.toFixed(1)),
    expectancy:    parseFloat(expect.toFixed(2)),
    cagr:          parseFloat(cagr),
    equity_curve:  equity,
    monte_carlo: {
      prob_profitable: Math.round(mc.filter(c => c > initialCapital).length / mc.length * 100),
      median_final:    Math.round(mc[Math.floor(mc.length / 2)]),
      p5_final:        Math.round(mc[Math.floor(mc.length * 0.05)]),
      p95_final:       Math.round(mc[Math.floor(mc.length * 0.95)]),
    },
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────
async function runBacktest({ symbol, strategy = 'ALL', initial_capital = 10000 }) {
  logger.info(`Backtest: ${symbol} / ${strategy} / ₹${initial_capital}`, { module: 'backtest' });
  const candles = await fetchHistory(symbol);
  if (!candles || candles.length < 60) {
    throw new Error(`Not enough historical data for ${symbol} (got ${candles?.length ?? 0} days, need ≥60)`);
  }
  const cap  = Number(initial_capital) || 10000;
  const days = candles.length;
  const { trades, equity, finalCapital } = simulate(candles, strategy, cap);
  return metrics(trades, cap, finalCapital, equity, days);
}

module.exports = { runBacktest };
