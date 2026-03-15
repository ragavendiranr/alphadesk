import React, { useState } from 'react';
import axios from 'axios';
import { CheckCircle, XCircle, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { formatINR, formatPct, confidenceColor } from '../utils/formatters';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('alphadesk_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

export default function SignalCard({ signal, onAction }) {
  const [loading, setLoading] = useState(false);

  const approve = async () => {
    setLoading(true);
    try {
      await api.post(`/api/signals/${signal._id}/approve`);
      onAction?.('approved', signal._id);
    } catch (e) {
      alert(e.response?.data?.error || 'Error approving signal');
    }
    setLoading(false);
  };

  const reject = async () => {
    setLoading(true);
    try {
      await api.post(`/api/signals/${signal._id}/reject`);
      onAction?.('rejected', signal._id);
    } catch {}
    setLoading(false);
  };

  const isBuy    = signal.type === 'BUY';
  const rr       = signal.riskReward || 0;
  const conf     = signal.confidence || 0;
  const isPending = signal.status === 'PENDING';

  return (
    <div style={{
      background: '#0d1526', border: `1px solid ${isBuy ? '#166534' : '#7f1d1d'}`,
      borderRadius: 10, padding: 16, marginBottom: 12,
      borderLeft: `3px solid ${isBuy ? '#22c55e' : '#ef4444'}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isBuy ? <TrendingUp size={16} color="#22c55e" /> : <TrendingDown size={16} color="#ef4444" />}
          <span style={{ fontWeight: 700, fontSize: 15, color: '#e2e8f0' }}>{signal.symbol}</span>
          <span style={{
            background: isBuy ? '#14532d' : '#7f1d1d', color: isBuy ? '#22c55e' : '#ef4444',
            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
          }}>{signal.type}</span>
          <span style={{ color: '#64748b', fontSize: 11 }}>{signal.strategy}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: confidenceColor(conf), fontWeight: 700 }}>{conf}%</span>
          {signal.rlAgree && <span style={{ fontSize: 10, color: '#3b82f6', background: '#1e3a5f', padding: '1px 5px', borderRadius: 3 }}>RL ✓</span>}
          <StatusBadge status={signal.status} />
        </div>
      </div>

      {/* Levels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'Entry',     val: signal.entry,    color: '#e2e8f0' },
          { label: 'Stoploss',  val: signal.stoploss, color: '#ef4444' },
          { label: 'Target 1',  val: signal.target1,  color: '#22c55e' },
          { label: 'R:R',       val: `${rr.toFixed(2)}:1`, color: '#f59e0b', raw: true },
        ].map(({ label, val, color, raw }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color }}>{raw ? val : formatINR(val)}</div>
          </div>
        ))}
      </div>

      {/* Reasons */}
      {signal.reasons?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {signal.reasons.slice(0, 3).map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>• {r}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={approve}
            disabled={loading}
            style={{
              flex: 1, background: '#166534', color: '#22c55e', border: '1px solid #22c55e',
              borderRadius: 6, padding: '7px 0', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <CheckCircle size={13} /> APPROVE & EXECUTE
          </button>
          <button
            onClick={reject}
            disabled={loading}
            style={{
              flex: 1, background: '#7f1d1d', color: '#ef4444', border: '1px solid #ef4444',
              borderRadius: 6, padding: '7px 0', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <XCircle size={13} /> REJECT
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    PENDING:  '#f59e0b', APPROVED: '#3b82f6', EXECUTED: '#22c55e',
    REJECTED: '#ef4444', EXPIRED: '#6b7280',
  };
  return (
    <span style={{
      fontSize: 10, color: colors[status] || '#94a3b8',
      border: `1px solid ${colors[status] || '#94a3b8'}`,
      padding: '1px 6px', borderRadius: 3,
    }}>
      {status}
    </span>
  );
}
