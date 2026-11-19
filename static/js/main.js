// App entry: routing, navigation, theme, PWA.
import { api } from './api.js';
import { store } from './store.js';
import { applyTheme } from './theme.js';
import { html, mount, icon, toast, $ } from './ui.js';
import * as onboarding from './views/onboarding.js';
import * as home from './views/home.js';
import * as plan from './views/plan.js';
import * as snap from './views/snap.js';
import * as progress from './views/progress.js';
import * as coach from './views/coach.js';
import * as profile from './views/profile.js';
import * as settings from './views/settings.js';

const ROUTES = {
  welcome: { view: onboarding, title: 'Welcome', bare: true },
  home: { view: home, title: 'Home', icon: icon.home, tab: true, rail: true },
  plan: { view: plan, title: 'Plan', icon: icon.plan, tab: true, rail: true },
  snap: { view: snap, title: 'Snap', icon: icon.camera, tab: true, rail: true, fab: true },
  progress: { view: progress, title: 'Progress', icon: icon.chart, tab: true, rail: true },
  coach: { view: coach, title: 'AI Coach', icon: icon.chat, rail: true },
  profile: { view: profile, title: 'Profile', icon: icon.user, tab: true, rail: true },
  settings: { view: settings, title: 'Settings', icon: icon.settings, rail: true },
};

const ctx = {
  status: { ai_enabled: false, tm_model_url: null },
  installPrompt: null,
  navigate: (route) => { if (location.hash !== `#/${route}`) location.hash = `#/${route}`; else render(); },
  async refreshMetrics() {
    const { profile: p } = store.get();
    if (!p) return null;
    try {
      const metrics = await api.assess(p);
      store.set({ metrics });
      return metrics;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  },
};

let cleanup = null;

function requestedRoute() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  return ROUTES[name] ? name : 'home';
}

function renderNav(active) {
  const rail = Object.entries(ROUTES).filter(([, r]) => r.rail);
  mount($('#rail-nav'), rail.map(([key, r]) => html`
    <a class="nav-link" href="#/${key}" ${active === key ? html`aria-current="page"` : ''}>${r.icon}<span>${r.title}</span></a>`));
  mount($('#tabbar'), Object.entries(ROUTES).filter(([, r]) => r.tab).map(([key, r]) => html`
    <a class="tab ${r.fab ? 'fab' : ''}" href="#/${key}" ${active === key || (key === 'profile' && active === 'settings') ? html`aria-current="page"` : ''} aria-label="${r.title}">
      ${r.icon}<span>${r.title}</span></a>`));
  mount($('#top-coach'), icon.chat);
}

function render() {
  const wanted = requestedRoute();
  const name = !store.get().profile ? 'welcome' : wanted;      // onboarding first
  if (name !== wanted) history.replaceState(null, '', `#/${name}`);
  const route = ROUTES[name];
  $('#app').dataset.onboarding = String(!!route.bare);
  $('#app').dataset.route = name;
  renderNav(name);
  document.title = `${route.title} · BodyWise AI`;

  if (typeof cleanup === 'function') cleanup();
  const view = $('#view');
  view.classList.remove('enter');
  void view.offsetWidth;
  view.classList.add('enter');
  cleanup = route.view.render(view, ctx);
  view.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

async function loadStatus() {
  try { ctx.status = await api.status(); }
  catch { toast('Cannot reach the BodyWise server. Is it running?', 'error'); }
}

// ---- PWA ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ctx.installPrompt = e; });
window.addEventListener('appinstalled', () => { ctx.installPrompt = null; toast('BodyWise installed on your home screen 🎉'); });

// ---- boot ----
applyTheme();
window.addEventListener('hashchange', render);
await loadStatus();
render();
$('#app').dataset.ready = 'true';
