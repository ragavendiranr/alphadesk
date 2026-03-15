"""Feature engineering — computes 40+ technical indicators."""
import pandas as pd
import numpy as np
import ta


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Input df must have columns: open, high, low, close, volume
    Returns df with 40+ computed feature columns.
    """
    df = df.copy()
    close = df['close']
    high  = df['high']
    low   = df['low']
    vol   = df['volume']

    # ── RSI ─────────────────────────────────────────────────────────────────
    df['rsi_9']  = ta.momentum.RSIIndicator(close, window=9).rsi()
    df['rsi_14'] = ta.momentum.RSIIndicator(close, window=14).rsi()

    # ── MACD ─────────────────────────────────────────────────────────────────
    macd = ta.trend.MACD(close)
    df['macd']        = macd.macd()
    df['macd_signal'] = macd.macd_signal()
    df['macd_hist']   = macd.macd_diff()

    # ── EMA ──────────────────────────────────────────────────────────────────
    for w in [9, 20, 50, 200]:
        df[f'ema_{w}'] = ta.trend.EMAIndicator(close, window=w).ema_indicator()

    # ── EMA Cross signals ────────────────────────────────────────────────────
    df['ema9_above_20']  = (df['ema_9']  > df['ema_20']).astype(int)
    df['ema20_above_50'] = (df['ema_20'] > df['ema_50']).astype(int)
    df['ema50_above_200']= (df['ema_50'] > df['ema_200']).astype(int)
    df['bullish_stack']  = ((df['ema_9'] > df['ema_20']) & (df['ema_20'] > df['ema_50']) & (df['ema_50'] > df['ema_200'])).astype(int)

    # ── ATR ───────────────────────────────────────────────────────────────────
    df['atr_14'] = ta.volatility.AverageTrueRange(high, low, close, window=14).average_true_range()

    # ── Bollinger Bands ───────────────────────────────────────────────────────
    bb = ta.volatility.BollingerBands(close, window=20, window_dev=2)
    df['bb_upper']  = bb.bollinger_hband()
    df['bb_middle'] = bb.bollinger_mavg()
    df['bb_lower']  = bb.bollinger_lband()
    df['bb_pct']    = bb.bollinger_pband()

    # ── ADX ───────────────────────────────────────────────────────────────────
    adx = ta.trend.ADXIndicator(high, low, close, window=14)
    df['adx']      = adx.adx()
    df['plus_di']  = adx.adx_pos()
    df['minus_di'] = adx.adx_neg()

    # ── Stochastic ────────────────────────────────────────────────────────────
    stoch = ta.momentum.StochasticOscillator(high, low, close, window=14, smooth_window=3)
    df['stoch_k'] = stoch.stoch()
    df['stoch_d'] = stoch.stoch_signal()

    # ── OBV ───────────────────────────────────────────────────────────────────
    df['obv'] = ta.volume.OnBalanceVolumeIndicator(close, vol).on_balance_volume()

    # ── CCI ───────────────────────────────────────────────────────────────────
    df['cci'] = ta.trend.CCIIndicator(high, low, close, window=20).cci()

    # ── ROC ───────────────────────────────────────────────────────────────────
    df['roc'] = ta.momentum.ROCIndicator(close, window=12).roc()

    # ── Williams %R ───────────────────────────────────────────────────────────
    df['willr'] = ta.momentum.WilliamsRIndicator(high, low, close, lbp=14).williams_r()

    # ── VWAP ─────────────────────────────────────────────────────────────────
    df['vwap'] = (close * vol).cumsum() / vol.cumsum()
    df['vwap_deviation'] = ((close - df['vwap']) / df['vwap'] * 100).round(4)
    df['above_vwap'] = (close > df['vwap']).astype(int)

    # ── Volume features ───────────────────────────────────────────────────────
    df['vol_ma20']   = vol.rolling(20).mean()
    df['vol_ratio']  = (vol / df['vol_ma20']).round(3)
    df['vol_spike']  = (df['vol_ratio'] > 1.5).astype(int)

    # ── Price position (52-week) ──────────────────────────────────────────────
    periods_252 = min(252, len(df))
    df['high_52w'] = high.rolling(periods_252).max()
    df['low_52w']  = low.rolling(periods_252).min()
    df['pct_from_52w_high'] = ((close - df['high_52w']) / df['high_52w'] * 100).round(2)
    df['pct_from_52w_low']  = ((close - df['low_52w'])  / df['low_52w']  * 100).round(2)

    # ── Candle features ───────────────────────────────────────────────────────
    df['candle_body']  = abs(df['close'] - df['open'])
    df['candle_range'] = df['high'] - df['low']
    df['body_ratio']   = (df['candle_body'] / df['candle_range'].replace(0, np.nan)).fillna(0).round(3)
    df['is_bullish']   = (df['close'] > df['open']).astype(int)

    # ── Candle patterns ───────────────────────────────────────────────────────
    df['doji']         = (df['body_ratio'] < 0.1).astype(int)
    df['hammer']       = ((df['body_ratio'] < 0.3) & ((df['close'] - df['low']) > 2 * df['candle_body'])).astype(int)
    df['shooting_star']= ((df['body_ratio'] < 0.3) & ((df['high'] - df['close']) > 2 * df['candle_body'])).astype(int)

    # Bullish engulfing
    prev_body   = df['candle_body'].shift(1)
    prev_bull   = df['is_bullish'].shift(1)
    df['engulfing_bull'] = (
        (df['is_bullish'] == 1) & (prev_bull == 0) &
        (df['close'] > df['open'].shift(1)) & (df['open'] < df['close'].shift(1))
    ).astype(int)

    # ── Time features ─────────────────────────────────────────────────────────
    if hasattr(df.index, 'hour'):
        df['hour']        = df.index.hour
        df['minute']      = df.index.minute
        df['day_of_week'] = df.index.dayofweek
        # Best trading window (9:30–11:30 AM IST)
        df['prime_window'] = (
            ((df['hour'] == 9)  & (df['minute'] >= 30)) |
            ((df['hour'] == 10)) |
            ((df['hour'] == 11) & (df['minute'] <= 30))
        ).astype(int)

    # ── Volatility regime ─────────────────────────────────────────────────────
    atr_pct     = df['atr_14'] / close * 100
    atr_90      = atr_pct.rolling(50).quantile(0.9)
    atr_10      = atr_pct.rolling(50).quantile(0.1)
    df['vol_regime'] = np.where(atr_pct > atr_90, 2,  # high
                        np.where(atr_pct < atr_10, 0,  # low
                                 1))                    # normal

    # ── Market structure (HH/HL/LH/LL) ───────────────────────────────────────
    df['hh'] = (high > high.shift(1)).astype(int)
    df['hl'] = (low  > low.shift(1)).astype(int)
    df['lh'] = (high < high.shift(1)).astype(int)
    df['ll'] = (low  < low.shift(1)).astype(int)
    df['trend_score'] = df['hh'] + df['hl'] - df['lh'] - df['ll']

    # ── MACD histogram trend (3 consecutive increases) ────────────────────────
    df['macd_hist_rising'] = (
        (df['macd_hist'] > df['macd_hist'].shift(1)) &
        (df['macd_hist'].shift(1) > df['macd_hist'].shift(2))
    ).astype(int)

    # ── Clean up ─────────────────────────────────────────────────────────────
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.fillna(0, inplace=True)

    return df


FEATURE_COLS = [
    'rsi_9', 'rsi_14', 'macd', 'macd_signal', 'macd_hist',
    'ema9_above_20', 'ema20_above_50', 'ema50_above_200', 'bullish_stack',
    'atr_14', 'bb_pct', 'adx', 'plus_di', 'minus_di',
    'stoch_k', 'stoch_d', 'cci', 'roc', 'willr',
    'vwap_deviation', 'above_vwap', 'vol_ratio', 'vol_spike',
    'pct_from_52w_high', 'pct_from_52w_low',
    'body_ratio', 'is_bullish', 'doji', 'hammer', 'shooting_star',
    'engulfing_bull', 'vol_regime', 'trend_score', 'macd_hist_rising',
]
