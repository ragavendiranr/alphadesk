import React from 'react';

export default function GreeksPanel({ positions = [] }) {
  const optionPositions = positions.filter(p => p.strategy === 'OPTIONS_MOMENTUM');

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>Options Greeks</h2>
      {optionPositions.length === 0
        ? <p style={{ color: '#64748b' }}>No open options positions.</p>
        : optionPositions.map(p => (
          <div key={p._id} style={{ background: '#0d1526', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid #1e2d4a' }}>
            <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>{p.symbol}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {[
                { greek: 'Delta', val: p.greeks?.delta?.toFixed(3) || '—', color: '#3b82f6' },
                { greek: 'Gamma', val: p.greeks?.gamma?.toFixed(4) || '—', color: '#22c55e' },
                { greek: 'Theta', val: p.greeks?.theta?.toFixed(2) || '—', color: '#ef4444' },
                { greek: 'Vega',  val: p.greeks?.vega?.toFixed(3) || '—',  color: '#f59e0b' },
                { greek: 'IV',    val: p.greeks?.iv ? `${p.greeks.iv?.toFixed(1)}%` : '—', color: '#a855f7' },
              ].map(({ greek, val, color }) => (
                <div key={greek} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{greek}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      }
    </div>
  );
}
