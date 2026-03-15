export const formatINR = (val) => {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(val);
};

export const formatPct = (val, decimals = 1) =>
  val !== null && val !== undefined ? `${Number(val).toFixed(decimals)}%` : '—';

export const formatNum = (val, decimals = 2) =>
  val !== null && val !== undefined ? Number(val).toFixed(decimals) : '—';

export const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
};

export const formatTime = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
};

export const pnlColor = (val) =>
  Number(val) >= 0 ? '#22c55e' : '#ef4444';

export const confidenceColor = (val) => {
  if (val >= 85) return '#22c55e';
  if (val >= 75) return '#f59e0b';
  return '#ef4444';
};
