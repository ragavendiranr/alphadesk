'use strict';
/**
 * ICT / Smart Money Concepts Strategy
 * Detects: Order Blocks, Fair Value Gaps, MSS, Liquidity Sweeps
 */
function detectLiquiditySweep(candles) {
  const n = candles.length;
  if (n < 3) return false;
  const prev = candles[n - 2];
  const curr = candles[n - 1];
  // Swept previous high then closed back below
  const sweptHigh = curr.high > prev.high && curr.close < prev.high;
  // Swept previous low then closed back above
  const sweptLow  = curr.low  < prev.low  && curr.close > prev.low;
  return sweptHigh || sweptLow;
}

function detectFVG(candles) {
  const n = candles.length;
  if (n < 3) return { found: false };
  const c0 = candles[n - 3];
  const c1 = candles[n - 2];
  const c2 = candles[n - 1];
  // Bullish FVG: gap between c0.high and c2.low
  if (c2.low > c0.high) return { found: true, type: 'BULLISH', level: (c0.high + c2.low) / 2 };
  // Bearish FVG
  if (c2.high < c0.low)  return { found: true, type: 'BEARISH', level: (c0.low + c2.high) / 2 };
  return { found: false };
}

function detectOrderBlock(candles) {
  const n = candles.length;
  if (n < 5) return { found: false };
  const recentBodies = candles.slice(-20).map(c => Math.abs(c.close - c.open));
  const avgBody = recentBodies.reduce((a, b) => a + b, 0) / recentBodies.length;
  const c = candles[n - 4];
  const body = Math.abs(c.close - c.open);
  if (body > avgBody * 1.5) {
    return { found: true, level: (c.open + c.close) / 2, type: c.close > c.open ? 'BULLISH' : 'BEARISH' };
  }
  return { found: false };
}

function detectMSS(candles) {
  const n = candles.length;
  if (n < 5) return null;
  const highs = candles.slice(-5).map(c => c.high);
  if (highs[4] > highs[3] && highs[3] < highs[2]) return 'BULLISH_MSS';
  if (highs[4] < highs[3] && highs[3] > highs[2]) return 'BEARISH_MSS';
  return null;
}

function evaluate(candles, indicators) {
  const n    = candles.length;
  if (n < 10) return null;
  const last = candles[n - 1];
  const close = last.close;
  const ind   = indicators;
  const atr   = ind.atr14;

  const liquidity = detectLiquiditySweep(candles);
  const fvg       = detectFVG(candles);
  const ob        = detectOrderBlock(candles);
  const mss       = detectMSS(candles);

  const smcScore = [liquidity, fvg.found, ob.found, !!mss].filter(Boolean).length;
  if (smcScore < 2) return null;

  // Determine direction
  let direction = close > ind.vwap ? 'BUY' : 'SELL';
  if (mss === 'BEARISH_MSS') direction = 'SELL';
  if (mss === 'BULLISH_MSS') direction = 'BUY';

  const confirmations = [];
  if (liquidity) confirmations.push('Liquidity sweep detected');
  if (fvg.found) confirmations.push(`FVG: ${fvg.type} at ${fvg.level?.toFixed(2)}`);
  if (ob.found)  confirmations.push(`Order Block: ${ob.type} at ${ob.level?.toFixed(2)}`);
  if (mss)       confirmations.push(`Market Structure Shift: ${mss}`);

  return {
    type:       direction,
    strategy:   'ICT_SMC',
    entry:      +close.toFixed(2),
    stoploss:   direction === 'BUY' ? +(close - 1.5 * atr).toFixed(2) : +(close + 1.5 * atr).toFixed(2),
    target1:    direction === 'BUY' ? +(close + 2.5 * atr).toFixed(2) : +(close - 2.5 * atr).toFixed(2),
    target2:    direction === 'BUY' ? +(close + 4.0 * atr).toFixed(2) : +(close - 4.0 * atr).toFixed(2),
    target3:    direction === 'BUY' ? +(close + 6.0 * atr).toFixed(2) : +(close - 6.0 * atr).toFixed(2),
    riskReward: 2.5,
    confirmations,
    smc: { liquidity, fvg, ob, mss },
  };
}

module.exports = { evaluate, detectLiquiditySweep, detectFVG, detectOrderBlock, detectMSS };
