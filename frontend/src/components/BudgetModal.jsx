import React, { useState } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('alphadesk_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

export default function BudgetModal({ onClose, currentCapital }) {
  const [amount, setAmount] = useState(currentCapital || 10000);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!amount || amount <= 0) return;
    setSaving(true);
    try {
      await api.patch('/api/risk/budget', { capital: Number(amount) });
      onClose?.();
    } catch (e) {
      alert(e.response?.data?.error || 'Error saving budget');
    }
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 12,
        padding: 24, width: 340,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 16 }}>Set Daily Capital</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={18} />
          </button>
        </div>

        <label style={{ color: '#94a3b8', fontSize: 12 }}>Capital Amount (₹)</label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{
            width: '100%', background: '#1a2035', border: '1px solid #2d3a5a',
            borderRadius: 6, padding: '10px 12px', color: '#e2e8f0', fontSize: 15,
            marginTop: 6, marginBottom: 12, outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[10000, 25000, 50000, 100000].map(v => (
            <button key={v} onClick={() => setAmount(v)} style={{
              flex: 1, background: amount === v ? '#1e3a5f' : '#0d1526',
              border: `1px solid ${amount === v ? '#3b82f6' : '#2d3a5a'}`,
              color: amount === v ? '#3b82f6' : '#94a3b8', borderRadius: 6,
              padding: '6px 0', cursor: 'pointer', fontSize: 11,
            }}>
              ₹{(v / 1000).toFixed(0)}K
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>
          Risk per trade: 1% = ₹{Math.round(Number(amount) * 0.01).toLocaleString()}<br />
          Daily loss limit: 1.5% = ₹{Math.round(Number(amount) * 0.015).toLocaleString()}
        </div>

        <button
          onClick={save} disabled={saving}
          style={{
            width: '100%', background: '#1e3a5f', color: '#3b82f6',
            border: '1px solid #3b82f6', borderRadius: 8, padding: '10px 0',
            cursor: 'pointer', fontWeight: 600, fontSize: 14,
          }}
        >
          {saving ? 'Saving...' : 'Save Budget'}
        </button>
      </div>
    </div>
  );
}
