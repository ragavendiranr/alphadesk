import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });

// ── Status colour map ──────────────────────────────────────────────────────────
const COLOR = {
  online: '#22c55e',   connected: '#22c55e',  authenticated: '#22c55e',
  running: '#22c55e',  ready: '#22c55e',       active: '#22c55e',
  degraded: '#f59e0b', stale: '#f59e0b',       paused: '#f59e0b',
  unconfigured: '#f59e0b', no_data: '#f59e0b',
  offline: '#ef4444',  disconnected: '#ef4444', auth_expired: '#ef4444',
  credit_exhausted: '#ef4444', error: '#ef4444', idle: '#f59e0b',
  unavailable: '#ef4444', unknown: '#64748b',
};

// ── Component icon map ─────────────────────────────────────────────────────────
const ICON = {
  aiEngine: '🤖',  database: '🗄️',  marketData: '📊', brokerApi: '🏦',
  strategyEngine: '⚙️', newsFeed: '📰',  backtestEngine: '📈', webSocket: '🔌',
  scheduler: '🕐',
};

const STATUS_LABEL = {
  online: 'Online', connected: 'Connected', authenticated: 'Authenticated',
  running: 'Running', ready: 'Ready', active: 'Active',
  degraded: 'Degraded', stale: 'Stale', paused: 'Paused',
  unconfigured: 'Not Configured', no_data: 'No Data',
  offline: 'Offline', disconnected: 'Disconnected',
  auth_expired: 'Auth Expired', credit_exhausted: 'Credits Empty',
  error: 'Error', idle: 'Idle', unavailable: 'Unavailable', unknown: 'Checking…',
};

export default function SystemHealthPanel({ token, fullHealth, onRepair }) {
  const [health,     setHealth]     = useState(fullHealth || null);
  const [alerts,     setAlerts]     = useState([]);
  const [repairing,  setRepairing]  = useState({});
  const [repairLogs, setRepairLogs] = useState({});

  // ── Sync from parent prop ─────────────────────────────────────────────────
  useEffect(() => {
    if (fullHealth) {
      setHealth(fullHealth);
      setAlerts(fullHealth.alerts || []);
    }
  }, [fullHealth]);

  // ── Fallback: local polling if no parent prop ─────────────────────────────
  useEffect(() => {
    if (!token || fullHealth) return;
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    const fetch = async () => {
      try {
        const { data } = await api.get('/api/system/health');
        setHealth(data);
        setAlerts(data.alerts || []);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [token, fullHealth]);

  const handleRepair = useCallback(async (component) => {
    setRepairing(p => ({ ...p, [component]: true }));
    try {
      const { data } = await api.post('/api/system/repair', { component });
      setRepairLogs(p => ({ ...p, [component]: data.steps || [] }));
      if (data.health) { setHealth(data.health); setAlerts(data.health.alerts || []); }
      if (onRepair) onRepair(data.health);
    } catch (err) {
      setRepairLogs(p => ({ ...p, [component]: [`Repair failed: ${err.message}`] }));
    } finally {
      setRepairing(p => ({ ...p, [component]: false }));
    }
  }, [onRepair]);

  const handleDismiss = useCallback(async (component) => {
    try { await api.post('/api/system/repair/dismiss', { component }); } catch {}
    setAlerts(prev => prev.filter(a => a.component !== component));
    setRepairLogs(p => { const n = { ...p }; delete n[component]; return n; });
  }, []);

  const components = health?.components || {};
  const lastCheck  = health?.lastCheck
    ? new Date(health.lastCheck).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const allOk = alerts.length === 0 &&
    Object.values(components).every(c => ['online','connected','authenticated','running','ready','active','paused'].includes(c.status));

  return (
    <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 10, padding: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', width: 8, height: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
            <div style={{
              position: 'absolute', top: 0, left: 0, width: 8, height: 8,
              borderRadius: '50%', background: '#22c55e', opacity: 0.5,
              animation: 'hbPulse 2s ease-in-out infinite',
            }} />
          </div>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>System Health Monitor</span>
          <span style={{ fontSize: 10, color: '#22c55e', background: '#14532d', borderRadius: 4, padding: '1px 6px' }}>
            MONITORING ACTIVE
          </span>
        </div>
        <div style={{ fontSize: 10, color: '#64748b' }}>
          Last check: <span style={{ color: '#94a3b8' }}>{lastCheck} IST</span>
        </div>
      </div>

      {/* ── Signal pause warning ── */}
      {components.marketData?.status === 'stale' && (
        <div style={{
          background: '#451a03', border: '1px solid #f59e0b', borderRadius: 6,
          padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>
            Signal generation paused — market data feed stale. Do not trade on stale data.
          </span>
        </div>
      )}

      {/* ── Alert banners ── */}
      {alerts.map(alert => (
        <AlertBanner
          key={alert.component}
          alert={alert}
          repairing={!!repairing[alert.component]}
          logs={repairLogs[alert.component] || []}
          onRepair={() => handleRepair(alert.component)}
          onDismiss={() => handleDismiss(alert.component)}
        />
      ))}

      {/* ── Component grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {Object.entries(components).map(([key, comp]) => (
          <ComponentCard key={key} id={key} comp={comp} />
        ))}
      </div>

      {/* WebSocket connection count */}
      {health?.wsConnections !== undefined && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#64748b', textAlign: 'right' }}>
          {health.wsConnections} dashboard client{health.wsConnections !== 1 ? 's' : ''} connected
        </div>
      )}

      {allOk && alerts.length === 0 && Object.keys(components).length > 0 && (
        <div style={{ marginTop: 10, textAlign: 'center', color: '#22c55e', fontSize: 11 }}>
          ✅ All systems operational
        </div>
      )}

      <style>{`
        @keyframes hbPulse { 0%,100%{transform:scale(1);opacity:.5} 50%{transform:scale(2.5);opacity:0} }
        @keyframes repairSpin { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── Alert Banner ──────────────────────────────────────────────────────────────
function AlertBanner({ alert, repairing, logs, onRepair, onDismiss }) {
  return (
    <div style={{
      background: '#1a0a0a', border: '1px solid #ef4444', borderRadius: 6,
      padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>🚨</span>
            <span style={{ color: '#fca5a5', fontWeight: 700, fontSize: 12 }}>{alert.title}</span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>{alert.detail}</p>
          {logs.length > 0 && (
            <div style={{ marginTop: 6, background: '#0a0f1e', borderRadius: 4, padding: '6px 8px' }}>
              {logs.map((l, i) => (
                <div key={i} style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}>• {l}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginBottom: 2 }}>Auto-repair?</div>
          <button
            onClick={onRepair}
            disabled={repairing}
            style={{
              background: '#14532d', color: '#22c55e', border: '1px solid #22c55e',
              borderRadius: 4, padding: '4px 10px', cursor: repairing ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: 700, minWidth: 44,
            }}
          >
            {repairing ? (
              <span style={{ display: 'inline-block', animation: 'repairSpin 1s linear infinite' }}>⟳</span>
            ) : 'YES'}
          </button>
          <button
            onClick={onDismiss}
            disabled={repairing}
            style={{
              background: '#1e2d4a', color: '#94a3b8', border: '1px solid #2d3a5a',
              borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700,
            }}
          >
            NO
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Component Card ────────────────────────────────────────────────────────────
function ComponentCard({ id, comp }) {
  const color = COLOR[comp.status] || '#64748b';
  const label = STATUS_LABEL[comp.status] || comp.status;
  const lastChk = comp.lastCheck
    ? new Date(comp.lastCheck).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div style={{
      background: '#111827', border: `1px solid ${color}33`,
      borderRadius: 6, padding: '8px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>{ICON[id] || '●'}</span>
        <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>
          {comp.label || id}
        </span>
        {id === 'webSocket' && comp.connections !== undefined && (
          <span style={{ fontSize: 9, color: '#64748b', marginLeft: 'auto' }}>
            {comp.connections} conn
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ color, fontSize: 11, fontWeight: 700 }}>{label}</span>
      </div>
      {comp.error && (
        <div style={{
          marginTop: 4, color: '#f59e0b', fontSize: 9,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={comp.error}>
          {comp.error}
        </div>
      )}
      {lastChk && (
        <div style={{ marginTop: 2, color: '#374151', fontSize: 9 }}>{lastChk}</div>
      )}
    </div>
  );
}
