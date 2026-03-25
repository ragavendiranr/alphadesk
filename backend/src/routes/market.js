'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { OHLC } = require('../../../database/schemas');

// GET /api/market/status — lightweight market open/closed check
router.get('/status', auth, (req, res) => {
  const istMs = Date.now() + (5 * 60 + 30) * 60 * 1000;
  const ist   = new Date(istMs);
  const h     = ist.getUTCHours();
  const m     = ist.getUTCMinutes();
  const day   = ist.getUTCDay();
  const mins  = h * 60 + m;
  const isWeekend = day === 0 || day === 6;

  let status  = 'CLOSED';
  let is_open = false;
  if (!isWeekend) {
    if (mins >= 9 * 60 && mins < 9 * 60 + 15)           { status = 'PRE_OPEN'; }
    else if (mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30) { status = 'OPEN'; is_open = true; }
  }

  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  let next_open = 'Monday 9:15 AM IST';
  if (!isWeekend) {
    if (mins < 9 * 60 + 15) next_open = 'Today 9:15 AM IST';
    else if (day >= 1 && day <= 4) next_open = 'Tomorrow 9:15 AM IST';
  }

  res.json({ status, is_open, current_time_ist: `${hh}:${mm}`, next_open });
});

// GET /api/market/quote/:symbol
router.get('/quote/:symbol', auth, async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const candle = await OHLC.findOne({ symbol, timeframe: '1m' })
      .sort({ timestamp: -1 });
    if (!candle) return res.status(404).json({ error: 'No data for symbol' });
    res.json({
      symbol,
      ltp: candle.close,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      volume: candle.volume,
      timestamp: candle.timestamp,
    });
  } catch (err) { next(err); }
});

// GET /api/market/candles/:symbol
router.get('/candles/:symbol', auth, async (req, res, next) => {
  try {
    const { timeframe = '5m', limit = 200 } = req.query;
    const symbol = req.params.symbol.toUpperCase();
    const candles = await OHLC.find({ symbol, timeframe })
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .lean();
    res.json({ symbol, timeframe, candles: candles.reverse() });
  } catch (err) { next(err); }
});

// GET /api/market/prices — live prices via Twelve Data API
router.get('/prices', auth, async (req, res, next) => {
  try {
    const TWELVE_KEY = process.env.TWELVE_DATA_KEY;
    if (!TWELVE_KEY) return res.status(503).json({ error: 'TWELVE_DATA_KEY not configured' });

    const symbols = [
      'NIFTY:NSE', 'BANKNIFTY:NSE',
      'RELIANCE:NSE', 'TCS:NSE', 'HDFCBANK:NSE',
      'INFY:NSE', 'ICICIBANK:NSE',
    ];
    const symbolStr = symbols.join(',');

    const { data } = await axios.get(
      `https://api.twelvedata.com/price?symbol=${symbolStr}&apikey=${TWELVE_KEY}`,
      { timeout: 10000 }
    );

    // Also fetch previous close for % change
    const { data: prevData } = await axios.get(
      `https://api.twelvedata.com/eod?symbol=${symbolStr}&apikey=${TWELVE_KEY}`,
      { timeout: 10000 }
    ).catch(() => ({ data: {} }));

    const prices = {};
    for (const sym of symbols) {
      const key = sym.split(':')[0];
      const priceEntry = data[sym] || data[key];
      const prevEntry  = prevData[sym] || prevData[key];
      if (priceEntry?.price) {
        const ltp  = parseFloat(priceEntry.price);
        const prev = prevEntry?.close ? parseFloat(prevEntry.close) : ltp;
        const chg  = prev > 0 ? ((ltp - prev) / prev) * 100 : 0;
        prices[key] = { ltp, change: parseFloat(chg.toFixed(2)), prev };
      }
    }
    res.json({ prices, source: 'twelve_data', timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

// GET /api/market/watchlist
router.get('/watchlist', auth, (req, res) => {
  const symbols = (process.env.MARKETS || 'NIFTY,BANKNIFTY').split(',');
  const niftyStocks = [
    'RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK',
    'HINDUNILVR','SBIN','BHARTIARTL','BAJFINANCE','ASIANPAINT',
    'ITC','KOTAKBANK','LT','AXISBANK','MARUTI',
    'SUNPHARMA','TITAN','ULTRACEMCO','WIPRO','ONGC',
  ];
  res.json({ symbols: [...symbols, ...niftyStocks] });
});

module.exports = router;
