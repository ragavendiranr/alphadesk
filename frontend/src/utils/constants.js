// BACKEND_URL: always empty — Vercel proxy rewrites /api/* to Render backend
// Hardcoded to bypass any Vercel dashboard env var that may point to a stale URL
export const BACKEND_URL = "";
export const WS_URL      = "https://alphadesk-backend.onrender.com";

export const WATCHED_SYMBOLS = [
  'NIFTY 50', 'NIFTY BANK',
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'SBIN', 'BHARTIARTL', 'BAJFINANCE', 'ASIANPAINT',
  'ITC', 'KOTAKBANK', 'LT', 'AXISBANK', 'MARUTI',
  'SUNPHARMA', 'TITAN', 'ULTRACEMCO', 'WIPRO',
];

export const STRATEGIES = ['BREAKOUT', 'MEAN_REVERSION', 'MOMENTUM', 'VWAP_REVERSAL', 'ICT_SMC', 'OPTIONS_MOMENTUM'];
export const SIGNAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED'];
export const TRADE_STATUSES  = ['OPEN', 'CLOSED', 'SL_HIT', 'TARGET_HIT'];

export const REGIME_COLORS = {
  TRENDING_UP:   '#22c55e',
  TRENDING_DOWN: '#ef4444',
  RANGING:       '#f59e0b',
  VOLATILE:      '#a855f7',
  UNKNOWN:       '#6b7280',
};

export const SENTIMENT_COLORS = {
  BULLISH: '#22c55e',
  BEARISH: '#ef4444',
  NEUTRAL: '#f59e0b',
};
