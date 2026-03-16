import React from 'react';
import { Zap, Eye, Clock, TrendingUp } from 'lucide-react';

const MONITORED_ASSETS = [
  { symbol: 'NIFTY 50',  tf: ['5M','15M','1H'] },
  { symbol: 'BANKNIFTY', tf: ['5M','15M','1H'] },
  { symbol: 'FINNIFTY',  tf: ['5M','15M'] },
  { symbol: 'RELIANCE',  tf: ['5M','15M'] },
  { symbol: 'TCS',       tf: ['5M','15M'] },
  { symbol: 'HDFCBANK',  tf: ['5M','15M'] },
  { symbol: 'INFY',      tf: ['5M','15M'] },
  { symbol: '+20 stocks', tf: ['5M','15M'] },
];

export default function SignalEnginePanel({ systemStatus }) {
  const stats   = systemStatus?.signalStats || {};
  const isOpen  = systemStatus?.isMarketOpen;
  const sigEng  = systemStatus?.signalEngineStatus || 'PAUSED';
  const lastSig = stats.lastSignalAt
    ? new Date(stats.lastSignalAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={{ background: '#0d1526', borderRadius: 10, border: '1px solid #1e2d4a', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #1e2d4a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Zap size={14} color={isOpen ? '#22c55e' : '#64748b'} />
          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>Signal Engine</span>
        </div>
        <div style={{
          padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
          background: isOpen ? '#14321a' : '#1a2035',
          color: isOpen ? '#22c55e' : '#64748b',
          border: `1px solid ${isOpen ? '#22c55e33' : '#2d3a5a'}`,
        }}>
          {sigEng}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, borderBottom: '1px solid #1e2d4a' }}>
        {[
          { label: 'Today',    val: stats.total   || 0, color: '#e2e8f0' },
          { label: 'Approved', val: stats.approved || 0, color: '#22c55e' },
          { label: 'Active',   val: stats.pending  || 0, color: '#3b82f6' },
          { label: 'Ignored',  val: stats.ignored  || 0, color: '#64748b' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '10px 4px', background: '#0a1020' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Last signal time */}
      <div style={{ padding: '6px 14px', borderBottom: '1px solid #1e2d4a', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={11} color="#64748b" />
        <span style={{ fontSize: 11, color: '#64748b' }}>Last Signal: </span>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{lastSig}</span>
      </div>

      {/* Monitored assets */}
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Eye size={12} color="#64748b" />
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
            MONITORING {systemStatus?.scanSymbolCount || 27} ASSETS
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {MONITORED_ASSETS.map(({ symbol, tf }) => (
            <div key={symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{symbol}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {tf.map(t => (
                  <span key={t} style={{
                    fontSize: 9, color: isOpen ? '#3b82f6' : '#475569',
                    background: isOpen ? '#1e2d4a' : '#1a2035',
                    borderRadius: 3, padding: '1px 5px',
                    border: `1px solid ${isOpen ? '#3b82f633' : '#2d3a5a'}`,
                  }}>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Indicators used */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #1e2d4a', background: '#0a1020' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <TrendingUp size={11} color="#64748b" />
          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>INDICATORS</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {['RSI', 'MACD', 'EMA 9', 'EMA 20', 'EMA 50', 'VWAP', 'Bollinger Bands', 'Volume'].map(ind => (
            <span key={ind} style={{
              fontSize: 9, color: '#3b82f6', background: '#1e2d4a',
              borderRadius: 3, padding: '2px 6px', border: '1px solid #3b82f633',
            }}>{ind}</span>
          ))}
        </div>
      </div>

      {!isOpen && (
        <div style={{
          margin: '10px 14px', padding: '7px 10px', borderRadius: 6,
          background: '#1a2035', border: '1px solid #2d3a5a', textAlign: 'center',
          fontSize: 11, color: '#64748b',
        }}>
          Market Closed — Signal Engine Paused
        </div>
      )}
    </div>
  );
}
