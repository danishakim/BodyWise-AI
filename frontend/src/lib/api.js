// Thin fetch wrapper: timeouts, JSON errors, one place for every endpoint.
// Web: same origin (''). Android app: VITE_API_BASE from .env.android, e.g. https://bodywise.vercel.app
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

async function request(path, { method = 'GET', json, form, timeout = 60000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { 'X-BodyWise': '1' };                     // custom header → blocks cross-site form posts
    if (json) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, { method, signal: ctrl.signal, headers, body: json ? JSON.stringify(json) : form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.code = data.code;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The request took too long. Please try again.');
    if (err instanceof TypeError) throw new Error('Cannot reach the BodyWise server. Is it running?');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const post = (path, json, opts) => request(path, { method: 'POST', json, ...opts });

function imageForm(blob, fields = {}) {
  const form = new FormData();
  form.append('image', blob, 'photo.jpg');
  for (const [k, v] of Object.entries(fields)) form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  return form;
}

export const api = {
  status: () => request('/api/status', { timeout: 8000 }),
  foods: () => request('/api/foods'),
  assess: (profile) => post('/api/assess', profile),
  plan: (profile, prefs) => post('/api/plan', { profile, prefs }, { timeout: 180000 }),
  swap: (slot, kcal, vegetarian, name) => post('/api/swap', { slot, kcal, vegetarian, name }),
  scanMenu: (blob, fields) => request('/api/menu/scan', { method: 'POST', form: imageForm(blob, fields) }),
  scanLabel: (blob) => request('/api/label/scan', { method: 'POST', form: imageForm(blob) }),
  predict: (weights, target_kg, goal) => post('/api/predict', { weights, target_kg, goal }),
  rebalance: (profile, extra_kcal, days_before, days_after) => post('/api/rebalance', { profile, extra_kcal, days_before, days_after }),
  coach: (profile, messages, today) => post('/api/coach', { profile, messages, today }),
};
