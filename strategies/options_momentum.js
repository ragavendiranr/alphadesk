'use strict';
/**
 * Options Momentum Strategy
 * For NIFTY / BANKNIFTY options based on spot momentum + OI analysis.
 */
function evaluate(candles, indicators, optionChain = null) {
  const n    = candles.length;
  if (n < 20) return null;
  const last = candles[n - 1];
  const close = last.close;
  const ind   = indicators;
  const atr   = ind.atr14;

  // Strong directional momentum required
  const bullishStack = ind.ema9 > ind.ema20 && ind.ema20 > ind.ema50;
  const bearishStack = ind.ema9 < ind.ema20 && ind.ema20 < ind.ema50;

  if (!bullishStack && !bearishStack) return null;
  if (ind.adx < 25) return null;     // need strong trend
  if (ind.volRatio < 1.5) return null;

  const direction = bullishStack ? 'BUY' : 'SELL';

  // Detect unusual OI activity from option chain if available
  let oiSignal = '';
  if (optionChain) {
    const calls = optionChain.calls || [];
    const puts  = optionChain.puts  || [];
    const bigCallOI = calls.find(c => c.oiChange > 500000);
    const bigPutOI  = puts.find(p => p.oiChange > 500000);
    if (bigCallOI) oiSignal = `Large CALL OI build-up at ${bigCallOI.strike}`;
    if (bigPutOI)  oiSignal = `Large PUT OI build-up at ${bigPutOI.strike}`;
  }

  const confirmations = [
    direction === 'BUY' ? 'Bullish EMA alignment (9>20>50)' : 'Bearish EMA alignment (9<20<50)',
    `ADX = ${ind.adx?.toFixed(0)} — strong trend`,
    `Volume ${ind.volRatio?.toFixed(1)}× above average`,
  ];
  if (oiSignal) confirmations.push(`OI signal: ${oiSignal}`);

  // Suggest ATM or OTM strike (simplified: 1 ATR OTM)
  const strikeInterval = close > 20000 ? 50 : 100;
  const atmStrike = Math.round(close / strikeInterval) * strikeInterval;

  return {
    type:       direction,
    strategy:   'OPTIONS_MOMENTUM',
    entry:      +close.toFixed(2),
    stoploss:   direction === 'BUY' ? +(close - 1.0 * atr).toFixed(2) : +(close + 1.0 * atr).toFixed(2),
    target1:    direction === 'BUY' ? +(close + 2.0 * atr).toFixed(2) : +(close - 2.0 * atr).toFixed(2),
    target2:    direction === 'BUY' ? +(close + 3.5 * atr).toFixed(2) : +(close - 3.5 * atr).toFixed(2),
    target3:    direction === 'BUY' ? +(close + 5.0 * atr).toFixed(2) : +(close - 5.0 * atr).toFixed(2),
    riskReward: 2.5,
    confirmations,
    optionsSuggestion: {
      strike:    atmStrike,
      type:      direction === 'BUY' ? 'CE' : 'PE',
      expiry:    'NEAR_WEEK',
    },
  };
}

module.exports = { evaluate };
