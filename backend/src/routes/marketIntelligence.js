'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const svc     = require('../services/marketIntelligenceService');

// GET /api/market-intel/intelligence — full snapshot (cached data from DB)
router.get('/intelligence', auth, async (req, res, next) => {
  try {
    const data = await svc.getMarketIntelligence();
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/market-intel/fii-dii — last 5 days FII/DII
router.get('/fii-dii', auth, async (req, res, next) => {
  try {
    const { FiiDiiData } = require('../../../database/schemas');
    const data = await FiiDiiData.find().sort({ date: -1 }).limit(10).lean();
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/market-intel/refresh/fii-dii — manual refresh
router.post('/refresh/fii-dii', auth, async (req, res, next) => {
  try {
    const data = await svc.fetchFiiDii();
    res.json({ message: 'FII/DII refreshed', count: data.length });
  } catch (err) { next(err); }
});

// POST /api/market-intel/refresh/news — manual refresh
router.post('/refresh/news', auth, async (req, res, next) => {
  try {
    await Promise.all([svc.fetchIndiaNews(), svc.fetchGlobalNews()]);
    res.json({ message: 'News refreshed' });
  } catch (err) { next(err); }
});

// GET /api/market-intel/global-markets — live global markets
router.get('/global-markets', auth, async (req, res, next) => {
  try {
    const data = await svc.fetchGlobalMarkets();
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
