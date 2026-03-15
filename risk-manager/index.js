'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Budget, Trade } = require('../database/schemas');
const logger = require('../backend/src/config/logger');

class RiskManager {
  constructor() {
    this._consecutiveLosses = 0;
    this._reducedSizeUntil  = 0; // trade count until size returns to normal
    this._tradeCount        = 0;
  }

  // ── Position sizing ────────────────────────────────────────────────────────
  calcPositionSize({ capital, entry, stoploss, atr, confidence, winRate = 0.5 }) {
    const baseRisk = capital * Number(process.env.MAX_RISK_PER_TRADE || 0.01);

    // ATR adjustment
    const atrPct = ((atr || Math.abs(entry - stoploss)) / entry) * 100;
    const atrMult = atrPct > 1.5 ? 0.5 : atrPct > 1.0 ? 0.75 : 1.0;

    // Confidence adjustment (75% → 0.75×, 90% → 1.0×)
    const confMult = Math.min(1.0, Math.max(0.1, (confidence - 50) / 40));

    // Win rate adjustment
    const wrMult = winRate < 0.40 ? 0.5 : winRate < 0.50 ? 0.75 : 1.0;

    // Consecutive loss adjustment
    const consLossMult = this._consecutiveLosses >= 3 ? 0.5 : 1.0;

    const adjustedRisk = baseRisk * atrMult * confMult * wrMult * consLossMult;
    const slDistance   = Math.abs(entry - stoploss);

    const qty = slDistance > 0 ? Math.floor(adjustedRisk / slDistance) : 0;

    return {
      qty,
      riskAmount: Math.round(adjustedRisk),
      adjustments: { atr: atrMult, conf: confMult, winRate: wrMult, consLoss: consLossMult },
    };
  }

  // ── Pre-trade risk check ───────────────────────────────────────────────────
  async preTradeCheck(signal) {
    const date   = new Date().toISOString().slice(0, 10);
    const budget = await Budget.findOne({ date });

    if (!budget) {
      return { allowed: false, reason: 'No budget set for today' };
    }

    // Trading halted?
    if (budget.halted) {
      return { allowed: false, reason: budget.haltReason || 'Trading halted' };
    }

    // Check time — no new trades after 3:10 PM IST
    const now = new Date();
    const istHour   = (now.getUTCHours() + 5) % 24;
    const istMinute = (now.getUTCMinutes() + 30) % 60;
    if (istHour > 15 || (istHour === 15 && istMinute >= 10)) {
      return { allowed: false, reason: 'No new trades after 3:10 PM IST' };
    }

    // Max concurrent trades
    const openCount = await Trade.countDocuments({ status: 'OPEN' });
    const maxTrades = Number(process.env.MAX_CONCURRENT_TRADES || 3);
    if (openCount >= maxTrades) {
      return { allowed: false, reason: `Max concurrent trades reached (${maxTrades})` };
    }

    // Daily loss limit check
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const closedToday = await Trade.find({
      entryTime: { $gte: today },
      status: { $in: ['CLOSED', 'SL_HIT', 'TARGET_HIT'] },
    });

    const dailyLoss = closedToday.reduce((s, t) => s + Math.min(t.pnl || 0, 0), 0);
    const lossLimit = budget.capital * budget.lossLimit;

    if (Math.abs(dailyLoss) >= lossLimit) {
      await Budget.findOneAndUpdate({ date }, { halted: true, haltReason: 'Daily loss limit hit' });
      const telegramBot = require('../telegram-bot/bot');
      await telegramBot.sendRiskAlert(`🚨 *Daily loss limit hit!*\nLoss: ₹${Math.abs(dailyLoss).toFixed(2)}\nLimit: ₹${lossLimit.toFixed(2)}\nTrading HALTED for today.`);
      return { allowed: false, reason: 'Daily loss limit hit' };
    }

    // Warn at 70% of limit
    if (Math.abs(dailyLoss) >= lossLimit * 0.7) {
      const telegramBot = require('../telegram-bot/bot');
      await telegramBot.sendRiskAlert(
        `⚠️ Daily loss at ${((Math.abs(dailyLoss) / lossLimit) * 100).toFixed(0)}% of limit.\nCurrent: ₹${Math.abs(dailyLoss).toFixed(2)} / ₹${lossLimit.toFixed(2)}`
      );
    }

    // Get recent win rate (last 10 trades)
    const lastTen = await Trade.find({ status: { $in: ['CLOSED', 'SL_HIT', 'TARGET_HIT'] } })
      .sort({ exitTime: -1 }).limit(10);
    const recentWinRate = lastTen.length
      ? lastTen.filter(t => (t.pnl || 0) > 0).length / lastTen.length
      : 0.5;

    return {
      allowed:          true,
      availableCapital: budget.capital,
      recentWinRate,
      dailyLossUsed:    Math.abs(dailyLoss),
      dailyLossLimit:   lossLimit,
    };
  }

  // ── Record loss for consecutive loss tracking ─────────────────────────────
  async recordLoss(trade) {
    this._consecutiveLosses++;
    this._tradeCount++;
    logger.warn(`Consecutive losses: ${this._consecutiveLosses}`, { module: 'riskManager' });

    const telegramBot = require('../telegram-bot/bot');

    if (this._consecutiveLosses === 3) {
      this._reducedSizeUntil = this._tradeCount + 5;
      await telegramBot.sendRiskAlert(
        '⚠️ 3 consecutive losses. Position size reduced to 50% for next 5 trades.'
      );
    }

    if (this._consecutiveLosses >= 5) {
      // Halt for rest of day
      const date = new Date().toISOString().slice(0, 10);
      await Budget.findOneAndUpdate(
        { date },
        { halted: true, haltReason: '5 consecutive losses — auto-halt' },
        { upsert: true }
      );
      await telegramBot.sendRiskAlert(
        '🚨 *5 consecutive losses!*\nTrading HALTED for the rest of the day.\nUse /resume to override.'
      );
    }
  }

  // Reset on win
  recordWin() {
    this._consecutiveLosses = 0;
    this._tradeCount++;
  }

  // Extra capital check (confidence ≥ 90, confirmations ≥ 5, RL agrees)
  async requestExtraCapital(signal) {
    if (signal.confidence < 90) return false;
    if ((signal.confirmations || []).length < 5) return false;
    if (!signal.rlAgree) return false;

    const telegramBot = require('../telegram-bot/bot');
    await telegramBot.sendMessage(
      process.env.TELEGRAM_CHAT_ID,
      [
        '⚡ *Extra Capital Request*',
        '',
        `Signal: *${signal.symbol} ${signal.type}*`,
        `Confidence: ${signal.confidence}%`,
        `Confirmations: ${signal.confirmations.length}/5+`,
        `RL Agent: ✅ Agrees`,
        '',
        'Approve to use up to 2× normal position size?',
        '*(Risk still capped at 2%)*',
      ].join('\n'),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '⚡ USE EXTRA CAPITAL', callback_data: `extra_capital:${signal._id}:yes` },
            { text: '🚫 NORMAL SIZE',       callback_data: `extra_capital:${signal._id}:no` },
          ]],
        },
      }
    );
    return true;
  }
}

module.exports = new RiskManager();
