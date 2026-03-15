"""Optuna-based Bayesian hyperparameter optimization for strategies."""
import optuna
import pandas as pd
from feature_engine import compute_features


def objective_breakout(trial, df: pd.DataFrame, initial_capital: float = 10000.0) -> float:
    rsi_min   = trial.suggest_int('rsi_min', 45, 60)
    rsi_max   = trial.suggest_int('rsi_max', 65, 75)
    vol_mult  = trial.suggest_float('vol_mult', 1.2, 2.5)
    adx_min   = trial.suggest_float('adx_min', 20, 30)
    atr_sl    = trial.suggest_float('atr_sl',  1.0, 2.5)
    atr_tgt   = trial.suggest_float('atr_tgt', 1.5, 4.0)

    df_f = compute_features(df.copy())
    capital = initial_capital
    wins    = 0
    total   = 0

    for i in range(50, len(df_f) - 10):
        last = df_f.iloc[i]
        close = last['close']
        prev_high = df_f['high'].iloc[max(0, i - 20):i].max()

        if (close > prev_high and
                last['vol_ratio'] >= vol_mult and
                last['above_vwap'] == 1 and
                last['adx'] >= adx_min and
                rsi_min <= last['rsi_14'] <= rsi_max and
                last['body_ratio'] >= 0.6):

            atr = last['atr_14']
            sl  = close - atr_sl * atr
            tgt = close + atr_tgt * atr
            total += 1

            future = df_f.iloc[i + 1:i + 21]
            for _, c in future.iterrows():
                if c['low']  <= sl:  break
                if c['high'] >= tgt: wins += 1; break

            capital += atr_tgt * atr * 1 if (close + atr_tgt * atr) else -(atr_sl * atr)

    if total < 5:
        return 0.0
    wr = wins / total
    pf = (wr * atr_tgt) / ((1 - wr) * atr_sl) if (1 - wr) * atr_sl > 0 else 0
    sharpe = wr * atr_tgt - (1 - wr) * atr_sl
    return sharpe * pf


def optimize_strategy(df: pd.DataFrame, strategy: str = 'breakout',
                      n_trials: int = 200, capital: float = 10000.0) -> dict:
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    if strategy == 'breakout':
        obj = lambda trial: objective_breakout(trial, df, capital)
    else:
        obj = lambda trial: objective_breakout(trial, df, capital)  # fallback

    study = optuna.create_study(direction='maximize')
    study.optimize(obj, n_trials=n_trials, show_progress_bar=False)

    return {
        'strategy':   strategy,
        'best_value': round(study.best_value, 4),
        'best_params': study.best_params,
        'n_trials':   n_trials,
    }
