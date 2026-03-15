'use strict';
/**
 * VWAP Reversal Strategy
 * Trigger: extreme VWAP deviation → revert to mean.
 */
function evaluate(candles, indicators) {
  const n    = candles.length;
  if (n < 20) return null;
  const last = candles[n - 1];
  const close = last.close;
  const ind   = indicators;

  const vwapDev = ((close - ind.vwap) / ind.vwap) * 100;
  if (Math.abs(vwapDev) < 0.5) return null;

  const atr = ind.atr14;

  // Below VWAP deviation → BUY (revert up)
  if (vwapDev < -0.5 && ind.rsi14 < 40 && ind.volRatio < 0.8) {
    return {
      type:       'BUY',
      strategy:   'VWAP_REVERSAL',
      entry:      +close.toFixed(2),
      stoploss:   +(close - 1.0 * atr).toFixed(2),
      target1:    +ind.vwap.toFixed(2),
      target2:    +(ind.vwap + atr).toFixed(2),
      target3:    +(ind.vwap + 2 * atr).toFixed(2),
      riskReward: 1.5,
      confirmations: [
        `VWAP deviation ${vwapDev.toFixed(2)}% (below VWAP)`,
        `RSI = ${ind.rsi14.toFixed(0)} oversold`,
        'Volume declining on deviation',
      ],
    };
  }

  // Above VWAP deviation → SELL (revert down)
  if (vwapDev > 0.5 && ind.rsi14 > 60 && ind.volRatio < 0.8) {
    return {
      type:       'SELL',
      strategy:   'VWAP_REVERSAL',
      entry:      +close.toFixed(2),
      stoploss:   +(close + 1.0 * atr).toFixed(2),
      target1:    +ind.vwap.toFixed(2),
      target2:    +(ind.vwap - atr).toFixed(2),
      target3:    +(ind.vwap - 2 * atr).toFixed(2),
      riskReward: 1.5,
      confirmations: [
        `VWAP deviation ${vwapDev.toFixed(2)}% (above VWAP)`,
        `RSI = ${ind.rsi14.toFixed(0)} overbought`,
        'Volume declining on deviation',
      ],
    };
  }

  return null;
}

module.exports = { evaluate };
