#!/bin/bash
# ============================================================
# AlphaDesk — Start All Services
# Client: DWU300 (Ragavendiran)
# ============================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║         ALPHADESK TRADING SYSTEM      ║"
echo "  ║         AI-Powered NSE Algo Bot       ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Check .env
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in values."
  exit 1
fi

# Create logs directory
mkdir -p logs

# ── 1. Install backend dependencies ──────────────────────────────────────────
echo -e "${YELLOW}Installing backend dependencies...${NC}"
cd backend && npm install --silent && cd ..

# ── 2. Install frontend dependencies ─────────────────────────────────────────
echo -e "${YELLOW}Installing frontend dependencies...${NC}"
cd frontend && npm install --silent && cd ..

# ── 3. Install Python dependencies ───────────────────────────────────────────
echo -e "${YELLOW}Setting up ML engine...${NC}"
cd ml-engine
if [ ! -d venv ]; then
  python3 -m venv venv
fi
source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
pip install -r requirements.txt -q
cd ..

echo -e "${GREEN}All dependencies installed!${NC}"

# ── 4. Start services ─────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Starting services...${NC}"

# ML Engine
cd ml-engine
source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
uvicorn main:app --host 0.0.0.0 --port 5001 --log-level warning &
ML_PID=$!
cd ..
echo -e "${GREEN}✅ ML Engine started (PID: $ML_PID) → http://localhost:5001${NC}"
sleep 2

# Backend
cd backend
node server.js &
BE_PID=$!
cd ..
echo -e "${GREEN}✅ Backend started (PID: $BE_PID) → http://localhost:4000${NC}"
sleep 2

# Frontend (dev mode)
cd frontend
npm run dev &
FE_PID=$!
cd ..
echo -e "${GREEN}✅ Frontend started (PID: $FE_PID) → http://localhost:3000${NC}"

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  AlphaDesk is running!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "  Dashboard:   http://localhost:3000"
echo "  Backend API: http://localhost:4000"
echo "  ML Engine:   http://localhost:5001"
echo ""
echo "  Login: DWU300 / <your_zerodha_password>"
echo ""
echo "  Telegram: Send /status to your bot"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Wait and cleanup on exit
trap "echo 'Stopping...'; kill $ML_PID $BE_PID $FE_PID 2>/dev/null; exit 0" INT TERM
wait
