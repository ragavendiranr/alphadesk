'use strict';
const os    = require('os');
const axios = require('axios');
const { mongoose } = require('../config/db');

async function getSystemHealth() {
  const cpuLoad  = os.loadavg()[0];
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const memUsePct = ((1 - freeMem / totalMem) * 100).toFixed(1);

  let dbStatus = 'disconnected';
  try {
    if (mongoose.connection.readyState === 1) dbStatus = 'connected';
  } catch {}

  let mlStatus = 'offline';
  try {
    await axios.get(
      `${process.env.ML_ENGINE_URL || 'http://localhost:5001'}/health`,
      { timeout: 3000 }
    );
    mlStatus = 'online';
  } catch {}

  return {
    status:   'ok',
    uptime:   Math.floor(process.uptime()),
    cpu:      cpuLoad.toFixed(2),
    memory:   `${memUsePct}%`,
    db:       dbStatus,
    ml:       mlStatus,
    nodeEnv:  process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  };
}

module.exports = { getSystemHealth };
