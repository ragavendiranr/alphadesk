import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
const setAuth = (t) => { api.defaults.headers.common['Authorization'] = `Bearer ${t}`; };

const card = { background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 10, padding: 16, marginBottom: 14 };
const h3s = { color: '#e2e8f0', fontSize: 14, fontWeight: 700, margin: '0 0 12px' };
const lbl = { color: '#64748b', fontSize: 11 };
const inputStyle = {
  background: '#0a1020', border: '1px solid #1e2d4a', borderRadius: 6,
  color: '#e2e8f0', padding: '6px 10px', fontSize: 12, outline: 'none',
};
const btnBlue = {
  background: '#1e3a5f', color: '#3b82f6', border: '1px solid #3b82f6',
  borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12,
};

const RATING_COLORS = { BUY: '#22c55e', HOLD: '#f59e0b', WATCH: '#94a3b8' };
const CAP_COLORS    = { LARGE: '#3b82f6', MID: '#a855f7', SMALL: '#f59e0b', MICRO: '#ef4444' };

// ── Stock Card ─────────────────────────────────────────────────────────────────
function StockCard({ stock, onDeepDive }) {
  const ratingColor = RATING_COLORS[stock.aiRating] || '#94a3b8';
  const capColor    = CAP_COLORS[stock.capCategory] || '#94a3b8';

  return (
    <div style={{ ...card, marginBottom: 10, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>{stock.symbol}</span>
            <span style={{ background: '#0f1929', color: capColor, fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
              {stock.capCategory}
            </span>
          </div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{stock.name}</div>
          <div style={{ color: '#475569', fontSize: 10 }}>{stock.sector}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: ratingColor, fontWeight: 700, fontSize: 13 }}>{stock.aiRating}</div>
          {stock.currentPrice && (
            <div style={{ color: '#e2e8f0', fontSize: 13 }}>₹{stock.currentPrice?.toLocaleString()}</div>
          )}
        </div>
      </div>

      {/* AI Conviction Bar */}
      {stock.aiScore > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={lbl}>AI Conviction</span>
            <span style={{ color: ratingColor, fontSize: 11, fontWeight: 600 }}>{stock.aiScore}/100</span>
          </div>
          <div style={{ background: '#0f1929', borderRadius: 4, height: 4 }}>
            <div style={{ background: ratingColor, width: `${stock.aiScore}%`, height: 4, borderRadius: 4 }} />
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
        {[
          ['PE', stock.peRatio],
          ['ROE%', stock.roePct],
          ['D/E', stock.debtToEquity],
          ['Div%', stock.dividendYieldPct],
        ].map(([k, v]) => (
          <div key={k} style={{ textAlign: 'center', background: '#0a1020', borderRadius: 4, padding: '4px 2px' }}>
            <div style={{ ...lbl, fontSize: 9 }}>{k}</div>
            <div style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 600 }}>{v ?? '-'}</div>
          </div>
        ))}
      </div>

      {/* Thesis */}
      {stock.companyThesis && (
        <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>
          {stock.companyThesis.substring(0, 100)}...
        </div>
      )}

      <button onClick={() => onDeepDive(stock)} style={{ ...btnBlue, width: '100%', padding: '7px 0', fontSize: 12 }}>
        🔍 Claude Deep Dive
      </button>
    </div>
  );
}

// ── Deep Dive Modal ────────────────────────────────────────────────────────────
function DeepDiveModal({ stock, onClose }) {
  const [analysis, setAnalysis] = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get(`/api/invest/deep-dive/${stock.symbol}`);
        setAnalysis(data.analysis);
      } catch (err) {
        setAnalysis(`Error: ${err.response?.data?.error || err.message}`);
      }
      setLoading(false);
    }
    load();
  }, [stock.symbol]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 12, padding: 28, width: 680, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <span style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 18 }}>{stock.symbol}</span>
            <span style={{ color: '#64748b', fontSize: 14, marginLeft: 8 }}>{stock.name}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>
              <div style={{ marginBottom: 8 }}>🤖 Claude is analyzing {stock.symbol}...</div>
              <div style={{ fontSize: 12 }}>This may take 20-30 seconds</div>
            </div>
          ) : (
            <pre style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {analysis}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI Recommendation Panel ────────────────────────────────────────────────────
function AiRecommendSection() {
  const [cap, setCap]       = useState('');
  const [sector, setSector] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post('/api/invest/ai-recommend', { cap, sector });
      setResult(data);
    } catch (err) {
      setResult({ error: err.response?.data?.error || err.message });
    }
    setLoading(false);
  }

  const CONVICT_COLORS = { HIGH: '#22c55e', MEDIUM: '#f59e0b', LOW: '#94a3b8' };

  return (
    <div style={card}>
      <h3 style={h3s}>🤖 Claude AI Stock Recommendations</h3>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <select value={cap} onChange={e => setCap(e.target.value)} style={inputStyle}>
          <option value="">All Caps</option>
          {['LARGE','MID','SMALL','MICRO'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Sector (optional)" value={sector} onChange={e => setSector(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <button onClick={run} disabled={loading} style={btnBlue}>
          {loading ? '⏳ Analyzing...' : '🚀 Get Recommendations'}
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: 30 }}>
          <div>Claude is analyzing stocks...</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Typically 30-60 seconds</div>
        </div>
      )}

      {result?.error && <div style={{ color: '#ef4444', fontSize: 12 }}>{result.error}</div>}

      {result?.recommendations && (
        <div>
          {result.recommendations.map((rec, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #0f1929' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{rec.symbol}</span>
                  <span style={{ color: '#64748b', marginLeft: 8, fontSize: 12 }}>{rec.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: CONVICT_COLORS[rec.conviction] || '#94a3b8', fontSize: 12, fontWeight: 600 }}>
                    {rec.conviction} conviction
                  </span>
                  {rec.aiScore && (
                    <span style={{ color: '#3b82f6', fontSize: 12 }}>Score: {rec.aiScore}</span>
                  )}
                </div>
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4, lineHeight: 1.5 }}>{rec.thesis}</div>
              {rec.entryReason && (
                <div style={{ color: '#22c55e', fontSize: 11 }}>Why now: {rec.entryReason}</div>
              )}
              {rec.targetRange && (
                <div style={{ color: '#f59e0b', fontSize: 11 }}>Target: {rec.targetRange}</div>
              )}
            </div>
          ))}
          <div style={{ color: '#475569', fontSize: 10, marginTop: 8 }}>
            Generated: {result.generatedAt ? new Date(result.generatedAt).toLocaleString() : ''} · Cached for 4 hours
          </div>
        </div>
      )}
    </div>
  );
}

// ── Portfolio Section ──────────────────────────────────────────────────────────
function PortfolioSection() {
  const [holdings, setHoldings] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ symbol: '', name: '', quantity: '', buyPrice: '', buyDate: '' });

  useEffect(() => { loadPortfolio(); }, []);

  async function loadPortfolio() {
    try {
      const { data } = await api.get('/api/invest/portfolio');
      setHoldings(data);
    } catch {}
  }

  async function addHolding() {
    try {
      await api.post('/api/invest/portfolio', form);
      setAdding(false);
      setForm({ symbol: '', name: '', quantity: '', buyPrice: '', buyDate: '' });
      loadPortfolio();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add');
    }
  }

  async function removeHolding(id) {
    if (!window.confirm('Remove holding?')) return;
    try { await api.delete(`/api/invest/portfolio/${id}`); loadPortfolio(); } catch {}
  }

  const totalInvested = holdings.reduce((s, h) => s + (h.buyPrice * h.quantity), 0);
  const totalCurrent  = holdings.reduce((s, h) => s + ((h.currentPrice || h.buyPrice) * h.quantity), 0);
  const totalGain     = totalCurrent - totalInvested;

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ ...h3s, margin: 0 }}>📂 Investment Portfolio</h3>
        <button onClick={() => setAdding(true)} style={btnBlue}>+ Add Holding</button>
      </div>

      {/* Summary */}
      {holdings.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Invested', val: `₹${totalInvested.toLocaleString()}` },
            { label: 'Current', val: `₹${totalCurrent.toLocaleString()}` },
            { label: 'Gain/Loss', val: `${totalGain >= 0 ? '+' : ''}₹${totalGain.toFixed(0)}`, color: totalGain >= 0 ? '#22c55e' : '#ef4444' },
          ].map(({ label: l, val, color }) => (
            <div key={l} style={{ background: '#0a1020', borderRadius: 6, padding: '8px 12px', textAlign: 'center' }}>
              <div style={lbl}>{l}</div>
              <div style={{ color: color || '#e2e8f0', fontWeight: 700, fontSize: 14 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div style={{ background: '#0a1020', borderRadius: 8, padding: 14, marginBottom: 14, border: '1px solid #1e2d4a' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input placeholder="Symbol (e.g. INFY)" value={form.symbol} onChange={e => setForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))} style={inputStyle} />
            <input placeholder="Company Name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
            <input placeholder="Quantity" type="number" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} style={inputStyle} />
            <input placeholder="Buy Price ₹" type="number" value={form.buyPrice} onChange={e => setForm(p => ({ ...p, buyPrice: e.target.value }))} style={inputStyle} />
            <input placeholder="Buy Date" type="date" value={form.buyDate} onChange={e => setForm(p => ({ ...p, buyDate: e.target.value }))} style={{ ...inputStyle, gridColumn: 'span 2' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addHolding} style={{ ...btnBlue, flex: 1 }}>Add</button>
            <button onClick={() => setAdding(false)} style={{ background: 'none', border: '1px solid #1e2d4a', color: '#64748b', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Holdings list */}
      {holdings.length === 0 && !adding && (
        <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 20 }}>No holdings yet. Add your first investment!</div>
      )}
      {holdings.map(h => (
        <div key={h._id} style={{ padding: '10px 0', borderBottom: '1px solid #0f1929', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{h.symbol}</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>{h.quantity} shares @ ₹{h.buyPrice} · {new Date(h.buyDate).toLocaleDateString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {h.currentPrice && <div style={{ color: '#e2e8f0', fontSize: 13 }}>₹{h.currentPrice?.toLocaleString()}</div>}
            {h.gainPct != null && (
              <div style={{ color: parseFloat(h.gainPct) >= 0 ? '#22c55e' : '#ef4444', fontSize: 11 }}>
                {parseFloat(h.gainPct) >= 0 ? '+' : ''}{h.gainPct}% (₹{parseFloat(h.gainAbs).toFixed(0)})
              </div>
            )}
          </div>
          <button onClick={() => removeHolding(h._id)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, marginLeft: 12 }}>🗑</button>
        </div>
      ))}
    </div>
  );
}

// ── Main InvestPanel ───────────────────────────────────────────────────────────
export default function InvestPanel({ token }) {
  const [stocks, setStocks]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [seeding, setSeeding]     = useState(false);
  const [deepDive, setDeepDive]   = useState(null);
  const [subTab, setSubTab]       = useState('screener');
  const [filters, setFilters]     = useState({ cap: '', sector: '', minRoe: '', maxDebt: '', rating: '' });

  useEffect(() => {
    if (token) { setAuth(token); loadStocks(); }
  }, [token]);

  async function loadStocks() {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const { data } = await api.get('/api/invest/stocks', { params });
      setStocks(data);
    } catch {}
    setLoading(false);
  }

  async function seed() {
    setSeeding(true);
    try {
      await api.post('/api/invest/seed');
      await loadStocks();
    } catch {}
    setSeeding(false);
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['screener', 'ai-recommend', 'portfolio'].map(t => (
          <button key={t} onClick={() => setSubTab(t)} style={{
            background: subTab === t ? '#1e3a5f' : 'none',
            color: subTab === t ? '#3b82f6' : '#64748b',
            border: `1px solid ${subTab === t ? '#3b82f6' : '#1e2d4a'}`,
            borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: subTab === t ? 600 : 400,
          }}>
            {t === 'screener' ? '🔎 Screener' : t === 'ai-recommend' ? '🤖 AI Picks' : '📂 Portfolio'}
          </button>
        ))}
      </div>

      {/* Screener Tab */}
      {subTab === 'screener' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filters.cap} onChange={e => setFilters(p => ({ ...p, cap: e.target.value }))} style={inputStyle}>
              <option value="">All Caps</option>
              {['LARGE','MID','SMALL','MICRO'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input placeholder="Sector" value={filters.sector} onChange={e => setFilters(p => ({ ...p, sector: e.target.value }))}
              style={{ ...inputStyle, width: 120 }} />
            <input placeholder="Min ROE%" type="number" value={filters.minRoe} onChange={e => setFilters(p => ({ ...p, minRoe: e.target.value }))}
              style={{ ...inputStyle, width: 90 }} />
            <input placeholder="Max D/E" type="number" value={filters.maxDebt} onChange={e => setFilters(p => ({ ...p, maxDebt: e.target.value }))}
              style={{ ...inputStyle, width: 80 }} />
            <select value={filters.rating} onChange={e => setFilters(p => ({ ...p, rating: e.target.value }))} style={inputStyle}>
              <option value="">All Ratings</option>
              {['BUY','HOLD','WATCH'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={loadStocks} style={btnBlue}>🔍 Filter</button>
            <button onClick={seed} disabled={seeding} style={{ ...btnBlue, marginLeft: 'auto' }}>
              {seeding ? 'Seeding...' : '🌱 Seed Stocks'}
            </button>
          </div>

          {loading ? (
            <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Loading stocks...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {stocks.map(s => <StockCard key={s.symbol} stock={s} onDeepDive={setDeepDive} />)}
              {stocks.length === 0 && (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 40, gridColumn: '1/-1' }}>
                  No stocks found. Click "Seed Stocks" to populate the database.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Recommend Tab */}
      {subTab === 'ai-recommend' && <AiRecommendSection />}

      {/* Portfolio Tab */}
      {subTab === 'portfolio' && <PortfolioSection />}

      {/* Deep Dive Modal */}
      {deepDive && <DeepDiveModal stock={deepDive} onClose={() => setDeepDive(null)} />}
    </div>
  );
}
