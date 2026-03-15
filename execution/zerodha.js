'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { KiteConnect } = require('kiteconnect');
const speakeasy        = require('speakeasy');
const axios            = require('axios');
const logger           = require('../backend/src/config/logger');

const KITE_API     = 'https://api.kite.trade';
const KITE_OMS_API = 'https://kite.zerodha.com/oms';

class ZerodhaClient {
  constructor() {
    this.kite = new KiteConnect({
      api_key: process.env.ZERODHA_API_KEY,
    });
    this.accessToken = null;
    this.enctoken    = null;
    this.tokenExpiry = null;
  }

  // Returns Authorization header — enctoken takes priority over access_token
  _authHeader() {
    if (this.enctoken) return `enctoken ${this.enctoken}`;
    return `token ${process.env.ZERODHA_API_KEY}:${this.accessToken}`;
  }

  // Make authenticated request to Kite REST API
  async _req(method, path, params = {}) {
    // Use OMS API with enctoken, KiteConnect API with access_token
    const baseUrl = this.enctoken ? KITE_OMS_API : KITE_API;
    const cfg = {
      method,
      url: `${baseUrl}${path}`,
      headers: {
        'X-Kite-Version': '3',
        'Authorization': this._authHeader(),
      },
    };
    if (method === 'GET') cfg.params = params;
    else { cfg.data = new URLSearchParams(params); cfg.headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    const resp = await axios(cfg);
    return resp.data?.data ?? resp.data;
  }

  // ── Auto-login with TOTP (uses enctoken from cookie) ─────────────────────
  async autoLogin() {
    try {
      const totp = speakeasy.totp({
        secret:   process.env.ZERODHA_TOTP_SECRET,
        encoding: 'base32',
      });

      logger.info('Initiating Zerodha auto-login...', { module: 'zerodha' });

      // Step 1: Login — get request_id
      const loginResp = await axios.post(
        'https://kite.zerodha.com/api/login',
        new URLSearchParams({
          user_id:  process.env.ZERODHA_CLIENT_ID,
          password: process.env.ZERODHA_PASSWORD,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const requestId = loginResp.data?.data?.request_id;
      if (!requestId) throw new Error('Login failed: no request_id');

      // Step 2: Submit TOTP — Zerodha now returns enctoken in Set-Cookie (HTTP 200)
      const totpResp = await axios.post(
        'https://kite.zerodha.com/api/twofa',
        new URLSearchParams({
          user_id:      process.env.ZERODHA_CLIENT_ID,
          request_id:   requestId,
          twofa_value:  totp,
          twofa_type:   'totp',
          skip_session: '',
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          maxRedirects: 0,
          validateStatus: s => s < 500,
        }
      );

      // Extract enctoken from Set-Cookie header
      const setCookies = [].concat(totpResp.headers['set-cookie'] || []);
      let enctoken = null;
      for (const cookie of setCookies) {
        const m = cookie.match(/enctoken=([^;]+)/);
        if (m) { enctoken = decodeURIComponent(m[1]); break; }
      }

      if (enctoken) {
        this.enctoken    = enctoken;
        this.accessToken = enctoken; // also store for KiteTicker
        this.tokenExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000);
        this.kite.setAccessToken(enctoken);
        logger.info(`✅ Zerodha login via enctoken. Valid until ${this.tokenExpiry.toLocaleTimeString()}`, { module: 'zerodha' });
        return enctoken;
      }

      // Fallback: try request_token from Location header (legacy flow)
      const loc = totpResp.headers?.location || '';
      const requestToken = loc.split('request_token=')[1]?.split('&')[0];
      if (requestToken) {
        const session = await this.kite.generateSession(requestToken, process.env.ZERODHA_API_SECRET);
        this.accessToken = session.access_token;
        this.enctoken    = null;
        this.tokenExpiry = new Date(Date.now() + 8 * 60 * 60 * 1000);
        this.kite.setAccessToken(this.accessToken);
        logger.info(`✅ Zerodha login via access_token. Valid until ${this.tokenExpiry.toLocaleTimeString()}`, { module: 'zerodha' });
        return this.accessToken;
      }

      throw new Error('TOTP auth failed: no enctoken or request_token in response');
    } catch (err) {
      logger.error(`Zerodha auto-login failed: ${err.message}`, { module: 'zerodha' });
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
    if (!this.enctoken && !this.accessToken || (this.tokenExpiry && new Date() > this.tokenExpiry)) {
      await this.autoLogin();
    }
  }

  // ── Market Data ──────────────────────────────────────────────────────────
  async getQuote(symbol, exchange = 'NSE') {
    await this.ensureAuth();
    const data = await this._req('GET', '/quote', { i: `${exchange}:${symbol}` });
    return data[`${exchange}:${symbol}`];
  }

  async getHistoricalData(symbol, from, to, interval, exchange = 'NSE') {
    await this.ensureAuth();
    const instr = await this.getInstrumentToken(symbol, exchange);
    const data  = await this._req('GET', `/instruments/historical/${instr.instrument_token}/${interval}`, {
      from, to, continuous: 0, oi: 0,
    });
    return data?.candles ?? data;
  }

  async getInstrumentToken(symbol, exchange = 'NSE') {
    await this.ensureAuth();
    const instruments = await this.kite.getInstruments(exchange);
    return instruments.find(i => i.tradingsymbol === symbol);
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  async placeOrder(params) {
    await this.ensureAuth();
    const variety = params.variety || 'regular';
    const data = await this._req('POST', `/orders/${variety}`, {
      exchange:         params.exchange || 'NSE',
      tradingsymbol:    params.symbol,
      transaction_type: params.type,
      quantity:         params.qty,
      product:          params.product || 'MIS',
      order_type:       params.orderType || 'LIMIT',
      price:            params.price || undefined,
      trigger_price:    params.triggerPrice || undefined,
      tag:              params.tag || 'alphadesk',
    });
    const orderId = data?.order_id;
    logger.info(`Order placed: ${params.symbol} ${params.type} x${params.qty} orderId=${orderId}`, { module: 'zerodha' });
    return { orderId };
  }

  async modifyOrder(orderId, params) {
    await this.ensureAuth();
    return this._req('PUT', `/orders/regular/${orderId}`, params);
  }

  async cancelOrder(orderId) {
    await this.ensureAuth();
    return this._req('DELETE', `/orders/regular/${orderId}`);
  }

  async getOrders() {
    await this.ensureAuth();
    return this._req('GET', '/orders');
  }

  async getPositions() {
    await this.ensureAuth();
    return this._req('GET', '/portfolio/positions');
  }

  async getHoldings() {
    await this.ensureAuth();
    return this._req('GET', '/portfolio/holdings');
  }

  async getFunds() {
    await this.ensureAuth();
    return this._req('GET', '/user/margins');
  }

  async getProfile() {
    await this.ensureAuth();
    return this._req('GET', '/user/profile');
  }

  async getStatus() {
    try {
      await this.ensureAuth();
      const profile = await this.getProfile();
      return {
        connected:   true,
        userId:      profile.user_id,
        userName:    profile.user_name,
        tokenExpiry: this.tokenExpiry,
      };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }

  // ── Square off all MIS ────────────────────────────────────────────────────
  async squareOffAll() {
    await this.ensureAuth();
    const positions = await this.getPositions();
    const mis = (positions?.net || []).filter(p => p.product === 'MIS' && p.quantity !== 0);
    const results = [];
    for (const pos of mis) {
      try {
        const type = pos.quantity > 0 ? 'SELL' : 'BUY';
        const r = await this.placeOrder({
          symbol: pos.tradingsymbol, exchange: pos.exchange,
          type, qty: Math.abs(pos.quantity), product: 'MIS', orderType: 'MARKET', tag: 'AD_SQUAREOFF',
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
    ticker.on('ticks',        onTick);
    ticker.on('connect',      () => { logger.info('KiteTicker connected', { module: 'zerodha' }); ticker.subscribe(tokens); ticker.setMode(ticker.modeFull, tokens); });
    ticker.on('disconnected', () => logger.warn('KiteTicker disconnected', { module: 'zerodha' }));
    ticker.on('error',        (err) => logger.error(`KiteTicker error: ${err}`, { module: 'zerodha' }));
    ticker.connect();
    return ticker;
  }
}

module.exports = new ZerodhaClient();
