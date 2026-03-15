'use strict';
/**
 * Momentum Strategy
 * Trigger: EMA stack + MACD expansion + above VWAP.
 */
function evaluate(candles, indicators) {
  const n    = candles.length;
  if (n < 3) return null;
  const last = candles[n - 1];
  const close = last.close;
  const ind   = indicators;

  const bullishStack = ind.ema9 > ind.ema20 && ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200;
  const macdRising   = ind.macdHist > 0 && ind.macdHist > (indicators.prevMacdHist || 0);
  const vwapDev      = ((close - ind.vwap) / ind.vwap) * 100;

  if (!bullishStack) return null;
  if (!macdRising)   return null;
  if (ind.volRatio < 1.3) return null;
  if (vwapDev < 0.2 || vwapDev > 0.5) return null;

  const atr = ind.atr14;
  return {
    type:       'BUY',
    strategy:   'MOMENTUM',
    entry:      +close.toFixed(2),
    stoploss:   +(close - 1.0 * atr).toFixed(2),
    target1:    +(close + 2.0 * atr).toFixed(2),
    target2:    +(close + 3.5 * atr).toFixed(2),
    target3:    +(close + 5.0 * atr).toFixed(2),
    riskReward: 2.5,
    confirmations: [
      'EMA 9>20>50>200 bullish stack',
      'MACD histogram rising',
      `Volume ${ind.volRatio.toFixed(1)}× above average`,
      `VWAP deviation ${vwapDev.toFixed(2)}% (optimal range)`,
    ],
  };
}

module.exports = { evaluate };
