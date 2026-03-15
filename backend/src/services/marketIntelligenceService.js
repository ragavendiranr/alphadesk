'use strict';
const axios  = require('axios');
const logger = require('../config/logger');
const { FiiDiiData, MarketNews } = require('../../../database/schemas');

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── FII/DII ────────────────────────────────────────────────────────────────────
async function fetchFiiDii() {
  try {
    const { data } = await axios.get('https://www.nseindia.com/api/fiidiiTradeReact', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nseindia.com',
      },
      timeout: 15000,
    });

    const rows = Array.isArray(data) ? data : (data?.data || []);
    const results = [];

    for (const row of rows.slice(0, 5)) { // last 5 trading days
      const date = row.Date || row.date;
      if (!date) continue;

      // NSE format: date like "15-Mar-2026"
      const dateObj = new Date(date);
      const dateStr = dateObj.toISOString().slice(0, 10);

      const fiiNet  = parseFloat(row['FII/FPI Net'] || row.FII_NET || row.fiiNet || 0);
      const fiiBuy  = parseFloat(row['FII/FPI Buy'] || row.FII_BUY || row.fiiBuy || 0);
      const fiiSell = parseFloat(row['FII/FPI Sell'] || row.FII_SELL || row.fiiSell || 0);
      const diiNet  = parseFloat(row['DII Net'] || row.DII_NET || row.diiNet || 0);
      const diiBuy  = parseFloat(row['DII Buy'] || row.DII_BUY || row.diiBuy || 0);
      const diiSell = parseFloat(row['DII Sell'] || row.DII_SELL || row.diiSell || 0);

      const saved = await FiiDiiData.findOneAndUpdate(
        { date: dateStr },
        {
          fii: { grossBuy: fiiBuy, grossSell: fiiSell, net: fiiNet },
          dii: { grossBuy: diiBuy, grossSell: diiSell, net: diiNet },
          rawData: row,
        },
        { upsert: true, new: true }
      );
      results.push(saved);
    }

    logger.info(`FII/DII data stored: ${results.length} days`, { module: 'marketIntel' });
    return results;
  } catch (err) {
    logger.error(`FII/DII fetch failed: ${err.message}`, { module: 'marketIntel' });
    throw err;
  }
}

// ── Global Markets (Yahoo Finance free API) ────────────────────────────────────
const GLOBAL_SYMBOLS = {
  'S&P 500':    '^GSPC',
  'NASDAQ':     '^IXIC',
  'FTSE 100':   '^FTSE',
  'Nikkei 225': '^N225',
  'Shanghai':   '000001.SS',
  'Brent Oil':  'BZ=F',
  'USD/INR':    'USDINR=X',
  'Gold':       'GC=F',
};

async function fetchGlobalMarkets() {
  try {
    const symbols = Object.values(GLOBAL_SYMBOLS).join(',');
    const { data } = await axios.get('https://query1.finance.yahoo.com/v7/finance/quote', {
      params: { symbols, fields: 'regularMarketPrice,regularMarketChangePercent,regularMarketPreviousClose' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });

    const quotes = data?.quoteResponse?.result || [];
    const nameMap = Object.fromEntries(Object.entries(GLOBAL_SYMBOLS).map(([k, v]) => [v, k]));

    return quotes.map(q => ({
      name:    nameMap[q.symbol] || q.shortName || q.symbol,
      symbol:  q.symbol,
      price:   q.regularMarketPrice,
      change:  q.regularMarketChangePercent?.toFixed(2),
      prevClose: q.regularMarketPreviousClose,
    }));
  } catch (err) {
    logger.error(`Global markets fetch failed: ${err.message}`, { module: 'marketIntel' });
    return [];
  }
}

// ── India Market Summary (NIFTY, BANKNIFTY, SENSEX, VIX) ─────────────────────
async function fetchIndiaMarketSummary() {
  try {
    const indiaSymbols = ['^NSEI', '^NSEBANK', '^BSESN', '^NIFVIX'];
    const { data } = await axios.get('https://query1.finance.yahoo.com/v7/finance/quote', {
      params: { symbols: indiaSymbols.join(',') },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });

    const quotes = data?.quoteResponse?.result || [];
    const nameMap = {
      '^NSEI':    'NIFTY 50',
      '^NSEBANK': 'BANK NIFTY',
      '^BSESN':   'SENSEX',
      '^NIFVIX':  'India VIX',
    };

    return quotes.map(q => ({
      name:    nameMap[q.symbol] || q.symbol,
      price:   q.regularMarketPrice,
      change:  q.regularMarketChangePercent?.toFixed(2),
      prevClose: q.regularMarketPreviousClose,
    }));
  } catch (err) {
    logger.error(`India market summary failed: ${err.message}`, { module: 'marketIntel' });
    return [];
  }
}

// ── Claude Sentiment Tagging ───────────────────────────────────────────────────
async function tagSentimentClaude(headlines) {
  if (!ANTHROPIC_API_KEY || headlines.length === 0) return [];
  try {
    const batches = [];
    for (let i = 0; i < headlines.length; i += 10) {
      batches.push(headlines.slice(i, i + 10));
    }

    const results = [];
    for (const batch of batches) {
      const prompt = `You are a financial news sentiment analyzer. For each headline below, respond with a JSON array where each element has:
- "sentiment": "BULLISH", "BEARISH", or "NEUTRAL"
- "note": brief 1-line reason (max 10 words)

Headlines:
${batch.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Respond ONLY with valid JSON array, no other text.`;

      const { data } = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const raw = data?.content?.[0]?.text || '[]';
      const parsed = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]');
      results.push(...parsed);
      await new Promise(r => setTimeout(r, 500)); // rate limit
    }
    return results;
  } catch (err) {
    logger.error(`Claude sentiment tagging failed: ${err.message}`, { module: 'marketIntel' });
    return headlines.map(() => ({ sentiment: 'NEUTRAL', note: '' }));
  }
}

// ── Fetch News ─────────────────────────────────────────────────────────────────
async function fetchNews(query, category) {
  if (!NEWS_API_KEY) { logger.warn('NEWS_API_KEY not set', { module: 'marketIntel' }); return []; }
  try {
    const { data } = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 20,
        apiKey: NEWS_API_KEY,
      },
      timeout: 15000,
    });

    const articles = (data?.articles || []).filter(a => a.title && a.title !== '[Removed]');
    const headlines = articles.map(a => a.title);

    // Tag sentiment with Claude
    const tags = await tagSentimentClaude(headlines);

    const docs = articles.map((a, i) => ({
      source:      a.source?.name,
      headline:    a.title,
      url:         a.url,
      publishedAt: new Date(a.publishedAt),
      category,
      sentiment:   (tags[i]?.sentiment || 'NEUTRAL'),
      sentimentNote: (tags[i]?.note || ''),
    }));

    // Upsert by headline
    for (const doc of docs) {
      await MarketNews.findOneAndUpdate(
        { headline: doc.headline },
        doc,
        { upsert: true }
      );
    }

    logger.info(`${category} news stored: ${docs.length} articles`, { module: 'marketIntel' });
    return docs;
  } catch (err) {
    logger.error(`News fetch (${category}) failed: ${err.message}`, { module: 'marketIntel' });
    return [];
  }
}

async function fetchIndiaNews() {
  return fetchNews('NSE stock market India Moneycontrol Sensex NIFTY', 'INDIA');
}

async function fetchGlobalNews() {
  return fetchNews('Federal Reserve India stocks FII dollar rupee oil', 'GLOBAL');
}

// ── Full market intelligence snapshot ─────────────────────────────────────────
async function getMarketIntelligence() {
  const [india, global, fiiDii] = await Promise.allSettled([
    fetchIndiaMarketSummary(),
    fetchGlobalMarkets(),
    FiiDiiData.find().sort({ date: -1 }).limit(5).lean(),
  ]);

  const [indiaNews, globalNews] = await Promise.allSettled([
    MarketNews.find({ category: 'INDIA' }).sort({ publishedAt: -1 }).limit(15).lean(),
    MarketNews.find({ category: 'GLOBAL' }).sort({ publishedAt: -1 }).limit(15).lean(),
  ]);

  return {
    indiaMarket:  india.value   || [],
    globalMarkets: global.value || [],
    fiiDii:       fiiDii.value  || [],
    indiaNews:    indiaNews.value  || [],
    globalNews:   globalNews.value || [],
    fetchedAt:    new Date(),
  };
}

module.exports = {
  fetchFiiDii,
  fetchGlobalMarkets,
  fetchIndiaMarketSummary,
  fetchIndiaNews,
  fetchGlobalNews,
  getMarketIntelligence,
};
