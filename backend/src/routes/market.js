'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { OHLC } = require('../../../database/schemas');

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
