// App shell: hash routing, navigation (rail on desktop, tab bar on mobile),
// toasts, the meal-logged overlay and shared services via context.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { store, useStore, applyTheme } from './lib/store.js';
import { Icon } from './lib/icons.jsx';
import { AppContext } from './components/AppContext.js';
import Logged from './components/Logged.jsx';
import Onboarding from './views/Onboarding.jsx';
import Home from './views/Home.jsx';
import Plan from './views/Plan.jsx';
import Snap from './views/Snap.jsx';
import Progress from './views/Progress.jsx';
import Coach from './views/Coach.jsx';
import Profile from './views/Profile.jsx';
import Settings from './views/Settings.jsx';

const ROUTES = {
  welcome: { View: Onboarding, title: 'Welcome', bare: true },
  edit: { View: Onboarding, title: 'Edit profile', bare: true },
  home: { View: Home, title: 'Home', icon: 'home', tab: true, rail: true },
  plan: { View: Plan, title: 'Plan', icon: 'plan', tab: true, rail: true },
  snap: { View: Snap, title: 'Snap', icon: 'camera', tab: true, rail: true, fab: true },
  progress: { View: Progress, title: 'Progress', icon: 'chart', tab: true, rail: true },
  coach: { View: Coach, title: 'AI Coach', icon: 'chat', rail: true },
  profile: { View: Profile, title: 'Profile', icon: 'user', tab: true, rail: true },
  settings: { View: Settings, title: 'Settings', icon: 'settings', rail: true },
};

const readHash = () => {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  return ROUTES[name] ? name : 'home';
};

export default function App() {
  const s = useStore();
  const [route, setRoute] = useState(readHash);
  const [status, setStatus] = useState({ ai_enabled: false, tm_model_url: null });
  const [toasts, setToasts] = useState([]);
  const [logged, setLogged] = useState(null);
  const installPrompt = useRef(null);

  // Every app open starts with Splash → Welcome. `launched` flips when the user taps
  // Continue / Get started, then we go to the screen they originally opened (or Home).
  const [launched, setLaunched] = useState(false);
  const startRoute = useRef(['welcome', 'edit'].includes(route) ? 'home' : route);
  const name = !launched || !s.profile ? 'welcome' : route;
  const current = ROUTES[name];

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Remember the forced route, so finishing onboarding shows "Plan ready" instead of jumping to Home.
  useEffect(() => { if (name !== route) { history.replaceState(null, '', `#/${name}`); setRoute(name); } }, [name, route]);
  useEffect(() => { document.title = `${current.title} · BodyWise AI`; window.scrollTo({ top: 0 }); }, [name, current.title]);
  useEffect(() => { applyTheme(s.theme); }, [s.theme]);

  const toast = useCallback((message, type = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  useEffect(() => {
    api.status().then(setStatus).catch(() => toast('Cannot reach the BodyWise server. Is it running?', 'error'));
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const onPrompt = (e) => { e.preventDefault(); installPrompt.current = e; };
    const onInstalled = () => { installPrompt.current = null; toast('BodyWise installed on your home screen 🎉'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, [toast]);

  const navigate = useCallback((to) => {
    if (location.hash === `#/${to}`) setRoute(to);
    else location.hash = `#/${to}`;
  }, []);

  const refreshMetrics = useCallback(async () => {
    const { profile } = store.get();
    if (!profile) return null;
    try {
      const metrics = await api.assess(profile);
      store.set({ metrics });
      return metrics;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }, [toast]);

  const launch = useCallback((to) => { setLaunched(true); if (to) navigate(to === true ? startRoute.current : to); }, [navigate]);

  const ctx = useMemo(() => ({
    status, navigate, toast, refreshMetrics, installPrompt, launch,
    showLogged: (meal) => setLogged(meal),
  }), [status, navigate, toast, refreshMetrics, launch]);

  const { View } = current;
  const tabs = Object.entries(ROUTES).filter(([, r]) => r.tab);
  const rail = Object.entries(ROUTES).filter(([, r]) => r.rail);

  return (
    <AppContext.Provider value={ctx}>
      <a className="skip-link" href="#view">Skip to content</a>
      <div className="app" data-ready="true" data-onboarding={String(!!current.bare)} data-route={name}>
        <aside className="rail" aria-label="Main navigation">
          <a className="brand" href="#/home" aria-label="BodyWise AI home">
            <img src="/img/logo.svg" alt="" width="36" height="36" /><span>Body<em>Wise</em></span>
          </a>
          <nav className="rail-nav">
            {rail.map(([key, r]) => (
              <a key={key} className="nav-link" href={`#/${key}`} aria-current={name === key ? 'page' : undefined}>
                <Icon name={r.icon} /><span>{r.title}</span>
              </a>
            ))}
          </nav>
        </aside>

        <header className="topbar">
          <a className="brand" href="#/home" aria-label="BodyWise AI home">
            <img src="/img/logo.svg" alt="" width="30" height="30" /><span>Body<em>Wise</em></span>
          </a>
          <a className="icon-btn" href="#/coach" aria-label="Ask the AI coach"><Icon name="chat" /></a>
        </header>

        <main id="view" className="view enter" key={name} tabIndex={-1}>
          <View route={name} />
        </main>

        <nav className="tabbar" aria-label="Main navigation">
          {tabs.map(([key, r]) => (
            <a key={key} className={`tab ${r.fab ? 'fab' : ''}`} href={`#/${key}`} aria-label={r.title}
              aria-current={name === key || (key === 'profile' && name === 'settings') ? 'page' : undefined}>
              <Icon name={r.icon} /><span>{r.title}</span>
            </a>
          ))}
        </nav>
      </div>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`}>
            <Icon name={t.type === 'error' ? 'alert' : 'check'} /><span>{t.message}</span>
          </div>
        ))}
      </div>

      {logged && <Logged meal={logged} onClose={() => setLogged(null)} onHome={() => { setLogged(null); navigate('home'); }} />}
    </AppContext.Provider>
  );
}
