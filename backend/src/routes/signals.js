'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Signal } = require('../../../database/schemas');
const signalService = require('../services/signalService');

// GET /api/signals — list signals with filters
router.get('/', auth, async (req, res, next) => {
  try {
    const { status, symbol, strategy, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status)   filter.status   = status;
    if (symbol)   filter.symbol   = symbol.toUpperCase();
    if (strategy) filter.strategy = strategy;

    const signals = await Signal.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Signal.countDocuments(filter);
    res.json({ signals, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    if (err.message?.includes('buffering timed out')) {
      return res.json({ signals: [], total: 0, page: 1, limit: 50, _dbError: 'DB reconnecting' });
    }
    next(err);
  }
});

// GET /api/signals/:id
router.get('/:id', auth, async (req, res, next) => {
  try {
    const signal = await Signal.findById(req.params.id);
    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    res.json(signal);
  } catch (err) { next(err); }
});

// POST /api/signals/:id/approve
router.post('/:id/approve', auth, async (req, res, next) => {
  try {
    const result = await signalService.approveSignal(req.params.id, req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/signals/:id/reject
router.post('/:id/reject', auth, async (req, res, next) => {
  try {
    const signal = await Signal.findByIdAndUpdate(
      req.params.id,
      { status: 'REJECTED', approvedBy: req.user.id, approvedAt: new Date() },
      { new: true }
    );
    res.json(signal);
  } catch (err) { next(err); }
});

// POST /api/signals/scan — manual signal scan
router.post('/scan', auth, async (req, res, next) => {
  try {
    const { symbol, timeframe } = req.body;
    const signals = await signalService.manualScan(symbol, timeframe);
    res.json({ signals });
  } catch (err) { next(err); }
});

module.exports = router;
