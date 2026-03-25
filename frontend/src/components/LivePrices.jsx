import React, { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL } from '../utils/constants';

const CARD_SYMBOLS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'];

function api(path) {
  const token = localStorage.getItem('alphadesk_token');
  return fetch(`${BACKEND_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(10000),
  }).then(r => r.json());
}

export default function LivePrices() {
  const [prices,    setPrices]    = useState({});
  const [lastSync,  setLastSync]  = useState(null);
  const [isClosed,  setIsClosed]  = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/market/prices');
      if (data?.prices && Object.keys(data.prices).length > 0) {
        setPrices(data.prices);
        setLastSync(new Date());
        setIsClosed(false);
      } else {
        setIsClosed(true);
      }
    } catch {
      setIsClosed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (isClosed && Object.keys(prices).length === 0) {
    return (
      <div style={{
        background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: 20, textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>🕘</div>
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>
          Market Closed — Prices update at 9:15 AM IST
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 14, margin: 0 }}>Live Prices</h3>
        {lastSync && (
          <span style={{ fontSize: 10, color: '#475569' }}>
            Updated {lastSync.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
        {CARD_SYMBOLS.map(sym => {
          const p = prices[sym];
          if (!p) return null;
          const up    = p.change >= 0;
          const color = up ? '#22c55e' : '#ef4444';
          const arrow = up ? '▲' : '▼';
          return (
            <div key={sym} style={{
              background: '#0d1117',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
                {sym}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                ₹{p.ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color, marginTop: 2 }}>
                {arrow} {Math.abs(p.change)?.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
