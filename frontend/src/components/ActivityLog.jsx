import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/constants';

const LEVEL_COLORS = {
  INFO:   '#94a3b8',
  SIGNAL: '#3b82f6',
  TRADE:  '#22c55e',
  WARN:   '#f59e0b',
  ERROR:  '#ef4444',
};

const LEVEL_BG = {
  INFO:   '#1a2035',
  SIGNAL: '#1e2d4a',
  TRADE:  '#14321a',
  WARN:   '#2d2010',
  ERROR:  '#2d1010',
};

export default function ActivityLog({ token }) {
  const [logs,       setLogs]     = useState([]);
  const [loading,    setLoading]  = useState(true);
  const [autoScroll, setAuto]     = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    const api = axios.create({
      baseURL: BACKEND_URL,
      headers: { Authorization: `Bearer ${token}` },
    });

    const fetch = async () => {
      try {
        const { data } = await api.get('/api/system/activity?limit=50');
        setLogs(data.logs || []);
      } catch {}
      setLoading(false);
    };

    fetch();
    const id = setInterval(fetch, 5000); // refresh every 5s
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  return (
    <div style={{ background: '#0d1526', borderRadius: 10, border: '1px solid #1e2d4a', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #1e2d4a',
      }}>
        <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>
          Live Bot Activity Log
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'logpulse 1.5s infinite' }} />
          <span style={{ fontSize: 11, color: '#64748b' }}>LIVE</span>
          <button
            onClick={() => setAuto(a => !a)}
            style={{
              background: autoScroll ? '#1e3a5f' : '#1a2035',
              color: autoScroll ? '#3b82f6' : '#64748b',
              border: `1px solid ${autoScroll ? '#3b82f6' : '#2d3a5a'}`,
              borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10,
            }}
          >
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>
        </div>
      </div>

      <div style={{ height: 280, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
        {loading && <div style={{ color: '#64748b', padding: 16, textAlign: 'center' }}>Loading...</div>}
        {!loading && logs.length === 0 && (
          <div style={{ color: '#64748b', padding: 16, textAlign: 'center' }}>No activity yet</div>
        )}
        {logs.map((log, i) => (
          <div key={i} style={{
            display: 'flex', gap: 8, padding: '4px 12px',
            background: i % 2 === 0 ? 'transparent' : '#0a1020',
            borderLeft: `3px solid ${LEVEL_COLORS[log.level] || '#64748b'}`,
            alignItems: 'flex-start',
          }}>
            <span style={{ color: '#475569', minWidth: 52, flexShrink: 0 }}>
              {log.time ? new Date(log.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
            </span>
            <span style={{
              background: LEVEL_BG[log.level] || '#1a2035',
              color: LEVEL_COLORS[log.level] || '#94a3b8',
              borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700,
              minWidth: 42, textAlign: 'center', flexShrink: 0,
            }}>
              {log.level}
            </span>
            {log.module && (
              <span style={{ color: '#475569', minWidth: 60, flexShrink: 0 }}>[{log.module}]</span>
            )}
            <span style={{ color: '#cbd5e1', lineHeight: 1.4 }}>{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <style>{`@keyframes logpulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </div>
  );
}
