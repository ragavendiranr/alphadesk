import React, { useState, useEffect } from 'react';
import axios from 'axios';

import Header         from './components/Header';
import TickerBar      from './components/TickerBar';
import SignalCard     from './components/SignalCard';
import TradeLog       from './components/TradeLog';
import RiskMeter      from './components/RiskMeter';
import MLPanel        from './components/MLPanel';
import StrategyPanel  from './components/StrategyPanel';
import PerfChart      from './components/PerfChart';
import BacktestPanel  from './components/BacktestPanel';
import RegimePanel    from './components/RegimePanel';
import SentimentPanel from './components/SentimentPanel';
import SystemMonitor  from './components/SystemMonitor';
import BudgetModal    from './components/BudgetModal';
import AIJournal      from './components/AIJournal';
import GreeksPanel    from './components/GreeksPanel';
import OrderFlowPanel from './components/OrderFlowPanel';

import useWebSocket   from './hooks/useWebSocket';
import useTrades      from './hooks/useTrades';
import { BACKEND_URL } from './utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
const setAuthHeader = (token) => {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

const TABS = [
  'Dashboard', 'Signals', 'Trades', 'ML Engine',
  'Regime', 'Sentiment', 'Backtest', 'Options',
  'Journal', 'Risk', 'Settings',
];

export default function App() {
  const [tab,          setTab]          = useState('Dashboard');
  const [token,        setToken]        = useState(localStorage.getItem('alphadesk_token'));
  const [loginForm,    setLoginForm]    = useState({ user: '', pass: '' });
  const [loginErr,     setLoginErr]     = useState('');
  const [health,       setHealth]       = useState(null);
  const [signals,      setSignals]      = useState([]);
  const [riskStatus,   setRiskStatus]   = useState(null);
  const [regime,       setRegime]       = useState(null);
  const [sentiment,    setSentiment]    = useState(null);
  const [strategies,   setStrategies]   = useState([]);
  const [mlStats,      setMlStats]      = useState(null);
  const [equityCurve,  setEquityCurve]  = useState([]);
  const [showBudget,   setShowBudget]   = useState(false);
  const [allTrades,    setAllTrades]    = useState([]);

  const { connected, ticks, tradeUpdates, newSignals } = useWebSocket();
  const { openTrades, summary, refetch: refetchTrades } = useTrades();

  // Auth
  const login = async () => {
    setLoginErr('');
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/login`, {
        username: loginForm.user, password: loginForm.pass,
      });
      localStorage.setItem('alphadesk_token', data.token);
      setAuthHeader(data.token);
      setToken(data.token);
    } catch (e) {
      if (e.response?.status === 401) {
        setLoginErr('Invalid credentials — use DWU300 / your password');
      } else if (e.code === 'ERR_NETWORK' || !e.response) {
        setLoginErr('Cannot reach server — check backend URL');
      } else {
        setLoginErr(e.response?.data?.error || 'Login failed');
      }
    }
  };

  useEffect(() => {
    if (token) {
      setAuthHeader(token);
      loadDashboardData();
      const id = setInterval(loadDashboardData, 30000);
      return () => clearInterval(id);
    }
  }, [token]);

  // Append new signals from WS
  useEffect(() => {
    if (newSignals.length > 0) {
      setSignals(prev => {
        const ids = new Set(prev.map(s => s._id));
        const fresh = newSignals.filter(s => !ids.has(s._id));
        return [...fresh, ...prev];
      });
    }
  }, [newSignals]);

  async function loadDashboardData() {
    try {
      const [healthRes, signalsRes, riskRes, regimeRes, sentimentRes, stratRes, mlRes, tradesRes] = await Promise.allSettled([
        api.get('/health'),
        api.get('/api/signals?status=PENDING&limit=20'),
        api.get('/api/risk/status'),
        api.get('/api/regime/current'),
        api.get('/api/sentiment/latest'),
        api.get('/api/backtest/results'),
        api.get('/api/ml/model-stats'),
        api.get('/api/trades?limit=50'),
      ]);

      if (healthRes.status    === 'fulfilled') setHealth(healthRes.value.data);
      if (signalsRes.status   === 'fulfilled') setSignals(signalsRes.value.data.signals || []);
      if (riskRes.status      === 'fulfilled') setRiskStatus(riskRes.value.data);
      if (regimeRes.status    === 'fulfilled') setRegime(regimeRes.value.data);
      if (sentimentRes.status === 'fulfilled') setSentiment(sentimentRes.value.data?.scores?.[0]);
      if (mlRes.status        === 'fulfilled') setMlStats(mlRes.value.data);
      if (tradesRes.status    === 'fulfilled') {
        setAllTrades(tradesRes.value.data.trades || []);
        // Build simple equity curve
        const closed = (tradesRes.value.data.trades || [])
          .filter(t => t.status !== 'OPEN')
          .sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
        let eq = 10000;
        const curve = closed.map(t => { eq += (t.netPnl || 0); return { date: t.entryTime, equity: eq }; });
        setEquityCurve([{ date: 'start', equity: 10000 }, ...curve]);
      }
    } catch {}
  }

  const handleSignalAction = (action, id) => {
    setSignals(prev => prev.map(s => s._id === id ? { ...s, status: action === 'approved' ? 'EXECUTED' : 'REJECTED' } : s));
  };

  // Login screen
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060d1a' }}>
        <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 14, padding: 36, width: 340 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#e2e8f0' }}>
              ALPHA<span style={{ color: '#3b82f6' }}>DESK</span>
            </div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>AI Trading System</div>
          </div>
          <input placeholder="Client ID (DWU300)" value={loginForm.user} onChange={e => setLoginForm(p => ({ ...p, user: e.target.value }))}
            style={{ width: '100%', background: '#1a2035', border: '1px solid #2d3a5a', borderRadius: 6, padding: '10px 12px', color: '#e2e8f0', marginBottom: 10, outline: 'none' }} />
          <input type="password" placeholder="Password" value={loginForm.pass} onChange={e => setLoginForm(p => ({ ...p, pass: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={{ width: '100%', background: '#1a2035', border: '1px solid #2d3a5a', borderRadius: 6, padding: '10px 12px', color: '#e2e8f0', marginBottom: 10, outline: 'none' }} />
          {loginErr && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{loginErr}</div>}
          <button onClick={login} style={{ width: '100%', background: '#1e3a5f', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: 8, padding: '11px 0', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060d1a' }}>
      <Header connected={connected} systemHealth={health} />
      <TickerBar ticks={ticks} />

      {/* Tab navigation */}
      <div style={{ background: '#0d1526', borderBottom: '1px solid #1e2d4a', padding: '0 16px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 14px', fontSize: 13, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? '#3b82f6' : '#64748b',
            borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
            whiteSpace: 'nowrap',
          }}>{t}</button>
        ))}
        <button onClick={() => setShowBudget(true)} style={{
          marginLeft: 'auto', background: '#1e3a5f', color: '#3b82f6', border: '1px solid #3b82f6',
          borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', alignSelf: 'center',
        }}>💰 Budget</button>
        <button onClick={() => { localStorage.removeItem('alphadesk_token'); setToken(null); }} style={{
          background: 'none', color: '#64748b', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 8px',
        }}>Logout</button>
      </div>

      {/* Main content */}
      <div style={{ padding: 16 }}>

        {/* ── Dashboard ── */}
        {tab === 'Dashboard' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            {/* Left: Signals */}
            <div>
              <h3 style={{ color: '#e2e8f0', marginBottom: 10, fontSize: 14 }}>
                Pending Signals ({signals.filter(s => s.status === 'PENDING').length})
              </h3>
              {signals.filter(s => s.status === 'PENDING').slice(0, 5).map(s => (
                <SignalCard key={s._id} signal={s} onAction={handleSignalAction} />
              ))}
              {signals.filter(s => s.status === 'PENDING').length === 0 &&
                <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 20 }}>No pending signals</div>
              }
            </div>

            {/* Middle: P&L + Trades */}
            <div>
              {summary && (
                <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, marginBottom: 14, border: '1px solid #1e2d4a' }}>
                  <h3 style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 10 }}>Today's P&L</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Net P&L', val: `₹${parseFloat(summary.netPnl).toFixed(0)}`, big: true, color: parseFloat(summary.netPnl) >= 0 ? '#22c55e' : '#ef4444' },
                      { label: 'Win Rate', val: `${summary.winRate}%` },
                      { label: 'Trades', val: `${summary.won}W / ${summary.lost}L` },
                    ].map(({ label, val, big, color }) => (
                      <div key={label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
                        <div style={{ fontSize: big ? 20 : 14, fontWeight: 700, color: color || '#e2e8f0' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <TradeLog trades={openTrades} title={`Open Positions (${openTrades.length})`} />
              <div style={{ marginTop: 14 }}>
                <PerfChart data={equityCurve} />
              </div>
            </div>

            {/* Right: Risk + Regime + Sentiment */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <RiskMeter riskStatus={riskStatus} />
              <RegimePanel regime={regime} />
              <SentimentPanel sentiment={sentiment} />
              <SystemMonitor health={health} />
            </div>
          </div>
        )}

        {tab === 'Signals' && (
          <div style={{ maxWidth: 800 }}>
            <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>All Signals</h2>
            {signals.map(s => <SignalCard key={s._id} signal={s} onAction={handleSignalAction} />)}
            {signals.length === 0 && <p style={{ color: '#64748b' }}>No signals yet</p>}
          </div>
        )}

        {tab === 'Trades' && (
          <div>
            <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>Trade History</h2>
            <TradeLog trades={allTrades} title="" />
          </div>
        )}

        {tab === 'ML Engine' && (
          <div style={{ maxWidth: 600 }}>
            <MLPanel mlStats={mlStats} />
          </div>
        )}

        {tab === 'Regime' && (
          <div style={{ maxWidth: 500 }}>
            <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>Market Regime</h2>
            <RegimePanel regime={regime} />
          </div>
        )}

        {tab === 'Sentiment' && (
          <div style={{ maxWidth: 500 }}>
            <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>News Sentiment</h2>
            <SentimentPanel sentiment={sentiment} />
          </div>
        )}

        {tab === 'Backtest' && <BacktestPanel />}

        {tab === 'Options' && <GreeksPanel positions={openTrades} />}

        {tab === 'Journal' && <AIJournal />}

        {tab === 'Risk' && (
          <div style={{ maxWidth: 600 }}>
            <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>Risk Management</h2>
            <RiskMeter riskStatus={riskStatus} />
            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <button onClick={async () => { await api.post('/api/risk/halt', { reason: 'Manual dashboard halt' }); loadDashboardData(); }}
                style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                🛑 HALT TRADING
              </button>
              <button onClick={async () => { await api.post('/api/risk/resume'); loadDashboardData(); }}
                style={{ background: '#14532d', color: '#86efac', border: '1px solid #22c55e', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                ▶️ RESUME
              </button>
            </div>
          </div>
        )}

        {tab === 'Settings' && (
          <div style={{ maxWidth: 500 }}>
            <h2 style={{ color: '#e2e8f0', marginBottom: 16 }}>Settings</h2>
            <div style={{ background: '#0d1526', borderRadius: 10, padding: 16, border: '1px solid #1e2d4a' }}>
              {[
                ['Client ID',      'DWU300'],
                ['Markets',        'NIFTY, BANKNIFTY, Stocks (MIS + CNC)'],
                ['Daily Capital',  '₹10,000 (adjustable monthly)'],
                ['Risk/Trade',     '1% = ₹100'],
                ['Daily Limit',    '1.5% = ₹150'],
                ['Max Positions',  '3 concurrent'],
                ['Min Confidence', '75%'],
                ['ML Models',      'XGBoost + RF + RL (PPO)'],
                ['Deployment',     'Railway + Vercel'],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #0f1929' }}>
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>{label}</span>
                  <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showBudget && (
        <BudgetModal
          currentCapital={riskStatus?.capital}
          onClose={() => { setShowBudget(false); loadDashboardData(); }}
        />
      )}
    </div>
  );
}
