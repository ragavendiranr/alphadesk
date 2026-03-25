'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Trade } = require('../../../database/schemas');

// GET /api/trades
router.get('/', auth, async (req, res, next) => {
  try {
    const { status, symbol, from, to, limit = 100, page = 1 } = req.query;
    const filter = {};
    if (status)  filter.status  = status;
    if (symbol)  filter.symbol  = symbol.toUpperCase();
    if (from || to) {
      filter.entryTime = {};
      if (from) filter.entryTime.$gte = new Date(from);
      if (to)   filter.entryTime.$lte = new Date(to);
    }
    const trades = await Trade.find(filter)
      .sort({ entryTime: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Trade.countDocuments(filter);
    res.json({ trades, total });
  } catch (err) {
    if (err.message?.includes('buffering timed out')) {
      return res.json({ trades: [], total: 0, _dbError: 'DB reconnecting' });
    }
    next(err);
  }
});

// GET /api/trades/summary — today's P&L summary
router.get('/summary', auth, async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const trades = await Trade.find({
      entryTime: { $gte: today },
      status: { $in: ['CLOSED', 'SL_HIT', 'TARGET_HIT'] },
    });

    const gross = trades.reduce((s, t) => s + (t.pnl || 0), 0);
    const charges = trades.reduce((s, t) => s + (t.charges?.total || 0), 0);
    const won = trades.filter(t => (t.pnl || 0) > 0).length;

    res.json({
      totalTrades: trades.length,
      won,
      lost: trades.length - won,
      winRate: trades.length ? ((won / trades.length) * 100).toFixed(1) : 0,
      grossPnl: gross.toFixed(2),
      charges: charges.toFixed(2),
      netPnl: (gross - charges).toFixed(2),
    });
  } catch (err) { next(err); }
});

// GET /api/trades/open
router.get('/open', auth, async (req, res, next) => {
  try {
    const trades = await Trade.find({ status: 'OPEN' });
    res.json({ trades });
  } catch (err) { next(err); }
});

// GET /api/trades/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const trade = await Trade.findById(req.params.id).populate('signalId');
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    res.json(trade);
  } catch (err) { next(err); }
});

// PATCH /api/trades/:id/notes
router.patch('/:id/notes', auth, async (req, res, next) => {
  try {
    const trade = await Trade.findByIdAndUpdate(
      req.params.id,
      { notes: req.body.notes, tags: req.body.tags },
      { new: true }
    );
    res.json(trade);
  } catch (err) { next(err); }
});

module.exports = router;
