'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const { strictLimiter } = require('../middleware/rateLimiter');
const zerodha = require('../../../execution/zerodha');

// GET /api/broker/status — connectivity check
router.get('/status', auth, async (req, res, next) => {
  try {
    const status = await zerodha.getStatus();
    res.json(status);
  } catch (err) { next(err); }
});

// GET /api/broker/profile
router.get('/profile', auth, async (req, res, next) => {
  try {
    const profile = await zerodha.getProfile();
    res.json(profile);
  } catch (err) { next(err); }
});

// GET /api/broker/positions
router.get('/positions', auth, async (req, res, next) => {
  try {
    const positions = await zerodha.getPositions();
    res.json(positions);
  } catch (err) { next(err); }
});

// GET /api/broker/orders
router.get('/orders', auth, async (req, res, next) => {
  try {
    const orders = await zerodha.getOrders();
    res.json(orders);
  } catch (err) { next(err); }
});

// GET /api/broker/holdings
router.get('/holdings', auth, async (req, res, next) => {
  try {
    const holdings = await zerodha.getHoldings();
    res.json(holdings);
  } catch (err) { next(err); }
});

// POST /api/broker/order — place order
router.post('/order', auth, strictLimiter, async (req, res, next) => {
  try {
    const result = await zerodha.placeOrder(req.body);
    res.json(result);
  } catch (err) { next(err); }
});

// DELETE /api/broker/order/:orderId — cancel order
router.delete('/order/:orderId', auth, async (req, res, next) => {
  try {
    const result = await zerodha.cancelOrder(req.params.orderId);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/broker/squareoff — square off all MIS positions
router.post('/squareoff', auth, async (req, res, next) => {
  try {
    const result = await zerodha.squareOffAll();
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/broker/funds
router.get('/funds', auth, async (req, res, next) => {
  try {
    const funds = await zerodha.getFunds();
    res.json(funds);
  } catch (err) { next(err); }
});

module.exports = router;
