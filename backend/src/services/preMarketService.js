'use strict';
const axios  = require('axios');
const logger = require('../config/logger');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Fetch pre-market movers from Yahoo Finance ────────────────────────────────
async function fetchPreMarketMovers() {
  try {
    // NSE large + mid cap universe
    const candidates = [
      'RELIANCE.NS','TCS.NS','HDFCBANK.NS','INFY.NS','ICICIBANK.NS','SBIN.NS','BHARTIARTL.NS',
      'BAJFINANCE.NS','ASIANPAINT.NS','ITC.NS','LT.NS','MARUTI.NS','SUNPHARMA.NS','TITAN.NS',
      'KOTAKBANK.NS','AXISBANK.NS','WIPRO.NS','ULTRACEMCO.NS','TECHM.NS','HCLTECH.NS',
      'POWERGRID.NS','ONGC.NS','NTPC.NS','COALINDIA.NS','TATAMOTORS.NS','TATASTEEL.NS',
      'JSWSTEEL.NS','ADANIENT.NS','ADANIPORTS.NS','BAJAJFINSV.NS','DMART.NS','PIDILITIND.NS',
      'DIVISLAB.NS','DRREDDY.NS','CIPLA.NS','APOLLOHOSP.NS','INDUSINDBK.NS','GRASIM.NS',
      'SBILIFE.NS','HDFCLIFE.NS','PERSISTENT.NS','DIXON.NS','TRENT.NS','ZOMATO.NS',
    ];
    const symbolStr = candidates.join(',');
    const { data } = await axios.get('https://query1.finance.yahoo.com/v7/finance/quote', {
      params: { symbols: symbolStr },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000,
    });
    const quotes = (data?.quoteResponse?.result || [])
      .filter(q => q.regularMarketPrice && q.regularMarketChangePercent != null)
      .map(q => ({
        symbol:       q.symbol.replace('.NS', ''),
        name:         q.shortName || q.longName || q.symbol,
        price:        q.regularMarketPrice,
        changePercent: parseFloat(q.regularMarketChangePercent?.toFixed(2)),
        volume:       q.regularMarketVolume,
        avgVolume:    q.averageDailyVolume3Month,
        marketCap:    q.marketCap,
        sector:       q.sector || '',
      }))
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    return quotes;
  } catch (err) {
    logger.error(`Pre-market movers fetch failed: ${err.message}`, { module: 'preMarket' });
    return [];
  }
}

// ── Fetch today's market news keywords for news-driven stocks ─────────────────
async function getTodayNewsSymbols() {
  try {
    const { MarketNews } = require('../../../database/schemas');
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const news = await MarketNews.find({ publishedAt: { $gte: since } }).lean();
    // Extract stock symbols mentioned in headlines
    const knownSymbols = ['RELIANCE','TCS','HDFC','INFY','ICICI','SBI','BHARTI','BAJAJ','ITC',
      'LT','MARUTI','SUNPHARMA','TITAN','KOTAK','AXIS','WIPRO','TATAMOTORS','ADANI','ZOMATO','DMART'];
    const mentioned = new Set();
    for (const article of news) {
      const hl = (article.headline || '').toUpperCase();
      for (const sym of knownSymbols) {
        if (hl.includes(sym)) mentioned.add(sym);
      }
    }
    return [...mentioned];
  } catch { return []; }
}

// ── Claude picks top 5 watchlist stocks ──────────────────────────────────────
async function pickWatchlistWithClaude(movers, newsSymbols) {
  if (!ANTHROPIC_API_KEY || !movers.length) {
    // Fallback: top 5 by absolute change
    return movers.slice(0, 5).map(m => ({
      symbol:  m.symbol,
      name:    m.name,
      price:   m.price,
      change:  m.changePercent,
      reason:  `${m.changePercent >= 0 ? 'Gap Up' : 'Gap Down'} ${Math.abs(m.changePercent)}% — high momentum play`,
      setup:   m.changePercent >= 0 ? 'Breakout long opportunity' : 'Short or bounce play',
    }));
  }

  try {
    const top20 = movers.slice(0, 20);
    const stockList = top20.map((m, i) =>
      `${i + 1}. ${m.symbol} | Change: ${m.changePercent >= 0 ? '+' : ''}${m.changePercent}% | Price: ₹${m.price} | Volume: ${m.volume?.toLocaleString() || 'N/A'}`
    ).join('\n');

    const newsContext = newsSymbols.length
      ? `Stocks with today's news mentions: ${newsSymbols.join(', ')}.`
      : '';

    const prompt = `You are an expert Indian stock market trader specializing in intraday and swing trades on NSE.

Today's pre-market movers (sorted by % change):
${stockList}

${newsContext}

Selection criteria:
1. High pre-market volume relative to average
2. News-driven momentum (if applicable)
3. Gap up/gap down setups with follow-through potential
4. Sector momentum and relative strength vs NIFTY
5. Clean technical setup likely

Pick the BEST 5 stocks for today's watchlist. Be decisive and specific.

Respond ONLY as JSON array:
[
  {
    "symbol": "RELIANCE",
    "name": "Reliance Industries",
    "price": 1234.50,
    "change": 2.3,
    "reason": "Gap up on strong Q3 results, Jio subscriber additions beat estimates",
    "setup": "Buy breakout above 1240, SL 1220, target 1270"
  }
]`;

    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
      { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 40000 }
    );

    const raw = data?.content?.[0]?.text || '[]';
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : movers.slice(0, 5).map(m => ({ ...m, reason: 'High momentum', setup: 'Monitor for entry' }));
  } catch (err) {
    logger.error(`Claude watchlist failed: ${err.message}`, { module: 'preMarket' });
    return movers.slice(0, 5).map(m => ({
      symbol: m.symbol, name: m.name, price: m.price, change: m.changePercent,
      reason: `${Math.abs(m.changePercent)}% mover`, setup: 'Monitor for entry',
    }));
  }
}

// ── Format watchlist message ──────────────────────────────────────────────────
function formatWatchlistMessage(watchlist) {
  const lines = [];
  lines.push(`📋 Today's Watchlist`);
  lines.push(`⏰ Pre-Market Scan — ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST`);
  lines.push('');

  for (let i = 0; i < watchlist.length; i++) {
    const s = watchlist[i];
    const dir = s.change >= 0 ? '▲' : '▼';
    const sign = s.change >= 0 ? '+' : '';
    lines.push(`${i + 1}. ${s.symbol} — ₹${s.price?.toFixed(2)} (${dir}${sign}${s.change}%)`);
    lines.push(`   📌 ${s.reason}`);
    lines.push(`   🎯 ${s.setup}`);
    lines.push('');
  }

  lines.push('─────────────────────────');
  lines.push('Market opens 9:15 AM IST. Monitor these stocks closely.');
  return lines.join('\n');
}

// ── Zerodha margin check ──────────────────────────────────────────────────────
async function getZerodhaStatus() {
  try {
    const zerodha = require('../../../execution/zerodha');
    const profile = await zerodha.getProfile();
    let marginText = '';
    try {
      const margins = await zerodha.getMargins();
      const equity  = margins?.equity || margins;
      const avail   = equity?.available?.live_balance || equity?.net || 0;
      marginText = `₹${parseFloat(avail).toLocaleString('en-IN')}`;
    } catch { marginText = 'N/A'; }

    return {
      connected: true,
      userId: profile?.user_id || 'DWU300',
      userName: profile?.user_name || 'Unknown',
      margin: marginText,
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

// ── Long-term scanner using InvestmentStock + Claude ─────────────────────────
async function generateLongTermScan() {
  try {
    const { InvestmentStock } = require('../../../database/schemas');
    // Best rated stocks by ROE, growth, debt, AI score
    const stocks = await InvestmentStock.find({ aiRating: { $in: ['BUY', 'HOLD'] } })
      .sort({ roePct: -1 }).limit(30).lean();

    if (!stocks.length || !ANTHROPIC_API_KEY) {
      return 'Long-term scan: No data available. Run /invest seed first.';
    }

    const stockList = stocks.slice(0, 15).map(s =>
      `${s.symbol} (${s.capCategory}/${s.sector}): PE=${s.peRatio}, ROE=${s.roePct}%, D/E=${s.debtToEquity}, Growth=${s.profitGrowth3yr}%pa, Thesis: ${s.companyThesis?.substring(0, 60)}`
    ).join('\n');

    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6', max_tokens: 1500,
        messages: [{ role: 'user', content: `You are a senior equity analyst. Based on 7-day market analysis and these fundamentals, recommend 3-5 stocks for long-term investment (12-24 month horizon):

${stockList}

Current market context: Indian markets March 2026, mixed FII activity, domestic flows positive, IT and banking sectors showing resilience.

For each stock provide:
1. Symbol & name
2. Why NOW is a good entry point
3. Ideal buy zone (price range to accumulate)
4. 12-month target
5. Key risk

Format as clean text for Telegram, starting with:
"📈 Long-Term Watchlist — [Date]"` }],
      },
      { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 60000 }
    );

    return data?.content?.[0]?.text || 'Long-term scan analysis unavailable.';
  } catch (err) {
    logger.error(`Long-term scan failed: ${err.message}`, { module: 'preMarket' });
    return `Long-term scan error: ${err.message}`;
  }
}

// ── Main: generate full watchlist ─────────────────────────────────────────────
async function generatePreMarketWatchlist() {
  const [movers, newsSymbols] = await Promise.all([
    fetchPreMarketMovers(),
    getTodayNewsSymbols(),
  ]);
  const watchlist = await pickWatchlistWithClaude(movers, newsSymbols);
  return { watchlist, message: formatWatchlistMessage(watchlist) };
}

module.exports = {
  generatePreMarketWatchlist,
  getZerodhaStatus,
  generateLongTermScan,
  fetchPreMarketMovers,
};
