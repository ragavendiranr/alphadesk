'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const svc     = require('../services/investmentService');

// GET /api/invest/stocks — all stocks (with optional filters)
router.get('/stocks', auth, async (req, res, next) => {
  try {
    const stocks = await svc.screenStocks(req.query);
    res.json(stocks);
  } catch (err) { next(err); }
});

// POST /api/invest/seed — seed the 50 stocks (admin action)
router.post('/seed', auth, async (req, res, next) => {
  try {
    const count = await svc.seedStocks();
    res.json({ message: `Seeded ${count} stocks` });
  } catch (err) { next(err); }
});

// POST /api/invest/ai-recommend — Claude AI recommendations
router.post('/ai-recommend', auth, async (req, res, next) => {
  try {
    const { cap, sector } = req.body;
    const result = await svc.getAiRecommendation(cap, sector);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/invest/deep-dive/:symbol — Claude deep dive for one stock
router.get('/deep-dive/:symbol', auth, async (req, res, next) => {
  try {
    const result = await svc.getStockDeepDive(req.params.symbol);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/invest/portfolio — get all portfolio holdings
router.get('/portfolio', auth, async (req, res, next) => {
  try {
    const portfolio = await svc.getPortfolio();
    res.json(portfolio);
  } catch (err) { next(err); }
});

// POST /api/invest/portfolio — add a holding
router.post('/portfolio', auth, async (req, res, next) => {
  try {
    const holding = await svc.addPortfolioHolding(req.body);
    res.status(201).json(holding);
  } catch (err) { next(err); }
});

// DELETE /api/invest/portfolio/:id — remove a holding
router.delete('/portfolio/:id', auth, async (req, res, next) => {
  try {
    await svc.removePortfolioHolding(req.params.id);
    res.json({ message: 'Holding removed' });
  } catch (err) { next(err); }
});

// POST /api/invest/refresh-prices — refresh current prices from Zerodha
router.post('/refresh-prices', auth, async (req, res, next) => {
  try {
    const count = await svc.refreshStockPrices();
    res.json({ message: `Prices refreshed for ${count} stocks` });
  } catch (err) { next(err); }
});

module.exports = router;
