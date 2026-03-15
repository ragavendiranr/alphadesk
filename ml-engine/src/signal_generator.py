"""Multi-strategy signal generator with ML + RL validation."""
import numpy as np
import pandas as pd
from feature_engine import compute_features, FEATURE_COLS
from model_trainer import predict as ml_predict
from rl_agent import rl_predict
from sentiment_engine import sentiment_confidence_adjustment


def detect_smc_concepts(df: pd.DataFrame) -> dict:
    """Detect Smart Money Concepts: Order Blocks, FVG, MSS, Liquidity sweeps."""
    if len(df) < 10:
        return {}

    close = df['close']
    high  = df['high']
    low   = df['low']

    # Liquidity sweep: price breaks prev high/low then reverses
    prev_high   = high.shift(1).iloc[-1]
    prev_low    = low.shift(1).iloc[-1]
    curr_high   = high.iloc[-1]
    curr_low    = low.iloc[-1]
    curr_close  = close.iloc[-1]
    prev_close  = close.shift(1).iloc[-1]

    liquidity_sweep = False
    if curr_high > prev_high and curr_close < prev_high:
        liquidity_sweep = True   # swept buy-side liquidity
    if curr_low < prev_low and curr_close > prev_low:
        liquidity_sweep = True   # swept sell-side liquidity

    # Fair Value Gap (FVG): current candle's range doesn't overlap 2 candles ago
    fvg = False
    ob_level = None
    if len(df) >= 3:
        c2_high = df['high'].iloc[-3]
        c2_low  = df['low'].iloc[-3]
        c1_low  = df['low'].iloc[-2]
        c1_high = df['high'].iloc[-2]
        if c1_low > c2_high:    # bullish FVG
            fvg      = True
            ob_level = (c1_low + c2_high) / 2
        elif c1_high < c2_low:  # bearish FVG
            fvg      = True
            ob_level = (c1_high + c2_low) / 2

    # Market Structure Shift: previous HH then LH
    mss = None
    if len(df) >= 5:
        h = high.values
        if h[-1] < h[-2] and h[-2] > h[-3]:
            mss = 'BEARISH_MSS'
        elif h[-1] > h[-2] and h[-2] < h[-3]:
            mss = 'BULLISH_MSS'

    # Order Block: large opposing candle before strong move
    order_block = False
    if len(df) >= 4:
        body_sizes = abs(close - df['open'])
        if body_sizes.iloc[-3] > body_sizes.iloc[-20:].mean() * 1.5:
            order_block = True
            ob_level    = (df['open'].iloc[-3] + close.iloc[-3]) / 2

    return {
        'liquidity_sweep': liquidity_sweep,
        'fvg':             fvg,
        'mss':             mss,
        'order_block':     order_block,
        'ob_level':        ob_level,
    }


def generate_explanation(signal_type: str, features: dict, smc: dict) -> list:
    reasons = []
    if smc.get('liquidity_sweep'):
        reasons.append('Liquidity sweep detected — stop hunt complete')
    if features.get('above_vwap') and signal_type == 'BUY':
        reasons.append('Price holding above VWAP — bullish bias confirmed')
    if features.get('vol_ratio', 1) > 1.5:
        reasons.append(f"Volume {features.get('vol_ratio', 0):.1f}× above average — strong participation")
    if smc.get('order_block'):
        reasons.append(f"Order Block zone respected at {smc.get('ob_level', 0):.2f}")
    if smc.get('fvg'):
        reasons.append('Fair Value Gap present — price magnet in direction of trade')
    if smc.get('mss'):
        reasons.append(f"Market Structure Shift: {smc.get('mss')} — trend changing")
    if features.get('adx', 0) > 25:
        reasons.append(f"ADX = {features.get('adx', 0):.0f} — trend is strong")
    if abs(features.get('vwap_deviation', 1)) < 0.3:
        reasons.append('VWAP equilibrium — low deviation, clean entry')
    if features.get('rsi_14', 50) > 50 and signal_type == 'BUY':
        reasons.append(f"RSI = {features.get('rsi_14', 0):.0f} — momentum aligned bullish")
    if features.get('bullish_stack') and signal_type == 'BUY':
        reasons.append('EMA 9>20>50>200 — full bullish stack confirmed')
    return reasons


def run_breakout(df: pd.DataFrame, features: pd.Series) -> dict | None:
    """Breakout strategy: price above prev high, volume, ADX, VWAP."""
    if len(df) < 20:
        return None
    prev_day_high = df['high'].iloc[-20:-1].max()
    close = df['close'].iloc[-1]
    if close <= prev_day_high:
        return None
    if features.get('vol_ratio', 0) < 1.5:
        return None
    if features.get('above_vwap', 0) != 1:
        return None
    if features.get('adx', 0) < 25:
        return None
    if not (50 <= features.get('rsi_14', 0) <= 70):
        return None
    if features.get('body_ratio', 0) < 0.6:
        return None
    atr = features.get('atr_14', 0)
    return {
        'signal': 'BUY', 'strategy': 'BREAKOUT',
        'entry': round(close, 2),
        'stoploss': round(close - 1.5 * atr, 2),
        'target1':  round(close + 2 * atr, 2),
        'target2':  round(close + 3 * atr, 2),
        'risk_reward': 2.0,
    }


def run_mean_reversion(df: pd.DataFrame, features: pd.Series) -> dict | None:
    close = df['close'].iloc[-1]
    rsi   = features.get('rsi_14', 50)
    bb_pct = features.get('bb_pct', 0.5)
    adx    = features.get('adx', 25)
    if adx > 20:
        return None
    atr = features.get('atr_14', 0)
    if rsi < 30 and bb_pct < 0.1 and features.get('vol_spike', 0):
        return {
            'signal': 'BUY', 'strategy': 'MEAN_REVERSION',
            'entry': round(close, 2),
            'stoploss': round(close - 1.5 * atr, 2),
            'target1':  round(close + 1.5 * atr, 2),
            'target2':  round(close + 2.5 * atr, 2),
            'risk_reward': 1.5,
        }
    if rsi > 70 and bb_pct > 0.9 and features.get('vol_spike', 0):
        return {
            'signal': 'SELL', 'strategy': 'MEAN_REVERSION',
            'entry': round(close, 2),
            'stoploss': round(close + 1.5 * atr, 2),
            'target1':  round(close - 1.5 * atr, 2),
            'target2':  round(close - 2.5 * atr, 2),
            'risk_reward': 1.5,
        }
    return None


def run_momentum(df: pd.DataFrame, features: pd.Series) -> dict | None:
    close = df['close'].iloc[-1]
    if not features.get('bullish_stack'):
        return None
    if not features.get('macd_hist_rising'):
        return None
    if features.get('vol_ratio', 0) < 1.3:
        return None
    vwap_dev = features.get('vwap_deviation', 0)
    if not (0.2 <= vwap_dev <= 0.5):
        return None
    atr = features.get('atr_14', 0)
    return {
        'signal': 'BUY', 'strategy': 'MOMENTUM',
        'entry': round(close, 2),
        'stoploss': round(close - 1.0 * atr, 2),
        'target1':  round(close + 2.0 * atr, 2),
        'target2':  round(close + 3.5 * atr, 2),
        'risk_reward': 2.5,
    }


def run_vwap_reversal(df: pd.DataFrame, features: pd.Series) -> dict | None:
    close   = df['close'].iloc[-1]
    vwap_dev = features.get('vwap_deviation', 0)
    rsi      = features.get('rsi_14', 50)
    if abs(vwap_dev) < 0.5:
        return None
    atr = features.get('atr_14', 0)
    if vwap_dev < -0.5 and rsi < 40:   # oversold deviation → BUY
        return {
            'signal': 'BUY', 'strategy': 'VWAP_REVERSAL',
            'entry': round(close, 2),
            'stoploss': round(close - 1.0 * atr, 2),
            'target1':  round(features.get('vwap', close), 2),
            'target2':  round(features.get('vwap', close) + atr, 2),
            'risk_reward': 1.5,
        }
    if vwap_dev > 0.5 and rsi > 60:    # overbought deviation → SELL
        return {
            'signal': 'SELL', 'strategy': 'VWAP_REVERSAL',
            'entry': round(close, 2),
            'stoploss': round(close + 1.0 * atr, 2),
            'target1':  round(features.get('vwap', close), 2),
            'target2':  round(features.get('vwap', close) - atr, 2),
            'risk_reward': 1.5,
        }
    return None


def run_ict(df: pd.DataFrame, features: pd.Series, smc: dict) -> dict | None:
    close = df['close'].iloc[-1]
    atr   = features.get('atr_14', 0)
    if not (smc.get('liquidity_sweep') or smc.get('order_block') or smc.get('fvg')):
        return None
    signal_type = 'BUY' if features.get('above_vwap') else 'SELL'
    if smc.get('mss') == 'BEARISH_MSS':
        signal_type = 'SELL'
    elif smc.get('mss') == 'BULLISH_MSS':
        signal_type = 'BUY'
    return {
        'signal': signal_type, 'strategy': 'ICT_SMC',
        'entry': round(close, 2),
        'stoploss': round(close - 1.5 * atr, 2) if signal_type == 'BUY' else round(close + 1.5 * atr, 2),
        'target1':  round(close + 2.5 * atr, 2) if signal_type == 'BUY' else round(close - 2.5 * atr, 2),
        'target2':  round(close + 4.0 * atr, 2) if signal_type == 'BUY' else round(close - 4.0 * atr, 2),
        'risk_reward': 2.5,
    }


class SignalGenerator:
    def __init__(self, xgb_model=None, rf_model=None, rl_model=None):
        self.xgb = xgb_model
        self.rf  = rf_model
        self.rl  = rl_model

    def generate(self, df: pd.DataFrame, symbol: str, regime: str = 'UNKNOWN',
                 sentiment: dict = None) -> dict | None:
        df_feat = compute_features(df.copy())
        if len(df_feat) < 50:
            return None

        last    = df_feat.iloc[-1]
        smc     = detect_smc_concepts(df_feat)
        features_dict = last[FEATURE_COLS].to_dict()

        # Run all strategies
        candidates = [
            run_breakout(df_feat, last),
            run_mean_reversion(df_feat, last),
            run_momentum(df_feat, last),
            run_vwap_reversal(df_feat, last),
            run_ict(df_feat, last, smc),
        ]
        raw = [c for c in candidates if c is not None]
        if not raw:
            return None

        # Pick strategy by regime
        strategy_map = {
            'TRENDING_UP':   ['BREAKOUT', 'MOMENTUM'],
            'TRENDING_DOWN': ['MEAN_REVERSION', 'ICT_SMC'],
            'RANGING':       ['MEAN_REVERSION', 'VWAP_REVERSAL'],
            'VOLATILE':      ['ICT_SMC'],
        }
        allowed  = strategy_map.get(regime, [s['strategy'] for s in raw])
        filtered = [s for s in raw if s['strategy'] in allowed] or raw
        best     = sorted(filtered, key=lambda x: x.get('risk_reward', 1), reverse=True)[0]

        # ML prediction
        ml_result = {'confidence': 50.0, 'win': False}
        if self.xgb and self.rf:
            feat_arr = last[FEATURE_COLS].values.astype(np.float32)
            ml_result = ml_predict(self.xgb, self.rf, feat_arr)

        # Sentiment adjustment
        if sentiment:
            ml_result['confidence'] = sentiment_confidence_adjustment(
                ml_result['confidence'], best['signal'], sentiment
            )

        # RL check
        rl_result = {'agree': True}
        if self.rl:
            obs = np.append(last[FEATURE_COLS].values.astype(np.float32),
                            [0.0, 0.0, 0.0, 0.0])
            rl_result = rl_predict(self.rl, obs)

        # Build confirmations
        confirmations = []
        if last.get('bullish_stack') and best['signal'] == 'BUY':
            confirmations.append('EMA bullish stack (9>20>50>200)')
        if last.get('macd_hist', 0) > 0:
            confirmations.append('MACD positive momentum')
        if last.get('vol_ratio', 0) > 1.3:
            confirmations.append(f"Volume {last.get('vol_ratio', 0):.1f}× above average")
        if last.get('above_vwap') and best['signal'] == 'BUY':
            confirmations.append('Price above VWAP')
        if last.get('adx', 0) > 25:
            confirmations.append(f"ADX = {last.get('adx', 0):.0f} strong trend")
        if smc.get('order_block'):
            confirmations.append('Order Block identified')
        if smc.get('liquidity_sweep'):
            confirmations.append('Liquidity sweep complete')
        if ml_result['confidence'] >= 75:
            confirmations.append(f"ML model: {ml_result['confidence']:.0f}% win probability")
        if rl_result.get('agree'):
            confirmations.append('RL agent confirms signal')

        reasons = generate_explanation(best['signal'], features_dict, smc)

        return {
            **best,
            'symbol':          symbol,
            'confidence':      round(ml_result['confidence'], 1),
            'ml_score':        round(ml_result['confidence'] / 100, 4),
            'rl_agree':        bool(rl_result.get('agree', True)),
            'regime':          regime,
            'sentiment_score': sentiment.get('score', 50) if sentiment else 50,
            'confirmations':   confirmations,
            'reasons':         reasons,
            'features':        {k: round(float(v), 4) if isinstance(v, (int, float, np.floating)) else v
                                for k, v in features_dict.items()},
            'smc':             smc,
            'target3':         round(best['target2'] * 1.5 - best['entry'] * 0.5, 2),
        }
