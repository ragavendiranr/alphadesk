'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const axios   = require('axios');
const { SentimentScore } = require('../../../database/schemas');

const ML_URL = () => process.env.ML_ENGINE_URL || 'http://localhost:5001';

// GET /api/sentiment/latest
router.get('/latest', auth, async (req, res, next) => {
  try {
    const { symbol } = req.query;
    const filter = symbol ? { symbol } : {};
    const scores = await SentimentScore.find(filter)
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ scores });
  } catch (err) { next(err); }
});

// POST /api/sentiment/refresh — trigger live fetch
router.post('/refresh', auth, async (req, res, next) => {
  try {
    const { data } = await axios.post(
      `${ML_URL()}/sentiment/refresh`,
      req.body || {},
      { timeout: 60000 }
    );
    // Persist to DB
    if (data.score !== undefined) {
      const date = new Date().toISOString().slice(0, 10);
      await SentimentScore.findOneAndUpdate(
        { date, symbol: data.symbol || 'MARKET' },
        { ...data, date },
        { upsert: true, new: true }
      );
    }
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/sentiment/history
router.get('/history', auth, async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const from = new Date();
    from.setDate(from.getDate() - Number(days));
    const scores = await SentimentScore.find({
      createdAt: { $gte: from },
    }).sort({ createdAt: -1 });
    res.json({ scores });
  } catch (err) { next(err); }
});

module.exports = router;
