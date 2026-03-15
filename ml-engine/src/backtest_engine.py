"""Vectorized backtest engine with Monte Carlo simulation."""
import numpy as np
import pandas as pd
from feature_engine import compute_features
from signal_generator import SignalGenerator


def run_backtest(df: pd.DataFrame, generator: SignalGenerator,
                 symbol: str = 'TEST', initial_capital: float = 10000.0) -> dict:
    df = compute_features(df.copy())
    trades = []
    capital = initial_capital
    equity  = [{'date': df.index[0] if hasattr(df.index[0], 'isoformat') else str(df.index[0]),
                 'equity': capital}]

    i = 50
    while i < len(df) - 10:
        window = df.iloc[max(0, i - 100):i + 1]
        sig = generator.generate(window, symbol)
        if sig and sig.get('rl_agree') and sig.get('confidence', 0) >= 75:
            entry  = sig['entry']
            sl     = sig['stoploss']
            tgt    = sig['target1']
            sl_dist = abs(entry - sl)
            qty     = max(1, int((capital * 0.01) / sl_dist))

            # Simulate trade — check next 20 candles for outcome
            result_candles = df.iloc[i + 1:i + 21]
            hit_sl = hit_tgt = False
            for _, c in result_candles.iterrows():
                if sig['signal'] == 'BUY':
                    if c['low']  <= sl:  hit_sl  = True; break
                    if c['high'] >= tgt: hit_tgt = True; break
                else:
                    if c['high'] >= sl:  hit_sl  = True; break
                    if c['low']  <= tgt: hit_tgt = True; break

            if hit_sl:
                pnl = -sl_dist * qty
            elif hit_tgt:
                pnl = abs(entry - tgt) * qty
            else:
                exit_price = df.iloc[i + 20]['close']
                pnl = (exit_price - entry if sig['signal'] == 'BUY' else entry - exit_price) * qty

            charges = min(40, (entry + (sl if hit_sl else tgt)) * qty * 0.0003)
            net_pnl = pnl - charges
            capital += net_pnl

            trades.append({
                'idx': i, 'signal': sig['signal'], 'strategy': sig['strategy'],
                'entry': entry, 'qty': qty, 'pnl': round(pnl, 2),
                'net_pnl': round(net_pnl, 2), 'outcome': 'WIN' if pnl > 0 else 'LOSS',
            })
            equity.append({
                'date': str(df.index[i]),
                'equity': round(capital, 2),
            })
            i += 21
        else:
            i += 1

    return _compute_metrics(trades, initial_capital, capital, equity)


def _compute_metrics(trades, initial, final, equity) -> dict:
    if not trades:
        return {'total_trades': 0, 'net_pnl': 0, 'win_rate': 0, 'equity_curve': equity}

    wins   = [t for t in trades if t['pnl'] > 0]
    losses = [t for t in trades if t['pnl'] <= 0]
    n      = len(trades)
    gross_profit = sum(t['pnl'] for t in wins)
    gross_loss   = abs(sum(t['pnl'] for t in losses))

    pf      = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    wr      = len(wins) / n
    avg_win = gross_profit / len(wins) if wins   else 0
    avg_los = gross_loss   / len(losses) if losses else 0
    exp     = wr * avg_win - (1 - wr) * avg_los

    # Drawdown
    equities = [e['equity'] for e in equity]
    peak     = equities[0]
    max_dd   = 0.0
    for e in equities:
        if e > peak: peak = e
        dd = (peak - e) / peak
        if dd > max_dd: max_dd = dd

    # Returns for Sharpe
    eq_s = pd.Series(equities)
    rets = eq_s.pct_change().dropna()
    sharpe  = (rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else 0
    neg_ret = rets[rets < 0]
    sortino = (rets.mean() / neg_ret.std() * np.sqrt(252)) if len(neg_ret) > 0 and neg_ret.std() > 0 else 0

    net_pnl = final - initial
    cagr    = (final / initial) ** (252 / max(len(equity), 1)) - 1 if initial > 0 else 0
    calmar  = (cagr / max_dd) if max_dd > 0 else 0

    return {
        'total_trades':   n,
        'won':            len(wins),
        'lost':           len(losses),
        'win_rate':       round(wr * 100, 2),
        'gross_profit':   round(gross_profit, 2),
        'gross_loss':     round(gross_loss, 2),
        'profit_factor':  round(pf, 3),
        'sharpe_ratio':   round(float(sharpe), 3),
        'sortino_ratio':  round(float(sortino), 3),
        'max_drawdown':   round(max_dd * 100, 2),
        'calmar_ratio':   round(float(calmar), 3),
        'expectancy':     round(exp, 2),
        'avg_win':        round(avg_win, 2),
        'avg_loss':       round(avg_los, 2),
        'best_trade':     max((t['pnl'] for t in trades), default=0),
        'worst_trade':    min((t['pnl'] for t in trades), default=0),
        'net_pnl':        round(net_pnl, 2),
        'cagr':           round(cagr * 100, 2),
        'initial_capital': initial,
        'final_capital':   round(final, 2),
        'equity_curve':   equity,
        'trades':         trades,
    }


def monte_carlo(metrics: dict, n_sims: int = 1000) -> dict:
    """Shuffle trade order 1000 times to get distribution of outcomes."""
    trades = metrics.get('trades', [])
    if not trades:
        return {}
    pnls       = [t['net_pnl'] for t in trades]
    initial    = metrics['initial_capital']
    end_equities = []

    for _ in range(n_sims):
        shuffled = np.random.choice(pnls, size=len(pnls), replace=False)
        end_equities.append(initial + float(np.sum(shuffled)))

    arr = np.array(end_equities)
    return {
        'simulations':       n_sims,
        'median_final':      round(float(np.median(arr)), 2),
        'p5_final':          round(float(np.percentile(arr, 5)), 2),
        'p95_final':         round(float(np.percentile(arr, 95)), 2),
        'prob_profitable':   round(float(np.mean(arr > initial)) * 100, 1),
    }
