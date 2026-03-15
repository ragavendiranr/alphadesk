import React from 'react';
import { REGIME_COLORS } from '../utils/constants';

export default function RegimePanel({ regime }) {
  const r = regime?.regime || 'UNKNOWN';
  const c = REGIME_COLORS[r] || '#6b7280';

  const strategies = {
    TRENDING_UP:   ['✅ Breakout', '✅ Momentum', '❌ Mean Reversion'],
    TRENDING_DOWN: ['✅ Mean Reversion', '✅ ICT/SMC', '❌ Breakout'],
    RANGING:       ['✅ Mean Reversion', '✅ VWAP Reversal', '❌ Breakout'],
    VOLATILE:      ['✅ ICT/SMC only', '⚠️ 50% position size'],
    UNKNOWN:       ['Analysis pending...'],
  };

  return (
    <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
      <h3 style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 12 }}>Market Regime</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10,
          background: c + '20', border: `2px solid ${c}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {r === 'TRENDING_UP' ? '📈' : r === 'TRENDING_DOWN' ? '📉' : r === 'RANGING' ? '↔️' : r === 'VOLATILE' ? '⚡' : '❓'}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{r.replace('_', ' ')}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {regime?.confidence ? `${regime.confidence}% confidence` : 'Detecting...'}
          </div>
        </div>
      </div>
      <div>
        {(strategies[r] || []).map((s, i) => (
          <div key={i} style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{s}</div>
        ))}
      </div>
    </div>
  );
}
