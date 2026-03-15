"""HMM-based market regime detection."""
import os, joblib
import numpy as np
import pandas as pd
from hmmlearn.hmm import GaussianHMM

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models', 'saved')
os.makedirs(MODEL_DIR, exist_ok=True)

REGIME_MAP = {0: 'TRENDING_UP', 1: 'TRENDING_DOWN', 2: 'RANGING', 3: 'VOLATILE'}


def prepare_regime_features(df: pd.DataFrame) -> np.ndarray:
    df = df.copy()
    df['returns']    = df['close'].pct_change()
    df['volatility'] = df['returns'].rolling(10).std()
    df['vol_change'] = df['volume'].pct_change()
    df['atr_norm']   = (df['high'] - df['low']) / df['close']
    X = df[['returns', 'volatility', 'vol_change', 'atr_norm']].dropna().values
    return X


def train_regime_model(df: pd.DataFrame):
    X = prepare_regime_features(df)
    hmm = GaussianHMM(n_components=4, covariance_type='diag', n_iter=200, random_state=42)
    hmm.fit(X)
    joblib.dump(hmm, f'{MODEL_DIR}/hmm_regime.pkl')
    return hmm


def load_regime_model():
    path = f'{MODEL_DIR}/hmm_regime.pkl'
    if not os.path.exists(path):
        return None
    return joblib.load(path)


def detect_regime(df: pd.DataFrame, model=None) -> dict:
    if model is None:
        model = load_regime_model()
    if model is None:
        return {'regime': 'UNKNOWN', 'confidence': 0}

    X = prepare_regime_features(df)
    if len(X) < 10:
        return {'regime': 'UNKNOWN', 'confidence': 0}

    states = model.predict(X)
    probs  = model.predict_proba(X)

    current_state   = int(states[-1])
    current_prob    = float(probs[-1].max())

    # Map states by mean returns to meaningful regimes
    # State with highest mean return → TRENDING_UP
    # State with lowest mean return  → TRENDING_DOWN
    # State with lowest volatility   → RANGING
    # State with highest volatility  → VOLATILE
    state_means = model.means_[:, 0]   # column 0 = returns
    state_vols  = model.means_[:, 1]   # column 1 = volatility

    sorted_by_ret = np.argsort(state_means)
    sorted_by_vol = np.argsort(state_vols)

    regime_assignment = {}
    regime_assignment[sorted_by_ret[-1]] = 'TRENDING_UP'
    regime_assignment[sorted_by_ret[0]]  = 'TRENDING_DOWN'
    regime_assignment[sorted_by_vol[0]]  = 'RANGING'
    regime_assignment[sorted_by_vol[-1]] = 'VOLATILE'

    # Fill any unassigned (can happen with 4 states)
    for i in range(4):
        if i not in regime_assignment:
            regime_assignment[i] = 'RANGING'

    regime = regime_assignment.get(current_state, 'UNKNOWN')

    return {
        'regime':     regime,
        'confidence': round(current_prob * 100, 1),
        'state':      current_state,
    }
