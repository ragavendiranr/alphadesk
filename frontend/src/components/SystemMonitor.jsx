import React from 'react';
import { Server } from 'lucide-react';

export default function SystemMonitor({ health }) {
  if (!health) return null;

  const stats = [
    { label: 'CPU Load',  val: health.cpu,    warn: parseFloat(health.cpu) > 80 },
    { label: 'Memory',    val: health.memory, warn: parseFloat(health.memory) > 85 },
    { label: 'Uptime',    val: `${Math.floor((health.uptime || 0) / 3600)}h ${Math.floor(((health.uptime || 0) % 3600) / 60)}m` },
    { label: 'DB',        val: health.db,     ok: health.db === 'connected' },
    { label: 'ML Engine', val: health.ml,     ok: health.ml === 'online' },
    { label: 'Env',       val: health.nodeEnv },
  ];

  return (
    <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Server size={15} color="#3b82f6" />
        <h3 style={{ color: '#e2e8f0', fontSize: 14 }}>System Monitor</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {stats.map(({ label, val, warn, ok }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: warn ? '#f59e0b' : ok === false ? '#ef4444' : ok === true ? '#22c55e' : '#e2e8f0',
            }}>{val ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
