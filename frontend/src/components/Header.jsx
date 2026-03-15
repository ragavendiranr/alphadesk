import React from 'react';
import { Activity, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

export default function Header({ connected, systemHealth }) {
  const dbOk  = systemHealth?.db  === 'connected';
  const mlOk  = systemHealth?.ml  === 'online';
  const beOk  = systemHealth?.status === 'ok';

  return (
    <header style={{
      background: '#0d1526', borderBottom: '1px solid #1e2d4a',
      padding: '0 20px', height: 52, display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Activity size={20} color="#3b82f6" />
        <span style={{ fontWeight: 700, fontSize: 18, color: '#e2e8f0', letterSpacing: 1 }}>
          ALPHA<span style={{ color: '#3b82f6' }}>DESK</span>
        </span>
        <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>NSE Algo Trading</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <StatusDot label="API"  ok={beOk}  />
        <StatusDot label="DB"   ok={dbOk}  />
        <StatusDot label="ML"   ok={mlOk}  />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {connected
            ? <><Wifi size={14} color="#22c55e" /><span style={{ fontSize: 12, color: '#22c55e' }}>LIVE</span></>
            : <><WifiOff size={14} color="#ef4444" /><span style={{ fontSize: 12, color: '#ef4444' }}>OFFLINE</span></>
          }
        </div>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    </header>
  );
}

function StatusDot({ label, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444' }} />
      <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
    </div>
  );
}
