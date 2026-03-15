'use strict';
const { Trade }       = require('../../../database/schemas');
const executionService = require('./executionService');
const riskMgr          = require('../../../risk-manager');
const logger           = require('../config/logger');

class MonitorService {
  constructor() {
    this._interval = null;
  }

  start(io) {
    this._io = io;
    this._interval = setInterval(() => this.tick(), 60 * 1000); // every minute
    logger.info('Trade monitor started', { module: 'monitor' });
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    logger.info('Trade monitor stopped', { module: 'monitor' });
  }

  async tick() {
    try {
      const openTrades = await Trade.find({ status: 'OPEN' });
      for (const trade of openTrades) {
        await this.checkTrade(trade);
      }
    } catch (err) {
      logger.error(`Monitor tick error: ${err.message}`, { module: 'monitor' });
    }
  }

  async checkTrade(trade) {
    // Get current price via zerodha (lazy import to avoid circular)
    let ltp;
    try {
      const zerodha = require('../../../execution/zerodha');
      const quote   = await zerodha.getQuote(trade.symbol);
      ltp = quote.last_price;
    } catch {
      return; // can't get price, skip
    }

    // Check SL hit
    if (trade.type === 'BUY' && ltp <= trade.stoploss) {
      logger.warn(`SL hit: ${trade.symbol} @ ${ltp}`, { module: 'monitor' });
      await executionService.closeTrade(trade._id, 'SL_HIT');
      if (this._io) this._io.emit('trade:sl_hit', { tradeId: trade._id, symbol: trade.symbol, ltp });
      await riskMgr.recordLoss(trade);
      return;
    }

    if (trade.type === 'SELL' && ltp >= trade.stoploss) {
      logger.warn(`SL hit (SHORT): ${trade.symbol} @ ${ltp}`, { module: 'monitor' });
      await executionService.closeTrade(trade._id, 'SL_HIT');
      if (this._io) this._io.emit('trade:sl_hit', { tradeId: trade._id, symbol: trade.symbol, ltp });
      await riskMgr.recordLoss(trade);
      return;
    }

    // Check target hit
    if (trade.type === 'BUY' && ltp >= trade.target) {
      logger.info(`Target hit: ${trade.symbol} @ ${ltp}`, { module: 'monitor' });
      await executionService.closeTrade(trade._id, 'TARGET_HIT');
      if (this._io) this._io.emit('trade:target_hit', { tradeId: trade._id, symbol: trade.symbol, ltp });
      return;
    }

    if (trade.type === 'SELL' && ltp <= trade.target) {
      logger.info(`Target hit (SHORT): ${trade.symbol} @ ${ltp}`, { module: 'monitor' });
      await executionService.closeTrade(trade._id, 'TARGET_HIT');
      if (this._io) this._io.emit('trade:target_hit', { tradeId: trade._id, symbol: trade.symbol, ltp });
      return;
    }

    // Trailing stop logic
    const newSl = this.calcTrailingSL(trade, ltp);
    if (newSl && newSl !== trade.trailingSl) {
      await Trade.findByIdAndUpdate(trade._id, { stoploss: newSl, trailingSl: newSl });
      logger.info(`Trailing SL updated: ${trade.symbol} → ${newSl}`, { module: 'monitor' });
      if (this._io) this._io.emit('trade:sl_updated', { tradeId: trade._id, newSl, ltp });
    }

    // Emit live P&L
    if (this._io) {
      const unrealised = trade.type === 'BUY'
        ? (ltp - trade.entryPrice) * trade.qty
        : (trade.entryPrice - ltp) * trade.qty;
      this._io.emit('trade:update', { tradeId: trade._id, ltp, unrealised: Math.round(unrealised * 100) / 100 });
    }
  }

  calcTrailingSL(trade, ltp) {
    const { entryPrice, stoploss, type } = trade;
    const riskAmt = Math.abs(entryPrice - stoploss);
    if (!riskAmt) return null;

    if (type === 'BUY') {
      const gain = ltp - entryPrice;
      const r    = gain / riskAmt;
      if (r >= 3) return entryPrice + 2 * riskAmt; // trail at 2R
      if (r >= 2) return entryPrice + riskAmt;      // trail at 1R
      if (r >= 1) return entryPrice;                // breakeven
    } else {
      const gain = entryPrice - ltp;
      const r    = gain / riskAmt;
      if (r >= 3) return entryPrice - 2 * riskAmt;
      if (r >= 2) return entryPrice - riskAmt;
      if (r >= 1) return entryPrice;
    }
    return null;
  }
}

module.exports = new MonitorService();
