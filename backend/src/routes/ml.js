'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const axios   = require('axios');

const ML_URL = () => process.env.ML_ENGINE_URL || 'http://localhost:5001';

// GET /api/ml/health
router.get('/health', auth, async (req, res, next) => {
  try {
    const { data } = await axios.get(`${ML_URL()}/health`, { timeout: 5000 });
    res.json(data);
  } catch {
    res.status(503).json({ status: 'offline', message: 'ML engine unreachable' });
  }
});

// POST /api/ml/predict
router.post('/predict', auth, async (req, res, next) => {
  try {
    const { data } = await axios.post(`${ML_URL()}/predict`, req.body, { timeout: 15000 });
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/ml/train
router.post('/train', auth, async (req, res, next) => {
  try {
    const { data } = await axios.post(`${ML_URL()}/train`, req.body || {}, { timeout: 300000 });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/ml/features/:symbol
router.get('/features/:symbol', auth, async (req, res, next) => {
  try {
    const { timeframe = '5m' } = req.query;
    const { data } = await axios.get(
      `${ML_URL()}/features/${req.params.symbol}?timeframe=${timeframe}`,
      { timeout: 10000 }
    );
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/ml/regime/:symbol
router.get('/regime/:symbol', auth, async (req, res, next) => {
  try {
    const { data } = await axios.get(`${ML_URL()}/regime/${req.params.symbol}`, { timeout: 10000 });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/ml/sentiment
router.get('/sentiment', auth, async (req, res, next) => {
  try {
    const { symbol } = req.query;
    const url = symbol
      ? `${ML_URL()}/sentiment?symbol=${symbol}`
      : `${ML_URL()}/sentiment`;
    const { data } = await axios.get(url, { timeout: 15000 });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/ml/model-stats
router.get('/model-stats', auth, async (req, res, next) => {
  try {
    const { data } = await axios.get(`${ML_URL()}/model-stats`, { timeout: 10000 });
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
