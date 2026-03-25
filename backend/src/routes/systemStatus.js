'use strict';
const express = require('express');
const router  = express.Router();
const authenticate = require('../middleware/auth');
const { ActivityLog }  = require('../../../database/schemas');
const { isMarketOpen, getIST, getTodaySignalStats, SCAN_SYMBOLS } = require('../services/techSignalService');
const healthSvc = require('../services/systemHealthService');

// ── GET /api/system/status — quick status (called every 10s) ──────────────────
router.get('/status', authenticate, async (req, res) => {
  try {
    const ist = getIST();
    const h = ist.getUTCHours(), m = ist.getUTCMinutes();
    const mins = h * 60 + m;
    const day  = ist.getUTCDay();
    const isWeekend = day === 0 || day === 6;

    // Market status
    let marketStatus = 'CLOSED';
    if (!isWeekend) {
      if (mins >= 9 * 60 + 0  && mins < 9 * 60 + 15)  marketStatus = 'PRE-OPEN';
      else if (mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30) marketStatus = 'OPEN';
      else if (mins > 15 * 60 + 30 && mins < 16 * 60)  marketStatus = 'POST-CLOSE';
    }

    // Signal engine status
    const open = isMarketOpen();
    const signalEngineStatus = open ? 'ACTIVE' : 'PAUSED';

    // Signal stats
    const signalStats = await getTodaySignalStats();

    // Bot status based on time
    let botStatus = 'IDLE';
    if (!isWeekend) {
      if (mins >= 7 * 60 && mins < 9 * 60 + 15)    botStatus = 'PRE-MARKET';
      else if (open)                                  botStatus = 'MONITORING';
      else if (mins > 15 * 60 + 30 && mins < 20 * 60) botStatus = 'POST-MARKET';
    }

    // Last activity — graceful fallback if DB buffering times out
    let lastActivity = null;
    try { lastActivity = await ActivityLog.findOne().sort({ time: -1 }).lean(); } catch {}

    res.json({
      marketStatus,
      botStatus,
      signalEngineStatus,
      isMarketOpen: open,
      istTime: ist.toISOString(),
      monitoredAssets: ['NIFTY50', 'BANKNIFTY', 'FINNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'],
      activeTimeframes: ['5M', '15M', '1H'],
      scanSymbolCount: SCAN_SYMBOLS.length,
      signalStats,
      lastActivityAt: lastActivity?.time || null,
      lastActivityMsg: lastActivity?.message || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/health — full component health (called every 30s) ──────────
router.get('/health', authenticate, async (req, res) => {
  try {
    res.json(healthSvc.getHealthSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/system/alerts — active alerts ─────────────────────────────────────
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const summary = healthSvc.getHealthSummary();
    res.json({ alerts: summary.alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system/repair — trigger auto-repair for a component ──────────────
router.post('/repair', authenticate, async (req, res) => {
  const { component } = req.body;
  if (!component) return res.status(400).json({ error: 'component required' });
  try {
    const steps = await healthSvc.repairComponent(component);
    res.json({ success: true, steps, health: healthSvc.getHealthSummary() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/system/repair/dismiss — dismiss an alert without repairing ───────
router.post('/repair/dismiss', authenticate, (req, res) => {
  res.json({ success: true });
});

// ── GET /api/system/activity ───────────────────────────────────────────────────
router.get('/activity', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const logs  = await ActivityLog.find().sort({ time: -1 }).limit(limit).lean();
    res.json({ logs: logs.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
