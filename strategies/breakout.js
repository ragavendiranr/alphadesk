'use strict';
/**
 * Breakout Strategy
 * Trigger: price breaks above previous session/day high with volume + trend.
 */
function evaluate(candles, indicators) {
  const n     = candles.length;
  if (n < 20) return null;
  const last  = candles[n - 1];
  const close = last.close;
  const ind   = indicators;

  const prevHigh = Math.max(...candles.slice(-20, -1).map(c => c.high));

  const checks = {
    priceBreakout:    close > prevHigh,
    volumeStrong:     ind.volRatio >= 1.5,
    aboveVWAP:        close > ind.vwap,
    trendStrong:      ind.adx >= 25,
    rsiInRange:       ind.rsi14 >= 50 && ind.rsi14 <= 70,
    candleBodyStrong: ind.bodyRatio >= 0.6,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  if (passed < 5) return null;

  const atr = ind.atr14;
  return {
    type:       'BUY',
    strategy:   'BREAKOUT',
    entry:      +close.toFixed(2),
    stoploss:   +(close - 1.5 * atr).toFixed(2),
    target1:    +(close + 2.0 * atr).toFixed(2),
    target2:    +(close + 3.0 * atr).toFixed(2),
    target3:    +(close + 4.5 * atr).toFixed(2),
    riskReward: 2.0,
    confirmations: Object.entries(checks).filter(([, v]) => v).map(([k]) => k),
  };
}

module.exports = { evaluate };
