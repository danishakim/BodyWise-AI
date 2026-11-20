// Tiny, dependency-free sync status so screens can show it without loading supabase-js.
import { useSyncExternalStore } from 'react';

export const syncEnabled = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

// state: 'off' | 'connecting' | 'saving' | 'synced' | 'offline' | 'error'
let status = { state: syncEnabled ? 'connecting' : 'off', google: false, email: null, error: null };
const subs = new Set();

export const syncStatus = {
  get: () => status,
  set(patch) { status = { ...status, ...patch }; subs.forEach((fn) => fn()); },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};

export const useSyncStatus = () => useSyncExternalStore(syncStatus.subscribe, syncStatus.get);

// Lazy-load the Supabase chunk only when sync is configured.
export const loadSync = () => import('./sync.js');
