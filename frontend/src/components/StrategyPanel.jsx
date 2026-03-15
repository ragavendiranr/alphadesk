import React from 'react';
import { formatPct } from '../utils/formatters';

export default function StrategyPanel({ strategies = [] }) {
  return (
    <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
      <h3 style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 12 }}>Strategy Performance</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e2d4a' }}>
              {['Strategy', 'Trades', 'Win%', 'Avg Win', 'Avg Loss', 'PF', 'Sharpe'].map(h => (
                <th key={h} style={{ padding: '4px 8px', color: '#64748b', textAlign: 'left', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.length === 0
              ? <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>No strategy data yet</td></tr>
              : strategies.map(s => (
                <tr key={s.strategy} style={{ borderBottom: '1px solid #0f1929' }}>
                  <td style={{ padding: '6px 8px', color: '#e2e8f0', fontWeight: 600 }}>{s.strategy}</td>
                  <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{s.tradesTotal}</td>
                  <td style={{ padding: '6px 8px', color: Number(s.winRate) >= 50 ? '#22c55e' : '#ef4444' }}>
                    {s.winRate?.toFixed(1)}%
                  </td>
                  <td style={{ padding: '6px 8px', color: '#22c55e' }}>₹{s.avgWin?.toFixed(0)}</td>
                  <td style={{ padding: '6px 8px', color: '#ef4444' }}>₹{s.avgLoss?.toFixed(0)}</td>
                  <td style={{ padding: '6px 8px', color: Number(s.profitFactor) >= 1.5 ? '#22c55e' : '#f59e0b' }}>
                    {s.profitFactor?.toFixed(2)}
                  </td>
                  <td style={{ padding: '6px 8px', color: Number(s.sharpeRatio) >= 1 ? '#22c55e' : '#94a3b8' }}>
                    {s.sharpeRatio?.toFixed(2)}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
