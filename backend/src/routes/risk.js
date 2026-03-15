'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { Budget, Trade, DailySession } = require('../../../database/schemas');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/risk/status — current risk dashboard
router.get('/status', auth, async (req, res, next) => {
  try {
    const date = todayStr();
    let budget = await Budget.findOne({ date });
    if (!budget) {
      budget = await Budget.create({
        date,
        capital: Number(process.env.DAILY_CAPITAL) || 10000,
        riskPct: Number(process.env.MAX_RISK_PER_TRADE) || 0.01,
        lossLimit: Number(process.env.DAILY_LOSS_LIMIT) || 0.015,
      });
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const closedTrades = await Trade.find({
      entryTime: { $gte: today },
      status: { $in: ['CLOSED', 'SL_HIT', 'TARGET_HIT'] },
    });

    const dailyLoss = closedTrades.reduce((s, t) => s + Math.min(t.pnl || 0, 0), 0);
    const dailyGain = closedTrades.reduce((s, t) => s + Math.max(t.pnl || 0, 0), 0);
    const netPnl    = dailyLoss + dailyGain;
    const lossLimitAmount = budget.capital * budget.lossLimit;
    const usedPct = Math.abs(dailyLoss) / lossLimitAmount * 100;

    res.json({
      date,
      capital: budget.capital,
      dailyLossLimit: lossLimitAmount,
      dailyLoss: Math.abs(dailyLoss),
      dailyGain,
      netPnl,
      usedLossLimitPct: usedPct.toFixed(1),
      halted: budget.halted,
      haltReason: budget.haltReason,
      openTrades: await Trade.countDocuments({ status: 'OPEN' }),
      maxConcurrentTrades: Number(process.env.MAX_CONCURRENT_TRADES) || 3,
    });
  } catch (err) { next(err); }
});

// POST /api/risk/halt
router.post('/halt', auth, async (req, res, next) => {
  try {
    const date = todayStr();
    const budget = await Budget.findOneAndUpdate(
      { date },
      { halted: true, haltReason: req.body.reason || 'Manual halt' },
      { upsert: true, new: true }
    );
    res.json({ halted: true, budget });
  } catch (err) { next(err); }
});

// POST /api/risk/resume
router.post('/resume', auth, async (req, res, next) => {
  try {
    const date = todayStr();
    const budget = await Budget.findOneAndUpdate(
      { date },
      { halted: false, haltReason: null },
      { upsert: true, new: true }
    );
    res.json({ halted: false, budget });
  } catch (err) { next(err); }
});

// PATCH /api/risk/budget
router.patch('/budget', auth, async (req, res, next) => {
  try {
    const { capital } = req.body;
    if (!capital || capital <= 0) return res.status(400).json({ error: 'Invalid capital' });
    const date = todayStr();
    const budget = await Budget.findOneAndUpdate(
      { date },
      { capital: Number(capital), setBy: req.user.id },
      { upsert: true, new: true }
    );
    res.json(budget);
  } catch (err) { next(err); }
});

module.exports = router;
