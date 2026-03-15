'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const axios   = require('axios');
const { BacktestResult } = require('../../../database/schemas');

const ML_URL = () => process.env.ML_ENGINE_URL || 'http://localhost:5001';

// POST /api/backtest/run
router.post('/run', auth, async (req, res, next) => {
  try {
    const { data } = await axios.post(`${ML_URL()}/backtest`, req.body, { timeout: 120000 });
    // Save result
    const saved = await BacktestResult.create({ ...data, runBy: req.user.id });
    res.json({ ...data, _id: saved._id });
  } catch (err) { next(err); }
});

// GET /api/backtest/results
router.get('/results', auth, async (req, res, next) => {
  try {
    const results = await BacktestResult.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-trades -equityCurve');
    res.json({ results });
  } catch (err) { next(err); }
});

// GET /api/backtest/results/:id
router.get('/results/:id', auth, async (req, res, next) => {
  try {
    const result = await BacktestResult.findById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Result not found' });
    res.json(result);
  } catch (err) { next(err); }
});

// DELETE /api/backtest/results/:id
router.delete('/results/:id', auth, async (req, res, next) => {
  try {
    await BacktestResult.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
