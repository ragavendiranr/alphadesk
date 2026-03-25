'use strict';
const os    = require('os');
const axios = require('axios');
const { mongoose, getLastError } = require('../config/db');

// ── Structured single-service check with timeout + retries ────────────────────
async function checkService({ name, fn, retries = 3, timeoutMs = 5000 }) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), timeoutMs)),
      ]);
      return {
        service:    name,
        status:     result.status,   // 'PASS' | 'WARN' | 'FAIL'
        detail:     result.detail || null,
        latency_ms: Date.now() - t0,
        error_msg:  null,
        attempts:   attempt,
      };
    } catch (err) {
      if (attempt === retries) {
        return {
          service:    name,
          status:     'FAIL',
          detail:     null,
          latency_ms: Date.now() - t0,
          error_msg:  err.message,
          attempts:   attempt,
        };
      }
      // Exponential back-off before retry
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
}

// ── Individual service check functions ────────────────────────────────────────

async function checkDatabaseFn() {
  const state = mongoose.connection.readyState;
  // 0=disconnected 1=connected 2=connecting 3=disconnecting
  if (state === 1) return { status: 'PASS', detail: 'connected' };
  if (state === 2) return { status: 'WARN', detail: 'connecting' };
  const lastErr = getLastError();
  return { status: 'FAIL', detail: `readyState=${state}${lastErr ? ' | ' + lastErr.substring(0, 120) : ''}` };
}

async function checkMlFn() {
  const mlUrl   = process.env.ML_ENGINE_URL || '';
  const isLocal = !mlUrl || mlUrl.includes('localhost') || mlUrl.includes('127.0.0.1');
  if (isLocal) {
    // Rule-based ML engine runs inside the backend process — always online
    return { status: 'PASS', detail: 'rule-based-v1 (built-in)' };
  }
  const { data } = await axios.get(`${mlUrl}/health`, { timeout: 4000 });
  if (data?.status === 'ok' || data?.xgb !== undefined) return { status: 'PASS', detail: 'online' };
  return { status: 'WARN', detail: JSON.stringify(data) };
}

async function checkBackendFn() {
  // Backend is this process — no HTTP round-trip needed
  if (process.uptime() > 0) return { status: 'PASS', detail: `uptime=${Math.floor(process.uptime())}s` };
  return { status: 'FAIL', detail: 'process not running' };
}

// ── Full health check ─────────────────────────────────────────────────────────
async function getSystemHealth() {
  const cpuLoad   = os.loadavg()[0];
  const memUsePct = ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1);

  const [beResult, dbResult, mlResult] = await Promise.all([
    checkService({ name: 'backend',  fn: checkBackendFn,  retries: 1, timeoutMs: 2000 }),
    checkService({ name: 'database', fn: checkDatabaseFn, retries: 3, timeoutMs: 5000 }),
    checkService({ name: 'ml',       fn: checkMlFn,       retries: 3, timeoutMs: 5000 }),
  ]);

  // Legacy-compatible fields so existing callers still work unchanged
  const dbStatus = dbResult.status === 'PASS' ? 'connected'     : 'disconnected';
  const mlStatus = mlResult.status === 'PASS' ? 'online'
                 : mlResult.status === 'WARN' ? 'not_deployed'
                 :                              'offline';

  return {
    status:    'ok',
    uptime:    Math.floor(process.uptime()),
    cpu:       cpuLoad.toFixed(2),
    memory:    `${memUsePct}%`,
    db:        dbStatus,
    ml:        mlStatus,
    nodeEnv:   process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    // Structured per-service results for pre-market check
    checks: { backend: beResult, database: dbResult, ml: mlResult },
  };
}

module.exports = { getSystemHealth, checkService };
