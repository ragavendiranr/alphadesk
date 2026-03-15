'use strict';
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const reportService = require('../services/reportService');

// GET /api/reports/daily
router.get('/daily', auth, async (req, res, next) => {
  try {
    const { date } = req.query;
    const report = await reportService.generateDailyReport(date);
    res.json(report);
  } catch (err) { next(err); }
});

// GET /api/reports/weekly
router.get('/weekly', auth, async (req, res, next) => {
  try {
    const report = await reportService.generateWeeklyReport();
    res.json(report);
  } catch (err) { next(err); }
});

// GET /api/reports/monthly
router.get('/monthly', auth, async (req, res, next) => {
  try {
    const report = await reportService.generateMonthlyReport();
    res.json(report);
  } catch (err) { next(err); }
});

// POST /api/reports/send-telegram
router.post('/send-telegram', auth, async (req, res, next) => {
  try {
    const { type = 'daily' } = req.body;
    await reportService.sendTelegramReport(type);
    res.json({ success: true, type });
  } catch (err) { next(err); }
});

module.exports = router;
