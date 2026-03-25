import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
const setAuth = (t) => { api.defaults.headers.common['Authorization'] = `Bearer ${t}`; };

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#0d1117',
  card:     '#0d1526',
  card2:    '#111827',
  border:   '#1e2d4a',
  text:     '#e2e8f0',
  muted:    '#64748b',
  muted2:   '#475569',
  green:    '#22c55e',
  greenDim: '#14532d',
  red:      '#ef4444',
  redDim:   '#7f1d1d',
  blue:     '#3b82f6',
  blueDim:  '#1e3a5f',
  amber:    '#f59e0b',
  amberDim: '#78350f',
  purple:   '#a855f7',
  purpleDim:'#4c1d95',
  gray:     '#94a3b8',
  grayDim:  '#1e2d4a',
};

const TAG_STYLE = {
  REGULATORY:   { bg: C.purpleDim, fg: C.purple },
  BULLISH:      { bg: C.greenDim,  fg: C.green  },
  BEARISH:      { bg: C.redDim,    fg: C.red    },
  NEUTRAL:      { bg: C.grayDim,   fg: C.gray   },
  MACRO:        { bg: C.blueDim,   fg: C.blue   },
  CENTRAL_BANK: { bg: C.amberDim,  fg: C.amber  },
};

// ── Tiny utilities ───────────────────────────────────────────────────────────
function fmtNum(v, dec = 2) {
  if (v == null || isNaN(v)) return '—';
  return parseFloat(v).toLocaleString('en-IN', { maximumFractionDigits: dec, minimumFractionDigits: dec });
}
function fmtCr(v) {
  if (v == null) return '—';
  return Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function timeAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function istTime() {
  return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
}

// ── Skeleton loader ──────────────────────────────────────────────────────────
const SKL_STYLE = { background: 'linear-gradient(90deg,#1e2d4a 25%,#243450 50%,#1e2d4a 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: 4 };

function Skl({ w = '100%', h = 14, style }) {
  return <div style={{ width: w, height: h, ...SKL_STYLE, ...style }} />;
}

function SkeletonCard() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
      <Skl w="40%" h={16} style={{ marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[0,1,2,3].map(i => <Skl key={i} w={80} h={60} style={{ borderRadius: 8 }} />)}
      </div>
      {[0,1,2,3,4].map(i => <Skl key={i} h={12} style={{ marginBottom: 10 }} />)}
    </div>
  );
}

// ── Shared components ────────────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, ...style }}>{children}</div>;
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          background:   active === t.key ? C.blueDim    : 'transparent',
          color:        active === t.key ? C.blue       : C.muted,
          border:       `1px solid ${active === t.key ? C.blue : C.border}`,
          borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function Pct({ v }) {
  const n   = parseFloat(v) || 0;
  const col = n > 0 ? C.green : n < 0 ? C.red : C.muted;
  return <span style={{ color: col, fontSize: 12, fontWeight: 600 }}>{n > 0 ? '▲' : n < 0 ? '▼' : ''} {Math.abs(n).toFixed(2)}%</span>;
}

function NetBadge({ val }) {
  const n  = parseFloat(val) || 0;
  const bg = n >= 0 ? C.greenDim : C.redDim;
  const fg = n >= 0 ? C.green   : C.red;
  return (
    <span style={{ background: bg, color: fg, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
      {n >= 0 ? '▲ +' : '▼ '}{fmtCr(n)} Cr
    </span>
  );
}

function Empty({ msg = 'No data' }) {
  return <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '18px 0' }}>{msg}</div>;
}

function SourceBadge({ status }) {
  const MAP = {
    live:            { bg: C.greenDim, fg: C.green, label: '● LIVE' },
    stooq_fallback:  { bg: C.amberDim, fg: C.amber, label: '● STOOQ' },
    partial_fallback:{ bg: C.amberDim, fg: C.amber, label: '● PARTIAL' },
    stale:           { bg: C.amberDim, fg: C.amber, label: '● STALE' },
    error:           { bg: C.redDim,   fg: C.red,   label: '● ERROR' },
    unknown:         { bg: C.grayDim,  fg: C.gray,  label: '● —' },
  };
  const s = MAP[status] || MAP.unknown;
  return <span style={{ background: s.bg, color: s.fg, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 800 }}>{s.label}</span>;
}

// ── Card 1: India Markets ────────────────────────────────────────────────────
function MarketStatusBadge({ status }) {
  const MAP = {
    open:        { bg: '#0d2a1a', fg: C.green, dot: '🟢', label: 'LIVE'       },
    'pre-market':{ bg: C.amberDim, fg: C.amber, dot: '🟡', label: 'PRE-MARKET' },
    closed:      { bg: C.redDim,  fg: C.red,   dot: '🔴', label: 'CLOSED'     },
  };
  const s = MAP[status] || MAP.closed;
  return (
    <div style={{ background: s.bg, color: s.fg, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
      {s.dot} {s.label} <span style={{ color: C.muted, fontWeight: 400 }}>{istTime()} IST</span>
    </div>
  );
}

function IndiaMarketsCard({ im, sourceStatus }) {
  const tickers = [
    { label: 'NIFTY',     d: im.nifty50   },
    { label: 'BANKNIFTY', d: im.bankNifty },
    { label: 'SENSEX',    d: im.sensex    },
    { label: 'VIX',       d: im.indiaVix ? { ltp: im.indiaVix.value, pctChange: im.indiaVix.change, change: im.indiaVix.change } : null },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>📈 India Markets</span>
          <SourceBadge status={sourceStatus} />
        </div>
        <MarketStatusBadge status={im.marketStatus} />
      </div>

      {/* Ticker chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {tickers.map(({ label, d }) => {
          if (!d) return (
            <div key={label} style={{ background: C.grayDim, borderRadius: 8, padding: '7px 12px', minWidth: 88 }}>
              <div style={{ color: C.muted, fontSize: 10, fontWeight: 700 }}>{label}</div>
              <div style={{ color: C.muted, fontSize: 13 }}>—</div>
            </div>
          );
          const pct = parseFloat(d.pctChange || 0);
          const bg  = pct > 0 ? '#0a1f10' : pct < 0 ? '#1f0a0a' : C.grayDim;
          const col = pct > 0 ? C.green   : pct < 0 ? C.red     : C.gray;
          return (
            <div key={label} style={{ background: bg, border: `1px solid ${col}33`, borderRadius: 8, padding: '7px 12px', minWidth: 88 }}>
              <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
              <div style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>{fmtNum(d.ltp, 2)}</div>
              <div style={{ marginTop: 1 }}>
                <span style={{ color: col, fontSize: 11 }}>{pct > 0 ? '▲' : pct < 0 ? '▼' : ''} {Math.abs(pct).toFixed(2)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* F&O Ban */}
      {im.foBanList?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <span style={{ color: C.amber, fontSize: 11, fontWeight: 700, marginRight: 8 }}>⚠ F&O Ban:</span>
          {im.foBanList.map(s => (
            <span key={s} style={{ background: C.amberDim, color: C.amber, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginRight: 5, marginBottom: 4, display: 'inline-block' }}>{s}</span>
          ))}
        </div>
      )}

      {/* Nifty H/L bar */}
      {im.nifty50?.high && im.nifty50?.low && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 11, color: C.muted }}>
          <span>H: <span style={{ color: C.green }}>{fmtNum(im.nifty50.high, 2)}</span></span>
          <span>L: <span style={{ color: C.red }}>{fmtNum(im.nifty50.low, 2)}</span></span>
          {im.nifty50.prevClose && <span>Prev: <span style={{ color: C.text }}>{fmtNum(im.nifty50.prevClose, 2)}</span></span>}
        </div>
      )}

      {im.marketStatus === 'pre-market' && (
        <div style={{ background: C.amberDim, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: C.amber, marginTop: 8 }}>
          🟡 Pre-market — prices are indicative, not live trading
        </div>
      )}
    </Card>
  );
}

// ── Card 2: Global Markets ───────────────────────────────────────────────────
function GlobalMarketsCard({ gm, sourceStatus }) {
  const [tab, setTab] = useState('indices');
  const TABS = [
    { key: 'indices',     label: '📊 Indices'    },
    { key: 'commodities', label: '🛢️ Commodities' },
    { key: 'forex',       label: '💱 Forex'       },
  ];
  const REGIONS = ['US', 'Europe', 'Asia'];

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>🌍 Global Markets</span>
        <SourceBadge status={sourceStatus} />
        {sourceStatus === 'partial_fallback' && (
          <span style={{ color: C.amber, fontSize: 10 }}>Indices unavailable — add TWELVE_DATA_KEY</span>
        )}
      </div>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'indices' && (
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {gm.indices?.length === 0 && (
            <div style={{ color: C.amber, fontSize: 12, padding: 12, background: C.amberDim, borderRadius: 6 }}>
              [ACTION NEEDED] Add TWELVE_DATA_KEY to Vercel environment variables for global indices.
            </div>
          )}
          {REGIONS.map(region => {
            const items = (gm.indices || []).filter(i => i.region === region);
            if (!items.length) return null;
            return (
              <div key={region} style={{ marginBottom: 10 }}>
                <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>
                  {region === 'US' ? '🇺🇸 US' : region === 'Europe' ? '🇪🇺 Europe' : '🌏 Asia'}
                </div>
                {items.map(i => (
                  <div key={i.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.text, fontSize: 13 }}>{i.flag} {i.name}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: C.text, fontSize: 12 }}>{fmtNum(i.value, 2)}</div>
                      <Pct v={i.pctChange} />
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'commodities' && (
        <div>
          {!gm.commodities?.length && <Empty msg="Add TWELVE_DATA_KEY for commodity prices" />}
          {(gm.commodities || []).map(c => (
            <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ color: C.text, fontSize: 13 }}>
                  {c.name === 'Gold' ? '🥇 ' : c.name.includes('WTI') ? '🛢️ ' : c.name === 'Brent' ? '⛽ ' : ''}{c.name}
                </div>
                <div style={{ color: C.muted, fontSize: 10 }}>{c.unit}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: C.text, fontSize: 13 }}>${fmtNum(c.value, 2)}</div>
                <Pct v={c.pctChange} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'forex' && (
        <div>
          {!gm.forex?.length && <Empty msg="No forex data" />}
          {(gm.forex || []).map(f => (
            <div key={f.pair} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{f.pair}</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: C.text, fontSize: 13 }}>{fmtNum(f.value, 4)}</div>
                <Pct v={f.pctChange} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Card 3: FII/DII ──────────────────────────────────────────────────────────
function FiiDiiCard({ fd, sourceStatus, onRefresh, refreshing }) {
  const [days, setDays] = useState(5);
  const fiiRows = (fd.fii || []).slice(0, days);
  const diiRows = (fd.dii || []).slice(0, days);
  const TH = { color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 };
  const COLS = '85px 1fr 1fr 1fr';

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>🏦 FII/DII Activity</span>
        <span style={{ color: C.muted, fontSize: 12 }}>(₹ Crores)</span>
        <SourceBadge status={sourceStatus} />
      </div>

      {fd.stale_manual_update && (
        <div style={{ background: C.amberDim, borderRadius: 6, padding: '7px 10px', fontSize: 11, color: C.amber, marginBottom: 12 }}>
          ⚠ FII/DII data may be delayed — last updated: {istTime()}. Click Refresh to try again.
        </div>
      )}

      {/* Toggle + refresh */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        {[5, 10].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            background:   days === d ? C.blueDim    : 'transparent',
            color:        days === d ? C.blue       : C.muted,
            border:       `1px solid ${days === d ? C.blue : C.border}`,
            borderRadius: 6, padding: '3px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>Last {d} Days</button>
        ))}
        <button onClick={onRefresh} disabled={refreshing} style={{
          marginLeft: 'auto', background: 'transparent', color: C.blue,
          border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 11,
        }}>{refreshing ? '↻...' : '↻ Refresh'}</button>
      </div>

      {/* FII */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: C.blue, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>FII / FPI</div>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, marginBottom: 5 }}>
          {['Date','Buy','Sell','Net'].map(h => <div key={h} style={TH}>{h}</div>)}
        </div>
        {fiiRows.length === 0 && <Empty />}
        {fiiRows.map((r, i) => (
          <div key={r.date || i} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted, fontSize: 11 }}>{r.date}</span>
            <span style={{ color: C.green, fontSize: 11 }}>{fmtCr(r.buy)}</span>
            <span style={{ color: C.red,   fontSize: 11 }}>{fmtCr(r.sell)}</span>
            <NetBadge val={r.net} />
          </div>
        ))}
      </div>

      {/* DII */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: C.amber, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>DII</div>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, marginBottom: 5 }}>
          {['Date','Buy','Sell','Net'].map(h => <div key={h} style={TH}>{h}</div>)}
        </div>
        {diiRows.length === 0 && <Empty />}
        {diiRows.map((r, i) => (
          <div key={(r.date || i) + 'd'} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted, fontSize: 11 }}>{r.date}</span>
            <span style={{ color: C.green, fontSize: 11 }}>{fmtCr(r.buy)}</span>
            <span style={{ color: C.red,   fontSize: 11 }}>{fmtCr(r.sell)}</span>
            <NetBadge val={r.dii?.net ?? r.net} />
          </div>
        ))}
      </div>

      {/* Summary footer */}
      <div style={{ background: '#08111e', borderRadius: 6, padding: '8px 12px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11 }}>
          <span style={{ color: C.muted }}>FII 5D Net: </span><NetBadge val={fd.fiiNet5D} />
        </div>
        <div style={{ fontSize: 11 }}>
          <span style={{ color: C.muted }}>DII 5D Net: </span><NetBadge val={fd.diiNet5D} />
        </div>
      </div>
    </Card>
  );
}

// ── Card 4: News & Regulatory ────────────────────────────────────────────────
function NewsCard({ news, sebiUpdates, foBanList, sourceStatus, onRefresh, refreshing }) {
  const [tab, setTab] = useState('india');
  const TABS = [
    { key: 'india',  label: '🇮🇳 India News'  },
    { key: 'global', label: '🌍 Global News'  },
    { key: 'sebi',   label: '📋 SEBI/NSE'     },
  ];

  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: C.text, fontSize: 14, fontWeight: 700 }}>📰 News & Regulatory</span>
          <SourceBadge status={sourceStatus} />
        </div>
        <button onClick={onRefresh} disabled={refreshing} style={{
          background: 'transparent', color: C.blue, border: `1px solid ${C.border}`,
          borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 11,
        }}>{refreshing ? '↻...' : '↻ Refresh'}</button>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 500 }}>
        {tab === 'india' && (
          (news?.india?.length === 0)
            ? <Empty msg="No news yet — click Refresh" />
            : (news?.india || []).map((a, i) => <NewsRow key={i} a={a} />)
        )}
        {tab === 'global' && (
          (news?.global?.length === 0)
            ? <Empty msg="No global news yet" />
            : (news?.global || []).map((a, i) => <NewsRow key={i} a={a} />)
        )}
        {tab === 'sebi' && (
          <>
            {foBanList?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ color: C.amber, fontSize: 11, fontWeight: 700, marginRight: 6 }}>⚠ F&O Ban:</span>
                {foBanList.map(s => (
                  <span key={s} style={{ background: C.amberDim, color: C.amber, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginRight: 5 }}>{s}</span>
                ))}
              </div>
            )}
            {!sebiUpdates?.length && <Empty msg="No SEBI circulars fetched yet" />}
            {(sebiUpdates || []).map((s, i) => (
              <div key={i} style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ background: C.purpleDim, color: C.purple, borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{s.date}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 12, lineHeight: 1.4 }}>{s.title}</div>
                    {s.pdfUrl && (
                      <a href={s.pdfUrl} target="_blank" rel="noreferrer" style={{
                        display: 'inline-block', marginTop: 4,
                        background: C.blueDim, color: C.blue, borderRadius: 4,
                        padding: '1px 8px', fontSize: 10, textDecoration: 'none', fontWeight: 600,
                      }}>📄 PDF</a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

function NewsRow({ a }) {
  const tag    = a.tag || a.sentiment || 'NEUTRAL';
  const colors = TAG_STYLE[tag] || TAG_STYLE.NEUTRAL;
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{
          background: colors.bg, color: colors.fg, borderRadius: 4, padding: '2px 7px',
          fontSize: 9, fontWeight: 800, minWidth: 66, textAlign: 'center', flexShrink: 0, marginTop: 2,
        }}>{tag}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <a href={a.url} target="_blank" rel="noreferrer"
            style={{ color: C.text, fontSize: 12, lineHeight: 1.45, textDecoration: 'none', display: 'block' }}>
            {a.headline}
            {a.url && <span style={{ color: C.muted2, fontSize: 10, marginLeft: 4 }}>↗</span>}
          </a>
          <div style={{ color: C.muted2, fontSize: 10, marginTop: 2 }}>
            {a.source} · {timeAgo(a.publishedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function MarketIntelligencePanel({ token }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [timedOut,    setTimedOut]    = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stale,       setStale]       = useState(false);
  const [partialErr,  setPartialErr]  = useState(false);

  const intervalRef  = useRef(null);
  const timeoutRef   = useRef(null);
  const mountedRef   = useRef(true);

  useEffect(() => { if (token) setAuth(token); }, [token]);

  const load = useCallback(async (silent = false) => {
    if (!mountedRef.current) return;
    if (!silent) { setLoading(true); setTimedOut(false); }

    // 8-second hard timeout for skeleton → error state
    if (!silent) {
      timeoutRef.current = setTimeout(() => {
        if (mountedRef.current && !data) setTimedOut(true);
      }, 8000);
    }

    try {
      const res = await api.get('/api/news-market', { timeout: 25000 });
      clearTimeout(timeoutRef.current);
      if (!mountedRef.current) return;

      setData(res.data.data || res.data);
      setStale(res.data.stale || false);
      setLastUpdated(new Date());
      setTimedOut(false);

      // Check if any source errored
      const srcs = res.data.sources || res.data.data?.sources || {};
      setPartialErr(Object.values(srcs).some(v => v === 'error'));
    } catch {
      clearTimeout(timeoutRef.current);
      if (!mountedRef.current) return;
      if (!data) setTimedOut(true);
      setStale(true);
    }
    if (!silent && mountedRef.current) setLoading(false);
  }, [data]);

  // Start / stop polling based on tab visibility (document.visibilityState)
  useEffect(() => {
    mountedRef.current = true;
    load(false);

    const startPoll = () => {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') load(true);
      }, 60_000);
    };
    const handleVis = () => {
      if (document.visibilityState === 'visible') load(true);
    };

    startPoll();
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, []);

  const refreshAll = async () => {
    setRefreshing(true);
    try { await api.post('/api/news-market/refresh'); } catch {}
    await load(true);
    setRefreshing(false);
  };
  const refreshNews = async () => {
    setRefreshing(true);
    try { await api.post('/api/news-market/refresh/news'); } catch {}
    await load(true);
    setRefreshing(false);
  };
  const refreshFii = async () => {
    setRefreshing(true);
    try { await api.post('/api/news-market/refresh/fii-dii'); } catch {}
    await load(true);
    setRefreshing(false);
  };

  const srcs = data?.sources || {};
  const im   = data?.indiaMarkets  || { marketStatus: 'closed', foBanList: [] };
  const gm   = data?.globalMarkets || { indices: [], commodities: [], forex: [] };
  const fd   = data?.fiiDii        || { fii: [], dii: [], fiiNet5D: 0, diiNet5D: 0 };
  const news = data?.news          || { india: [], global: [] };
  const sebi = data?.sebiUpdates   || [];

  const staleMin = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 60000) : 0;

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin    { to{transform:rotate(360deg)} }
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={refreshAll} disabled={refreshing} style={{
          background: C.blueDim, color: C.blue, border: `1px solid ${C.blue}`,
          borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}>
          {refreshing ? <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> : '🔄'} {refreshing ? 'Refreshing...' : 'Refresh All'}
        </button>
        <button onClick={refreshNews} disabled={refreshing} style={{
          background: 'transparent', color: C.blue, border: `1px solid ${C.border}`,
          borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12,
        }}>📰 Refresh News</button>
        <button onClick={refreshFii} disabled={refreshing} style={{
          background: 'transparent', color: C.blue, border: `1px solid ${C.border}`,
          borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12,
        }}>📊 Refresh FII/DII</button>

        <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 11 }}>
          {partialErr  && <div style={{ color: C.amber }}>⚠ Partial data — some sources failed</div>}
          {stale && staleMin > 10 && <div style={{ color: C.amber }}>⚠ Stale data — last updated {lastUpdated?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>}
          {!stale && lastUpdated && <div style={{ color: C.green }}>✓ Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>}
          <div style={{ color: C.muted2, marginTop: 2 }}>Auto-refresh every 60s</div>
        </div>
      </div>

      {/* ── Loading / timeout states ── */}
      {loading && !data && !timedOut && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      )}

      {timedOut && !data && (
        <div style={{ background: C.redDim, border: `1px solid ${C.red}`, borderRadius: 10, padding: 32, textAlign: 'center' }}>
          <div style={{ color: C.red, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>⚠ Unable to connect</div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Market data service is not responding.</div>
          <button onClick={() => load(false)} style={{
            background: C.blueDim, color: C.blue, border: `1px solid ${C.blue}`,
            borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>🔄 Click to Retry</button>
        </div>
      )}

      {/* ── 2×2 grid ── */}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <IndiaMarketsCard  im={im} sourceStatus={srcs.indiaMarkets} />
          <GlobalMarketsCard gm={gm} sourceStatus={srcs.globalMarkets} />
          <FiiDiiCard        fd={fd} sourceStatus={srcs.fiiDii} onRefresh={refreshFii} refreshing={refreshing} />
          <NewsCard
            news={news}
            sebiUpdates={sebi}
            foBanList={im.foBanList}
            sourceStatus={srcs.news}
            onRefresh={refreshNews}
            refreshing={refreshing}
          />
        </div>
      )}
    </div>
  );
}
