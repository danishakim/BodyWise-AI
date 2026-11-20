// App state, persisted in this browser's localStorage (private to the user's device).
// React components read it with useStore(), which re-renders them on every change.
import { useSyncExternalStore } from 'react';
import { localISO, addDays, daysBetween } from './format.js';

const KEY = 'bodywise:v1';

// RFC 4122 v4 id. crypto.randomUUID only exists on https/localhost; getRandomValues works on a LAN http URL too.
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const DEFAULTS = {
  profile: null,          // { name, sex, age, height_cm, weight_kg, activity, goal, target_kg }
  prefs: { vegetarian: false, halal: true, budget_rm: 30, puasa: false, dislikes: '' },
  metrics: null,          // from /api/assess
  plan: null,             // from /api/plan
  weights: [],            // [{ date, kg }]
  meals: {},              // { 'YYYY-MM-DD': [{ id, name, kcal, protein, slot, source, at }] }
  chat: [],               // [{ role, text }]
  event: null,            // Kenduri rebalancer { name, date, extra_kcal, days_before, days_after, result }
  theme: 'light',         // 'light' | 'dark'
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) return structuredClone(DEFAULTS);
    delete saved.look; // removed setting from older versions
    if (saved.theme !== 'dark') saved.theme = 'light'; // 'system' was removed: the app is light unless you pick dark
    for (const list of Object.values(saved.meals || {})) for (const m of list) m.id ||= uuid(); // ids for cloud sync
    return { ...DEFAULTS, ...saved, prefs: { ...DEFAULTS.prefs, ...saved.prefs } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let state = load();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode / quota: keep in memory */ }
}

export const store = {
  get: () => state,
  set(patch) { state = { ...state, ...patch }; save(); emit(); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  wipe() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    state = structuredClone(DEFAULTS);
    emit();
  },
};

export function useStore() {
  return useSyncExternalStore(store.subscribe, store.get);
}

// ---- Meals ----
export function mealsOn(date = localISO(), s = state) { return s.meals[date] || []; }
export function addMeal(item, date = localISO()) {
  const list = [...mealsOn(date), { ...item, id: uuid(), kcal: Math.round(item.kcal), protein: Math.round(item.protein || 0), at: Date.now() }];
  store.set({ meals: { ...state.meals, [date]: list } });
}
export function removeMeal(index, date = localISO()) {
  store.set({ meals: { ...state.meals, [date]: mealsOn(date).filter((_, i) => i !== index) } });
}
export function todayTotals(s = state) {
  const list = mealsOn(localISO(), s);
  return {
    kcal: list.reduce((a, m) => a + m.kcal, 0),
    protein: list.reduce((a, m) => a + (m.protein || 0), 0),
    items: list.map((m) => m.name).join(', '),
  };
}

// ---- Weights ----
export function addWeight(date, kg) {
  const weights = [...state.weights.filter((w) => w.date !== date), { date, kg: Math.round(kg * 10) / 10 }]
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = weights[weights.length - 1];
  const profile = state.profile && latest ? { ...state.profile, weight_kg: latest.kg } : state.profile;
  store.set({ weights, profile });
}
export function removeWeight(date) {
  store.set({ weights: state.weights.filter((w) => w.date !== date) });
}

// ---- Kenduri rebalancer: the target for a given day, accounting for a feast plan ----
export function targetFor(date = localISO(), s = state) {
  const base = s.metrics?.daily_kcal ?? 2000;
  const ev = s.event;
  if (!ev?.result) return { kcal: base, mode: 'normal' };
  const offset = daysBetween(ev.date, date);
  if (offset === 0) return { kcal: base + ev.extra_kcal, mode: 'event', event: ev };
  if (offset < 0 && -offset <= ev.days_before) return { kcal: ev.result.adjusted_daily_kcal, mode: 'before', event: ev };
  if (offset > 0 && offset <= ev.days_after) return { kcal: ev.result.adjusted_daily_kcal, mode: 'after', event: ev };
  return { kcal: base, mode: 'normal' };
}
export function eventActive(s = state) {
  const ev = s.event;
  return !!ev && daysBetween(localISO(), addDays(ev.date, ev.days_after)) >= 0;
}

// Share of the way from the first weigh-in to the target (works for lose and gain).
export function goalProgress(s = state) {
  const m = s.metrics, w = s.weights;
  if (!m?.target_kg || !w.length || !s.profile) return 0;
  const start = w[0].kg, now = s.profile.weight_kg;
  if (start === m.target_kg) return 1;
  return Math.min(1, Math.max(0, (start - now) / (start - m.target_kg)));
}

// ---- Demo data for presentations ----
export function seedDemoData() {
  const p = state.profile;
  if (!p) return;
  const dir = p.goal === 'gain' ? 1 : p.goal === 'lose' ? -1 : 0;
  const start = p.weight_kg - dir * 3.2;
  const weights = [];
  for (let w = 8; w >= 0; w--) {
    const date = addDays(localISO(), -w * 7);
    const progress = (8 - w) / 8;
    const plateau = w === 4 || w === 3 ? 0.25 : 0;
    const noise = [0.2, -0.1, 0.15, -0.2, 0.05, 0.1, -0.15, 0.05, 0][w];
    weights.push({ date, kg: Math.round((start + dir * 3.2 * progress + dir * plateau + noise) * 10) / 10 });
  }
  store.set({ weights });
}

export function exportData() {
  const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'bodywise-data.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function applyTheme(theme = state.theme) {
  const root = document.documentElement;
  root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}
