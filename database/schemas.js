'use strict';
const mongoose = require('mongoose');

// ── 1. OHLC ───────────────────────────────────────────────────────────────────
const ohlcSchema = new mongoose.Schema({
  symbol:    { type: String, required: true, index: true },
  exchange:  { type: String, default: 'NSE' },
  timeframe: { type: String, required: true, index: true }, // 1m,3m,5m,15m,30m,1h,1D
  timestamp: { type: Date,   required: true, index: true },
  open:  Number, high: Number, low: Number, close: Number, volume: Number, oi: Number,
  indicators: {
    rsi9: Number, rsi14: Number,
    macd: Number, macdSignal: Number, macdHist: Number,
    ema9: Number, ema20: Number, ema50: Number, ema200: Number,
    atr14: Number,
    bbUpper: Number, bbMiddle: Number, bbLower: Number, bbPct: Number,
    adx14: Number, plusDI: Number, minusDI: Number,
    stochK: Number, stochD: Number,
    obv: Number, vwap: Number, volumeMa20: Number,
    cci: Number, roc: Number, willR: Number,
  },
}, { timestamps: true });
ohlcSchema.index({ symbol: 1, timeframe: 1, timestamp: -1 }, { unique: true });

// ── 2. SIGNALS ────────────────────────────────────────────────────────────────
const signalSchema = new mongoose.Schema({
  symbol:    { type: String, required: true },
  exchange:  { type: String, default: 'NSE' },
  strategy:  { type: String, required: true },
  type:      { type: String, enum: ['BUY', 'SELL'], required: true },
  timeframe: String,
  entry:     Number,
  stoploss:  Number,
  target1:   Number,
  target2:   Number,
  target3:   Number,
  riskReward: Number,
  confidence: Number,            // ML confidence 0-100
  mlScore:    Number,
  rlAgree:    Boolean,
  regime:     String,
  sentimentScore: Number,
  confirmations: [String],
  reasons:    [String],
  features:   mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
  },
  approvedBy: String,
  approvedAt: Date,
  executedAt: Date,
  tradeId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },
  expiry:     Date,
}, { timestamps: true });

// ── 3. TRADES ─────────────────────────────────────────────────────────────────
const tradeSchema = new mongoose.Schema({
  signalId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Signal' },
  symbol:    { type: String, required: true },
  exchange:  String,
  strategy:  String,
  type:      { type: String, enum: ['BUY', 'SELL'] },
  product:   { type: String, enum: ['MIS', 'CNC', 'NRML'], default: 'MIS' },
  qty:       Number,
  entryPrice:  Number,
  exitPrice:   Number,
  stoploss:    Number,
  target:      Number,
  trailingSl:  Number,
  zerodhaOrderId: String,
  zerodhaSlOrderId: String,
  zerodhaTargetOrderId: String,
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED', 'SL_HIT', 'TARGET_HIT', 'PARTIAL', 'CANCELLED'],
    default: 'OPEN',
  },
  entryTime:   Date,
  exitTime:    Date,
  durationMin: Number,
  pnl:         Number,
  pnlPct:      Number,
  rMultiple:   Number,
  charges:     mongoose.Schema.Types.Mixed,
  netPnl:      Number,
  notes:       String,
  tags:        [String],
  capitalUsed: Number,
  riskAmount:  Number,
}, { timestamps: true });

// ── 4. DAILY SESSIONS ─────────────────────────────────────────────────────────
const dailySessionSchema = new mongoose.Schema({
  date:        { type: String, required: true, unique: true }, // YYYY-MM-DD
  capital:     Number,
  grossPnl:    Number,
  charges:     Number,
  netPnl:      Number,
  netPnlPct:   Number,
  tradesTotal: Number,
  tradesWon:   Number,
  tradesLost:  Number,
  winRate:     Number,
  bestTrade:   Number,
  worstTrade:  Number,
  circuitBreakerHit: Boolean,
  haltReason:  String,
  regimeAtOpen: String,
  sentimentAtOpen: Number,
  notes:       String,
}, { timestamps: true });

// ── 5. STRATEGY PERFORMANCE ───────────────────────────────────────────────────
const strategyPerfSchema = new mongoose.Schema({
  strategy:     { type: String, required: true, unique: true },
  enabled:      { type: Boolean, default: true },
  tradesTotal:  { type: Number, default: 0 },
  tradesWon:    { type: Number, default: 0 },
  tradesLost:   { type: Number, default: 0 },
  winRate:      Number,
  grossPnl:     { type: Number, default: 0 },
  profitFactor: Number,
  sharpeRatio:  Number,
  sortinoRatio: Number,
  maxDrawdown:  Number,
  expectancy:   Number,
  avgWin:       Number,
  avgLoss:      Number,
  bestTrade:    Number,
  worstTrade:   Number,
  lastUpdated:  Date,
  params:       mongoose.Schema.Types.Mixed,
}, { timestamps: true });

// ── 6. ML RECORDS ─────────────────────────────────────────────────────────────
const mlRecordSchema = new mongoose.Schema({
  symbol:    String,
  timeframe: String,
  timestamp: Date,
  features:  mongoose.Schema.Types.Mixed,
  label:     Number,   // 1=win, 0=loss
  tradeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Trade' },
  modelVersion: String,
}, { timestamps: true });

// ── 7. SYSTEM LOGS ────────────────────────────────────────────────────────────
const systemLogSchema = new mongoose.Schema({
  level:   { type: String, enum: ['info', 'warn', 'error', 'debug'], default: 'info' },
  module:  String,
  message: String,
  data:    mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now, index: true },
}, { timestamps: false });
systemLogSchema.index({ timestamp: -1 });

// ── 8. BUDGETS ────────────────────────────────────────────────────────────────
const budgetSchema = new mongoose.Schema({
  date:       { type: String, required: true, unique: true },
  capital:    { type: Number, required: true },
  used:       { type: Number, default: 0 },
  remaining:  Number,
  riskPct:    { type: Number, default: 0.01 },
  lossLimit:  { type: Number, default: 0.015 },
  halted:     { type: Boolean, default: false },
  haltReason: String,
  setBy:      String,
}, { timestamps: true });

// ── 9. MARKET REGIMES ─────────────────────────────────────────────────────────
const marketRegimeSchema = new mongoose.Schema({
  symbol:    { type: String, required: true },
  timeframe: { type: String, default: '15m' },
  timestamp: { type: Date, required: true },
  regime: {
    type: String,
    enum: ['TRENDING_UP', 'TRENDING_DOWN', 'RANGING', 'VOLATILE'],
  },
  confidence: Number,
  features:   mongoose.Schema.Types.Mixed,
}, { timestamps: true });
marketRegimeSchema.index({ symbol: 1, timestamp: -1 });

// ── 10. SENTIMENT SCORES ──────────────────────────────────────────────────────
const sentimentSchema = new mongoose.Schema({
  symbol:    String,
  date:      { type: String, required: true },
  score:     Number,     // 0-100
  label:     { type: String, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
  positiveCount: Number,
  negativeCount: Number,
  neutralCount:  Number,
  articlesAnalyzed: Number,
  headlines: [String],
  source:    String,
}, { timestamps: true });
sentimentSchema.index({ date: -1, symbol: 1 });

// ── 11. TRADE JOURNAL ─────────────────────────────────────────────────────────
const tradeJournalSchema = new mongoose.Schema({
  tradeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', required: true, unique: true },
  symbol:    String,
  strategy:  String,
  outcome:   { type: String, enum: ['WIN', 'LOSS', 'BREAKEVEN'] },
  pnl:       Number,
  entryReasons:  [String],
  exitReasons:   [String],
  marketConditions: mongoose.Schema.Types.Mixed,
  tradeManagement: mongoose.Schema.Types.Mixed,
  aiAnalysis:    String,
  mistakes:      [String],
  lessons:       [String],
  rating:        { type: Number, min: 1, max: 5 },
  tags:          [String],
  userNotes:     String,
  patterns:      [String],
}, { timestamps: true });

// ── 12. BACKTEST RESULTS ──────────────────────────────────────────────────────
const backtestSchema = new mongoose.Schema({
  name:       String,
  strategy:   String,
  symbol:     String,
  timeframe:  String,
  fromDate:   Date,
  toDate:     Date,
  params:     mongoose.Schema.Types.Mixed,
  initialCapital: Number,
  finalCapital:   Number,
  metrics: {
    totalTrades:  Number,
    winRate:      Number,
    profitFactor: Number,
    sharpeRatio:  Number,
    sortinoRatio: Number,
    maxDrawdown:  Number,
    calmarRatio:  Number,
    expectancy:   Number,
    cagr:         Number,
    recoveryFactor: Number,
    avgWin:       Number,
    avgLoss:      Number,
    bestTrade:    Number,
    worstTrade:   Number,
    netPnl:       Number,
  },
  equityCurve:  [{ date: Date, equity: Number }],
  trades:       [mongoose.Schema.Types.Mixed],
  monteCarlo:   mongoose.Schema.Types.Mixed,
  runBy:        String,
}, { timestamps: true });

// ── 13. FII/DII DATA ──────────────────────────────────────────────────────────
const fiiDiiSchema = new mongoose.Schema({
  date:          { type: String, required: true, unique: true }, // YYYY-MM-DD
  fii: {
    grossBuy:    Number,
    grossSell:   Number,
    net:         Number,
  },
  dii: {
    grossBuy:    Number,
    grossSell:   Number,
    net:         Number,
  },
  rawData:       mongoose.Schema.Types.Mixed,
}, { timestamps: true });
fiiDiiSchema.index({ date: -1 });

// ── 14. MARKET NEWS ───────────────────────────────────────────────────────────
const marketNewsSchema = new mongoose.Schema({
  source:        String,
  headline:      { type: String, required: true },
  url:           String,
  publishedAt:   Date,
  category:      { type: String, enum: ['INDIA', 'GLOBAL'], default: 'INDIA' },
  sentiment:     { type: String, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'], default: 'NEUTRAL' },
  sentimentNote: String,
  fetchedAt:     { type: Date, default: Date.now },
}, { timestamps: true });
marketNewsSchema.index({ publishedAt: -1, category: 1 });

// ── 15. INVESTMENT STOCK ──────────────────────────────────────────────────────
const investmentStockSchema = new mongoose.Schema({
  symbol:              { type: String, required: true, unique: true },
  name:                String,
  sector:              String,
  capCategory:         { type: String, enum: ['MICRO', 'SMALL', 'MID', 'LARGE'] },
  currentPrice:        Number,
  priceUpdatedAt:      Date,
  marketCapCrores:     Number,
  peRatio:             Number,
  pbRatio:             Number,
  dividendYieldPct:    Number,
  roePct:              Number,
  rocePct:             Number,
  debtToEquity:        Number,
  revenueGrowth3yr:    Number,
  profitGrowth3yr:     Number,
  promoterHoldingPct:  Number,
  fiiHoldingPct:       Number,
  diiHoldingPct:       Number,
  companyThesis:       String,
  futureGoals:         String,
  aiScore:             { type: Number, default: 0 },
  aiRating:            { type: String, enum: ['BUY', 'HOLD', 'WATCH'], default: 'HOLD' },
  lastUpdated:         { type: Date, default: Date.now },
}, { timestamps: true });

// ── 16. INVESTMENT PORTFOLIO ──────────────────────────────────────────────────
const investPortfolioSchema = new mongoose.Schema({
  symbol:      { type: String, required: true },
  name:        String,
  quantity:    { type: Number, required: true },
  buyPrice:    { type: Number, required: true },
  buyDate:     { type: Date, required: true },
  currentPrice: Number,
  priceUpdatedAt: Date,
}, { timestamps: true });

// ── 17. AI RECOMMENDATION CACHE ───────────────────────────────────────────────
const aiRecommendationSchema = new mongoose.Schema({
  cacheKey:      { type: String, required: true, unique: true },
  capFilter:     String,
  sectorFilter:  String,
  response:      mongoose.Schema.Types.Mixed,
  cachedAt:      { type: Date, default: Date.now },
  expiresAt:     Date,
}, { timestamps: true });

// ── 18. ACTIVITY LOG ─────────────────────────────────────────────────────────
const activityLogSchema = new mongoose.Schema({
  time:    { type: Date, default: Date.now, index: true },
  level:   { type: String, enum: ['INFO', 'SIGNAL', 'TRADE', 'WARN', 'ERROR'], default: 'INFO' },
  message: { type: String, required: true },
  module:  String,
  meta:    mongoose.Schema.Types.Mixed,
}, { timestamps: false });
activityLogSchema.index({ time: -1 });


// ── Export all models ─────────────────────────────────────────────────────────
module.exports = {
  OHLC:              mongoose.model('OHLC',             ohlcSchema),
  Signal:            mongoose.model('Signal',           signalSchema),
  Trade:             mongoose.model('Trade',            tradeSchema),
  DailySession:      mongoose.model('DailySession',     dailySessionSchema),
  StrategyPerf:      mongoose.model('StrategyPerf',     strategyPerfSchema),
  MLRecord:          mongoose.model('MLRecord',         mlRecordSchema),
  SystemLog:         mongoose.model('SystemLog',        systemLogSchema),
  Budget:            mongoose.model('Budget',           budgetSchema),
  MarketRegime:      mongoose.model('MarketRegime',     marketRegimeSchema),
  SentimentScore:    mongoose.model('SentimentScore',   sentimentSchema),
  TradeJournal:      mongoose.model('TradeJournal',     tradeJournalSchema),
  BacktestResult:    mongoose.model('BacktestResult',   backtestSchema),
  FiiDiiData:        mongoose.model('FiiDiiData',       fiiDiiSchema),
  MarketNews:        mongoose.model('MarketNews',       marketNewsSchema),
  InvestmentStock:   mongoose.model('InvestmentStock',  investmentStockSchema),
  InvestPortfolio:   mongoose.model('InvestPortfolio',  investPortfolioSchema),
  AiRecommendation:  mongoose.model('AiRecommendation', aiRecommendationSchema),
  ActivityLog:       mongoose.model('ActivityLog',       activityLogSchema),
};
