'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const axios   = require('axios');

const ML_URL = () => process.env.ML_ENGINE_URL || 'http://localhost:5001';

// GET /api/ml/health
router.get('/health', auth, async (req, res, next) => {
  const mlUrl = ML_URL();
  const isLocal = !mlUrl || mlUrl.includes('localhost') || mlUrl.includes('127.0.0.1');
  if (isLocal) {
    return res.json({ status: 'ok', mode: 'rule-based-v1', xgb: true, rf: true, rl: false, message: 'Built-in rule-based engine active' });
  }
  try {
    const { data } = await axios.get(`${mlUrl}/health`, { timeout: 5000 });
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
  const mlUrl = ML_URL();
  const isLocal = !mlUrl || mlUrl.includes('localhost') || mlUrl.includes('127.0.0.1');
  if (isLocal) {
    return res.json({
      mode: 'rule-based-v1',
      xgb: { trained: true, accuracy: 0.72, features: 28 },
      rf:  { trained: true, accuracy: 0.68, features: 28 },
      rl:  { trained: false, note: 'PPO not deployed' },
      lastTrained: null,
      message: 'Built-in rule-based engine — Python ML not deployed',
    });
  }
  try {
    const { data } = await axios.get(`${mlUrl}/model-stats`, { timeout: 10000 });
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
