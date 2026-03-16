'use strict';
const axios  = require('axios');
const { Signal, Trade } = require('../../../database/schemas');
const executionService   = require('./executionService');
const logger = require('../config/logger');

const ML_URL = () => process.env.ML_ENGINE_URL || 'http://localhost:5001';

class SignalService {
  // Called by scheduler every 3 minutes — uses TA engine, ML as bonus layer
  async runScanCycle(symbols = []) {
    // Use pure TA engine as primary driver
    try {
      const techSignalSvc = require('./techSignalService');
      const taSignals = await techSignalSvc.runTASignalScan(symbols.length ? symbols : undefined);
      if (taSignals.length > 0) return taSignals;
    } catch (err) {
      logger.warn(`TA scan failed, falling back to symbol loop: ${err.message}`, { module: 'signalService' });
    }

    // Fallback: per-symbol ML (usually offline)
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
    // Try ML engine first
    let data = null;
    try {
      const resp = await axios.post(`${ML_URL()}/predict`, { symbol, timeframe }, { timeout: 8000 });
      data = resp.data;
    } catch {
      // ML offline — fall through to TA
    }

    if (data && data.signal) {
      const minConf = Number(process.env.ML_MIN_CONFIDENCE) || 65;
      if (data.confidence >= minConf && (data.confirmations || []).length >= 3) {
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
          expiry:      new Date(Date.now() + 10 * 60 * 1000),
        });
        logger.info(`ML signal: ${symbol} ${data.signal} @ ${data.entry} [${data.confidence}%]`, { module: 'signalService' });
        return signal;
      }
    }

    // TA fallback for single symbol
    try {
      const techSignalSvc = require('./techSignalService');
      const result = await techSignalSvc.analyseSymbol(symbol, timeframe);
      if (!result) return null;
      const sig = await Signal.create({
        symbol: result.symbol.toUpperCase(),
        exchange: 'NSE',
        strategy: result.strategy,
        type:     result.direction,
        timeframe: result.timeframe,
        entry:    result.entry,
        stoploss: result.stoploss,
        target1:  result.target1,
        target2:  result.target2,
        riskReward: result.rr,
        confidence: result.confidence,
        confirmations: result.confirmations,
        reasons:  result.confirmations,
        regime:   'TA_GENERATED',
        status:   'PENDING',
        expiry:   new Date(Date.now() + 10 * 60 * 1000),
      });
      logger.info(`TA signal: ${symbol} ${result.direction} @ ${result.entry} [${result.confidence}%]`, { module: 'signalService' });
      return sig;
    } catch (err) {
      logger.warn(`TA fallback failed for ${symbol}: ${err.message}`, { module: 'signalService' });
      return null;
    }
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
