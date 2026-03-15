'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { KiteConnect } = require('kiteconnect');
const speakeasy        = require('speakeasy');
const axios            = require('axios');
const logger           = require('../backend/src/config/logger');

class ZerodhaClient {
  constructor() {
    this.kite = new KiteConnect({
      api_key: process.env.ZERODHA_API_KEY,
    });
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // ── Auto-login with TOTP ──────────────────────────────────────────────────
  async autoLogin() {
    try {
      const totp = speakeasy.totp({
        secret:   process.env.ZERODHA_TOTP_SECRET,
        encoding: 'base32',
      });

      logger.info('Initiating Zerodha auto-login...', { module: 'zerodha' });

      // Step 1: Get login session
      const loginResp = await axios.post(
        'https://kite.zerodha.com/api/login',
        new URLSearchParams({
          user_id:  process.env.ZERODHA_CLIENT_ID,
          password: process.env.ZERODHA_PASSWORD,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, withCredentials: true }
      );

      const requestId = loginResp.data?.data?.request_id;
      if (!requestId) throw new Error('Login failed: no request_id');

      // Step 2: Submit TOTP
      const totpResp = await axios.post(
        'https://kite.zerodha.com/api/twofa',
        new URLSearchParams({
          user_id:    process.env.ZERODHA_CLIENT_ID,
          request_id: requestId,
          twofa_value: totp,
          twofa_type:  'totp',
          skip_session: '',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, withCredentials: true }
      );

      const requestToken = totpResp.data?.data?.request_token || totpResp.headers?.location?.split('request_token=')[1]?.split('&')[0];
      if (!requestToken) throw new Error('TOTP auth failed: no request_token');

      // Step 3: Exchange request token for access token
      const session = await this.kite.generateSession(requestToken, process.env.ZERODHA_API_SECRET);
      this.accessToken = session.access_token;
      this.tokenExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8h expiry
      this.kite.setAccessToken(this.accessToken);

      logger.info(`✅ Zerodha login successful. Token valid until ${this.tokenExpiry.toLocaleTimeString()}`, {
        module: 'zerodha',
      });

      return this.accessToken;
    } catch (err) {
      logger.error(`Zerodha auto-login failed: ${err.message}`, { module: 'zerodha' });
      // Send Telegram alert
      try {
        const bot = require('../telegram-bot/bot');
        const loginUrl = this.kite.getLoginURL();
        await bot.sendMessage(
          process.env.TELEGRAM_CHAT_ID,
          `⚠️ *Zerodha Auto-Login FAILED*\nError: ${err.message}\n\n[Manual Login Link](${loginUrl})`,
          { parse_mode: 'Markdown' }
        );
      } catch {}
      throw err;
    }
  }

  async ensureAuth() {
    if (!this.accessToken || (this.tokenExpiry && new Date() > this.tokenExpiry)) {
      await this.autoLogin();
    }
  }

  // ── Market Data ──────────────────────────────────────────────────────────
  async getQuote(symbol, exchange = 'NSE') {
    await this.ensureAuth();
    const key    = `${exchange}:${symbol}`;
    const quotes = await this.kite.getQuote([key]);
    return quotes[key];
  }

  async getHistoricalData(symbol, from, to, interval, exchange = 'NSE') {
    await this.ensureAuth();
    const instruments = await this.getInstrumentToken(symbol, exchange);
    return this.kite.getHistoricalData(instruments.instrument_token, interval, from, to);
  }

  async getInstrumentToken(symbol, exchange = 'NSE') {
    await this.ensureAuth();
    const instruments = await this.kite.getInstruments(exchange);
    return instruments.find(i => i.tradingsymbol === symbol);
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  async placeOrder(params) {
    await this.ensureAuth();
    const variety = params.variety || this.kite.VARIETY_REGULAR;
    const orderId = await this.kite.placeOrder(variety, {
      exchange:         params.exchange || 'NSE',
      tradingsymbol:    params.symbol,
      transaction_type: params.type, // BUY / SELL
      quantity:         params.qty,
      product:          params.product || 'MIS',
      order_type:       params.orderType || 'LIMIT',
      price:            params.price || undefined,
      trigger_price:    params.triggerPrice || undefined,
      tag:              params.tag || 'alphadesk',
    });
    logger.info(`Order placed: ${params.symbol} ${params.type} x${params.qty} orderId=${orderId}`, {
      module: 'zerodha',
    });
    return { orderId };
  }

  async modifyOrder(orderId, params) {
    await this.ensureAuth();
    return this.kite.modifyOrder(this.kite.VARIETY_REGULAR, orderId, params);
  }

  async cancelOrder(orderId) {
    await this.ensureAuth();
    return this.kite.cancelOrder(this.kite.VARIETY_REGULAR, orderId);
  }

  async getOrders() {
    await this.ensureAuth();
    return this.kite.getOrders();
  }

  async getPositions() {
    await this.ensureAuth();
    return this.kite.getPositions();
  }

  async getHoldings() {
    await this.ensureAuth();
    return this.kite.getHoldings();
  }

  async getFunds() {
    await this.ensureAuth();
    return this.kite.getMargins();
  }

  async getProfile() {
    await this.ensureAuth();
    return this.kite.getProfile();
  }

  async getStatus() {
    try {
      await this.ensureAuth();
      const profile = await this.kite.getProfile();
      return {
        connected: true,
        userId:    profile.user_id,
        userName:  profile.user_name,
        tokenExpiry: this.tokenExpiry,
      };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  // ── Square off all MIS ────────────────────────────────────────────────────
  async squareOffAll() {
    await this.ensureAuth();
    const positions = await this.kite.getPositions();
    const mis = (positions.net || []).filter(p => p.product === 'MIS' && p.quantity !== 0);
    const results = [];
    for (const pos of mis) {
      try {
        const type = pos.quantity > 0 ? 'SELL' : 'BUY';
        const r = await this.placeOrder({
          symbol:    pos.tradingsymbol,
          exchange:  pos.exchange,
          type,
          qty:       Math.abs(pos.quantity),
          product:   'MIS',
          orderType: 'MARKET',
          tag:       'AD_SQUAREOFF',
        });
        results.push({ symbol: pos.tradingsymbol, ...r });
      } catch (err) {
        results.push({ symbol: pos.tradingsymbol, error: err.message });
      }
    }
    return results;
  }

  // ── WebSocket Live Feed ────────────────────────────────────────────────────
  startTickerStream(tokens, onTick) {
    const { KiteTicker } = require('kiteconnect');
    const ticker = new KiteTicker({
      api_key:      process.env.ZERODHA_API_KEY,
      access_token: this.accessToken,
    });

    ticker.on('ticks',       onTick);
    ticker.on('connect',     () => { logger.info('KiteTicker connected', { module: 'zerodha' }); ticker.subscribe(tokens); ticker.setMode(ticker.modeFull, tokens); });
    ticker.on('disconnected', () => logger.warn('KiteTicker disconnected', { module: 'zerodha' }));
    ticker.on('error',        (err) => logger.error(`KiteTicker error: ${err}`, { module: 'zerodha' }));
    ticker.connect();
    return ticker;
  }
}

module.exports = new ZerodhaClient();
