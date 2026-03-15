import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { WS_URL } from '../utils/constants';

export default function useWebSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [ticks,     setTicks]     = useState({});
  const [tradeUpdates, setTradeUpdates] = useState([]);
  const [newSignals,   setNewSignals]   = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('alphadesk_token');
    socketRef.current = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    const s = socketRef.current;
    s.on('connect',    () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('tick', (data) => {
      setTicks(prev => ({ ...prev, [data.symbol]: data }));
    });

    s.on('trade:update', (data) => {
      setTradeUpdates(prev => [data, ...prev.slice(0, 49)]);
    });

    s.on('trade:sl_hit',     (data) => setTradeUpdates(prev => [{ ...data, event: 'SL_HIT' },     ...prev.slice(0, 49)]));
    s.on('trade:target_hit', (data) => setTradeUpdates(prev => [{ ...data, event: 'TARGET_HIT' }, ...prev.slice(0, 49)]));
    s.on('signal:new',       (data) => setNewSignals(prev => [data, ...prev.slice(0, 19)]));

    return () => s.disconnect();
  }, []);

  const subscribe = (symbol) => socketRef.current?.emit('subscribe:symbol', symbol);

  return { connected, ticks, tradeUpdates, newSignals, subscribe };
}
