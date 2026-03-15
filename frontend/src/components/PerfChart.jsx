import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function PerfChart({ data = [], title = 'Equity Curve' }) {
  if (!data.length) {
    return (
      <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#64748b', fontSize: 13 }}>No equity data yet</span>
      </div>
    );
  }

  const initial = data[0]?.equity || 0;
  const current = data[data.length - 1]?.equity || 0;
  const pnl     = current - initial;
  const pnlPct  = initial ? (pnl / initial * 100) : 0;

  return (
    <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 14 }}>{title}</h3>
        <span style={{ fontSize: 14, fontWeight: 700, color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
          {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(0)} ({pnlPct.toFixed(1)}%)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <XAxis dataKey="date" hide />
          <YAxis domain={['auto', 'auto']} hide />
          <Tooltip
            formatter={(v) => [`₹${Number(v).toFixed(2)}`, 'Equity']}
            contentStyle={{ background: '#1a2035', border: '1px solid #2d3a5a', borderRadius: 6, fontSize: 12 }}
          />
          <ReferenceLine y={initial} stroke="#2d3a5a" strokeDasharray="4 4" />
          <Line
            type="monotone" dataKey="equity" stroke={pnl >= 0 ? '#22c55e' : '#ef4444'}
            dot={false} strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
