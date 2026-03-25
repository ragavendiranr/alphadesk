'use strict';
/**
 * GET  /api/news-market                — full unified snapshot
 * GET  /api/news-market/status         — per-source status
 * POST /api/news-market/refresh        — manual full refresh
 * POST /api/news-market/refresh/news   — news only
 * POST /api/news-market/refresh/fii-dii
 */
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const svc     = require('../services/marketIntelligenceService');

// Critical: tells Vercel CDN to serve cached response for 60s,
// then revalidate in background for up to 5 minutes (stale-while-revalidate).
// This is what keeps Vercel fast — no repeated scraping per user request.
const CACHE_HEADERS = {
  'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
};

// GET /api/news-market
router.get('/', auth, async (req, res) => {
  try {
    res.set(CACHE_HEADERS);
    const { section } = req.query;
    const data = await svc.getNewsMarket(section || null);
    res.json({
      data,
      sources:     data.sources || {},
      stale:       false,
      error:       null,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    // Never 500 — always return 200 with whatever we have
    res.set(CACHE_HEADERS);
    res.json({
      data:        {},
      sources:     svc.getSourceStatus(),
      stale:       true,
      error:       err.message,
      lastUpdated: new Date().toISOString(),
    });
  }
});

// GET /api/news-market/status
router.get('/status', auth, (req, res) => {
  res.json(svc.getSourceStatus());
});

// POST /api/news-market/refresh  (bypass Vercel cache — forces fresh fetch)
router.post('/refresh', auth, async (req, res) => {
  try {
    const data = await svc.getNewsMarket();
    res.json({ message: 'Full refresh complete', sources: data.sources });
  } catch (err) {
    res.json({ message: 'Partial refresh', error: err.message });
  }
});

// POST /api/news-market/refresh/news
router.post('/refresh/news', auth, async (req, res) => {
  try {
    const news = await svc.fetchNews();
    res.json({ message: 'News refreshed', count: news.india.length + news.global.length });
  } catch (err) {
    res.json({ message: 'News refresh failed', error: err.message });
  }
});

// POST /api/news-market/refresh/fii-dii
router.post('/refresh/fii-dii', auth, async (req, res) => {
  try {
    const data = await svc.fetchFiiDii();
    res.json({ message: 'FII/DII refreshed', count: data.fii?.length || 0, source: data.stale_manual_update ? 'stale' : 'live' });
  } catch (err) {
    res.json({ message: 'FII/DII refresh failed', error: err.message });
  }
});

module.exports = router;
