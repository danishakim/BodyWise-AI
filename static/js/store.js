// App state, persisted in this browser's localStorage (private to the user's device).
import { localISO, addDays, daysBetween } from './ui.js';

const KEY = 'bodywise:v1';
const DEFAULTS = {
  profile: null,          // { name, sex, age, height_cm, weight_kg, activity, goal, target_kg }
  prefs: { vegetarian: false, halal: true, budget_rm: 30, puasa: false, dislikes: '' },
  metrics: null,          // from /api/assess
  plan: null,             // from /api/plan
  weights: [],            // [{ date, kg }]
  meals: {},              // { 'YYYY-MM-DD': [{ name, kcal, protein, slot, source }] }
  chat: [],               // [{ role, text }]
  event: null,            // Kenduri rebalancer { name, date, extra_kcal, days_before, days_after, result }
  theme: 'system',
};

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

function load() {
  try {
    const saved = read(KEY);
    if (!saved) return structuredClone(DEFAULTS);
    delete saved.look; // removed setting from older versions
    return { ...DEFAULTS, ...saved, prefs: { ...DEFAULTS.prefs, ...saved.prefs } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let state = load();
const listeners = new Set();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode / quota: keep in memory */ }
}

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    save();
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // Remove all BodyWise data from this device.
  wipe() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    state = structuredClone(DEFAULTS);
    listeners.forEach((fn) => fn(state));
  },
  reset() {
    state = structuredClone(DEFAULTS);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    listeners.forEach((fn) => fn(state));
  },
};

// ---- Meals ----
export function mealsOn(date = localISO()) { return state.meals[date] || []; }
export function addMeal(item, date = localISO()) {
  const list = [...mealsOn(date), { ...item, kcal: Math.round(item.kcal), protein: Math.round(item.protein || 0), at: Date.now() }];
  store.set({ meals: { ...state.meals, [date]: list } });
}
export function removeMeal(index, date = localISO()) {
  const list = mealsOn(date).filter((_, i) => i !== index);
  store.set({ meals: { ...state.meals, [date]: list } });
}
export function todayTotals() {
  const list = mealsOn();
  return {
    kcal: list.reduce((s, m) => s + m.kcal, 0),
    protein: list.reduce((s, m) => s + (m.protein || 0), 0),
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

// ---- Exclusive: Kenduri rebalancer ----
// Returns the target for a given day, accounting for an active feast plan.
export function targetFor(date = localISO()) {
  const base = state.metrics?.daily_kcal ?? 2000;
  const ev = state.event;
  if (!ev?.result) return { kcal: base, mode: 'normal' };
  const offset = daysBetween(ev.date, date);
  if (offset === 0) return { kcal: base + ev.extra_kcal, mode: 'event', event: ev };
  if (offset < 0 && -offset <= ev.days_before) return { kcal: ev.result.adjusted_daily_kcal, mode: 'before', event: ev };
  if (offset > 0 && offset <= ev.days_after) return { kcal: ev.result.adjusted_daily_kcal, mode: 'after', event: ev };
  return { kcal: base, mode: 'normal' };
}
export function eventActive() {
  const ev = state.event;
  return ev && daysBetween(localISO(), addDays(ev.date, ev.days_after)) >= 0;
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
    // gentle trend + realistic noise, with a mini plateau around weeks 3-4
    const progress = (8 - w) / 8;
    const plateau = w === 4 || w === 3 ? 0.25 : 0;
    const noise = [0.2, -0.1, 0.15, -0.2, 0.05, 0.1, -0.15, 0.05, 0][w];
    weights.push({ date, kg: Math.round((start + dir * 3.2 * progress + dir * plateau + noise) * 10) / 10 });
  }
  store.set({ weights });
}
