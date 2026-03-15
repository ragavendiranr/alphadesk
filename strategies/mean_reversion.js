'use strict';
/**
 * Mean Reversion Strategy
 * Trigger: extreme RSI + BB deviation in ranging market.
 */
function evaluate(candles, indicators) {
  const n    = candles.length;
  if (n < 20) return null;
  const last = candles[n - 1];
  const close = last.close;
  const ind   = indicators;

  if (ind.adx >= 20) return null;   // only in ranging market

  const atr = ind.atr14;

  // Oversold → BUY
  if (ind.rsi14 < 30 && ind.bbPct < 0.1 && ind.volRatio > 1.2) {
    return {
      type:       'BUY',
      strategy:   'MEAN_REVERSION',
      entry:      +close.toFixed(2),
      stoploss:   +(close - 1.5 * atr).toFixed(2),
      target1:    +(close + 1.5 * atr).toFixed(2),
      target2:    +(ind.bbMiddle).toFixed(2),
      target3:    +(ind.bbUpper).toFixed(2),
      riskReward: 1.5,
      confirmations: ['RSI oversold (<30)', 'BB lower band', 'Volume spike', 'ADX ranging (<20)'],
    };
  }

  // Overbought → SELL
  if (ind.rsi14 > 70 && ind.bbPct > 0.9 && ind.volRatio > 1.2) {
    return {
      type:       'SELL',
      strategy:   'MEAN_REVERSION',
      entry:      +close.toFixed(2),
      stoploss:   +(close + 1.5 * atr).toFixed(2),
      target1:    +(close - 1.5 * atr).toFixed(2),
      target2:    +(ind.bbMiddle).toFixed(2),
      target3:    +(ind.bbLower).toFixed(2),
      riskReward: 1.5,
      confirmations: ['RSI overbought (>70)', 'BB upper band', 'Volume spike', 'ADX ranging (<20)'],
    };
  }

  return null;
}

module.exports = { evaluate };
