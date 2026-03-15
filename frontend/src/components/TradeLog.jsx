import React from 'react';
import { formatINR, formatTime, pnlColor } from '../utils/formatters';

export default function TradeLog({ trades = [], title = 'Trade Log' }) {
  return (
    <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
      <h3 style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 12 }}>{title}</h3>
      {trades.length === 0
        ? <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center' }}>No trades yet</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e2d4a' }}>
                  {['Symbol', 'Type', 'Qty', 'Entry', 'Exit', 'P&L', 'Status', 'Time'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: '#64748b', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map(t => (
                  <tr key={t._id} style={{ borderBottom: '1px solid #0f1929' }}>
                    <td style={{ padding: '6px 8px', color: '#e2e8f0', fontWeight: 600 }}>{t.symbol}</td>
                    <td style={{ padding: '6px 8px', color: t.type === 'BUY' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{t.type}</td>
                    <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{t.qty}</td>
                    <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{formatINR(t.entryPrice)}</td>
                    <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{t.exitPrice ? formatINR(t.exitPrice) : '—'}</td>
                    <td style={{ padding: '6px 8px', color: pnlColor(t.netPnl ?? t.pnl), fontWeight: 600 }}>
                      {t.netPnl !== undefined ? formatINR(t.netPnl) : '—'}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <StatusChip status={t.status} />
                    </td>
                    <td style={{ padding: '6px 8px', color: '#64748b' }}>{formatTime(t.entryTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function StatusChip({ status }) {
  const c = {
    OPEN: '#3b82f6', CLOSED: '#22c55e', SL_HIT: '#ef4444',
    TARGET_HIT: '#22c55e', CANCELLED: '#6b7280',
  }[status] || '#94a3b8';
  return (
    <span style={{ fontSize: 10, color: c, border: `1px solid ${c}`, padding: '1px 5px', borderRadius: 3 }}>
      {status}
    </span>
  );
}
