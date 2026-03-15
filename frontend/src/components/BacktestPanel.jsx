import React, { useState } from 'react';
import axios from 'axios';
import { Play, BarChart2 } from 'lucide-react';
import { BACKEND_URL, STRATEGIES, WATCHED_SYMBOLS } from '../utils/constants';
import PerfChart from './PerfChart';

const api = axios.create({ baseURL: BACKEND_URL });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('alphadesk_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

export default function BacktestPanel() {
  const [symbol,   setSymbol]   = useState('NIFTY 50');
  const [strategy, setStrategy] = useState('ALL');
  const [capital,  setCapital]  = useState(10000);
  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);

  const run = async () => {
    setRunning(true); setError(null);
    try {
      const { data } = await api.post('/api/backtest/run', {
        symbol, strategy, initial_capital: Number(capital),
      });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Backtest failed');
    }
    setRunning(false);
  };

  const m = result;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>Backtest Engine</h2>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={symbol} onChange={e => setSymbol(e.target.value)}
          style={{ background: '#1a2035', color: '#e2e8f0', border: '1px solid #2d3a5a', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
          {WATCHED_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={strategy} onChange={e => setStrategy(e.target.value)}
          style={{ background: '#1a2035', color: '#e2e8f0', border: '1px solid #2d3a5a', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
          <option value="ALL">All Strategies</option>
          {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="number" value={capital} onChange={e => setCapital(e.target.value)}
          placeholder="Capital ₹"
          style={{ background: '#1a2035', color: '#e2e8f0', border: '1px solid #2d3a5a', borderRadius: 6, padding: '8px 12px', fontSize: 13, width: 120 }} />
        <button onClick={run} disabled={running}
          style={{ background: '#1e3a5f', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Play size={14} />{running ? 'Running...' : 'Run Backtest'}
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>{error}</div>}

      {m && (
        <div>
          {/* Metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total Trades', val: m.total_trades },
              { label: 'Win Rate',     val: `${m.win_rate}%`, color: m.win_rate >= 50 ? '#22c55e' : '#ef4444' },
              { label: 'Profit Factor', val: m.profit_factor?.toFixed(2), color: m.profit_factor >= 1.5 ? '#22c55e' : '#f59e0b' },
              { label: 'Net P&L',      val: `₹${m.net_pnl?.toFixed(0)}`, color: m.net_pnl >= 0 ? '#22c55e' : '#ef4444' },
              { label: 'Sharpe Ratio', val: m.sharpe_ratio?.toFixed(2) },
              { label: 'Max Drawdown', val: `${m.max_drawdown?.toFixed(1)}%`, color: '#ef4444' },
              { label: 'Expectancy',   val: `₹${m.expectancy?.toFixed(0)}` },
              { label: 'CAGR',         val: `${m.cagr?.toFixed(1)}%` },
            ].map(({ label, val, color: c }) => (
              <div key={label} style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: c || '#e2e8f0' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Equity curve */}
          {m.equity_curve && <PerfChart data={m.equity_curve} title={`${symbol} Equity Curve`} />}

          {/* Monte Carlo */}
          {m.monte_carlo && (
            <div style={{ background: '#0d1526', borderRadius: 8, border: '1px solid #1e2d4a', padding: 12, marginTop: 12 }}>
              <h4 style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>Monte Carlo (1000 simulations)</h4>
              <div style={{ display: 'flex', gap: 20 }}>
                {[
                  { label: 'Prob Profitable', val: `${m.monte_carlo.prob_profitable}%`, color: '#22c55e' },
                  { label: 'Median Final',    val: `₹${m.monte_carlo.median_final?.toFixed(0)}` },
                  { label: 'P5 Worst',        val: `₹${m.monte_carlo.p5_final?.toFixed(0)}`, color: '#ef4444' },
                  { label: 'P95 Best',        val: `₹${m.monte_carlo.p95_final?.toFixed(0)}`, color: '#22c55e' },
                ].map(({ label, val, color: c }) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c || '#e2e8f0' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
