'use strict';
const zerodha = require('./zerodha');
const logger  = require('../backend/src/config/logger');

class OrderRouter {
  // Smart order: try LIMIT first, fallback to MARKET after 30s
  async placeSmartOrder(params) {
    const { symbol, exchange, type, qty, price, product, tag } = params;

    // Compute smart limit price
    let limitPrice = price;
    try {
      const quote = await zerodha.getQuote(symbol, exchange);
      const bid   = quote.depth?.buy[0]?.price  || quote.last_price;
      const ask   = quote.depth?.sell[0]?.price || quote.last_price;
      const spread = ask - bid;
      limitPrice = type === 'BUY'
        ? +(bid + 0.5 * spread).toFixed(2)
        : +(ask - 0.5 * spread).toFixed(2);
    } catch {
      limitPrice = price;
    }

    // For large orders (>5 lots NIFTY), use iceberg
    const isNifty = symbol.includes('NIFTY');
    if (isNifty && qty > 5) {
      return this.placeIcebergOrder({ symbol, exchange, type, qty, limitPrice, product, tag });
    }

    // Place LIMIT order
    logger.info(`SmartOrder LIMIT: ${symbol} ${type} x${qty} @ ${limitPrice}`, { module: 'orderRouter' });
    const result = await zerodha.placeOrder({
      symbol, exchange, type, qty,
      price: limitPrice,
      product,
      orderType: 'LIMIT',
      tag,
    });

    // Wait 30 seconds for fill, then fallback to MARKET
    await new Promise(r => setTimeout(r, 30000));
    const orders = await zerodha.getOrders();
    const order  = orders.find(o => o.order_id === result.orderId);

    if (order && order.status !== 'COMPLETE' && order.status !== 'CANCELLED') {
      logger.warn(`Limit order unfilled after 30s — converting to MARKET: ${result.orderId}`, { module: 'orderRouter' });
      await zerodha.cancelOrder(result.orderId);
      const marketResult = await zerodha.placeOrder({
        symbol, exchange, type, qty,
        product,
        orderType: 'MARKET',
        tag: `${tag}_MKT`,
      });
      return { ...marketResult, orderType: 'MARKET', averagePrice: price };
    }

    const avgPrice = order?.average_price || limitPrice;
    return { ...result, orderType: 'LIMIT', averagePrice: avgPrice };
  }

  // Iceberg: split into 3 parts
  async placeIcebergOrder(params) {
    const { symbol, exchange, type, qty, limitPrice, product, tag } = params;
    const partSize  = Math.ceil(qty / 3);
    const results   = [];

    for (let i = 0; i < 3; i++) {
      const partQty = Math.min(partSize, qty - partSize * i);
      if (partQty <= 0) break;
      const r = await this.placeSmartOrder({
        symbol, exchange, type,
        qty:     partQty,
        price:   limitPrice,
        product,
        tag:     `${tag}_ICE${i + 1}`,
      });
      results.push(r);
      await new Promise(r => setTimeout(r, 2000));
    }

    const avgPrice = results.reduce((s, r) => s + (r.averagePrice || limitPrice), 0) / results.length;
    return { orderId: results[0].orderId, orderType: 'ICEBERG', averagePrice: avgPrice, parts: results };
  }

  // SL-M order
  async placeSLOrder(params) {
    const { symbol, exchange, type, qty, triggerPrice, product, parentTradeId } = params;
    const result = await zerodha.placeOrder({
      symbol, exchange, type, qty,
      triggerPrice,
      product,
      orderType: 'SL-M',
      tag: `AD_SL_${parentTradeId}`,
    });
    logger.info(`SL order placed: ${symbol} trigger @ ${triggerPrice} orderId=${result.orderId}`, {
      module: 'orderRouter',
    });
    return result.orderId;
  }

  // Target LIMIT order
  async placeTargetOrder(params) {
    const { symbol, exchange, type, qty, targetPrice, product, parentTradeId } = params;
    const result = await zerodha.placeOrder({
      symbol, exchange, type, qty,
      price: targetPrice,
      product,
      orderType: 'LIMIT',
      tag: `AD_TGT_${parentTradeId}`,
    });
    return result.orderId;
  }

  // Modify SL (trailing stop update)
  async modifySLOrder(orderId, newTriggerPrice) {
    return zerodha.modifyOrder(orderId, { trigger_price: newTriggerPrice });
  }
}

module.exports = new OrderRouter();
