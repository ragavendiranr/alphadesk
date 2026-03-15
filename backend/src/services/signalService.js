'use strict';
const axios  = require('axios');
const { Signal, Trade } = require('../../../database/schemas');
const executionService   = require('./executionService');
const logger = require('../config/logger');

const ML_URL = () => process.env.ML_ENGINE_URL || 'http://localhost:5001';

class SignalService {
  // Called by scheduler every 3 minutes
  async runScanCycle(symbols = []) {
    const results = [];
    for (const symbol of symbols) {
      try {
        const signal = await this.generateSignal(symbol);
        if (signal) results.push(signal);
      } catch (err) {
        logger.warn(`Signal scan failed for ${symbol}: ${err.message}`, { module: 'signalService' });
      }
    }
    return results;
  }

  async generateSignal(symbol, timeframe = '5m') {
    // Call ML engine for prediction
    const { data } = await axios.post(`${ML_URL()}/predict`, { symbol, timeframe }, { timeout: 15000 });
    if (!data || !data.signal) return null;

    // Require minimum confidence
    const minConf = Number(process.env.ML_MIN_CONFIDENCE) || 75;
    if (data.confidence < minConf) return null;

    // Require RL agreement
    if (!data.rl_agree) return null;

    // Require minimum 4 confirmations
    if ((data.confirmations || []).length < 4) return null;

    const signal = await Signal.create({
      symbol: symbol.toUpperCase(),
      exchange: 'NSE',
      strategy:    data.strategy,
      type:        data.signal,
      timeframe,
      entry:       data.entry,
      stoploss:    data.stoploss,
      target1:     data.target1,
      target2:     data.target2,
      target3:     data.target3,
      riskReward:  data.risk_reward,
      confidence:  data.confidence,
      mlScore:     data.ml_score,
      rlAgree:     data.rl_agree,
      regime:      data.regime,
      sentimentScore: data.sentiment_score,
      confirmations: data.confirmations,
      reasons:     data.reasons,
      features:    data.features,
      status:      'PENDING',
      expiry:      new Date(Date.now() + 10 * 60 * 1000), // 10 min expiry
    });

    logger.info(`New signal: ${symbol} ${data.signal} @ ${data.entry} [${data.confidence}% conf]`, {
      module: 'signalService',
    });

    return signal;
  }

  async approveSignal(signalId, approvedBy) {
    const signal = await Signal.findById(signalId);
    if (!signal) throw new Error('Signal not found');
    if (signal.status !== 'PENDING') throw new Error(`Signal is already ${signal.status}`);
    if (signal.expiry && signal.expiry < new Date()) {
      await Signal.findByIdAndUpdate(signalId, { status: 'EXPIRED' });
      throw new Error('Signal has expired');
    }

    signal.status     = 'APPROVED';
    signal.approvedBy = approvedBy;
    signal.approvedAt = new Date();
    await signal.save();

    // Execute the trade
    const trade = await executionService.executeSignal(signal);
    signal.status    = 'EXECUTED';
    signal.tradeId   = trade._id;
    signal.executedAt = new Date();
    await signal.save();

    return { signal, trade };
  }

  async manualScan(symbol, timeframe) {
    if (symbol) return [await this.generateSignal(symbol, timeframe)].filter(Boolean);
    const symbols = require('../../utils/constants').WATCHED_SYMBOLS || [];
    return this.runScanCycle(symbols);
  }

  // Expire stale pending signals
  async expireStaleSignals() {
    const result = await Signal.updateMany(
      { status: 'PENDING', expiry: { $lt: new Date() } },
      { status: 'EXPIRED' }
    );
    return result.modifiedCount;
  }
}

module.exports = new SignalService();
