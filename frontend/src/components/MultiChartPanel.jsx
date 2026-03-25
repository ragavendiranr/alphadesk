import React, { useState, useEffect, useCallback } from 'react';
import TradingViewChart from './TradingViewChart';

// ── Market definitions ────────────────────────────────────────────────────────
const MARKETS = {
  NSE: {
    label:   'NSE',
    icon:    '🇮🇳',
    color:   '#f97316',
    bg:      '#431407',
    timezone: 'Asia/Kolkata',
    tag:     'Indian Equities',
    symbols: [
      { label: 'NIFTY 50',   tv: 'NSE:NIFTY50'   },
      { label: 'BANKNIFTY',  tv: 'NSE:BANKNIFTY'  },
      { label: 'FINNIFTY',   tv: 'NSE:FINNIFTY'   },
      { label: 'RELIANCE',   tv: 'NSE:RELIANCE'   },
      { label: 'TCS',        tv: 'NSE:TCS'        },
      { label: 'HDFCBANK',   tv: 'NSE:HDFCBANK'   },
      { label: 'INFY',       tv: 'NSE:INFY'       },
      { label: 'ICICIBANK',  tv: 'NSE:ICICIBANK'  },
      { label: 'SBIN',       tv: 'NSE:SBIN'       },
      { label: 'MARUTI',     tv: 'NSE:MARUTI'     },
      { label: 'BHARTIARTL', tv: 'NSE:BHARTIARTL' },
      { label: 'BAJFINANCE', tv: 'NSE:BAJFINANCE' },
    ],
    defaults: ['NSE:NIFTY50', 'NSE:BANKNIFTY', 'NSE:RELIANCE', 'NSE:HDFCBANK'],
    defaultInterval: '5',
  },
  Crypto: {
    label:   'Crypto',
    icon:    '₿',
    color:   '#f59e0b',
    bg:      '#451a03',
    timezone: 'UTC',
    tag:     'Digital Assets',
    symbols: [
      { label: 'BTC/USDT',  tv: 'BINANCE:BTCUSDT'  },
      { label: 'ETH/USDT',  tv: 'BINANCE:ETHUSDT'  },
      { label: 'BNB/USDT',  tv: 'BINANCE:BNBUSDT'  },
      { label: 'SOL/USDT',  tv: 'BINANCE:SOLUSDT'  },
      { label: 'XRP/USDT',  tv: 'BINANCE:XRPUSDT'  },
      { label: 'ADA/USDT',  tv: 'BINANCE:ADAUSDT'  },
      { label: 'AVAX/USDT', tv: 'BINANCE:AVAXUSDT' },
      { label: 'DOGE/USDT', tv: 'BINANCE:DOGEUSDT' },
      { label: 'DOT/USDT',  tv: 'BINANCE:DOTUSDT'  },
      { label: 'MATIC',     tv: 'BINANCE:MATICUSDT' },
    ],
    defaults: ['BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT', 'BINANCE:BNBUSDT'],
    defaultInterval: '15',
  },
  Forex: {
    label:   'Forex',
    icon:    '💱',
    color:   '#22c55e',
    bg:      '#052e16',
    timezone: 'UTC',
    tag:     'Currency Pairs',
    symbols: [
      { label: 'EUR/USD', tv: 'FX:EURUSD' },
      { label: 'GBP/USD', tv: 'FX:GBPUSD' },
      { label: 'USD/JPY', tv: 'FX:USDJPY' },
      { label: 'AUD/USD', tv: 'FX:AUDUSD' },
      { label: 'USD/CHF', tv: 'FX:USDCHF' },
      { label: 'USD/CAD', tv: 'FX:USDCAD' },
      { label: 'NZD/USD', tv: 'FX:NZDUSD' },
      { label: 'EUR/GBP', tv: 'FX:EURGBP' },
      { label: 'EUR/JPY', tv: 'FX:EURJPY' },
      { label: 'GBP/JPY', tv: 'FX:GBPJPY' },
    ],
    defaults: ['FX:EURUSD', 'FX:GBPUSD', 'FX:USDJPY', 'FX:AUDUSD'],
    defaultInterval: '30',
  },
};

// ── Layout presets ────────────────────────────────────────────────────────────
const LAYOUTS = [
  { id: '1x1', label: '▣',    title: '1 chart',  cols: 1, count: 1 },
  { id: '1x2', label: '▣▣',   title: '2 charts', cols: 2, count: 2 },
  { id: '2x2', label: '⊞',    title: '4 charts', cols: 2, count: 4 },
  { id: '2x3', label: '⊟⊟⊟',  title: '6 charts', cols: 3, count: 6 },
];

const STORAGE_KEY = 'alphadesk_chart_config';

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch { return null; }
}

function buildSlots(market, count) {
  const m = MARKETS[market];
  return Array.from({ length: count }, (_, i) => ({
    id:     `${market}-${i}-${Date.now()}`,
    symbol: m.defaults[i] || m.defaults[0],
  }));
}

export default function MultiChartPanel({ initialMarket = 'NSE' }) {
  const saved = loadSaved();

  const [market,    setMarket]  = useState(saved?.market  || initialMarket);
  const [layoutId,  setLayout]  = useState(saved?.layoutId || '2x2');
  const [slots,     setSlots]   = useState(() => {
    if (saved?.market === (saved?.market || initialMarket) && saved?.slots?.length) {
      return saved.slots;
    }
    const lay = LAYOUTS.find(l => l.id === (saved?.layoutId || '2x2'));
    return buildSlots(saved?.market || initialMarket, lay?.count || 4);
  });

  const layout = LAYOUTS.find(l => l.id === layoutId) || LAYOUTS[2];
  const mktCfg = MARKETS[market];

  // Persist to localStorage on every state change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ market, layoutId, slots }));
  }, [market, layoutId, slots]);

  // Switch market: rebuild all slots with new defaults
  const switchMarket = useCallback((newMarket) => {
    if (newMarket === market) return;
    setMarket(newMarket);
    setSlots(buildSlots(newMarket, layout.count));
  }, [market, layout.count]);

  // Switch layout: resize slots array, keep existing symbols where possible
  const switchLayout = useCallback((newLayoutId) => {
    const newLay = LAYOUTS.find(l => l.id === newLayoutId);
    if (!newLay) return;
    setLayout(newLayoutId);
    setSlots(prev => {
      if (prev.length >= newLay.count) return prev.slice(0, newLay.count);
      const extra = buildSlots(market, newLay.count).slice(prev.length);
      return [...prev, ...extra];
    });
  }, [market]);

  // Update one slot's symbol
  const updateSymbol = useCallback((idx, symbol) => {
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, symbol } : s));
  }, []);

  // Remove a slot
  const removeSlot = useCallback((idx) => {
    setSlots(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // Add a chart slot
  const addSlot = useCallback(() => {
    if (slots.length >= 6) return;
    const newSymbol = mktCfg.defaults[slots.length % mktCfg.defaults.length];
    setSlots(prev => [
      ...prev,
      { id: `${market}-${prev.length}-${Date.now()}`, symbol: newSymbol },
    ]);
    // Expand layout if needed
    if (slots.length >= layout.count) {
      const bigger = LAYOUTS.find(l => l.count > slots.length);
      if (bigger) setLayout(bigger.id);
    }
  }, [slots, market, mktCfg, layout]);

  const cols      = Math.max(1, Math.min(layout.cols, slots.length));
  const chartH    = slots.length <= 1 ? 'calc(100vh - 180px)'
                  : slots.length <= 2 ? 'calc(50vh - 80px)'
                  : 'calc(48vh - 80px)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 'calc(100vh - 120px)' }}>

      {/* ── Top bar: market switcher + layout + add ────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '10px 14px',
        background: '#0a0e1a',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
      }}>

        {/* Market switcher */}
        <span style={{ fontSize: 11, color: '#475569', fontWeight: 700, letterSpacing: 1 }}>MARKET</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(MARKETS).map(([key, m]) => {
            const active = market === key;
            return (
              <button key={key} onClick={() => switchMarket(key)} style={{
                display:      'flex',
                alignItems:   'center',
                gap:          5,
                background:   active ? m.bg : 'transparent',
                color:        active ? m.color : '#475569',
                border:       `1px solid ${active ? m.color + '66' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 6,
                padding:      '5px 12px',
                cursor:       'pointer',
                fontSize:     12,
                fontWeight:   active ? 700 : 400,
                transition:   'all 0.2s',
              }}>
                <span style={{ fontSize: 14 }}>{m.icon}</span>
                <span>{m.label}</span>
                {active && (
                  <span style={{
                    fontSize: 9, color: m.color, background: m.color + '22',
                    borderRadius: 3, padding: '1px 4px', fontWeight: 600,
                  }}>{m.tag}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.07)' }} />

        {/* Layout selector */}
        <span style={{ fontSize: 11, color: '#475569', fontWeight: 700, letterSpacing: 1 }}>LAYOUT</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {LAYOUTS.map(l => (
            <button key={l.id} onClick={() => switchLayout(l.id)} title={l.title} style={{
              background:   layoutId === l.id ? '#1e3a5f' : 'transparent',
              color:        layoutId === l.id ? '#3b82f6' : '#475569',
              border:       `1px solid ${layoutId === l.id ? '#3b82f6' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
              fontSize: 13, fontFamily: 'monospace',
              transition: 'all 0.15s',
            }}>{l.label}</button>
          ))}
        </div>

        {/* Add chart button */}
        {slots.length < 6 && (
          <button onClick={addSlot} style={{
            background: 'transparent',
            color: '#00d4aa',
            border: '1px solid #00d4aa44',
            borderRadius: 5, padding: '4px 10px',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>+ Add Chart</button>
        )}

        {/* Right side: chart count + session info */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#475569' }}>
            {slots.length} chart{slots.length !== 1 ? 's' : ''}
          </span>
          <MarketSessionBadge market={market} cfg={mktCfg} />
        </div>
      </div>

      {/* ── Chart grid ────────────────────────────────────────────────────── */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap:                 8,
        flex:                1,
      }}>
        {slots.map((slot, idx) => (
          <div key={slot.id} style={{ height: chartH, minHeight: 280 }}>
            <TradingViewChart
              symbol={slot.symbol}
              defaultInterval={mktCfg.defaultInterval}
              timezone={mktCfg.timezone}
              symbols={mktCfg.symbols}
              onSymbolChange={(sym) => updateSymbol(idx, sym)}
              removable={slots.length > 1}
              onRemove={() => removeSlot(idx)}
              index={idx}
            />
          </div>
        ))}
      </div>

      {/* ── Market info footer ────────────────────────────────────────────── */}
      <MarketInfoBar market={market} cfg={mktCfg} />
    </div>
  );
}

// ── Market session badge ──────────────────────────────────────────────────────
function MarketSessionBadge({ market, cfg }) {
  const [status, setStatus] = useState('');

  useEffect(() => {
    function calc() {
      const now = new Date();
      if (market === 'NSE') {
        const istMs   = Date.now() + (5.5 * 3600 * 1000);
        const ist     = new Date(istMs);
        const h = ist.getUTCHours(), m = ist.getUTCMinutes(), d = ist.getUTCDay();
        const mins    = h * 60 + m;
        if (d === 0 || d === 6) { setStatus('WEEKEND'); return; }
        if (mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30) { setStatus('OPEN'); return; }
        if (mins >= 9 * 60 && mins < 9 * 60 + 15) { setStatus('PRE-OPEN'); return; }
        setStatus('CLOSED');
      } else if (market === 'Crypto') {
        setStatus('24/7');
      } else {
        const day = now.getUTCDay();
        setStatus(day === 0 || day === 6 ? 'CLOSED' : 'OPEN');
      }
    }
    calc();
    const id = setInterval(calc, 30_000);
    return () => clearInterval(id);
  }, [market]);

  const color = status === 'OPEN' || status === '24/7' ? '#22c55e'
              : status === 'PRE-OPEN' ? '#f59e0b' : '#ef4444';
  const pulse = status === 'OPEN' || status === '24/7';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ position: 'relative', width: 7, height: 7 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
        {pulse && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 7, height: 7,
            borderRadius: '50%', background: color, opacity: 0.5,
            animation: 'sessionPulse 1.5s ease-in-out infinite',
          }} />
        )}
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{status}</span>
      <style>{`@keyframes sessionPulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(2.5);opacity:0}}`}</style>
    </div>
  );
}

// ── Bottom info bar per market ────────────────────────────────────────────────
function MarketInfoBar({ market, cfg }) {
  const info = {
    NSE:    { hours: 'Mon–Fri  9:15 AM – 3:30 PM IST', note: 'NSE Equities · F&O · Currency', source: 'Kite Connect + Twelve Data' },
    Crypto: { hours: '24 / 7 / 365', note: 'Binance · Bybit · Coinbase data via TradingView', source: 'BINANCE / FTX feeds' },
    Forex:  { hours: 'Mon–Fri  24h (Sydney → New York)',  note: 'Major · Minor · Exotic pairs',    source: 'FXCM / OANDA via TradingView' },
  }[market];

  return (
    <div style={{
      display: 'flex', gap: 20, flexWrap: 'wrap',
      padding: '8px 14px',
      background: '#0a0e1a',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 8, fontSize: 11,
    }}>
      <span style={{ color: cfg.color, fontWeight: 700 }}>{cfg.icon} {cfg.label} — {cfg.tag}</span>
      <span style={{ color: '#475569' }}>🕐 {info.hours}</span>
      <span style={{ color: '#475569' }}>📡 {info.source}</span>
      <span style={{ color: '#334155', marginLeft: 'auto' }}>{info.note}</span>
    </div>
  );
}
