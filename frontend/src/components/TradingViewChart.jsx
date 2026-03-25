import React, { useEffect, useRef, useState } from 'react';

const INTERVALS = [
  { label: '1m',  value: '1'  },
  { label: '5m',  value: '5'  },
  { label: '15m', value: '15' },
  { label: '30m', value: '30' },
  { label: '1H',  value: '60' },
  { label: '4H',  value: '240'},
  { label: '1D',  value: 'D'  },
  { label: '1W',  value: 'W'  },
];

const STUDIES_PRESETS = {
  'RSI+MACD':    ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
  'BB+RSI':      ['BB@tv-basicstudies', 'RSI@tv-basicstudies'],
  'EMA+VWAP':    ['MASimple@tv-basicstudies', 'VWAP@tv-basicstudies'],
  'Volume+OBV':  ['Volume@tv-basicstudies', 'OBV@tv-basicstudies'],
};

export default function TradingViewChart({
  symbol,           // controlled: current symbol string (e.g. 'NSE:NIFTY50')
  defaultInterval = '5',
  timezone = 'Asia/Kolkata',
  symbols = [],     // list of { label, tv } for the quick-pick bar
  onSymbolChange,   // called when user picks a different symbol
  removable = false,
  onRemove,
  index = 0,        // chart slot number (shown in corner)
}) {
  const containerRef  = useRef(null);
  const [interval,    setIntervalState] = useState(defaultInterval);
  const [studies,     setStudies]       = useState('RSI+MACD');
  const [expanded,    setExpanded]      = useState(false);
  const [showStudies, setShowStudies]   = useState(false);

  // Re-render widget whenever symbol, interval, or studies change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';

    const script  = document.createElement('script');
    script.src    = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async  = true;
    script.innerHTML = JSON.stringify({
      autosize:          true,
      symbol,
      interval,
      timezone,
      theme:             'dark',
      style:             '1',
      locale:            'en',
      backgroundColor:   'rgba(6, 13, 26, 1)',
      gridColor:         'rgba(30, 45, 74, 0.3)',
      hide_top_toolbar:  false,
      hide_legend:       false,
      save_image:        true,
      allow_symbol_change: true,
      withdateranges:    true,
      show_popup_button: true,
      popup_width:       '1200',
      popup_height:      '700',
      studies:           STUDIES_PRESETS[studies] || STUDIES_PRESETS['RSI+MACD'],
    });

    el.appendChild(script);
    return () => { if (containerRef.current) containerRef.current.innerHTML = ''; };
  }, [symbol, interval, timezone, studies]);

  const accentColor = '#00d4aa';
  const borderColor = 'rgba(255,255,255,0.07)';

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      background:    '#0d1117',
      border:        `1px solid ${borderColor}`,
      borderRadius:  8,
      overflow:      'hidden',
      position:      expanded ? 'fixed' : 'relative',
      top:           expanded ? 0 : 'auto',
      left:          expanded ? 0 : 'auto',
      width:         expanded ? '100vw' : '100%',
      height:        expanded ? '100vh' : '100%',
      zIndex:        expanded ? 999 : 'auto',
    }}>

      {/* ── Top control bar ────────────────────────────────────────────────── */}
      <div style={{
        display:         'flex',
        alignItems:      'center',
        gap:             4,
        padding:         '4px 8px',
        background:      '#0a0e1a',
        borderBottom:    `1px solid ${borderColor}`,
        flexWrap:        'wrap',
        minHeight:       34,
      }}>
        {/* Chart index badge */}
        <span style={{
          fontSize: 10, color: '#475569', fontWeight: 700,
          background: '#1e2d4a', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
        }}>#{index + 1}</span>

        {/* Symbol quick-select */}
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {symbols.slice(0, 6).map(s => {
            const active = symbol === s.tv;
            return (
              <button key={s.tv} onClick={() => onSymbolChange?.(s.tv)} style={{
                background:   active ? '#1e3a2f' : 'transparent',
                color:        active ? accentColor : '#64748b',
                border:       `1px solid ${active ? accentColor + '55' : 'transparent'}`,
                borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                fontSize: 10, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}>{s.label}</button>
            );
          })}
        </div>

        {/* Interval selector */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {INTERVALS.map(iv => (
            <button key={iv.value} onClick={() => setIntervalState(iv.value)} style={{
              background:   interval === iv.value ? '#1e3a2f' : 'transparent',
              color:        interval === iv.value ? accentColor : '#475569',
              border:       `1px solid ${interval === iv.value ? accentColor + '44' : 'transparent'}`,
              borderRadius: 3, padding: '2px 5px', cursor: 'pointer',
              fontSize: 10, fontWeight: interval === iv.value ? 700 : 400,
              transition: 'all 0.15s',
            }}>{iv.label}</button>
          ))}
        </div>

        {/* Studies selector */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setShowStudies(p => !p)} style={{
            background: showStudies ? '#1e3a5f' : 'transparent',
            color: '#475569', border: '1px solid transparent',
            borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 10,
          }}>📊 {studies}</button>
          {showStudies && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 50,
              background: '#111827', border: '1px solid #1e2d4a', borderRadius: 6,
              padding: 4, minWidth: 110,
            }}>
              {Object.keys(STUDIES_PRESETS).map(k => (
                <button key={k} onClick={() => { setStudies(k); setShowStudies(false); }} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: studies === k ? '#1e3a2f' : 'transparent',
                  color: studies === k ? accentColor : '#94a3b8',
                  border: 'none', borderRadius: 4, padding: '4px 8px',
                  cursor: 'pointer', fontSize: 11,
                }}>{k}</button>
              ))}
            </div>
          )}
        </div>

        {/* Expand / Remove */}
        <button onClick={() => setExpanded(p => !p)} title={expanded ? 'Restore' : 'Fullscreen'} style={{
          background: 'transparent', color: '#475569', border: 'none',
          cursor: 'pointer', fontSize: 13, padding: '0 3px', flexShrink: 0,
        }}>{expanded ? '⤡' : '⤢'}</button>

        {removable && (
          <button onClick={onRemove} title="Remove chart" style={{
            background: 'transparent', color: '#ef4444', border: 'none',
            cursor: 'pointer', fontSize: 13, padding: '0 3px', flexShrink: 0,
          }}>✕</button>
        )}
      </div>

      {/* ── TradingView widget ──────────────────────────────────────────────── */}
      <div
        className="tradingview-widget-container"
        ref={containerRef}
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  );
}
