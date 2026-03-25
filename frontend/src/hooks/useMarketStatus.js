import { useState, useEffect } from 'react';
import { BACKEND_URL } from '../utils/constants';

// Calculate market status purely from IST clock — no API needed
function calcFromIST() {
  const istMs = Date.now() + (5 * 60 + 30) * 60 * 1000;
  const ist   = new Date(istMs);
  const h     = ist.getUTCHours();
  const m     = ist.getUTCMinutes();
  const day   = ist.getUTCDay(); // 0=Sun, 6=Sat
  const mins  = h * 60 + m;
  const isWeekend = day === 0 || day === 6;

  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const current_time_ist = `${hh}:${mm}`;

  let status  = 'CLOSED';
  let is_open = false;

  if (!isWeekend) {
    if (mins >= 9 * 60 && mins < 9 * 60 + 15) {
      status = 'PRE_OPEN';
    } else if (mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30) {
      status  = 'OPEN';
      is_open = true;
    }
  }

  // Next open string
  let next_open = 'Monday 9:15 AM IST';
  if (!isWeekend) {
    if (mins < 9 * 60 + 15) next_open = 'Today 9:15 AM IST';
    else if (day >= 1 && day <= 4) next_open = 'Tomorrow 9:15 AM IST';
  }

  return { status, is_open, current_time_ist, next_open };
}

export default function useMarketStatus() {
  const [marketStatus, setMarketStatus] = useState(calcFromIST);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      // Always compute client-side first so UI is never wrong
      const local = calcFromIST();

      try {
        const token = localStorage.getItem('alphadesk_token');
        const res   = await fetch(`${BACKEND_URL}/api/market/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setMarketStatus({
            status:           data.status          || local.status,
            is_open:          data.is_open          ?? local.is_open,
            current_time_ist: data.current_time_ist || local.current_time_ist,
            next_open:        data.next_open        || local.next_open,
          });
          return;
        }
      } catch {
        // API unavailable — fall through to local calculation
      }

      if (!cancelled) setMarketStatus(local);
    }

    refresh();
    const id = setInterval(refresh, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return marketStatus;
}
