import React from 'react';
import { Shield, AlertTriangle, StopCircle } from 'lucide-react';
import { formatINR, formatPct } from '../utils/formatters';

export default function RiskMeter({ riskStatus }) {
  if (!riskStatus) return null;
  const { usedLossLimitPct, dailyLoss, dailyLossLimit, capital, halted, openTrades, maxConcurrentTrades } = riskStatus;
  const pct = parseFloat(usedLossLimitPct) || 0;
  const color = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e';

  return (
    <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: `1px solid ${halted ? '#7f1d1d' : '#1e2d4a'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {halted
          ? <><StopCircle size={16} color="#ef4444" /><span style={{ color: '#ef4444', fontWeight: 700 }}>TRADING HALTED</span></>
          : <><Shield size={16} color="#3b82f6" /><span style={{ color: '#e2e8f0', fontWeight: 600 }}>Risk Monitor</span></>
        }
      </div>

      {/* Gauge */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Daily Loss Used</span>
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{pct.toFixed(1)}%</span>
        </div>
        <div style={{ height: 8, background: '#1e2d4a', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            width: `${Math.min(pct, 100)}%`,
            background: color,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Capital',      val: formatINR(capital) },
          { label: 'Daily Loss',   val: formatINR(dailyLoss),      color: '#ef4444' },
          { label: 'Loss Limit',   val: formatINR(dailyLossLimit) },
          { label: 'Open Trades',  val: `${openTrades}/${maxConcurrentTrades}` },
        ].map(({ label, val, color: c }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: c || '#e2e8f0' }}>{val}</div>
          </div>
        ))}
      </div>

      {halted && riskStatus.haltReason && (
        <div style={{ marginTop: 10, background: '#2d0a0a', border: '1px solid #7f1d1d', borderRadius: 6, padding: '6px 10px' }}>
          <AlertTriangle size={12} color="#ef4444" style={{ display: 'inline', marginRight: 4 }} />
          <span style={{ fontSize: 11, color: '#fca5a5' }}>{riskStatus.haltReason}</span>
        </div>
      )}
    </div>
  );
}
