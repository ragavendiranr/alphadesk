import React, { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff } from 'lucide-react';

export default function Header({ connected, systemHealth, systemStatus }) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dbOk = systemHealth?.db === 'connected';
  const beOk = systemHealth?.status === 'ok';

  const mktStatus  = systemStatus?.marketStatus  || 'CLOSED';
  const botStatus  = systemStatus?.botStatus     || 'IDLE';
  const sigStatus  = systemStatus?.signalEngineStatus || 'PAUSED';

  const mktColor = { OPEN: '#22c55e', 'PRE-OPEN': '#f59e0b', 'POST-CLOSE': '#94a3b8', CLOSED: '#ef4444' };
  const sigColor = sigStatus === 'ACTIVE' ? '#22c55e' : '#64748b';

  return (
    <header style={{
      background: '#0d1526', borderBottom: '1px solid #1e2d4a',
      padding: '0 16px', height: 52, display: 'flex',
      alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Activity size={18} color="#3b82f6" />
        <span style={{ fontWeight: 700, fontSize: 17, color: '#e2e8f0', letterSpacing: 1 }}>
          ALPHA<span style={{ color: '#3b82f6' }}>DESK</span>
        </span>
        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 2 }}>NSE Algo</span>
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>

        {/* Market Status */}
        <StatusChip
          label="MARKET"
          value={mktStatus}
          color={mktColor[mktStatus] || '#64748b'}
          pulse={mktStatus === 'OPEN'}
        />

        {/* Bot Status */}
        <StatusChip
          label="BOT"
          value={botStatus}
          color={botStatus === 'MONITORING' ? '#22c55e' : botStatus === 'PRE-MARKET' ? '#f59e0b' : '#64748b'}
        />

        {/* Signal Engine */}
        <StatusChip
          label="SIGNALS"
          value={sigStatus}
          color={sigColor}
          pulse={sigStatus === 'ACTIVE'}
        />

        {/* Signals today */}
        {systemStatus?.signalStats && (
          <div style={{ fontSize: 11, color: '#94a3b8', background: '#1a2035', borderRadius: 4, padding: '2px 8px', border: '1px solid #2d3a5a' }}>
            {systemStatus.signalStats.total} signals today
          </div>
        )}
      </div>

      {/* Right: dots + ws + clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <StatusDot label="API" ok={beOk} />
        <StatusDot label="DB"  ok={dbOk} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {connected
            ? <><Wifi size={13} color="#22c55e" /><span style={{ fontSize: 11, color: '#22c55e' }}>LIVE</span></>
            : <><WifiOff size={13} color="#ef4444" /><span style={{ fontSize: 11, color: '#ef4444' }}>OFFLINE</span></>
          }
        </div>
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 64 }}>{clock} IST</span>
      </div>
    </header>
  );
}

function StatusChip({ label, value, color, pulse }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: '#111827', borderRadius: 5, padding: '3px 8px',
      border: `1px solid ${color}33`,
    }}>
      <div style={{ position: 'relative', width: 7, height: 7 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
        {pulse && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 7, height: 7,
            borderRadius: '50%', background: color, opacity: 0.5,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        )}
      </div>
      <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}</span>
      <style>{`@keyframes pulse { 0%,100%{transform:scale(1);opacity:.5} 50%{transform:scale(2.2);opacity:0} }`}</style>
    </div>
  );
}

function StatusDot({ label, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444' }} />
      <span style={{ fontSize: 10, color: '#94a3b8' }}>{label}</span>
    </div>
  );
}
