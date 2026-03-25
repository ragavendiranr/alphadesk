'use strict';
const axios  = require('axios');
const logger = require('../config/logger');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NEWS_API_KEY      = process.env.NEWS_API_KEY;

// ── RSS fetch helper ──────────────────────────────────────────────────────────
async function fetchRSS(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, text/xml, application/xml' },
      timeout: 12000,
    });
    // Parse titles from RSS XML
    const items = [];
    const regex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>|<item>[\s\S]*?<title>(.*?)<\/title>/g;
    const linkRx = /<link>(.*?)<\/link>|<link\s+href="(.*?)"/g;
    let m;
    const titles = [];
    const links  = [];
    const re1 = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/g;
    while ((m = re1.exec(data)) && titles.length < 15) {
      const t = (m[1] || m[2] || '').trim();
      if (t && t.length > 20) titles.push(t);
    }
    return titles.slice(0, 12);
  } catch {
    return [];
  }
}

// ── NewsAPI fetch for India markets ──────────────────────────────────────────
async function fetchNewsAPIHeadlines() {
  if (!NEWS_API_KEY) return [];
  try {
    const { data } = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: 'Nifty BSE Sensex NSE stock market India Moneycontrol shares rupee',
        language: 'en', sortBy: 'publishedAt', pageSize: 25, apiKey: NEWS_API_KEY,
      },
      timeout: 12000,
    });
    return (data.articles || [])
      .filter(a => a.title && a.title !== '[Removed]' && a.title.length > 30)
      .slice(0, 20)
      .map(a => ({ title: a.title, source: a.source?.name || '', url: a.url }));
  } catch { return []; }
}

// ── Global markets from Yahoo Finance ────────────────────────────────────────
async function fetchGlobalSnapshot() {
  try {
    const symbols = ['^GSPC', '^IXIC', '^DJI', '^FTSE', '^N225', '000001.SS', 'BZ=F', 'GC=F', 'USDINR=X', '^NSEI', '^NSEBANK', '^BSESN', '^NIFVIX', 'NIFTYSGX=FX'];
    const { data } = await axios.get('https://query1.finance.yahoo.com/v7/finance/quote', {
      params: { symbols: symbols.join(',') },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });
    const quotes = data?.quoteResponse?.result || [];
    const map = {
      '^GSPC': 'S&P 500', '^IXIC': 'NASDAQ', '^DJI': 'Dow Jones', '^FTSE': 'FTSE 100',
      '^N225': 'Nikkei 225', '000001.SS': 'Shanghai', 'BZ=F': 'Brent Oil',
      'GC=F': 'Gold', 'USDINR=X': 'USD/INR', '^NSEI': 'NIFTY 50',
      '^NSEBANK': 'BANK NIFTY', '^BSESN': 'SENSEX', '^NIFVIX': 'India VIX',
      'NIFTYSGX=FX': 'SGX NIFTY',
    };
    return quotes.map(q => ({
      name: map[q.symbol] || q.symbol,
      symbol: q.symbol,
      price: q.regularMarketPrice,
      change: q.regularMarketChangePercent?.toFixed(2),
      prevClose: q.regularMarketPreviousClose,
    }));
  } catch { return []; }
}

// ── Claude: classify + summarize news ────────────────────────────────────────
async function classifyNewsWithClaude(articles) {
  if (!ANTHROPIC_API_KEY || !articles.length) {
    return { important: [], medium: [], other: [] };
  }
  try {
    const numbered = articles.map((a, i) => `${i + 1}. [${a.source || 'News'}] ${a.title}`).join('\n');
    const prompt = `You are a senior financial news editor specializing in Indian stock markets.

Classify these ${articles.length} news headlines into exactly 3 categories for Indian retail traders/investors:

IMPORTANT: Market-moving news (rate decisions, big earnings, FII data, major policy, circuit breakers, major fraud/scandal, index changes)
MEDIUM: Sector news, company updates, moderate macro news
OTHER: General business news, international news with limited India impact

For IMPORTANT and MEDIUM items, provide a 1-sentence insight (max 15 words).

Headlines:
${numbered}

Respond as valid JSON only:
{
  "important": [{"index": 1, "title": "...", "insight": "..."}],
  "medium": [{"index": 2, "title": "...", "insight": "..."}],
  "other": [1, 3, 5]
}`;

    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] },
      { headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, timeout: 45000 }
    );
    const raw = data?.content?.[0]?.text || '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { important: [], medium: [], other: [] };
    const parsed = JSON.parse(match[0]);
    // Map indices back to articles
    const articlesArr = articles;
    return {
      important: (parsed.important || []).map(item => ({
        title:   item.title || articlesArr[item.index - 1]?.title || '',
        insight: item.insight || '',
        source:  articlesArr[item.index - 1]?.source || '',
        url:     articlesArr[item.index - 1]?.url || '',
      })),
      medium: (parsed.medium || []).map(item => ({
        title:   item.title || articlesArr[item.index - 1]?.title || '',
        insight: item.insight || '',
        source:  articlesArr[item.index - 1]?.source || '',
        url:     articlesArr[item.index - 1]?.url || '',
      })),
      other: (Array.isArray(parsed.other) ? parsed.other : []).map(idx =>
        articlesArr[idx - 1]?.title || ''
      ).filter(Boolean),
    };
  } catch (err) {
    logger.error(`Claude news classification failed: ${err.message}`, { module: 'morningBrief' });
    return { important: [], medium: [], other: articles.slice(0, 5).map(a => a.title) };
  }
}

// ── Format the Telegram morning brief message ─────────────────────────────────
function formatMorningBrief(classified, markets, fiiDii) {
  const now   = new Date();
  const date  = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lines = [];

  lines.push(`🌅 Morning Market Brief`);
  lines.push(`📅 ${date}`);
  lines.push('');

  // ── Global Markets ──
  const glMap = {};
  for (const q of markets) glMap[q.name] = q;

  const arrow = (ch) => (parseFloat(ch) >= 0 ? '▲' : '▼');
  const fmt   = (q) => q ? `${q.price?.toFixed(2)} ${arrow(q.change)}${Math.abs(q.change)}%` : 'N/A';

  lines.push('🌍 Global Markets');
  for (const name of ['S&P 500', 'NASDAQ', 'Dow Jones', 'FTSE 100', 'Nikkei 225', 'Shanghai']) {
    const q = glMap[name];
    if (q) lines.push(`  ${name}: ${fmt(q)}`);
  }

  lines.push('');
  lines.push('🇮🇳 India Pre-Market');
  for (const name of ['SGX NIFTY', 'NIFTY 50', 'BANK NIFTY', 'SENSEX', 'India VIX']) {
    const q = glMap[name];
    if (q) lines.push(`  ${name}: ${fmt(q)}`);
  }

  lines.push('');
  lines.push('💱 Commodities & Forex');
  for (const name of ['Brent Oil', 'Gold', 'USD/INR']) {
    const q = glMap[name];
    if (q) lines.push(`  ${name}: ${fmt(q)}`);
  }

  // ── FII/DII ──
  if (fiiDii?.length) {
    const latest = fiiDii[0];
    lines.push('');
    lines.push('🏦 FII/DII Latest Activity');
    if (latest.fii?.net != null) {
      const fiiSign = latest.fii.net >= 0 ? '+' : '';
      lines.push(`  FII Net: ${fiiSign}₹${latest.fii.net?.toFixed(0)} Cr`);
    }
    if (latest.dii?.net != null) {
      const diiSign = latest.dii.net >= 0 ? '+' : '';
      lines.push(`  DII Net: ${diiSign}₹${latest.dii.net?.toFixed(0)} Cr`);
    }
    lines.push(`  Date: ${latest.date}`);
  }

  lines.push('');
  lines.push('─────────────────────────');

  // ── News ──
  lines.push('');
  lines.push('🔥 IMPORTANT NEWS');
  if (classified.important?.length) {
    for (const item of classified.important.slice(0, 5)) {
      lines.push(`• ${item.title}`);
      if (item.insight) lines.push(`  → ${item.insight}`);
    }
  } else {
    lines.push('• No major market-moving news');
  }

  lines.push('');
  lines.push('📌 MEDIUM IMPORTANCE');
  if (classified.medium?.length) {
    for (const item of classified.medium.slice(0, 5)) {
      lines.push(`• ${item.title}`);
      if (item.insight) lines.push(`  → ${item.insight}`);
    }
  } else {
    lines.push('• No medium news');
  }

  lines.push('');
  lines.push('📰 OTHER NEWS');
  for (const t of (classified.other || []).slice(0, 6)) {
    lines.push(`• ${t}`);
  }

  lines.push('');
  lines.push('─────────────────────────');
  lines.push(`⏰ Market opens at 9:15 AM IST`);
  lines.push(`🤖 AlphaDesk AI — Good trading!`);

  return lines.join('\n');
}

// ── RSS fallback: MoneyControl + Economic Times ───────────────────────────────
async function fetchRSSNews() {
  const MC_RSS = 'https://www.moneycontrol.com/rss/MCtopnews.xml';
  const ET_RSS = 'https://economictimes.indiatimes.com/markets/rss.cms';
  const [mcTitles, etTitles] = await Promise.all([fetchRSS(MC_RSS), fetchRSS(ET_RSS)]);
  const combined = [
    ...mcTitles.map(t => ({ title: t, source: 'Moneycontrol', url: '' })),
    ...etTitles.map(t => ({ title: t, source: 'Economic Times', url: '' })),
  ];
  logger.info(`RSS news fetched: ${combined.length} headlines (MC:${mcTitles.length} ET:${etTitles.length})`, { module: 'morningBrief' });
  return combined;
}

// ── Main: generate morning brief ──────────────────────────────────────────────
async function generateMorningBrief() {
  logger.info('Generating morning brief...', { module: 'morningBrief' });

  // Fetch in parallel — NewsAPI + RSS feeds + market data
  const [newsResult, rssResult, marketsResult, fiiResult] = await Promise.allSettled([
    fetchNewsAPIHeadlines(),
    fetchRSSNews(),
    fetchGlobalSnapshot(),
    (async () => {
      const { FiiDiiData } = require('../../../database/schemas');
      return FiiDiiData.find().sort({ date: -1 }).limit(1).lean();
    })(),
  ]);

  // Merge NewsAPI + RSS, deduplicate by title prefix
  const newsAPIArticles = newsResult.value || [];
  const rssArticles     = rssResult.value  || [];
  const seen = new Set(newsAPIArticles.map(a => a.title.slice(0, 40).toLowerCase()));
  const merged = [...newsAPIArticles];
  for (const r of rssArticles) {
    const key = r.title.slice(0, 40).toLowerCase();
    if (!seen.has(key)) { merged.push(r); seen.add(key); }
  }
  const articles = merged.slice(0, 25);
  logger.info(`News articles for brief: ${articles.length} (API:${newsAPIArticles.length} RSS:${rssArticles.length})`, { module: 'morningBrief' });

  const markets  = marketsResult.value || [];
  const fiiDii   = fiiResult.value || [];

  // Classify with Claude
  const classified = await classifyNewsWithClaude(articles);

  const message = formatMorningBrief(classified, markets, fiiDii);
  logger.info('Morning brief generated', { module: 'morningBrief' });
  return message;
}

module.exports = { generateMorningBrief, fetchGlobalSnapshot };
