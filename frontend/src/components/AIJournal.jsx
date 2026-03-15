import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BookOpen } from 'lucide-react';
import { formatDate, pnlColor, formatINR } from '../utils/formatters';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('alphadesk_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

export default function AIJournal() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    api.get('/api/trades?status=CLOSED&limit=20')
      .then(r => setEntries(r.data.trades || []))
      .catch(() => {});
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BookOpen size={18} color="#3b82f6" />
        <h2 style={{ color: '#e2e8f0' }}>AI Trade Journal</h2>
      </div>

      {entries.length === 0
        ? <p style={{ color: '#64748b' }}>No completed trades yet.</p>
        : entries.map(t => (
          <div key={t._id} style={{
            background: '#0d1526', borderRadius: 10, padding: 16, marginBottom: 12,
            border: `1px solid ${t.pnl >= 0 ? '#166534' : '#7f1d1d'}`,
            borderLeft: `3px solid ${pnlColor(t.pnl)}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{t.symbol} {t.type}</span>
              <span style={{ fontWeight: 700, color: pnlColor(t.netPnl ?? t.pnl) }}>
                {formatINR(t.netPnl ?? t.pnl)}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11, color: '#94a3b8' }}>
              <span>Entry: {formatINR(t.entryPrice)}</span>
              <span>Exit: {formatINR(t.exitPrice)}</span>
              <span>Status: {t.status}</span>
              <span>Strategy: {t.strategy}</span>
              <span>Duration: {t.durationMin}m</span>
              <span>R: {t.rMultiple?.toFixed(2)}R</span>
            </div>
            {t.notes && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                📝 {t.notes}
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 10, color: '#475569' }}>{formatDate(t.entryTime)}</div>
          </div>
        ))
      }
    </div>
  );
}
