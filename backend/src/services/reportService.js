'use strict';
const { Trade, DailySession, StrategyPerf } = require('../../../database/schemas');
const logger = require('../config/logger');

class ReportService {
  async generateDailyReport(dateStr) {
    const date = dateStr || new Date().toISOString().slice(0, 10);
    const from = new Date(date);
    const to   = new Date(date);
    to.setDate(to.getDate() + 1);

    const trades = await Trade.find({
      entryTime: { $gte: from, $lt: to },
      status:    { $in: ['CLOSED', 'SL_HIT', 'TARGET_HIT'] },
    });

    const grossPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
    const charges  = trades.reduce((s, t) => s + (t.charges?.total || 0), 0);
    const netPnl   = grossPnl - charges;
    const won      = trades.filter(t => (t.pnl || 0) > 0).length;
    const byStrategy = {};

    for (const t of trades) {
      if (!byStrategy[t.strategy]) byStrategy[t.strategy] = { trades: 0, pnl: 0, won: 0 };
      byStrategy[t.strategy].trades++;
      byStrategy[t.strategy].pnl += t.pnl || 0;
      if ((t.pnl || 0) > 0) byStrategy[t.strategy].won++;
    }

    return {
      date,
      totalTrades:  trades.length,
      won,
      lost:         trades.length - won,
      winRate:      trades.length ? ((won / trades.length) * 100).toFixed(1) : '0.0',
      grossPnl:     grossPnl.toFixed(2),
      charges:      charges.toFixed(2),
      netPnl:       netPnl.toFixed(2),
      byStrategy,
      bestTrade:    trades.length ? Math.max(...trades.map(t => t.pnl || 0)).toFixed(2) : 0,
      worstTrade:   trades.length ? Math.min(...trades.map(t => t.pnl || 0)).toFixed(2) : 0,
    };
  }

  async generateWeeklyReport() {
    const reports = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      reports.push(await this.generateDailyReport(d.toISOString().slice(0, 10)));
    }
    const totNetPnl = reports.reduce((s, r) => s + parseFloat(r.netPnl), 0);
    return { days: reports, totalNetPnl: totNetPnl.toFixed(2) };
  }

  async generateMonthlyReport() {
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const trades = await Trade.find({
      entryTime: { $gte: from },
      status:    { $in: ['CLOSED', 'SL_HIT', 'TARGET_HIT'] },
    });

    const grossPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
    const won      = trades.filter(t => (t.pnl || 0) > 0).length;

    // Simple AI recommendation
    const winRate = trades.length ? won / trades.length : 0;
    let recommendation = '';
    if (winRate > 0.6) recommendation = 'Performing well. Consider increasing position size by 10%.';
    else if (winRate > 0.45) recommendation = 'Average performance. Review losing trades and adjust strategy filters.';
    else recommendation = 'Below target win rate. Reduce position size by 50% and review entry criteria.';

    return {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalTrades: trades.length,
      won,
      winRate: (winRate * 100).toFixed(1),
      grossPnl: grossPnl.toFixed(2),
      aiRecommendation: recommendation,
    };
  }

  async sendTelegramReport(type) {
    const bot = require('../../../telegram-bot/bot');
    let report;
    if (type === 'weekly')  report = await this.generateWeeklyReport();
    else if (type === 'monthly') report = await this.generateMonthlyReport();
    else report = await this.generateDailyReport();

    const msg = this.formatReportMessage(type, report);
    await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
  }

  formatReportMessage(type, report) {
    if (type === 'daily') {
      return [
        `📊 *AlphaDesk Daily Report — ${report.date}*`,
        '',
        `Trades: ${report.totalTrades} | ✅ ${report.won} | ❌ ${report.lost}`,
        `Win Rate: *${report.winRate}%*`,
        `Gross P&L: ₹${report.grossPnl}`,
        `Charges: ₹${report.charges}`,
        `Net P&L: *₹${report.netPnl}*`,
        `Best: ₹${report.bestTrade} | Worst: ₹${report.worstTrade}`,
      ].join('\n');
    }
    if (type === 'weekly') {
      return `📅 *Weekly Summary*\nTotal Net P&L: *₹${report.totalNetPnl}*`;
    }
    return `📆 *Monthly Report — ${report.month}*\nNet P&L: ₹${report.grossPnl}\nWin Rate: ${report.winRate}%\n💡 ${report.aiRecommendation}`;
  }
}

module.exports = new ReportService();
