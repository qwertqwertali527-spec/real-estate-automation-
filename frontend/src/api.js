async function req(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  get: (p) => req(p),
  post: (p, body) => req(p, { method: 'POST', body }),
  put: (p, body) => req(p, { method: 'PUT', body }),
  patch: (p, body) => req(p, { method: 'PATCH', body }),
  del: (p) => req(p, { method: 'DELETE' }),
};

export const fmtMoney = (n) =>
  n === null || n === undefined ? '—'
  : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`
  : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}K`
  : `$${n}`;

export const fmtPrice = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toLocaleString()}`);

export const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return s;
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
