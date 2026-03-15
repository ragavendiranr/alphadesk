# AlphaDesk Deployment Guide
**Client:** DWU300 (Ragavendiran)
**Version:** 1.0.0
**Date:** 2026-03-15

---

## Quick Start (Local Development)

```bash
cd alphadesk
chmod +x start.sh
./start.sh
```

---

## 1. Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB Atlas account (already configured)
- Zerodha Kite Connect account (already configured)
- Telegram Bot (already configured)

---

## 2. Backend (Node.js) — Deploy to Railway

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### Step 2: Create project
```bash
cd alphadesk
railway init   # name it: alphadesk-backend
```

### Step 3: Set environment variables in Railway
Go to Railway dashboard → Variables, add all from your `.env`:
```
ZERODHA_API_KEY=4tr2vy6v27lfk6gk
ZERODHA_API_SECRET=e0xwjq5p52okneitqazc3n67j2th3jlt
ZERODHA_CLIENT_ID=DWU300
ZERODHA_EMAIL=ragavendiran1120@gmail.com
ZERODHA_PASSWORD=<your_password>
ZERODHA_TOTP_SECRET=OTENOYULPWEKTEPV3FDCXALYGHQSC5D3
MONGO_URI=mongodb+srv://ragavendiran1120_db_user:Ramesh@112002@cluster0.wy6g0yp.mongodb.net/
MONGO_DB_NAME=Alphadesk_Trading
TELEGRAM_BOT_TOKEN=8798396888:AAFf-Cuv97u1yzeOlecpZGXyCiZ8BG2X50c
TELEGRAM_CHAT_ID=879688640
TELEGRAM_AUTHORIZED_USERS=879688640
NEWS_API_KEY=f873500755914641a214bf72a57f7464
DAILY_CAPITAL=10000
JWT_SECRET=alphadesk_jwt_secret_DWU300_ragavendiran_2026_super_secure
```

### Step 4: Deploy
```bash
railway up
```

Your backend will be at: `https://alphadesk.up.railway.app`

---

## 3. ML Engine (Python) — Run Locally or VPS

### Install dependencies
```bash
cd ml-engine
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Start ML engine
```bash
cd ml-engine
uvicorn main:app --host 0.0.0.0 --port 5001 --reload
```

### Test ML engine
```bash
curl http://localhost:5001/health
```

---

## 4. Frontend (React) — Deploy to Vercel

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Set environment variables
Create `frontend/.env.production`:
```
VITE_BACKEND_URL=https://alphadesk.up.railway.app
VITE_WS_URL=https://alphadesk.up.railway.app
```

### Step 3: Deploy
```bash
cd frontend
npm install
vercel --prod
```

Your dashboard will be at: `https://alphadesk.vercel.app`

---

## 5. Docker (All-in-One Local)

```bash
# Start everything
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop
docker-compose down
```

---

## 6. PM2 (Production Process Manager)

```bash
npm install -g pm2

# Start all services
pm2 start ecosystem.config.js

# Monitor
pm2 status
pm2 logs alphadesk-api

# Auto-restart on system reboot
pm2 save
pm2 startup
```

---

## 7. Post-Deployment Verification

Run these checks after deploying:

```bash
# ✅ Backend health
curl https://alphadesk.up.railway.app/health
# Expected: {"status":"ok","db":"connected","ml":"online",...}

# ✅ ML engine health
curl http://localhost:5001/health
# Expected: {"status":"ok","xgb":true,...}

# ✅ Telegram bot
# Send /status to your bot — should reply with system health

# ✅ Dashboard
# Visit https://alphadesk.vercel.app
# Login: DWU300 / <your_zerodha_password>
```

---

## 8. Daily Operations

| Time (IST)   | Auto Action |
|-------------|-------------|
| 7:00 AM     | Zerodha auto-login (TOTP) |
| 7:30 AM     | Historical data sync |
| 7:35 AM     | ML model retrain |
| 8:45 AM     | Pre-market Telegram report |
| 9:14 AM     | Live data stream starts |
| 9:15 AM     | Signal scanning begins (every 3 min) |
| 12:00 PM    | Mid-day performance update |
| 3:10 PM     | Signal scanning stops |
| 3:15 PM     | Auto square-off all MIS |
| 3:35 PM     | Daily P&L report → Telegram |

---

## 9. Telegram Commands Reference

```
/status    — System health
/pnl       — Today's P&L
/positions — Open trades
/signals   — Last 5 signals
/budget 15000 — Change daily capital
/halt      — Emergency stop
/resume    — Resume trading
/regime    — Market regime
/sentiment — News sentiment
/report    — Manual daily report
/weekly    — Weekly summary
/monthly   — Monthly review
/settings  — Config overview
```

---

## 10. Scaling Capital (Month-on-Month)

Since you plan to grow ₹10,000 → more each month:

1. Send `/budget <new_amount>` in Telegram on 1st of each month
2. Or use dashboard: Budget button → enter new amount
3. Risk % stays at 1% — position sizes auto-scale

**Recommended progression:**
| Month | Capital | Risk/Trade | Loss Limit |
|-------|---------|------------|------------|
| 1     | ₹10,000 | ₹100       | ₹150       |
| 2     | ₹15,000 | ₹150       | ₹225       |
| 3     | ₹25,000 | ₹250       | ₹375       |
| 6     | ₹50,000 | ₹500       | ₹750       |

---

## 11. Troubleshooting

**Zerodha login fails:**
```
Check ZERODHA_TOTP_SECRET is correct base32 string
Verify your Zerodha password hasn't changed
The bot will send manual login URL to Telegram
```

**ML signals not generating:**
```
1. Check ML engine is running: curl localhost:5001/health
2. Check DB has OHLC data: need ≥ 60 candles per symbol
3. Run historical fetch manually: POST /api/ml/train
```

**MongoDB connection error:**
```
The URI has special characters in password (@ symbol in "Ramesh@112002")
URL-encode the password: Ramesh%40112002
Updated URI: mongodb+srv://ragavendiran1120_db_user:Ramesh%40112002@cluster0.wy6g0yp.mongodb.net/
```

---

*AlphaDesk v1.0.0 — Built for DWU300 | Ragavendiran R*
