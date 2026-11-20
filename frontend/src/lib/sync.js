// Cloud sync with Supabase.
//
// localStorage stays the instant, offline copy that every screen reads; Supabase Postgres is the
// durable copy. Everyone is signed in ANONYMOUSLY (no login screen). "Back up with Google" links a
// Google identity to that same user id, so the data can be restored on another device.
// Row-Level Security (supabase/schema.sql) means a user can only ever read or write their own rows.
//
// How it syncs: on start we pull the user's rows. Then every store change is diffed against the
// last synced snapshot and only the changed rows are written (debounced, retried when offline).
import { createClient } from '@supabase/supabase-js';
import { store } from './store.js';
import { syncStatus } from './syncState.js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'bodywise-auth' },
});

const META = 'bodywise:sync';                 // { owner: user id the local copy belongs to, dirty: unsynced local edits }
const meta = {
  get() { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch { return {}; } },
  set(patch) { try { localStorage.setItem(META, JSON.stringify({ ...meta.get(), ...patch })); } catch { /* private mode */ } },
};

const EMPTY = { profile: null, prefs: {}, theme: 'light', event: null, metrics: null, plan: null, weights: [], meals: {}, chat: [] };
let user = null;          // current Supabase user
let synced = null;        // snapshot of what Supabase holds
let timer = null;
let flushing = false;
let applying = false;     // true while we write remote data into the store (don't echo it back)
let started = false;
let toast = () => {};

const must = async (q) => { const { data, error } = await q; if (error) throw error; return data; };

// ---------------------------------------------------------------- start
export async function startSync(opts = {}) {
  if (started) return;
  started = true;
  toast = opts.toast || toast;
  store.subscribe(onChange);
  window.addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  supabase.auth.onAuthStateChange((_event, session) => { if (session?.user && session.user.id === user?.id) describe(session.user); });

  const q = new URLSearchParams(location.search);
  const oauthError = q.get('error_description') || q.get('error');
  const oauthFlow = sessionStorage.getItem('bw-oauth');
  sessionStorage.removeItem('bw-oauth');

  try {
    let { data: { session } } = await supabase.auth.getSession();   // also completes a Google redirect (?code=…)
    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    await adopt(session.user);
  } catch (err) {
    started = false;
    syncStatus.set({ state: navigator.onLine ? 'error' : 'offline', error: err.message });
    return;
  } finally {
    if (q.has('code') || oauthError) history.replaceState(null, '', location.pathname + location.hash);
  }

  if (oauthError) {
    toast(/already|exists|linked/i.test(oauthError)
      ? 'That Google account already has BodyWise data. Use “Sign in with Google” to switch to it.'
      : `Google sign-in didn’t finish: ${oauthError}`, 'error');
  } else if (oauthFlow === 'link' && syncStatus.get().google) {
    toast('Backed up to your Google account ☁️');
  } else if (oauthFlow === 'signin' && syncStatus.get().google) {
    toast('Signed in with Google. Your plan is loaded.');
  }
}

// Make the local copy and Supabase agree for this user.
async function adopt(u) {
  user = u;
  describe(u);
  const m = meta.get();
  const remote = await pull(u.id);
  const localWins = m.owner === u.id && m.dirty;          // offline edits not uploaded yet
  if (remote.profile && !localWins) {
    applying = true;
    try { store.set(remote); } finally { applying = false; }
    synced = store.get();
    meta.set({ owner: u.id, dirty: false });
    syncStatus.set({ state: 'synced', error: null });
  } else {
    synced = remote;
    meta.set({ owner: u.id });
    await flush(true);                                      // upload this device's data (first sync / offline edits)
  }
}

function describe(u) {
  syncStatus.set({ google: (u.identities || []).some((i) => i.provider === 'google'), email: u.email || null });
}

// ---------------------------------------------------------------- pull
async function pull(uid) {
  const [p, pl, w, m, c] = await Promise.all([
    must(supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle()),
    must(supabase.from('plans').select('metrics,plan').eq('user_id', uid).maybeSingle()),
    must(supabase.from('weight_logs').select('log_date,kg').eq('user_id', uid).order('log_date')),
    must(supabase.from('meal_logs').select('*').eq('user_id', uid).order('logged_at')),
    must(supabase.from('chat_messages').select('role,text').eq('user_id', uid).order('id')),
  ]);
  const meals = {};
  for (const r of m) {
    (meals[r.log_date] ||= []).push({
      id: r.id, name: r.name, kcal: r.kcal, protein: r.protein_g,
      ...(r.slot ? { slot: r.slot } : {}), ...(r.source ? { source: r.source } : {}), at: Date.parse(r.logged_at),
    });
  }
  return {
    profile: p ? {
      name: p.display_name, sex: p.sex, age: p.age, height_cm: Number(p.height_cm), weight_kg: Number(p.weight_kg),
      activity: p.activity, goal: p.goal, target_kg: p.target_kg == null ? null : Number(p.target_kg),
    } : null,
    prefs: p ? { ...store.get().prefs, ...p.prefs } : store.get().prefs,
    theme: p?.theme || store.get().theme,
    event: p?.event ?? null,
    metrics: pl?.metrics ?? null,
    plan: pl?.plan ?? null,
    weights: w.map((r) => ({ date: r.log_date, kg: Number(r.kg) })),
    meals,
    chat: c.map((r) => ({ role: r.role, text: r.text })),
  };
}

// ---------------------------------------------------------------- push
function onChange() {
  if (applying) return;
  meta.set({ dirty: true });
  if (user) schedule(800);
}

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => flush(), ms);
}

export async function flush(force = false) {
  if (!user) return false;
  if (flushing && !force) { schedule(600); return false; }
  const next = store.get();
  if (next === synced) { syncStatus.set({ state: 'synced', error: null }); return true; }
  flushing = true;
  syncStatus.set({ state: 'saving' });
  const base = { ...EMPTY, ...synced };
  try {
    await push(base, next);
    synced = next;
    if (store.get() === next) meta.set({ dirty: false });
    syncStatus.set({ state: 'synced', error: null });
    return true;
  } catch (err) {
    synced = base;                                          // tables that succeeded are recorded in base
    syncStatus.set({ state: navigator.onLine ? 'error' : 'offline', error: err.message });
    schedule(20000);                                        // retry later; the local copy is safe meanwhile
    return false;
  } finally {
    flushing = false;
  }
}

// Write only what changed between `base` (what Supabase has) and `next` (the local state).
// Each table updates `base` when it succeeds, so a partial failure never duplicates rows on retry.
async function push(base, next) {
  const uid = user.id;
  const tasks = [];

  if (['profile', 'prefs', 'theme', 'event'].some((k) => base[k] !== next[k])) {
    tasks.push((async () => {
      if (next.profile) {
        const p = next.profile;
        await must(supabase.from('profiles').upsert({
          user_id: uid, display_name: (p.name || '').slice(0, 40), sex: p.sex, age: Math.round(p.age),
          height_cm: p.height_cm, weight_kg: p.weight_kg, activity: p.activity, goal: p.goal, target_kg: p.target_kg ?? null,
          prefs: next.prefs || {}, theme: next.theme === 'dark' ? 'dark' : 'light', event: next.event ?? null,
        }));
      } else if (base.profile) {
        await must(supabase.from('profiles').delete().eq('user_id', uid));
      }
      Object.assign(base, { profile: next.profile, prefs: next.prefs, theme: next.theme, event: next.event });
    })());
  }

  if (base.plan !== next.plan || base.metrics !== next.metrics) {
    tasks.push((async () => {
      if (next.plan || next.metrics) await must(supabase.from('plans').upsert({ user_id: uid, metrics: next.metrics, plan: next.plan }));
      else await must(supabase.from('plans').delete().eq('user_id', uid));
      Object.assign(base, { plan: next.plan, metrics: next.metrics });
    })());
  }

  if (base.weights !== next.weights) {
    tasks.push((async () => {
      const before = new Map(base.weights.map((w) => [w.date, w.kg]));
      const after = new Map(next.weights.map((w) => [w.date, w.kg]));
      const up = [...after].filter(([d, kg]) => before.get(d) !== kg).map(([d, kg]) => ({ user_id: uid, log_date: d, kg }));
      const gone = [...before.keys()].filter((d) => !after.has(d));
      if (up.length) await must(supabase.from('weight_logs').upsert(up));
      if (gone.length) await must(supabase.from('weight_logs').delete().eq('user_id', uid).in('log_date', gone));
      base.weights = next.weights;
    })());
  }

  if (base.meals !== next.meals) {
    tasks.push((async () => {
      const flat = (meals) => new Map(Object.entries(meals).flatMap(([date, list]) => list.map((m) => [m.id, { ...m, date }])));
      const before = flat(base.meals);
      const after = flat(next.meals);
      const same = (a, b) => a && a.date === b.date && a.name === b.name && a.kcal === b.kcal && a.protein === b.protein;
      const up = [...after.values()].filter((m) => m.id && !same(before.get(m.id), m)).map((m) => ({
        id: m.id, user_id: uid, log_date: m.date, name: String(m.name).slice(0, 160), kcal: Math.round(m.kcal),
        protein_g: Math.round(m.protein || 0), slot: m.slot ?? null, source: m.source ?? null,
        logged_at: new Date(m.at || Date.now()).toISOString(),
      }));
      const gone = [...before.keys()].filter((id) => id && !after.has(id));
      if (up.length) await must(supabase.from('meal_logs').upsert(up));
      if (gone.length) await must(supabase.from('meal_logs').delete().eq('user_id', uid).in('id', gone));
      base.meals = next.meals;
    })());
  }

  if (base.chat !== next.chat) {
    tasks.push((async () => {
      const prev = base.chat;
      const appended = next.chat.length >= prev.length && prev.every((m, i) => next.chat[i].role === m.role && next.chat[i].text === m.text);
      const rows = (list) => list.map((m) => ({ user_id: uid, role: m.role, text: String(m.text).slice(0, 4000) }));
      if (appended) {
        const extra = next.chat.slice(prev.length);
        if (extra.length) await must(supabase.from('chat_messages').insert(rows(extra)));
      } else {                                                // cleared or trimmed: replace the conversation
        await must(supabase.from('chat_messages').delete().eq('user_id', uid));
        if (next.chat.length) await must(supabase.from('chat_messages').insert(rows(next.chat)));
      }
      base.chat = next.chat;
    })());
  }

  const results = await Promise.allSettled(tasks);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
}

// ---------------------------------------------------------------- Google
const redirectTo = () => `${location.origin}/`;

/** Keep this anonymous user's data and attach a Google login to it. */
export async function linkGoogle() {
  await flush();
  sessionStorage.setItem('bw-oauth', 'link');
  const { error } = await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: redirectTo() } });
  if (error) { sessionStorage.removeItem('bw-oauth'); throw error; }
}

/** Switch to the account already linked to a Google login (e.g. on a new phone). */
export async function signInWithGoogle() {
  sessionStorage.setItem('bw-oauth', 'signin');
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  if (error) { sessionStorage.removeItem('bw-oauth'); throw error; }
}

/** Sign out of Google: the data stays in that account; this device starts fresh as a new anonymous user. */
export async function signOut() {
  await flush().catch(() => {});
  clearTimeout(timer);
  await supabase.auth.signOut();
  user = null;
  synced = null;
  applying = true;
  try { store.wipe(); } finally { applying = false; }
  meta.set({ owner: null, dirty: false });
  syncStatus.set({ google: false, email: null, state: 'connecting' });
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) { syncStatus.set({ state: 'error', error: error.message }); return; }
  await adopt(data.user);
}
