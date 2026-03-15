# AlphaDesk — Complete Online Deployment (No Installation Needed)
**All services run 100% in the cloud. Nothing on your laptop.**

---

## What Goes Where

| Service | Platform | Cost | URL |
|---------|----------|------|-----|
| Backend (Node.js) | Railway | Free $5 credit | `https://alphadesk-backend.up.railway.app` |
| ML Engine (Python) | Railway | Free $5 credit | `https://alphadesk-ml.up.railway.app` |
| Frontend (React) | Vercel | Free forever | `https://alphadesk.vercel.app` |
| Database | MongoDB Atlas | Free forever | Already configured |
| Telegram Bot | Runs inside Backend | Free | Your bot |

---

## PART 1 — Push Code to GitHub (5 minutes)

> Your code is already in the branch. You need a GitHub account.

### Step 1: Create GitHub account
Go to https://github.com/signup (if you don't have one)

### Step 2: Create new repository
1. Go to https://github.com/new
2. Repository name: `alphadesk`
3. Set to **Private** (keeps your credentials safe)
4. Click **Create repository**

### Step 3: Push your code
Run these commands on your computer:
```bash
cd /path/to/Clude-Code/alphadesk

git init
git add .
git commit -m "Initial AlphaDesk deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/alphadesk.git
git push -u origin main
```

---

## PART 2 — Deploy Backend on Railway (10 minutes)

### Step 1: Create Railway account
Go to https://railway.app → Sign up with GitHub

### Step 2: New Project
1. Click **New Project**
2. Click **Deploy from GitHub repo**
3. Select your `alphadesk` repository
4. Railway will detect it automatically

### Step 3: Set Environment Variables
Click **Variables** tab → Add each variable:

```
ZERODHA_API_KEY          = 4tr2vy6v27lfk6gk
ZERODHA_API_SECRET       = e0xwjq5p52okneitqazc3n67j2th3jlt
ZERODHA_CLIENT_ID        = DWU300
ZERODHA_EMAIL            = ragavendiran1120@gmail.com
ZERODHA_PASSWORD         = Ramesh@112002
ZERODHA_TOTP_SECRET      = OTENOYULPWEKTEPV3FDCXALYGHQSC5D3
MONGO_URI                = mongodb+srv://ragavendiran1120_db_user:Ramesh%40112002@cluster0.wy6g0yp.mongodb.net/
MONGO_DB_NAME            = Alphadesk_Trading
JWT_SECRET               = alphadesk_jwt_secret_DWU300_ragavendiran_2026_super_secure
JWT_EXPIRES_IN           = 7d
TELEGRAM_BOT_TOKEN       = 8798396888:AAFf-Cuv97u1yzeOlecpZGXyCiZ8BG2X50c
TELEGRAM_CHAT_ID         = 879688640
TELEGRAM_AUTHORIZED_USERS= 879688640
NEWS_API_KEY             = f873500755914641a214bf72a57f7464
DAILY_CAPITAL            = 10000
MAX_RISK_PER_TRADE       = 0.01
DAILY_LOSS_LIMIT         = 0.015
MAX_CONCURRENT_TRADES    = 3
ML_MIN_CONFIDENCE        = 75
PRODUCT_TYPE             = MIS
MARKETS                  = NIFTY,BANKNIFTY,STOCKS
NODE_ENV                 = production
FRONTEND_URL             = https://alphadesk.vercel.app
ML_ENGINE_URL            = https://alphadesk-ml.up.railway.app
```

### Step 4: Set Start Command
Settings → Deploy → Start Command:
```
node backend/server.js
```

### Step 5: Get your Backend URL
After deploy → Settings → copy the URL like:
`https://alphadesk-backend.up.railway.app`

### Step 6: Test backend
Open in browser:
```
https://YOUR-BACKEND.up.railway.app/health
```
Should show: `{"status":"ok","db":"connected",...}`

---

## PART 3 — Deploy ML Engine on Railway (10 minutes)

### Step 1: Add a NEW service in same Railway project
1. In your Railway project → **New Service**
2. Click **GitHub Repo** again
3. Select `alphadesk` again
4. This time, set the **Root Directory** to: `ml-engine`

### Step 2: Set Environment Variables (same project, new service)
```
MONGO_URI      = mongodb+srv://ragavendiran1120_db_user:Ramesh%40112002@cluster0.wy6g0yp.mongodb.net/
MONGO_DB_NAME  = Alphadesk_Trading
NEWS_API_KEY   = f873500755914641a214bf72a57f7464
```

### Step 3: Set Start Command
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Step 4: Get ML Engine URL
Copy the URL like: `https://alphadesk-ml.up.railway.app`

### Step 5: Update Backend with ML URL
Go back to **Backend service** → Variables → Update:
```
ML_ENGINE_URL = https://YOUR-ML-ENGINE.up.railway.app
```

### Step 6: Test ML engine
```
https://YOUR-ML-ENGINE.up.railway.app/health
```
Should show: `{"status":"ok","xgb":false,...}`
(xgb=false is fine until first training run)

---

## PART 4 — Deploy Frontend on Vercel (5 minutes)

### Step 1: Create Vercel account
Go to https://vercel.com → Sign up with GitHub

### Step 2: Import project
1. Click **New Project**
2. Import from GitHub → select `alphadesk`
3. Set **Root Directory** to: `frontend`
4. Framework: **Vite** (auto-detected)

### Step 3: Set Environment Variables
```
VITE_BACKEND_URL = https://YOUR-BACKEND.up.railway.app
VITE_WS_URL      = https://YOUR-BACKEND.up.railway.app
```

### Step 4: Deploy
Click **Deploy** — Vercel builds and deploys automatically.

Your dashboard URL: `https://alphadesk.vercel.app`

---

## PART 5 — Final Setup (2 minutes)

### Step 1: Update Backend FRONTEND_URL
In Railway backend variables, update:
```
FRONTEND_URL = https://alphadesk.vercel.app
```
(Use your actual Vercel URL)

### Step 2: Test everything
Open `https://alphadesk.vercel.app`
- Login: `DWU300` / `Ramesh@112002`
- Dashboard should load

Send `/status` to your Telegram bot
- Should reply with system health

---

## PART 6 — First Training Run

After deployment, the ML model needs to be trained:

1. Open dashboard → **ML Engine** tab
2. Click **Retrain** button
3. Wait 10-15 minutes (running in background on Railway)
4. Refresh page → AUC score should appear

OR via Telegram:
```
(No command yet — use dashboard for first train)
```

---

## Daily Automated Schedule (All Cloud, No Action Needed)

| Time (IST) | What happens automatically |
|------------|---------------------------|
| 7:00 AM | Zerodha auto-login (TOTP) |
| 7:30 AM | Historical data sync |
| 8:45 AM | Pre-market report → Telegram |
| 9:15 AM | Signal scanning starts |
| Every 3 min | Strategies scan market |
| Signal found | Telegram alert sent to you |
| You tap ✅ | Order placed in Zerodha |
| 3:15 PM | Auto square-off MIS |
| 3:35 PM | Daily report → Telegram |

**You only need to:**
1. Approve/reject signals in Telegram
2. Check P&L with `/pnl`

---

## Telegram — Your Remote Control

| Command | Action |
|---------|--------|
| `/status` | Is system alive? |
| `/pnl` | Today's profit |
| `/positions` | Open trades |
| `/halt` | Emergency stop |
| `/resume` | Resume trading |
| `/budget 15000` | Change capital |
| `/regime` | Market condition |
| `/sentiment` | News sentiment |

---

## Costs

| Service | Free Tier | What you get |
|---------|-----------|-------------|
| Railway | $5/month credit | ~500 hours = enough for both services |
| Vercel | Free forever | Frontend hosting |
| MongoDB Atlas | Free forever | 512MB storage |
| Telegram | Free forever | Bot + alerts |
| NewsAPI | Free | 100 requests/day |
| **Total** | **~₹0/month** | Full trading system |

When Railway $5 credit runs out (~month 1-2):
- Upgrade to Railway Hobby: $5/month = ₹420/month
- Or use Render.com free tier as alternative

---

## Troubleshooting

**Railway deploy fails:**
- Check build logs in Railway dashboard
- Make sure `backend/package.json` exists
- Check all env variables are set

**ML Engine timeout:**
- First deploy takes 5-10 min (installing torch)
- Check logs for `Application startup complete`

**Frontend shows "Cannot connect":**
- Verify `VITE_BACKEND_URL` in Vercel env vars
- Must be your exact Railway backend URL
- Redeploy Vercel after changing env vars

**Telegram bot not responding:**
- Check `TELEGRAM_BOT_TOKEN` in Railway vars
- Only 1 instance should be running (not local + Railway)
- Check Railway logs: search for "Telegram bot started"

---

*AlphaDesk v1.0.0 | DWU300 — Fully Cloud Deployed*
