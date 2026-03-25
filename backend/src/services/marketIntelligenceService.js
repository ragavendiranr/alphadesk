'use strict';
/**
 * AlphaDesk — Market Intelligence Service
 * =========================================
 * Vercel-safe: only verified APIs, RSS feeds, lightweight scrapes.
 * No Yahoo Finance. No persistent in-memory cache (Vercel kills processes).
 * Cache-Control headers on responses replace scheduler-based refresh.
 *
 * Sources:
 *  - India Markets : NSE Official API (cookie session) → Stooq fallback
 *  - Global Markets: Twelve Data batch API → Frankfurter forex fallback
 *  - News          : RSS (ET, Business Standard, Financial Express, Reuters, NDTV)
 *  - SEBI          : sebi.gov.in RSS feed
 *  - FII/DII       : NSE API (cookie session) → Economic Times HTML fallback
 *  - Global Markets: Twelve Data API → Stooq index fallback → Frankfurter forex
 */

const axios     = require('axios');
const cheerio   = require('cheerio');
const RSSParser = require('rss-parser');
const logger    = require('../config/logger');
const { FiiDiiData, MarketNews } = require('../../../database/schemas');

const rss = new RSSParser({ timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });

// ── env ──────────────────────────────────────────────────────────────────────
const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY;

// ── IST helpers ──────────────────────────────────────────────────────────────
function isMarketHours() {
  const now  = new Date();
  const mins = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % (24 * 60);
  const dow  = (new Date(now.getTime() + 330 * 60000)).getUTCDay();
  return dow !== 0 && dow !== 6 && mins >= 555 && mins <= 930; // 9:15–15:30
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function get(url, opts = {}) {
  return axios.get(url, {
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    timeout: opts.timeout || 9000,
    ...opts,
  });
}

// ── SOURCE STATUS tracker ─────────────────────────────────────────────────────
const _sourceStatus = {
  indiaMarkets:  'unknown',
  globalMarkets: 'unknown',
  news:          'unknown',
  sebi:          'unknown',
  fiiDii:        'unknown',
};

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 1 — INDIA MARKETS (NSE API → Stooq fallback)
// ═══════════════════════════════════════════════════════════════════════════

let _nseCookies = '';
let _nseCookieTs = 0;

async function getNSECookies() {
  // Re-use cookie for 4 minutes (Vercel function stays warm that long sometimes)
  if (_nseCookies && Date.now() - _nseCookieTs < 240_000) return _nseCookies;
  const res = await get('https://www.nseindia.com/', {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 10000,
  });
  const raw = res.headers['set-cookie'] || [];
  _nseCookies  = raw.map(c => c.split(';')[0]).join('; ');
  _nseCookieTs = Date.now();
  return _nseCookies;
}

async function nseGet(path) {
  const cookies = await getNSECookies();
  return get(`https://www.nseindia.com${path}`, {
    headers: {
      Accept: 'application/json, */*',
      Referer: 'https://www.nseindia.com/',
      Cookie: cookies,
    },
    timeout: 9000,
  });
}

async function fetchFromStooq() {
  const PAIRS = [
    { url: 'https://stooq.com/q/l/?s=^nsei&f=sd2t2ohlcv&h&e=json',    key: 'nifty50',   name: 'NIFTY 50' },
    { url: 'https://stooq.com/q/l/?s=^bsesn&f=sd2t2ohlcv&h&e=json',   key: 'sensex',    name: 'SENSEX'   },
    { url: 'https://stooq.com/q/l/?s=^nsebank&f=sd2t2ohlcv&h&e=json', key: 'bankNifty', name: 'BANK NIFTY' },
  ];
  const result = {};
  await Promise.allSettled(PAIRS.map(async ({ url, key }) => {
    const { data } = await get(url, { timeout: 8000 });
    const sym = data?.symbols?.[0];
    if (!sym || sym.close === 'N/D') return;
    const ltp  = parseFloat(sym.close) || 0;
    const prev = parseFloat(sym.open)  || ltp;
    const chg  = ltp - prev;
    result[key] = { ltp, change: +chg.toFixed(2), pctChange: +((chg / prev) * 100).toFixed(2), high: parseFloat(sym.high) || 0, low: parseFloat(sym.low) || 0, prevClose: prev, source: 'stooq' };
  }));
  return result;
}

async function fetchIndiaMarkets() {
  try {
    // Step 1: cookie
    await getNSECookies();

    // Step 2: allIndices + market-status + ban — parallel
    const [idxRes, statusRes, banRes] = await Promise.allSettled([
      nseGet('/api/allIndices'),
      nseGet('/api/market-status'),
      nseGet('/api/security-in-ban-period?key=allBan'),
    ]);

    const indices = idxRes.value?.data?.data || [];
    const WANT    = { 'NIFTY 50': 'nifty50', 'NIFTY BANK': 'bankNifty', 'INDIA VIX': 'indiaVix', 'S&P BSE SENSEX': 'sensex', 'NIFTY MIDCAP 100': 'midcap100' };
    const mapped  = {};
    for (const idx of indices) {
      const key = WANT[idx.index];
      if (!key) continue;
      if (key === 'indiaVix') {
        mapped[key] = { value: parseFloat(idx.last) || 0, change: parseFloat(idx.change) || 0, pctChange: parseFloat(idx.percentChange) || 0 };
      } else {
        mapped[key] = { ltp: parseFloat(idx.last) || 0, change: parseFloat(idx.change) || 0, pctChange: parseFloat(idx.percentChange) || 0, high: parseFloat(idx.high) || 0, low: parseFloat(idx.low) || 0, prevClose: parseFloat(idx.previousClose) || 0, open: parseFloat(idx.open) || 0 };
      }
    }

    const rawStatus = statusRes.value?.data?.marketState?.[0]?.marketStatus || '';
    const marketStatus = rawStatus.toLowerCase().includes('open') ? 'open' : (isMarketHours() ? 'open' : 'pre-market');

    const banSymbols = (banRes.value?.data?.data || []).map(s => (typeof s === 'string' ? s : s?.symbol || '').toUpperCase()).filter(Boolean);

    if (Object.keys(mapped).length >= 2) {
      _sourceStatus.indiaMarkets = 'live';
      return { ...mapped, marketStatus, foBanList: banSymbols };
    }
    throw new Error('NSE returned insufficient data');
  } catch (e) {
    logger.warn(`NSE API failed (${e.message}), using Stooq`, { module: 'marketIntel' });
    try {
      const stooq = await fetchFromStooq();
      _sourceStatus.indiaMarkets = 'stooq_fallback';
      return { ...stooq, marketStatus: isMarketHours() ? 'open' : 'closed', foBanList: [] };
    } catch (e2) {
      logger.error(`Stooq also failed: ${e2.message}`, { module: 'marketIntel' });
      _sourceStatus.indiaMarkets = 'error';
      return { marketStatus: isMarketHours() ? 'open' : 'closed', foBanList: [] };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 2 — GLOBAL MARKETS (Twelve Data → Frankfurter fallback)
// ═══════════════════════════════════════════════════════════════════════════

const TD_SYMBOLS = 'SPX,IXIC,DJI,DAX,FTSE,N225,HSI,XAU/USD,WTI/USD,USD/INR,EUR/INR,GBP/INR';

const TD_META = {
  SPX:     { name: 'S&P 500',    flag: '🇺🇸', type: 'index',     region: 'US'     },
  IXIC:    { name: 'NASDAQ',     flag: '🇺🇸', type: 'index',     region: 'US'     },
  DJI:     { name: 'Dow Jones',  flag: '🇺🇸', type: 'index',     region: 'US'     },
  DAX:     { name: 'DAX',        flag: '🇩🇪', type: 'index',     region: 'Europe' },
  FTSE:    { name: 'FTSE 100',   flag: '🇬🇧', type: 'index',     region: 'Europe' },
  N225:    { name: 'Nikkei 225', flag: '🇯🇵', type: 'index',     region: 'Asia'   },
  HSI:     { name: 'Hang Seng',  flag: '🇭🇰', type: 'index',     region: 'Asia'   },
  'XAU/USD': { name: 'Gold',     type: 'commodity', unit: '$/oz'  },
  'WTI/USD': { name: 'Crude WTI', type: 'commodity', unit: '$/bbl' },
  'USD/INR': { pair: 'USD/INR',  type: 'forex' },
  'EUR/INR': { pair: 'EUR/INR',  type: 'forex' },
  'GBP/INR': { pair: 'GBP/INR',  type: 'forex' },
};

// Stooq symbols for global indices (free, no API key needed)
const STOOQ_GLOBAL = [
  { s: '^spx',  name: 'S&P 500',    flag: '🇺🇸', region: 'US'     },
  { s: '^ndq',  name: 'NASDAQ',     flag: '🇺🇸', region: 'US'     },
  { s: '^dji',  name: 'Dow Jones',  flag: '🇺🇸', region: 'US'     },
  { s: '^dax',  name: 'DAX',        flag: '🇩🇪', region: 'Europe' },
  { s: '^ftx',  name: 'FTSE 100',   flag: '🇬🇧', region: 'Europe' },
  { s: '^nk',   name: 'Nikkei 225', flag: '🇯🇵', region: 'Asia'   },
  { s: '^hsi',  name: 'Hang Seng',  flag: '🇭🇰', region: 'Asia'   },
];

async function fetchGlobalFromStooq() {
  const results = await Promise.allSettled(
    STOOQ_GLOBAL.map(async ({ s, name, flag, region }) => {
      const { data } = await get(`https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcv&h&e=json`, { timeout: 8000 });
      const sym = data?.symbols?.[0];
      if (!sym || sym.close === 'N/D') return null;
      const ltp  = parseFloat(sym.close) || 0;
      const prev = parseFloat(sym.open)  || ltp;
      const chg  = ltp - prev;
      return { name, flag, region, value: ltp, change: +chg.toFixed(2), pctChange: +((chg / prev) * 100).toFixed(2) };
    })
  );
  return results.map(r => r.value).filter(Boolean);
}

async function fetchGlobalMarkets() {
  let indices = [], commodities = [], forex = [];

  // Try Twelve Data (works for forex/commodities; indices need paid plan)
  if (TWELVE_DATA_KEY) {
    try {
      const { data } = await get(`https://api.twelvedata.com/quote?symbol=${TD_SYMBOLS}&apikey=${TWELVE_DATA_KEY}`, { timeout: 9000 });
      for (const [sym, meta] of Object.entries(TD_META)) {
        const q = data[sym];
        if (!q || q.status === 'error') continue;
        const value  = parseFloat(q.close) || 0;
        const pctChg = parseFloat(q.percent_change) || 0;
        const absChg = parseFloat(q.change) || 0;
        if (meta.type === 'index') {
          indices.push({ name: meta.name, flag: meta.flag, region: meta.region, value, change: +absChg.toFixed(2), pctChange: +pctChg.toFixed(2) });
        } else if (meta.type === 'commodity') {
          commodities.push({ name: meta.name, unit: meta.unit, value, change: +absChg.toFixed(2), pctChange: +pctChg.toFixed(2) });
        } else {
          forex.push({ pair: meta.pair, value, change: +absChg.toFixed(4), pctChange: +pctChg.toFixed(2) });
        }
      }
      if (indices.length > 0 && commodities.length > 0) {
        _sourceStatus.globalMarkets = 'live';
        return { indices, commodities, forex };
      }
      // Twelve Data returned partial data (free plan misses indices) — fall through to Stooq for indices
      logger.info(`Twelve Data partial (${indices.length} indices) — using Stooq for indices`, { module: 'marketIntel' });
    } catch (e) {
      logger.warn(`Twelve Data failed: ${e.message}`, { module: 'marketIntel' });
    }
  }

  // Stooq fallback for indices (always free, no auth required)
  if (indices.length === 0) {
    try {
      const stooqIndices = await fetchGlobalFromStooq();
      if (stooqIndices.length > 0) {
        indices = stooqIndices;
        logger.info(`Global indices from Stooq: ${indices.length} symbols`, { module: 'marketIntel' });
      }
    } catch (e) {
      logger.warn(`Stooq global failed: ${e.message}`, { module: 'marketIntel' });
    }
  }

  // Frankfurter for forex if Twelve Data didn't provide it
  if (forex.length === 0) {
    try {
      const { data } = await get('https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP', { timeout: 7000 });
      const rates = data?.rates || {};
      if (rates.INR) forex.push({ pair: 'USD/INR', value: +rates.INR.toFixed(4), change: 0, pctChange: 0 });
      if (rates.EUR) forex.push({ pair: 'EUR/USD', value: +(1 / rates.EUR).toFixed(4), change: 0, pctChange: 0 });
      if (rates.GBP) forex.push({ pair: 'GBP/USD', value: +(1 / rates.GBP).toFixed(4), change: 0, pctChange: 0 });
    } catch (e) {
      logger.warn(`Frankfurter failed: ${e.message}`, { module: 'marketIntel' });
    }
  }

  if (indices.length > 0) {
    _sourceStatus.globalMarkets = TWELVE_DATA_KEY ? 'stooq_fallback' : 'stooq_only';
  } else {
    _sourceStatus.globalMarkets = forex.length > 0 ? 'partial_fallback' : 'error';
  }
  return { indices, commodities, forex };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 3 — NEWS (RSS feeds — never blocked on Vercel)
// ═══════════════════════════════════════════════════════════════════════════

const RSS_FEEDS = [
  { url: 'https://economictimes.indiatimes.com/markets/rss.cms',         source: 'Economic Times',     region: 'india'  },
  { url: 'https://www.business-standard.com/rss/markets-106.rss',        source: 'Business Standard',  region: 'india'  },
  { url: 'https://www.financialexpress.com/market/feed/',                 source: 'Financial Express',  region: 'india'  },
  { url: 'https://feeds.reuters.com/reuters/INbusinessNews',             source: 'Reuters',            region: 'global' },
  { url: 'https://feeds.feedburner.com/ndtvprofit-latest',               source: 'NDTV Profit',        region: 'india'  },
];

const TAG_RULES = [
  { tag: 'REGULATORY',   words: ['sebi', 'rbi', 'irdai', 'circular', 'rule', 'ban', 'regulation', 'policy', 'penalty', 'compliance', 'mandate'] },
  { tag: 'CENTRAL_BANK', words: ['federal reserve', 'powell', 'ecb', 'boj', 'rbi governor', 'sanjay malhotra', 'shaktikanta', 'central bank', 'monetary policy'] },
  { tag: 'MACRO',        words: ['gdp', 'cpi', 'inflation', 'nfp', 'fed', 'rate hike', 'rate cut', 'jobs report', 'fomc', 'fiscal', 'current account'] },
  { tag: 'BULLISH',      words: ['rally', 'surge', 'gain', 'record high', 'breakout', 'buying', 'jumps', 'soars', 'bullish', 'upbeat', 'strong growth'] },
  { tag: 'BEARISH',      words: ['fall', 'drop', 'crash', 'sell-off', 'decline', 'weak', 'plunges', 'slumps', 'bearish', 'downgrade', 'concern'] },
];

function autoTag(title) {
  const h = title.toLowerCase();
  for (const { tag, words } of TAG_RULES) {
    if (words.some(w => h.includes(w))) return tag;
  }
  return 'NEUTRAL';
}

async function fetchOneFeed({ url, source, region }) {
  try {
    const feed  = await rss.parseURL(url);
    return (feed.items || []).map(item => ({
      headline:    (item.title || '').trim(),
      source,
      region,
      url:         item.link || item.guid || '',
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
      tag:         autoTag(item.title || ''),
    })).filter(a => a.headline.length > 15);
  } catch (e) {
    logger.warn(`RSS failed (${source}): ${e.message}`, { module: 'marketIntel' });
    return [];
  }
}

async function fetchNews() {
  const results = await Promise.allSettled(RSS_FEEDS.map(f => fetchOneFeed(f)));
  const all     = results.flatMap(r => r.value || []);

  // Deduplicate by first 60 chars of headline
  const seen   = new Set();
  const unique = all.filter(a => {
    const key = a.headline.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date descending
  unique.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const india  = unique.filter(a => a.region === 'india').slice(0, 25);
  const global = unique.filter(a => a.region === 'global').slice(0, 25);

  // Persist to DB asynchronously (best-effort, don't await)
  const save = async (articles) => {
    for (const doc of articles) {
      try {
        await MarketNews.findOneAndUpdate(
          { headline: doc.headline },
          { ...doc, sentiment: doc.tag, category: doc.region === 'india' ? 'INDIA' : 'GLOBAL', publishedAt: new Date(doc.publishedAt) },
          { upsert: true }
        );
      } catch {}
    }
  };
  save([...india, ...global]).catch(() => {});

  _sourceStatus.news = (india.length + global.length > 0) ? 'live' : 'error';
  return { india, global };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 4 — SEBI CIRCULARS (Official RSS — always accessible)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchSebi() {
  try {
    const feed  = await rss.parseURL('https://www.sebi.gov.in/sebirss.xml');
    const items = (feed.items || []).slice(0, 10).map(item => ({
      date:   item.isoDate ? new Date(item.isoDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : (item.pubDate || ''),
      title:  (item.title || '').trim(),
      pdfUrl: item.link || item.guid || '',
    }));
    _sourceStatus.sebi = items.length > 0 ? 'live' : 'error';
    return items;
  } catch (e) {
    logger.warn(`SEBI RSS failed: ${e.message}`, { module: 'marketIntel' });

    // Fallback: load from DB if available
    try {
      const dbNews = await MarketNews.find({ category: 'SEBI' }).sort({ publishedAt: -1 }).limit(10).lean();
      if (dbNews.length > 0) {
        _sourceStatus.sebi = 'stale';
        return dbNews.map(n => ({ date: n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('en-IN') : '', title: n.headline, pdfUrl: n.url }));
      }
    } catch {}

    _sourceStatus.sebi = 'error';
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 5 — FII/DII (NSE API primary → ET HTML fallback → DB fallback)
// ═══════════════════════════════════════════════════════════════════════════

// Normalize date strings from NSE/ET to YYYY-MM-DD
function normalizeDateStr(raw) {
  if (!raw) return null;
  const s = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-Mon-YYYY e.g. "16-Jan-2026" or "16-JAN-2026"
  const m1 = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m1) {
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const mo = months[m1[2].toLowerCase()];
    if (mo) return `${m1[3]}-${String(mo).padStart(2,'0')}-${m1[1]}`;
  }
  // Mon DD, YYYY e.g. "Jan 16, 2026"
  const m2 = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m2) {
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const mo = months[m2[1].toLowerCase()];
    if (mo) return `${m2[3]}-${String(mo).padStart(2,'0')}-${String(m2[2]).padStart(2,'0')}`;
  }
  // Try JS Date as last resort
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  return null;
}

async function fetchFiiDiiFromNSE() {
  // NSE Official FII/DII API — uses same cookie session as other NSE calls
  const { data } = await nseGet('/api/fiidii');
  const rows = Array.isArray(data) ? data : (data?.data || []);
  if (!rows.length) throw new Error('NSE FII/DII returned empty array');

  const fiiRows = [], diiRows = [];
  for (const row of rows.slice(0, 10)) {
    // NSE returns: { date, buyValue, sellValue, netValue, category }
    // category can be 'FII/FPI' or 'DII'
    const date = normalizeDateStr(row.date || row.Date || '');
    if (!date) continue;
    const buy  = parseFloat(String(row.buyValue  || row.BuyValue  || 0).replace(/[,\s]/g,'')) || 0;
    const sell = parseFloat(String(row.sellValue || row.SellValue || 0).replace(/[,\s]/g,'')) || 0;
    const net  = parseFloat(String(row.netValue  || row.NetValue  || (buy - sell)).replace(/[,\s]/g,'')) || +(buy - sell).toFixed(2);
    const cat  = (row.category || row.Category || '').toUpperCase();
    const entry = { date, buy: +buy.toFixed(2), sell: +sell.toFixed(2), net: +net.toFixed(2) };
    if (cat.includes('DII')) diiRows.push(entry);
    else fiiRows.push(entry); // FII/FPI or default
  }

  if (!fiiRows.length && !diiRows.length) throw new Error('NSE FII/DII parse: no rows after filtering');
  return { fii: fiiRows, dii: diiRows };
}

async function fetchFiiDiiFromET() {
  const { data: html } = await get('https://economictimes.indiatimes.com/markets/stocks/fiidii', {
    headers: { Accept: 'text/html', Referer: 'https://economictimes.indiatimes.com/' },
    timeout: 12000,
  });
  if (!html || html.length < 500) throw new Error(`ET FII/DII page too small (${html?.length || 0} bytes)`);

  const $ = cheerio.load(html);
  const fii = [], dii = [];

  const parseTable = (tableEl) => {
    const rows = [];
    $(tableEl).find('tr').each((i, tr) => {
      if (i === 0) return;
      const tds = $(tr).find('td');
      if (tds.length < 4) return;
      const dateRaw = $(tds[0]).text().trim();
      const date    = normalizeDateStr(dateRaw);
      if (!date) return;
      const buy  = parseFloat($(tds[1]).text().replace(/[,\s₹]/g,'')) || 0;
      const sell = parseFloat($(tds[2]).text().replace(/[,\s₹]/g,'')) || 0;
      const net  = parseFloat($(tds[3]).text().replace(/[,\s₹]/g,'')) || +(buy - sell).toFixed(2);
      if (buy > 0) rows.push({ date, buy: +buy.toFixed(2), sell: +sell.toFixed(2), net: +net.toFixed(2) });
    });
    return rows.slice(0, 10);
  };

  const tables = $('table');
  if (tables.length >= 2) {
    fii.push(...parseTable(tables.eq(0)));
    dii.push(...parseTable(tables.eq(1)));
  } else if (tables.length === 1) {
    fii.push(...parseTable(tables.eq(0)));
  }

  if (!fii.length) throw new Error('ET FII/DII table parse returned 0 rows');
  return { fii, dii };
}

async function fetchFiiDii() {
  let fii = [], dii = [];
  let source = 'live';

  // Primary: NSE API
  try {
    const r = await fetchFiiDiiFromNSE();
    fii = r.fii; dii = r.dii;
    logger.info(`FII/DII fetched from NSE API: ${fii.length} FII, ${dii.length} DII rows`, { module: 'marketIntel' });
  } catch (e1) {
    logger.warn(`NSE FII/DII failed (${e1.message}), trying ET`, { module: 'marketIntel' });
    // Secondary: ET scrape
    try {
      const r = await fetchFiiDiiFromET();
      fii = r.fii; dii = r.dii;
      logger.info(`FII/DII fetched from ET: ${fii.length} rows`, { module: 'marketIntel' });
    } catch (e2) {
      logger.warn(`ET FII/DII also failed (${e2.message}), using DB`, { module: 'marketIntel' });
    }
  }

  if (fii.length > 0) {
    // Persist to DB
    for (const row of fii) {
      await FiiDiiData.findOneAndUpdate(
        { date: row.date },
        { fii: { grossBuy: row.buy, grossSell: row.sell, net: row.net }, rawData: row },
        { upsert: true }
      ).catch(() => {});
    }
    for (let i = 0; i < dii.length; i++) {
      await FiiDiiData.findOneAndUpdate(
        { date: dii[i].date },
        { dii: { grossBuy: dii[i].buy, grossSell: dii[i].sell, net: dii[i].net } },
        { upsert: true }
      ).catch(() => {});
    }
    const fiiNet5D = fii.slice(0, 5).reduce((s, r) => s + r.net, 0);
    const diiNet5D = dii.slice(0, 5).reduce((s, r) => s + r.net, 0);
    _sourceStatus.fiiDii = 'live';
    return { fii, dii, fiiNet5D: +fiiNet5D.toFixed(2), diiNet5D: +diiNet5D.toFixed(2) };
  }

  // Tertiary: DB fallback
  try {
    const rows = await FiiDiiData.find().sort({ date: -1 }).limit(10).lean();
    if (rows.length > 0) {
      const fiiDb = rows.map(r => ({ date: r.date, buy: r.fii?.grossBuy || 0, sell: r.fii?.grossSell || 0, net: r.fii?.net || 0 }));
      const diiDb = rows.map(r => ({ date: r.date, buy: r.dii?.grossBuy || 0, sell: r.dii?.grossSell || 0, net: r.dii?.net || 0 }));
      _sourceStatus.fiiDii = 'stale';
      return {
        fii: fiiDb, dii: diiDb,
        fiiNet5D: +fiiDb.slice(0, 5).reduce((s, r) => s + r.net, 0).toFixed(2),
        diiNet5D: +diiDb.slice(0, 5).reduce((s, r) => s + r.net, 0).toFixed(2),
        stale_manual_update: true,
      };
    }
  } catch {}

  _sourceStatus.fiiDii = 'error';
  return { fii: [], dii: [], fiiNet5D: 0, diiNet5D: 0, stale_manual_update: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENTRY POINT — called by /api/news-market
// All 5 sources run in PARALLEL — total time ~3-5s, never sequential
// ═══════════════════════════════════════════════════════════════════════════

async function getNewsMarket(section = null) {
  const [imResult, gmResult, newsResult, sebiResult, fiiResult] = await Promise.allSettled([
    fetchIndiaMarkets(),
    fetchGlobalMarkets(),
    fetchNews(),
    fetchSebi(),
    fetchFiiDii(),
  ]);

  const indiaMarkets  = imResult.value   || { marketStatus: isMarketHours() ? 'open' : 'closed', foBanList: [] };
  const globalMarkets = gmResult.value   || { indices: [], commodities: [], forex: [] };
  const newsData      = newsResult.value || { india: [], global: [] };
  const sebiUpdates   = sebiResult.value || [];
  const fiiDii        = fiiResult.value  || { fii: [], dii: [], fiiNet5D: 0, diiNet5D: 0 };

  // Log any source errors
  if (imResult.reason)   logger.error(`India markets error: ${imResult.reason?.message}`,   { module: 'marketIntel' });
  if (gmResult.reason)   logger.error(`Global markets error: ${gmResult.reason?.message}`,  { module: 'marketIntel' });
  if (newsResult.reason) logger.error(`News error: ${newsResult.reason?.message}`,           { module: 'marketIntel' });
  if (sebiResult.reason) logger.error(`SEBI error: ${sebiResult.reason?.message}`,           { module: 'marketIntel' });
  if (fiiResult.reason)  logger.error(`FII/DII error: ${fiiResult.reason?.message}`,         { module: 'marketIntel' });

  const full = {
    lastUpdated: new Date().toISOString(),
    sources: {
      indiaMarkets:  _sourceStatus.indiaMarkets,
      globalMarkets: _sourceStatus.globalMarkets,
      news:          _sourceStatus.news,
      sebi:          _sourceStatus.sebi,
      fiiDii:        _sourceStatus.fiiDii,
    },
    indiaMarkets: {
      nifty50:      indiaMarkets.nifty50      || null,
      bankNifty:    indiaMarkets.bankNifty    || null,
      sensex:       indiaMarkets.sensex       || null,
      indiaVix:     indiaMarkets.indiaVix     || null,
      midcap100:    indiaMarkets.midcap100    || null,
      marketStatus: indiaMarkets.marketStatus || 'closed',
      foBanList:    indiaMarkets.foBanList    || [],
    },
    globalMarkets,
    fiiDii,
    sebiUpdates,
    news: newsData,
  };

  if (section && full[section] !== undefined) return full[section];
  return full;
}

// ── Legacy compat (keeps old marketIntelligence route working) ────────────────
async function getMarketIntelligence() {
  const d = await getNewsMarket();
  const n = d.indiaMarkets;
  return {
    indiaMarket: [
      n.nifty50   && { name: 'NIFTY 50',   price: n.nifty50.ltp,    change: String(n.nifty50.pctChange)   },
      n.bankNifty && { name: 'BANK NIFTY', price: n.bankNifty.ltp,  change: String(n.bankNifty.pctChange) },
      n.sensex    && { name: 'SENSEX',     price: n.sensex.ltp,     change: String(n.sensex.pctChange)    },
      n.indiaVix  && { name: 'INDIA VIX',  price: n.indiaVix.value, change: String(n.indiaVix.change)     },
    ].filter(Boolean),
    globalMarkets: d.globalMarkets.indices.map(i => ({ name: i.name, price: i.value, change: String(i.pctChange) })),
    fiiDii: d.fiiDii.fii.map((f, i) => ({
      date: f.date,
      fii:  { grossBuy: f.buy, grossSell: f.sell, net: f.net },
      dii:  d.fiiDii.dii[i] ? { grossBuy: d.fiiDii.dii[i].buy, grossSell: d.fiiDii.dii[i].sell, net: d.fiiDii.dii[i].net } : {},
    })),
    indiaNews:  d.news.india.map(a => ({ headline: a.headline, source: a.source, url: a.url, publishedAt: a.publishedAt, sentiment: a.tag })),
    globalNews: d.news.global.map(a => ({ headline: a.headline, source: a.source, url: a.url, publishedAt: a.publishedAt, sentiment: a.tag })),
    fetchedAt: d.lastUpdated,
  };
}

function getSourceStatus() { return { ..._sourceStatus }; }

// ── Individual exports (used by route refresh endpoints) ─────────────────────
module.exports = {
  fetchIndiaMarkets,
  fetchGlobalMarkets,
  fetchNews,
  fetchSebi,
  fetchFiiDii,
  getNewsMarket,
  getMarketIntelligence,
  getSourceStatus,
  // Legacy aliases
  fetchIndiaMarketSummary: fetchIndiaMarkets,
  fetchIndiaNews:  () => fetchNews().then(r => r.india),
  fetchGlobalNews: () => fetchNews().then(r => r.global),
  fetchSEBIUpdates: fetchSebi,
  fetchGainersLosers: async () => ({ gainers: [], losers: [] }),
};
