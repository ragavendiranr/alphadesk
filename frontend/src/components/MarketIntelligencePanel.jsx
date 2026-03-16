import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
const setAuth = (t) => { api.defaults.headers.common['Authorization'] = `Bearer ${t}`; };

const card = { background: '#0d1526', border: '1px solid #1e2d4a', borderRadius: 10, padding: 16, marginBottom: 14 };
const label = { color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 };
const h3style = { color: '#e2e8f0', fontSize: 14, fontWeight: 700, marginBottom: 12, margin: '0 0 12px' };

function Chip({ children, color }) {
  const bg = color === 'green' ? '#14532d' : color === 'red' ? '#7f1d1d' : '#1e2d4a';
  const fg = color === 'green' ? '#86efac' : color === 'red' ? '#fca5a5' : '#94a3b8';
  return (
    <span style={{ background: bg, color: fg, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function FiiDiiSection({ data }) {
  if (!data?.length) return <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 20 }}>No FII/DII data yet</div>;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
        {['Date', 'FII Buy', 'FII Sell', 'FII Net'].map(h => <div key={h} style={label}>{h}</div>)}
      </div>
      {data.map(d => (
        <div key={d.date} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '6px 0', borderBottom: '1px solid #0f1929' }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>{d.date}</div>
          <div style={{ color: '#22c55e', fontSize: 12 }}>{d.fii?.grossBuy?.toFixed(0) || '-'}</div>
          <div style={{ color: '#ef4444', fontSize: 12 }}>{d.fii?.grossSell?.toFixed(0) || '-'}</div>
          <div>
            <Chip color={d.fii?.net >= 0 ? 'green' : 'red'}>
              {d.fii?.net >= 0 ? '+' : ''}{d.fii?.net?.toFixed(0) || 0} Cr
            </Chip>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
          {['Date', 'DII Buy', 'DII Sell', 'DII Net'].map(h => <div key={h} style={label}>{h}</div>)}
        </div>
        {data.map(d => (
          <div key={d.date + 'dii'} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '6px 0', borderBottom: '1px solid #0f1929' }}>
            <div style={{ color: '#94a3b8', fontSize: 12 }}>{d.date}</div>
            <div style={{ color: '#22c55e', fontSize: 12 }}>{d.dii?.grossBuy?.toFixed(0) || '-'}</div>
            <div style={{ color: '#ef4444', fontSize: 12 }}>{d.dii?.grossSell?.toFixed(0) || '-'}</div>
            <div>
              <Chip color={d.dii?.net >= 0 ? 'green' : 'red'}>
                {d.dii?.net >= 0 ? '+' : ''}{d.dii?.net?.toFixed(0) || 0} Cr
              </Chip>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketRow({ item }) {
  const change = parseFloat(item.change);
  const isPos = change >= 0;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #0f1929' }}>
      <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{item.name}</div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: '#e2e8f0', fontSize: 13 }}>{item.price?.toLocaleString()}</div>
        <div style={{ color: isPos ? '#22c55e' : '#ef4444', fontSize: 11 }}>{isPos ? '+' : ''}{change?.toFixed(2)}%</div>
      </div>
    </div>
  );
}

function NewsItem({ article }) {
  const colors = { BULLISH: '#22c55e', BEARISH: '#ef4444', NEUTRAL: '#f59e0b' };
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #0f1929' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ color: colors[article.sentiment] || '#f59e0b', fontSize: 10, fontWeight: 700, minWidth: 55, paddingTop: 1 }}>
          {article.sentiment || 'NEUTRAL'}
        </span>
        <div>
          <a href={article.url} target="_blank" rel="noreferrer"
            style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.4, textDecoration: 'none' }}>
            {article.headline}
          </a>
          {article.sentimentNote && (
            <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>{article.sentimentNote}</div>
          )}
          <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>
            {article.source} · {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketIntelligencePanel({ token }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection]     = useState('india');

  useEffect(() => { if (token) { setAuth(token); load(); } }, [token]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/api/market-intel/intelligence');
      setData(res.data);
    } catch {}
    setLoading(false);
  }

  async function refreshNews() {
    setRefreshing(true);
    try {
      await api.post('/api/market-intel/refresh/news');
      await load();
    } catch {}
    setRefreshing(false);
  }

  async function refreshFiiDii() {
    setRefreshing(true);
    try {
      await api.post('/api/market-intel/refresh/fii-dii');
      await load();
    } catch {}
    setRefreshing(false);
  }

  if (loading) return <div style={{ color: '#64748b', padding: 40, textAlign: 'center' }}>Loading market intelligence...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={refreshNews} disabled={refreshing}
          style={{ background: '#1e3a5f', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
          {refreshing ? '...' : '🔄 Refresh News'}
        </button>
        <button onClick={refreshFiiDii} disabled={refreshing}
          style={{ background: '#1e3a5f', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
          {refreshing ? '...' : '📊 Refresh FII/DII'}
        </button>
        {data?.fetchedAt && (
          <span style={{ color: '#475569', fontSize: 11, alignSelf: 'center' }}>
            Updated: {new Date(data.fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

        {/* Left: FII/DII + India Market */}
        <div>
          <div style={card}>
            <h3 style={h3style}>📈 India Markets</h3>
            {(data?.indiaMarket || []).map(m => <MarketRow key={m.name} item={m} />)}
            {!data?.indiaMarket?.length && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 10 }}>Data loading...</div>}
          </div>

          <div style={card}>
            <h3 style={h3style}>🏦 FII/DII Activity (₹ Crores)</h3>
            <FiiDiiSection data={data?.fiiDii} />
          </div>
        </div>

        {/* Middle: Global Markets */}
        <div>
          <div style={card}>
            <h3 style={h3style}>🌍 Global Markets</h3>
            {(data?.globalMarkets || []).map(m => <MarketRow key={m.name} item={m} />)}
            {!data?.globalMarkets?.length && <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 10 }}>Data loading...</div>}
          </div>
        </div>

        {/* Right: News */}
        <div>
          <div style={card}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['india', 'global'].map(s => (
                <button key={s} onClick={() => setSection(s)} style={{
                  background: section === s ? '#1e3a5f' : 'none',
                  color: section === s ? '#3b82f6' : '#64748b',
                  border: `1px solid ${section === s ? '#3b82f6' : '#1e2d4a'}`,
                  borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12,
                }}>{s === 'india' ? '🇮🇳 India' : '🌐 Global'}</button>
              ))}
            </div>
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {section === 'india' && (data?.indiaNews || []).map((a, i) => <NewsItem key={i} article={a} />)}
              {section === 'global' && (data?.globalNews || []).map((a, i) => <NewsItem key={i} article={a} />)}
              {section === 'india' && !data?.indiaNews?.length && (
                <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 20 }}>
                  No news yet. Click "Refresh News" to fetch.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
