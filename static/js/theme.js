import { store } from './store.js';

export function applyTheme(theme = store.get().theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = theme;
}
