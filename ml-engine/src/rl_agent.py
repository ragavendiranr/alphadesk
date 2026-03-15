"""Reinforcement Learning agent using Stable Baselines3 PPO."""
import os
import numpy as np
import pandas as pd
import gymnasium as gym
from gymnasium import spaces
from stable_baselines3 import PPO
from stable_baselines3.common.env_checker import check_env
from feature_engine import compute_features, FEATURE_COLS

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models', 'saved')
os.makedirs(MODEL_DIR, exist_ok=True)

N_FEATURES = len(FEATURE_COLS) + 4  # features + position + unrealised_pnl + entry_price + steps_in_trade


class TradingEnv(gym.Env):
    """Custom Gym environment for AlphaDesk RL agent."""
    metadata = {'render_modes': ['human']}

    def __init__(self, df: pd.DataFrame, initial_capital: float = 100000.0):
        super().__init__()
        self.df              = compute_features(df.copy())
        self.initial_capital = initial_capital
        self.obs_size        = N_FEATURES

        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(self.obs_size,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(4)  # 0=HOLD, 1=BUY, 2=SELL, 3=CLOSE
        self.reset()

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.idx           = 50            # start after warmup
        self.position      = 0            # 0=flat, 1=long, -1=short
        self.entry_price   = 0.0
        self.capital       = self.initial_capital
        self.unrealised    = 0.0
        self.steps_in_trade= 0
        return self._get_obs(), {}

    def _get_obs(self):
        row   = self.df.iloc[self.idx]
        feats = row[FEATURE_COLS].values.astype(np.float32)
        extra = np.array([
            float(self.position),
            float(self.unrealised / self.initial_capital),
            float(self.entry_price / (row['close'] + 1e-8) - 1),
            float(min(self.steps_in_trade, 100) / 100),
        ], dtype=np.float32)
        return np.concatenate([feats, extra])

    def step(self, action):
        row = self.df.iloc[self.idx]
        ltp = row['close']
        reward = 0.0

        # ── Actions ──────────────────────────────────────────────────────────
        if action == 1 and self.position == 0:   # BUY
            self.position   = 1
            self.entry_price = ltp
            self.steps_in_trade = 0

        elif action == 2 and self.position == 0:  # SELL (short)
            self.position   = -1
            self.entry_price = ltp
            self.steps_in_trade = 0

        elif action == 3 and self.position != 0:  # CLOSE
            pnl = (ltp - self.entry_price) * self.position
            reward = pnl / self.initial_capital * 100
            if pnl < 0:
                reward *= 2   # asymmetric penalty for losses
            self.capital  += pnl
            self.position  = 0
            self.entry_price = 0.0
            self.unrealised  = 0.0
            self.steps_in_trade = 0
        else:
            reward = -0.001   # time penalty

        # Bonus for staying flat in ranging
        if self.position == 0 and row.get('adx', 25) < 20:
            reward += 0.1

        # Update unrealised P&L
        if self.position != 0:
            self.unrealised = (ltp - self.entry_price) * self.position
            self.steps_in_trade += 1

        self.idx += 1
        done = self.idx >= len(self.df) - 1

        return self._get_obs(), reward, done, False, {}

    def render(self):
        row = self.df.iloc[self.idx]
        print(f"Step {self.idx} | pos={self.position} | unreal={self.unrealised:.2f} | capital={self.capital:.2f}")


def train_rl_agent(df: pd.DataFrame, timesteps: int = 100_000, version: str = 'v1'):
    env = TradingEnv(df)
    check_env(env)

    model = PPO(
        'MlpPolicy', env, verbose=1,
        learning_rate=3e-4,
        n_steps=2048,
        batch_size=64,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
    )
    model.learn(total_timesteps=timesteps)
    model.save(f'{MODEL_DIR}/rl_ppo_{version}')
    print(f'RL agent saved to {MODEL_DIR}/rl_ppo_{version}')
    return model


def load_rl_agent(version: str = 'v1'):
    path = f'{MODEL_DIR}/rl_ppo_{version}.zip'
    if not os.path.exists(path):
        return None
    return PPO.load(path)


def rl_predict(model, obs: np.ndarray) -> dict:
    """Returns action and probability."""
    if model is None:
        return {'action': 0, 'agree': True}  # default agree when no model
    action, _states = model.predict(obs, deterministic=True)
    return {'action': int(action), 'agree': int(action) in [1, 2]}
