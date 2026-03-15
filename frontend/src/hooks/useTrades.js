import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/constants';

const api = axios.create({ baseURL: BACKEND_URL });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('alphadesk_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default function useTrades() {
  const [openTrades,  setOpenTrades]  = useState([]);
  const [summary,     setSummary]     = useState(null);
  const [loading,     setLoading]     = useState(false);

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      const [openRes, summaryRes] = await Promise.all([
        api.get('/api/trades/open'),
        api.get('/api/trades/summary'),
      ]);
      setOpenTrades(openRes.data.trades || []);
      setSummary(summaryRes.data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, 15000);
    return () => clearInterval(id);
  }, [fetchTrades]);

  return { openTrades, summary, loading, refetch: fetchTrades };
}
