'use strict';
const zerodha  = require('../../../execution/zerodha');
const orderRouter = require('../../../execution/order_router');
const riskMgr  = require('../../../risk-manager');
const { Trade } = require('../../../database/schemas');
const logger   = require('../config/logger');

class ExecutionService {
  async executeSignal(signal) {
    // 1. Risk checks
    const riskCheck = await riskMgr.preTradeCheck(signal);
    if (!riskCheck.allowed) throw new Error(`Risk blocked: ${riskCheck.reason}`);

    // 2. Calculate position size
    const sizing = riskMgr.calcPositionSize({
      capital:    riskCheck.availableCapital,
      entry:      signal.entry,
      stoploss:   signal.stoploss,
      atr:        signal.features?.atr14 || (Math.abs(signal.entry - signal.stoploss)),
      confidence: signal.confidence,
      winRate:    riskCheck.recentWinRate,
    });

    if (sizing.qty < 1) throw new Error('Position size too small — insufficient capital or large SL');

    // 3. Place entry order
    const product = signal.symbol.includes('NIFTY') ? 'NRML' : (process.env.PRODUCT_TYPE || 'MIS');
    const orderResult = await orderRouter.placeSmartOrder({
      symbol:    signal.symbol,
      exchange:  signal.exchange || 'NSE',
      type:      signal.type,   // BUY/SELL
      qty:       sizing.qty,
      price:     signal.entry,
      product,
      tag:       `AD_${signal._id}`,
    });

    // 4. Record trade
    const trade = await Trade.create({
      signalId:   signal._id,
      symbol:     signal.symbol,
      exchange:   signal.exchange || 'NSE',
      strategy:   signal.strategy,
      type:       signal.type,
      product,
      qty:        sizing.qty,
      entryPrice: orderResult.averagePrice || signal.entry,
      stoploss:   signal.stoploss,
      target:     signal.target1,
      zerodhaOrderId: orderResult.orderId,
      status:     'OPEN',
      entryTime:  new Date(),
      capitalUsed: sizing.qty * signal.entry,
      riskAmount: sizing.riskAmount,
    });

    // 5. Place SL order
    try {
      const slOrderId = await orderRouter.placeSLOrder({
        symbol:    signal.symbol,
        exchange:  signal.exchange || 'NSE',
        type:      signal.type === 'BUY' ? 'SELL' : 'BUY',
        qty:       sizing.qty,
        triggerPrice: signal.stoploss,
        product,
        parentTradeId: trade._id,
      });
      await Trade.findByIdAndUpdate(trade._id, { zerodhaSlOrderId: slOrderId });
    } catch (err) {
      logger.warn(`SL order failed for trade ${trade._id}: ${err.message}`, { module: 'execution' });
    }

    logger.info(
      `Trade opened: ${signal.symbol} ${signal.type} x${sizing.qty} @ ${trade.entryPrice}`,
      { module: 'execution', tradeId: trade._id }
    );

    return trade;
  }

  async closeTrade(tradeId, reason = 'MANUAL') {
    const trade = await Trade.findById(tradeId);
    if (!trade || trade.status !== 'OPEN') throw new Error('Trade not open');

    const closeType = trade.type === 'BUY' ? 'SELL' : 'BUY';
    const result = await orderRouter.placeSmartOrder({
      symbol:   trade.symbol,
      exchange: trade.exchange,
      type:     closeType,
      qty:      trade.qty,
      product:  trade.product,
      tag:      `CLOSE_${trade._id}`,
    });

    const exitPrice = result.averagePrice || trade.entryPrice;
    const rawPnl = trade.type === 'BUY'
      ? (exitPrice - trade.entryPrice) * trade.qty
      : (trade.entryPrice - exitPrice) * trade.qty;

    const charges = this.calcCharges(trade.entryPrice, exitPrice, trade.qty);
    const netPnl  = rawPnl - charges.total;

    await Trade.findByIdAndUpdate(tradeId, {
      exitPrice,
      status:      reason === 'SL_HIT' ? 'SL_HIT' : reason === 'TARGET_HIT' ? 'TARGET_HIT' : 'CLOSED',
      exitTime:    new Date(),
      durationMin: Math.round((Date.now() - new Date(trade.entryTime)) / 60000),
      pnl:         Math.round(rawPnl * 100) / 100,
      pnlPct:      Math.round((rawPnl / trade.capitalUsed) * 10000) / 100,
      rMultiple:   Math.round((rawPnl / trade.riskAmount) * 100) / 100,
      charges,
      netPnl:      Math.round(netPnl * 100) / 100,
    });

    return await Trade.findById(tradeId);
  }

  calcCharges(entry, exit, qty) {
    const turnover   = (entry * qty) + (exit * qty);
    const brokerage  = Math.min(40, turnover * 0.0003);
    const stt        = exit * qty * 0.00025;
    const sebi       = turnover * 0.000001;
    const nseTxn     = turnover * 0.0000325;
    const stamp      = entry * qty * 0.00003;
    const gst        = (brokerage + sebi + nseTxn) * 0.18;
    const total      = brokerage + stt + sebi + nseTxn + stamp + gst;
    return {
      total:     Math.round(total * 100) / 100,
      brokerage: Math.round(brokerage * 100) / 100,
      stt:       Math.round(stt * 100) / 100,
      gst:       Math.round(gst * 100) / 100,
    };
  }
}

module.exports = new ExecutionService();
