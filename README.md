# AlphaDesk — AI-Powered NSE Algorithmic Trading System

**Client:** DWU300 (Ragavendiran R)
**Version:** 1.0.0

## Quick Start

```bash
cd alphadesk
chmod +x start.sh && ./start.sh
```

Open http://localhost:3000 — Login with `DWU300` / your Zerodha password.

## Architecture

| Layer | Tech | Purpose |
|-------|------|---------|
| Frontend | React + Vite | Trading dashboard |
| Backend | Node.js + Express + Socket.IO | API + WebSocket |
| ML Engine | Python + FastAPI | XGBoost + RF + RL signals |
| Database | MongoDB Atlas | All data persistence |
| Broker | Zerodha Kite Connect | Order execution |
| Bot | Telegram Bot API | Alerts + commands |

## Key Features

- **6 Strategies**: Breakout, Mean Reversion, Momentum, VWAP Reversal, ICT/SMC, Options Momentum
- **ML Ensemble**: 60% XGBoost + 40% Random Forest + PPO Reinforcement Learning
- **Risk Engine**: ATR-based sizing, circuit breakers, trailing stops
- **Auto-Login**: TOTP-based Zerodha login every morning
- **Smart Orders**: Limit → Market fallback, iceberg for large orders
- **Regime Detection**: HMM-based (Trending/Ranging/Volatile)
- **Sentiment**: FinBERT on live news from NewsAPI + RSS

## Trading Config

- Capital: ₹10,000 (grows monthly)
- Risk/Trade: 1% (₹100)
- Daily Loss Limit: 1.5% (₹150)
- Markets: NIFTY, BANKNIFTY, Top 20 NSE stocks
- Product: MIS + CNC

## Deployment

- Backend: [Railway](https://railway.app)
- Frontend: [Vercel](https://vercel.com)
- ML Engine: Local or VPS

See [deployment/DEPLOYMENT_GUIDE.md](deployment/DEPLOYMENT_GUIDE.md) for full setup instructions.

## ⚠️ Important: MongoDB URI

Your MongoDB password contains `@` — URL-encode it:
```
mongodb+srv://ragavendiran1120_db_user:Ramesh%40112002@cluster0.wy6g0yp.mongodb.net/
```

Update this in `.env` before starting.
