"""XGBoost + Random Forest model trainer with ensemble."""
import os, joblib, json
import pandas as pd
import numpy as np
from xgboost import XGBClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
from feature_engine import compute_features, FEATURE_COLS

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models', 'saved')
os.makedirs(MODEL_DIR, exist_ok=True)


def train_models(df: pd.DataFrame, version: str = 'v1'):
    """Train XGBoost + RF on historical OHLCV data with labels."""
    df = compute_features(df)

    # Label: 1 = trade won (close > open + ATR*1.0 within next 5 candles)
    if 'label' not in df.columns:
        future_ret = df['close'].pct_change(5).shift(-5)
        atr_norm   = df['atr_14'] / df['close']
        df['label'] = (future_ret > atr_norm).astype(int)

    df.dropna(subset=FEATURE_COLS + ['label'], inplace=True)

    X = df[FEATURE_COLS].values
    y = df['label'].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # ── XGBoost ──────────────────────────────────────────────────────────────
    xgb = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, use_label_encoder=False,
        eval_metric='logloss', random_state=42, n_jobs=-1,
    )
    xgb.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    # ── Random Forest ─────────────────────────────────────────────────────────
    rf = RandomForestClassifier(
        n_estimators=200, max_depth=8, min_samples_leaf=20,
        random_state=42, n_jobs=-1,
    )
    rf.fit(X_train, y_train)

    # ── Evaluate ─────────────────────────────────────────────────────────────
    xgb_pred  = xgb.predict_proba(X_test)[:, 1]
    rf_pred   = rf.predict_proba(X_test)[:, 1]
    ens_pred  = 0.6 * xgb_pred + 0.4 * rf_pred
    ens_label = (ens_pred >= 0.5).astype(int)

    auc = roc_auc_score(y_test, ens_pred)
    report = classification_report(y_test, ens_label, output_dict=True)

    print(f"Ensemble AUC: {auc:.4f}")
    print(classification_report(y_test, ens_label))

    # ── Save ──────────────────────────────────────────────────────────────────
    joblib.dump(xgb, f'{MODEL_DIR}/xgb_{version}.pkl')
    joblib.dump(rf,  f'{MODEL_DIR}/rf_{version}.pkl')

    metrics = {
        'version':  version,
        'auc':      round(auc, 4),
        'accuracy': round(report['accuracy'], 4),
        'f1':       round(report['weighted avg']['f1-score'], 4),
        'samples':  len(X_train),
        'features': len(FEATURE_COLS),
    }
    with open(f'{MODEL_DIR}/metrics_{version}.json', 'w') as f:
        json.dump(metrics, f, indent=2)

    return {'xgb': xgb, 'rf': rf, 'metrics': metrics}


def load_models(version: str = 'v1'):
    xgb_path = f'{MODEL_DIR}/xgb_{version}.pkl'
    rf_path  = f'{MODEL_DIR}/rf_{version}.pkl'
    if not os.path.exists(xgb_path):
        return None, None
    return joblib.load(xgb_path), joblib.load(rf_path)


def predict(xgb_model, rf_model, features: np.ndarray) -> dict:
    """Ensemble prediction: 0.6 × XGB + 0.4 × RF → confidence 0-100."""
    xgb_prob = xgb_model.predict_proba(features.reshape(1, -1))[0][1]
    rf_prob  = rf_model.predict_proba(features.reshape(1, -1))[0][1]
    ensemble = 0.6 * xgb_prob + 0.4 * rf_prob
    return {
        'confidence': round(float(ensemble * 100), 1),
        'xgb_prob':  round(float(xgb_prob), 4),
        'rf_prob':   round(float(rf_prob),  4),
        'win':       bool(ensemble >= 0.5),
    }
