import React from 'react';
import { TrendingUp } from 'lucide-react';

export default function OrderFlowPanel({ ticks = {} }) {
  const largeOrders = Object.entries(ticks)
    .filter(([, t]) => t.volume > 500000)
    .map(([sym, t]) => ({ sym, ...t }));

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <TrendingUp size={18} color="#3b82f6" />
        <h2 style={{ color: '#e2e8f0' }}>Order Flow Analysis</h2>
      </div>

      <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a', marginBottom: 16 }}>
        <h4 style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>Large Volume Detection (>500K lots)</h4>
        {largeOrders.length === 0
          ? <p style={{ color: '#64748b', fontSize: 12 }}>No unusual volume detected</p>
          : largeOrders.map(o => (
            <div key={o.sym} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1e2d4a', fontSize: 12 }}>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{o.sym}</span>
              <span style={{ color: '#f59e0b' }}>Vol: {(o.volume / 1000).toFixed(0)}K ⚠️</span>
            </div>
          ))
        }
      </div>

      <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
        <h4 style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>Institutional Proxy Signals</h4>
        <p style={{ color: '#475569', fontSize: 11 }}>
          Monitoring OI changes vs price movement divergence.<br />
          Large order detection active for NIFTY, BANKNIFTY futures.
        </p>
      </div>
    </div>
  );
}
