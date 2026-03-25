import React, { useState, useEffect } from 'react';
import axios from 'axios';

import Header              from './components/Header';
import TickerBar           from './components/TickerBar';
import SignalCard          from './components/SignalCard';
import TradeLog            from './components/TradeLog';
import RiskMeter           from './components/RiskMeter';
import MLPanel             from './components/MLPanel';
import StrategyPanel       from './components/StrategyPanel';
import PerfChart           from './components/PerfChart';
import BacktestPanel       from './components/BacktestPanel';
import RegimePanel         from './components/RegimePanel';
import SentimentPanel      from './components/SentimentPanel';
import SystemMonitor       from './components/SystemMonitor';
import BudgetModal         from './components/BudgetModal';
import AIJournal           from './components/AIJournal';
import GreeksPanel         from './components/GreeksPanel';
import OrderFlowPanel      from './components/OrderFlowPanel';
import MarketIntelligencePanel from './components/MarketIntelligencePanel';
import InvestPanel         from './components/InvestPanel';
import ActivityLog         from './components/ActivityLog';
import SignalEnginePanel   from './components/SignalEnginePanel';
import SystemHealthPanel   from './components/SystemHealthPanel';
import MultiChartPanel    from './components/MultiChartPanel';
import LivePrices         from './components/LivePrices';

import useWebSocket from './hooks/useWebSocket';
import useTrades    from './hooks/useTrades';
import { BACKEND_URL } from './utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
const setAuthHeader = (token) => {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

const TABS = [
  'Dashboard', 'Charts', 'Signals', 'Trades', 'ML Engine',
  'Regime', 'Sentiment', 'Backtest', 'Options',
  'Journal', 'Risk', 'News & Market', 'Invest', 'System', 'Settings',
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
  const [systemStatus, setSystemStatus] = useState(null);
  const [fullHealth,   setFullHealth]   = useState(null);   // detailed component health
  const [wsAlerts,     setWsAlerts]     = useState([]);      // alerts from WS
  const [livePrices,   setLivePrices]   = useState({});     // Twelve Data live prices
  const [activeMarket, setActiveMarket] = useState(        // global market context
    () => { try { return JSON.parse(localStorage.getItem('alphadesk_chart_config'))?.market || 'NSE'; } catch { return 'NSE'; } }
  );

  const { connected, ticks, tradeUpdates, newSignals, subscribe,
          systemHealth: wsHealth, systemAlerts } = useWebSocket();
  const { openTrades, summary, refetch: refetchTrades } = useTrades();

  // Merge WebSocket health updates with fetched health
  useEffect(() => {
    if (wsHealth) setFullHealth(wsHealth);
  }, [wsHealth]);

  // Merge WebSocket alerts
  useEffect(() => {
    if (systemAlerts?.length > 0) setWsAlerts(systemAlerts);
  }, [systemAlerts]);

  const allAlerts = wsAlerts.length > 0 ? wsAlerts : (fullHealth?.alerts || []);

  // Auth
  const login = async () => {
    setLoginErr('');
    try {
      const { data } = await axios.post(`${BACKEND_URL}/api/auth/login`, {
        username: loginForm.user, password: loginForm.pass,
      }, { timeout: 15000 });
      localStorage.setItem('alphadesk_token', data.token);
      setAuthHeader(data.token);
      setToken(data.token);
    } catch (e) {
      if (e.response?.status === 401) {
        setLoginErr('Invalid credentials — use DWU300 / your password');
      } else if (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' || !e.response) {
        setLoginErr(`Server unreachable — try again or check: ${BACKEND_URL}/health`);
      } else {
        setLoginErr(e.response?.data?.error || 'Login failed');
      }
    }
  };

  useEffect(() => {
    if (token) {
      setAuthHeader(token);
      loadDashboardData();
      loadSystemStatus();
      loadFullHealth();
      loadLivePrices();
      const id1 = setInterval(loadDashboardData,  30_000);
      const id2 = setInterval(loadSystemStatus,   10_000);
      const id3 = setInterval(loadFullHealth,     30_000);
      const id4 = setInterval(loadLivePrices,     15_000);
      return () => { clearInterval(id1); clearInterval(id2); clearInterval(id3); clearInterval(id4); };
    }
  }, [token]);

  async function loadLivePrices() {
    try {
      const { data } = await api.get('/api/market/prices');
      if (data?.prices) setLivePrices(data.prices);
    } catch {}
  }

  async function loadSystemStatus() {
    try {
      const { data } = await api.get('/api/system/status');
      setSystemStatus(data);
    } catch {}
  }

  async function loadFullHealth() {
    try {
      const { data } = await api.get('/api/system/health');
      setFullHealth(data);
      if (data.alerts?.length > 0) setWsAlerts(data.alerts);
    } catch {}
  }

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

  const handleRepair = (updatedHealth) => {
    if (updatedHealth) {
      setFullHealth(updatedHealth);
      setWsAlerts(updatedHealth.alerts || []);
    }
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
      <Header
        connected={connected}
        systemHealth={health}
        systemStatus={systemStatus}
        fullHealth={fullHealth}
        alertCount={allAlerts.length}
      />
      <TickerBar ticks={Object.keys(ticks).length > 0 ? ticks : livePrices} />

      {/* Persistent alert bar — shows on any tab */}
      {allAlerts.length > 0 && tab !== 'System' && (
        <div
          onClick={() => setTab('System')}
          style={{
            background: '#1a0000', borderBottom: '1px solid #ef4444',
            padding: '6px 16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontSize: 14 }}>🚨</span>
          <span style={{ color: '#fca5a5', fontSize: 12, fontWeight: 600 }}>
            {allAlerts.length} system alert{allAlerts.length !== 1 ? 's' : ''} detected —
          </span>
          <span style={{ color: '#ef4444', fontSize: 12 }}>{allAlerts[0]?.title}</span>
          <span style={{ color: '#64748b', fontSize: 11, marginLeft: 'auto' }}>Click to view System Health →</span>
        </div>
      )}

      {/* Tab navigation */}
      <div style={{ background: '#0d1526', borderBottom: '1px solid #1e2d4a', padding: '0 16px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 14px', fontSize: 13, fontWeight: tab === t ? 700 : 400,
            color: tab === t ? '#3b82f6' : '#64748b',
            borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
            whiteSpace: 'nowrap', position: 'relative',
          }}>
            {t}
            {t === 'System' && allAlerts.length > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 2,
                background: '#ef4444', borderRadius: '50%',
                width: 8, height: 8, display: 'block',
              }} />
            )}
          </button>
        ))}
        <button onClick={() => setShowBudget(true)} style={{
          marginLeft: 'auto', background: '#1e3a5f', color: '#3b82f6', border: '1px solid #3b82f6',
          borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', alignSelf: 'center',
        }}>💰 Budget</button>
        {/* Active market pill — visible on all tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
          {['NSE','Crypto','Forex'].map(m => {
            const color = m === 'NSE' ? '#f97316' : m === 'Crypto' ? '#f59e0b' : '#22c55e';
            const active = activeMarket === m;
            return (
              <button key={m} onClick={() => { setActiveMarket(m); setTab('Charts'); }} style={{
                background:   active ? color + '22' : 'transparent',
                color:        active ? color : '#475569',
                border:       `1px solid ${active ? color + '55' : 'transparent'}`,
                borderRadius: 4, padding: '3px 7px', cursor: 'pointer',
                fontSize: 10, fontWeight: active ? 700 : 400,
              }}>{m}</button>
            );
          })}
        </div>

        <button onClick={() => { localStorage.removeItem('alphadesk_token'); setToken(null); }} style={{
          background: 'none', color: '#64748b', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 8px',
        }}>Logout</button>
      </div>

      {/* Main content */}
      <div style={{ padding: 16 }}>

        {/* ── Dashboard ── */}
        {tab === 'Dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Top row: 3 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {/* Left: Signals */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <h3 style={{ color: '#e2e8f0', fontSize: 14, margin: 0 }}>
                    Pending Signals ({signals.filter(s => s.status === 'PENDING').length})
                  </h3>
                  {activeMarket !== 'NSE' && (
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 4,
                      background: activeMarket === 'Crypto' ? '#451a03' : '#052e16',
                      color: activeMarket === 'Crypto' ? '#f59e0b' : '#22c55e',
                      border: `1px solid ${activeMarket === 'Crypto' ? '#f59e0b44' : '#22c55e44'}`,
                      fontWeight: 700,
                    }}>{activeMarket} signals — coming soon</span>
                  )}
                </div>
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
                  {equityCurve.length > 1
                    ? <PerfChart data={equityCurve} />
                    : <LivePrices />
                  }
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

            {/* Bottom row: Signal Engine Panel + Activity Log */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
              <SignalEnginePanel systemStatus={systemStatus} />
              <ActivityLog token={token} />
            </div>
          </div>
        )}

        {tab === 'Charts' && (
          <MultiChartPanel
            initialMarket={activeMarket}
            key={activeMarket}
          />
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

        {tab === 'News & Market' && <MarketIntelligencePanel token={token} />}

        {tab === 'Invest' && <InvestPanel token={token} />}

        {/* ── System Health Monitor tab ── */}
        {tab === 'System' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <h2 style={{ color: '#e2e8f0', margin: 0, fontSize: 18 }}>System Health Monitor</h2>
              <button
                onClick={loadFullHealth}
                style={{ background: '#1a2035', color: '#94a3b8', border: '1px solid #2d3a5a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
              >
                ↻ Refresh
              </button>
            </div>

            {/* Data feed stale warning */}
            {fullHealth?.components?.marketData?.status === 'stale' && (
              <div style={{
                background: '#451a03', border: '1px solid #f59e0b', borderRadius: 8,
                padding: '12px 16px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div>
                  <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>
                    Signal Generation Paused — Market Data Stale
                  </div>
                  <div style={{ color: '#92400e', fontSize: 11, marginTop: 2 }}>
                    {fullHealth.components.marketData.error}. All signals blocked until feed recovers.
                  </div>
                </div>
              </div>
            )}

            <SystemHealthPanel
              token={token}
              fullHealth={fullHealth}
              onRepair={handleRepair}
            />

            {/* Component detail table */}
            {fullHealth?.components && (
              <div style={{ marginTop: 16, background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 10, padding: 16 }}>
                <h3 style={{ color: '#e2e8f0', fontSize: 13, marginBottom: 12 }}>Component Detail</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '4px 8px', fontWeight: 600 }}>Component</th>
                      <th style={{ padding: '4px 8px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '4px 8px', fontWeight: 600 }}>Detail</th>
                      <th style={{ padding: '4px 8px', fontWeight: 600 }}>Last Check (IST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(fullHealth.components).map(([key, comp]) => {
                      const isOk = ['online','connected','authenticated','running','ready','active'].includes(comp.status);
                      const color = isOk ? '#22c55e' : comp.status === 'paused' ? '#f59e0b' : '#ef4444';
                      return (
                        <tr key={key} style={{ borderTop: '1px solid #0f1929' }}>
                          <td style={{ padding: '6px 8px', color: '#94a3b8' }}>{comp.label || key}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <span style={{ color, fontWeight: 700 }}>{comp.status?.toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '6px 8px', color: '#64748b', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {comp.error || '—'}
                          </td>
                          <td style={{ padding: '6px 8px', color: '#64748b' }}>
                            {comp.lastCheck
                              ? new Date(comp.lastCheck).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
                ['Health Monitor', 'Every 30 seconds'],
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
