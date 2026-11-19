// Small UI toolkit: safe HTML templating, icons, toasts and helpers.

// ---- Safe templating: every interpolated value is HTML-escaped unless it is
// explicitly wrapped with raw(). This blocks XSS from user or AI text.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function renderVal(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}
export function html(strings, ...vals) {
  return new Raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? renderVal(vals[i]) : ''), ''));
}
export function mount(el, tpl) { el.innerHTML = renderVal(tpl); }

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- Icons (hand-drawn 24px stroke set) ----
const I = (d) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
export const icon = {
  home: I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  plan: I('<path d="M7 3v8a2 2 0 0 0 4 0V3"/><path d="M9 11v10"/><path d="M17 3c-2 2-2.5 5-2 8h2v10"/>'),
  camera: I('<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  chart: I('<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 15l4-4 3 3 5-6"/>'),
  chat: I('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  sparkle: I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  flame: I('<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7z"/>'),
  scale: I('<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8 9a5 5 0 0 1 8 0l-3 3"/>'),
  swap: I('<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  trash: I('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  check: I('<path d="M5 12l5 5 9-10"/>'),
  moon: I('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>'),
  alert: I('<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>'),
  info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  arrowR: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  arrowL: I('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  refresh: I('<path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 20v-4h-4"/>'),
  menu: I('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
  party: I('<path d="M4 20l5-14 9 9z"/><path d="M14 4v2M19 9h2M17 5l-1.5 1.5"/>'),
  target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  walk: I('<circle cx="13" cy="4" r="2"/><path d="M9 21l3-7 3 3v4"/><path d="M8 11l3-3 3 2 3 1"/>'),
  bolt: I('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  sofa: I('<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/>'),
  bike: I('<circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="M6 17l4-8h5l3 8M10 9l2 8"/>'),
  run: I('<circle cx="15" cy="4" r="2"/><path d="M6 21l4-6 3 2 1-6 4 3"/><path d="M8 9l4-2 2 4"/>'),
  down: I('<path d="M12 4v16M6 14l6 6 6-6"/>'),
  up: I('<path d="M12 20V4M6 10l6-6 6 6"/>'),
  equal: I('<path d="M5 9h14M5 15h14"/>'),
  send: I('<path d="M4 12l16-8-6 16-2-6z"/>'),
  download: I('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
  leaf: I('<path d="M5 19c0-9 5-14 15-15-1 10-6 15-15 15z"/><path d="M5 19l7-7"/>'),
  wallet: I('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2"/><path d="M3 10h18"/>'),
  settings: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  logout: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
  shield: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  mail: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  edit: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  phone: I('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
  calendar: I('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  chevron: I('<path d="m9 18 6-6-6-6"/>'),
  back: I('<path d="m15 18-6-6 6-6"/>'),
};

// ---- Toasts ----
export function toast(message, type = 'ok') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.innerHTML = renderVal(html`${type === 'error' ? icon.alert : icon.check}<span>${message}</span>`);
  box.append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

// ---- Formatting ----
export const fmt = {
  kcal: (n) => Math.round(n).toLocaleString('en-MY'),
  kg: (n) => (Math.round(n * 10) / 10).toFixed(1),
  rm: (n) => `RM${Number(n).toFixed(2)}`,
  date: (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-MY', opts),
};

export function localISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
}
export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function bmiOf(kg, cm) { const m = cm / 100; return Math.round((kg / (m * m)) * 10) / 10; }

// Shrink photos in the browser before upload: faster, cheaper, more private.
export async function resizeImage(file, max = 1024, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// Minimal, safe formatter for AI chat replies (escape first, then format).
export function formatReply(text) {
  const lines = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split('\n');
  let out = '', inList = false;
  for (const line of lines) {
    const m = line.match(/^\s*[-*•]\s+(.*)/);
    if (m) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${m[1]}</li>`; continue; }
    if (inList) { out += '</ul>'; inList = false; }
    if (line.trim()) out += `<p>${line}</p>`;
  }
  return raw(out + (inList ? '</ul>' : ''));
}
