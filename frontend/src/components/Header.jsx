import React, { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff, Shield } from 'lucide-react';
import useMarketStatus from '../hooks/useMarketStatus';

export default function Header({ connected, systemHealth, systemStatus, fullHealth, alertCount }) {
  const [clock, setClock] = useState('');
  const market = useMarketStatus();   // always correct from IST clock

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
  const mlOk = systemHealth?.ml === 'online';
  const beOk = systemHealth?.status === 'ok';

  // Market status — use hook (client-side IST) as source of truth
  // Map PRE_OPEN → PRE-OPEN for display, fall back to API value if available
  const rawMkt = systemStatus?.marketStatus || market.status;
  const mktDisplay = rawMkt === 'PRE_OPEN' ? 'PRE-OPEN' : rawMkt;
  const isMarketOpen = market.is_open;

  // Bot status — derive from market when API hasn't loaded yet
  const botFromApi = systemStatus?.botStatus;
  let botStatus;
  if (botFromApi) {
    botStatus = botFromApi;
  } else if (market.status === 'OPEN') {
    botStatus = 'MONITORING';
  } else if (market.status === 'PRE_OPEN') {
    botStatus = 'PRE-MARKET';
  } else {
    botStatus = 'IDLE';
  }

  const sigStatus = systemStatus?.signalEngineStatus || (isMarketOpen ? 'ACTIVE' : 'PAUSED');

  const mktColor = {
    'OPEN':       '#22c55e',
    'PRE-OPEN':   '#f59e0b',
    'POST-CLOSE': '#94a3b8',
    'CLOSED':     '#ef4444',
  };
  const sigColor = sigStatus === 'ACTIVE' ? '#22c55e' : '#64748b';

  const lastCheckTime = fullHealth?.lastCheck
    ? new Date(fullHealth.lastCheck).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit',
      })
    : null;

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
          value={mktDisplay}
          color={mktColor[mktDisplay] || '#64748b'}
          pulse={mktDisplay === 'OPEN'}
        />

        {/* Bot Status */}
        <StatusChip
          label="BOT"
          value={botStatus}
          color={botStatus === 'MONITORING' ? '#22c55e' : botStatus === 'PRE-MARKET' ? '#f59e0b' : '#64748b'}
          pulse={botStatus === 'MONITORING'}
        />

        {/* Signal Engine */}
        <StatusChip
          label="SIGNALS"
          value={sigStatus}
          color={sigColor}
          pulse={sigStatus === 'ACTIVE'}
        />

        {/* System Monitor */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: '#0a1628', borderRadius: 5, padding: '3px 8px',
          border: '1px solid #1e3a5f',
        }}>
          <Shield size={10} color="#3b82f6" />
          <span style={{ fontSize: 9, color: '#3b82f6', fontWeight: 700 }}>MONITOR</span>
          {lastCheckTime && (
            <span style={{ fontSize: 9, color: '#64748b' }}>{lastCheckTime}</span>
          )}
        </div>

        {/* Alert badge */}
        {alertCount > 0 && (
          <div style={{
            background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444',
            borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700,
            animation: 'alertBlink 1s ease-in-out infinite',
          }}>
            {alertCount} ALERT{alertCount !== 1 ? 'S' : ''}
          </div>
        )}

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
        <StatusDot label="ML"  ok={mlOk} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {connected
            ? <><Wifi size={13} color="#22c55e" /><span style={{ fontSize: 11, color: '#22c55e' }}>LIVE</span></>
            : <><WifiOff size={13} color="#ef4444" /><span style={{ fontSize: 11, color: '#ef4444' }}>OFFLINE</span></>
          }
        </div>
        <span style={{ fontSize: 11, color: '#64748b', minWidth: 64 }}>{clock} IST</span>
      </div>

      <style>{`
        @keyframes alertBlink { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
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
            animation: 'chipPulse 1.5s ease-in-out infinite',
          }} />
        )}
      </div>
      <span style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}</span>
      <style>{`@keyframes chipPulse { 0%,100%{transform:scale(1);opacity:.5} 50%{transform:scale(2.2);opacity:0} }`}</style>
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
