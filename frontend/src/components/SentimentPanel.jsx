import React from 'react';
import { SENTIMENT_COLORS } from '../utils/constants';

export default function SentimentPanel({ sentiment }) {
  const label = sentiment?.label || 'NEUTRAL';
  const score = sentiment?.score || 50;
  const color = SENTIMENT_COLORS[label] || '#f59e0b';

  return (
    <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
      <h3 style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 12 }}>News Sentiment</h3>

      {/* Score arc */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color }}>{score}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{label}</div>
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {sentiment?.articlesAnalyzed || 0} articles analyzed
        </div>
      </div>

      {/* Gauge */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ height: 6, background: 'linear-gradient(90deg, #ef4444, #f59e0b, #22c55e)', borderRadius: 3, position: 'relative' }}>
          <div style={{
            position: 'absolute', top: -3, left: `${score}%`,
            width: 12, height: 12, borderRadius: '50%',
            background: color, border: '2px solid white',
            transform: 'translateX(-50%)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 9, color: '#ef4444' }}>BEARISH</span>
          <span style={{ fontSize: 9, color: '#f59e0b' }}>NEUTRAL</span>
          <span style={{ fontSize: 9, color: '#22c55e' }}>BULLISH</span>
        </div>
      </div>

      {/* Counts */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <SentTag label="+" val={sentiment?.positiveCount} color="#22c55e" />
        <SentTag label="=" val={sentiment?.neutralCount}  color="#f59e0b" />
        <SentTag label="−" val={sentiment?.negativeCount} color="#ef4444" />
      </div>

      {/* Headlines */}
      {sentiment?.headlines?.slice(0, 3).map((h, i) => (
        <div key={i} style={{ fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>• {h.slice(0, 80)}...</div>
      ))}
    </div>
  );
}

function SentTag({ label, val, color }) {
  return (
    <div style={{ textAlign: 'center', background: color + '20', border: `1px solid ${color}`, borderRadius: 6, padding: '4px 10px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{label}</div>
      <div style={{ fontSize: 11, color }}>{val ?? 0}</div>
    </div>
  );
}
