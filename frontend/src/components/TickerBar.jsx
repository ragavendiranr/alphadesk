import React from 'react';

export default function TickerBar({ ticks = {} }) {
  const symbols = Object.keys(ticks);
  if (!symbols.length) return (
    <div style={{ background: '#0d1526', borderBottom: '1px solid #1e2d4a', height: 32, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
      <span style={{ color: '#334155', fontSize: 11 }}>Waiting for live data...</span>
    </div>
  );

  return (
    <div style={{ background: '#0d1526', borderBottom: '1px solid #1e2d4a', height: 32, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 24, padding: '0 16px', animation: 'scroll 30s linear infinite' }}>
        {symbols.map(sym => {
          const t = ticks[sym];
          const change = t?.change || 0;
          const color  = change >= 0 ? '#22c55e' : '#ef4444';
          return (
            <span key={sym} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              <span style={{ color: '#94a3b8' }}>{sym}: </span>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>₹{t?.ltp?.toFixed(2)}</span>
              <span style={{ color, marginLeft: 4 }}>{change >= 0 ? '+' : ''}{change?.toFixed(2)}%</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
