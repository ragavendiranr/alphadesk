import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('alphadesk_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function useMarketData(symbol) {
  const [quote,   setQuote]   = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchQuote = useCallback(async () => {
    if (!symbol) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/api/market/quote/${encodeURIComponent(symbol)}`);
      setQuote(data);
    } catch {}
    finally { setLoading(false); }
  }, [symbol]);

  useEffect(() => {
    fetchQuote();
    const id = setInterval(fetchQuote, 5000);
    return () => clearInterval(id);
  }, [fetchQuote]);

  return { quote, loading, refetch: fetchQuote };
}
