"""AlphaDesk ML Engine — FastAPI microservice."""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

from feature_engine import compute_features, FEATURE_COLS
from model_trainer import train_models, load_models, predict as ml_predict
from rl_agent import load_rl_agent, rl_predict
from regime_detector import detect_regime, load_regime_model, train_regime_model
from sentiment_engine import get_sentiment_score
from signal_generator import SignalGenerator
from backtest_engine import run_backtest, monte_carlo
from strategy_optimizer import optimize_strategy

# ── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(title='AlphaDesk ML Engine', version='1.0.0')

# ── Load models at startup ────────────────────────────────────────────────────
xgb_model  = None
rf_model   = None
rl_model   = None
hmm_model  = None
generator  = None

@app.on_event('startup')
async def startup():
    global xgb_model, rf_model, rl_model, hmm_model, generator
    xgb_model, rf_model = load_models('v1')
    rl_model             = load_rl_agent('v1')
    hmm_model            = load_regime_model()
    generator            = SignalGenerator(xgb_model, rf_model, rl_model)
    print(f'ML Engine started | XGB: {"✓" if xgb_model else "✗"} | RL: {"✓" if rl_model else "✗"} | HMM: {"✓" if hmm_model else "✗"}')


# ── Health ────────────────────────────────────────────────────────────────────
@app.get('/health')
def health():
    return {
        'status':    'ok',
        'xgb':       xgb_model is not None,
        'rf':        rf_model  is not None,
        'rl':        rl_model  is not None,
        'hmm':       hmm_model is not None,
        'timestamp': datetime.utcnow().isoformat(),
    }


# ── Pydantic models ───────────────────────────────────────────────────────────
class OHLCRow(BaseModel):
    timestamp: str
    open:  float
    high:  float
    low:   float
    close: float
    volume: float

class PredictRequest(BaseModel):
    symbol:    str
    timeframe: Optional[str] = '5m'
    candles:   Optional[List[OHLCRow]] = None
    mongo_fetch: Optional[bool] = True

class TrainRequest(BaseModel):
    symbol: Optional[str] = None
    version: Optional[str] = 'v1'

class BacktestRequest(BaseModel):
    symbol:   str
    strategy: Optional[str] = 'ALL'
    from_date: Optional[str] = None
    to_date:   Optional[str] = None
    initial_capital: Optional[float] = 10000.0
    candles:  Optional[List[OHLCRow]] = None

class OptimizeRequest(BaseModel):
    symbol:   str
    strategy: Optional[str] = 'breakout'
    n_trials: Optional[int] = 200


# ── Helper: DataFrame from candles ───────────────────────────────────────────
def candles_to_df(candles: List[OHLCRow]) -> pd.DataFrame:
    data = [{
        'timestamp': c.timestamp,
        'open':  c.open, 'high': c.high, 'low': c.low,
        'close': c.close, 'volume': c.volume,
    } for c in candles]
    df = pd.DataFrame(data)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df.set_index('timestamp', inplace=True)
    df.sort_index(inplace=True)
    return df


async def fetch_candles_from_mongo(symbol: str, timeframe: str, limit: int = 300) -> pd.DataFrame:
    """Fetch OHLCV from MongoDB."""
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(os.getenv('MONGO_URI'))
        db     = client[os.getenv('MONGO_DB_NAME', 'Alphadesk_Trading')]
        docs   = await db.ohlcs.find(
            {'symbol': symbol.upper(), 'timeframe': timeframe},
            {'_id': 0, 'timestamp': 1, 'open': 1, 'high': 1, 'low': 1, 'close': 1, 'volume': 1}
        ).sort('timestamp', -1).limit(limit).to_list(length=limit)
        if not docs:
            return pd.DataFrame()
        df = pd.DataFrame(docs)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)
        df.sort_index(inplace=True)
        return df
    except Exception as e:
        print(f'MongoDB fetch error: {e}')
        return pd.DataFrame()


# ── Predict endpoint ──────────────────────────────────────────────────────────
@app.post('/predict')
async def predict(req: PredictRequest):
    global generator, hmm_model

    if req.candles:
        df = candles_to_df(req.candles)
    else:
        df = await fetch_candles_from_mongo(req.symbol, req.timeframe)

    if df.empty or len(df) < 60:
        raise HTTPException(422, 'Not enough candle data (need ≥ 60 candles)')

    # Detect regime
    regime_info = detect_regime(df, hmm_model)
    regime      = regime_info.get('regime', 'UNKNOWN')

    # Get sentiment
    try:
        sentiment = get_sentiment_score(symbol=req.symbol)
    except Exception:
        sentiment = {'score': 50, 'label': 'NEUTRAL'}

    sig = generator.generate(df, req.symbol, regime, sentiment)
    if not sig:
        return {'signal': None, 'reason': 'No qualifying signal found'}

    return {**sig, 'regime_info': regime_info}


# ── Train endpoint ────────────────────────────────────────────────────────────
@app.post('/train')
async def train(req: TrainRequest, background: BackgroundTasks):
    global xgb_model, rf_model, generator

    async def do_train():
        global xgb_model, rf_model, generator
        df = await fetch_candles_from_mongo(req.symbol or 'NIFTY 50', '5m', 10000)
        if df.empty or len(df) < 500:
            print('Not enough data to train')
            return
        result = train_models(df, req.version or 'v1')
        xgb_model = result['xgb']
        rf_model  = result['rf']
        generator = SignalGenerator(xgb_model, rf_model, rl_model)
        print(f"Training complete: {result['metrics']}")

    background.add_task(do_train)
    return {'status': 'training started in background'}


# ── Features endpoint ─────────────────────────────────────────────────────────
@app.get('/features/{symbol}')
async def features(symbol: str, timeframe: str = '5m'):
    df = await fetch_candles_from_mongo(symbol, timeframe, 100)
    if df.empty:
        raise HTTPException(404, 'No data for symbol')
    df_f = compute_features(df)
    last = df_f.iloc[-1]
    return {
        col: round(float(last[col]), 4) if isinstance(last.get(col), (int, float, np.floating)) else last.get(col)
        for col in FEATURE_COLS if col in last
    }


# ── Regime endpoint ───────────────────────────────────────────────────────────
@app.get('/regime/{symbol}')
async def regime(symbol: str, timeframe: str = '15m'):
    df = await fetch_candles_from_mongo(symbol, timeframe, 200)
    if df.empty:
        return {'symbol': symbol, 'regime': 'UNKNOWN', 'confidence': 0}
    info = detect_regime(df, hmm_model)
    return {'symbol': symbol, **info}


# ── Sentiment endpoint ────────────────────────────────────────────────────────
@app.get('/sentiment')
@app.post('/sentiment/refresh')
async def sentiment_endpoint(symbol: Optional[str] = None):
    try:
        result = get_sentiment_score(symbol=symbol)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Backtest endpoint ─────────────────────────────────────────────────────────
@app.post('/backtest')
async def backtest(req: BacktestRequest):
    if req.candles:
        df = candles_to_df(req.candles)
    else:
        df = await fetch_candles_from_mongo(req.symbol, '5m', 5000)

    if df.empty or len(df) < 100:
        raise HTTPException(422, 'Not enough data for backtest')

    metrics = run_backtest(df, generator, req.symbol, req.initial_capital)
    mc      = monte_carlo(metrics)
    return {**metrics, 'monte_carlo': mc, 'symbol': req.symbol, 'strategy': req.strategy}


# ── Optimize endpoint ─────────────────────────────────────────────────────────
@app.post('/optimize')
async def optimize(req: OptimizeRequest):
    df = await fetch_candles_from_mongo(req.symbol, '5m', 5000)
    if df.empty or len(df) < 500:
        raise HTTPException(422, 'Not enough data to optimize')
    result = optimize_strategy(df, req.strategy, req.n_trials)
    return result


# ── Model stats ───────────────────────────────────────────────────────────────
@app.get('/model-stats')
def model_stats():
    import glob
    stats = []
    for path in glob.glob(os.path.join(os.path.dirname(__file__), 'src/models/saved/metrics_*.json')):
        with open(path) as f:
            stats.append(json.load(f))
    return {'models': stats}


if __name__ == '__main__':
    import uvicorn
    # Railway uses PORT env var; fallback to ML_PORT then 5001
    port = int(os.getenv('PORT', os.getenv('ML_PORT', 5001)))
    uvicorn.run(app, host='0.0.0.0', port=port)
