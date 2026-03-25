import React, { useEffect, useRef, useState } from 'react';

const SYMBOLS = [
  { label: 'NIFTY 50',   tv: 'NSE:NIFTY50' },
  { label: 'BANKNIFTY',  tv: 'NSE:BANKNIFTY' },
  { label: 'RELIANCE',   tv: 'NSE:RELIANCE' },
  { label: 'TCS',        tv: 'NSE:TCS' },
  { label: 'INFY',       tv: 'NSE:INFY' },
  { label: 'HDFCBANK',   tv: 'NSE:HDFCBANK' },
  { label: 'ICICIBANK',  tv: 'NSE:ICICIBANK' },
];

const INTERVALS = ['1', '5', '15', '30', '60', 'D', 'W'];

export default function ChartPanel() {
  const containerRef = useRef(null);
  const [symbol,   setSymbol]   = useState(SYMBOLS[0]);
  const [interval, setInterval] = useState('5');

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: symbol.tv,
      interval,
      timezone: 'Asia/Kolkata',
      theme: 'dark',
      style: '1',
      locale: 'en',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      backgroundColor: 'rgba(6, 13, 26, 1)',
      gridColor: 'rgba(30, 45, 74, 0.5)',
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies', 'BB@tv-basicstudies'],
      show_popup_button: true,
      popup_width: '1000',
      popup_height: '650',
    });

    containerRef.current.appendChild(script);
  }, [symbol, interval]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'calc(100vh - 140px)' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>SYMBOL:</span>
        {SYMBOLS.map(s => (
          <button key={s.tv} onClick={() => setSymbol(s)} style={{
            background: symbol.tv === s.tv ? '#1e3a5f' : '#0d1526',
            color: symbol.tv === s.tv ? '#3b82f6' : '#64748b',
            border: `1px solid ${symbol.tv === s.tv ? '#3b82f6' : '#1e2d4a'}`,
            borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>{s.label}</button>
        ))}
        <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600, marginLeft: 12 }}>INTERVAL:</span>
        {INTERVALS.map(iv => (
          <button key={iv} onClick={() => setInterval(iv)} style={{
            background: interval === iv ? '#1e3a5f' : '#0d1526',
            color: interval === iv ? '#3b82f6' : '#64748b',
            border: `1px solid ${interval === iv ? '#3b82f6' : '#1e2d4a'}`,
            borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12,
          }}>{iv === 'D' ? '1D' : iv === 'W' ? '1W' : `${iv}m`}</button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, borderRadius: 10, overflow: 'hidden', border: '1px solid #1e2d4a' }}>
        <div
          className="tradingview-widget-container"
          ref={containerRef}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    </div>
  );
}
