'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { MarketRegime } = require('../../../database/schemas');

// GET /api/regime/current
router.get('/current', auth, async (req, res, next) => {
  try {
    const { symbol = 'NIFTY 50' } = req.query;
    const regime = await MarketRegime.findOne({ symbol })
      .sort({ timestamp: -1 });
    if (!regime) return res.json({ symbol, regime: 'UNKNOWN', confidence: 0 });
    res.json(regime);
  } catch (err) { next(err); }
});

// GET /api/regime/history
router.get('/history', auth, async (req, res, next) => {
  try {
    const { symbol = 'NIFTY 50', limit = 100 } = req.query;
    const history = await MarketRegime.find({ symbol })
      .sort({ timestamp: -1 })
      .limit(Number(limit));
    res.json({ symbol, history });
  } catch (err) { next(err); }
});

module.exports = router;
