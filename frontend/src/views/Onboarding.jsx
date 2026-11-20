// Onboarding (Figma screens 01–08):
// Splash → Welcome → Goal → About you → Body → Goal weight → Activity → Food → Building → Plan ready.
// Shown on every app open (Splash → Welcome); returning users get "Continue".
// The #/edit route starts at Goal and returns to Profile on Back.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { store, useStore, addWeight } from '../lib/store.js';
import { fmt, bmiOf, clamp, debounce, localISO } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';
import Body3D from '../components/Body3D.jsx';
import Wheel from '../components/Wheel.jsx';
import { syncEnabled, loadSync } from '../lib/syncState.js';
import { isNative } from '../lib/native.js';

const GOALS = [
  { key: 'maintain', e: '⚖️', t: 'Stay healthy', d: 'Keep your weight, eat better' },
  { key: 'lose', e: '🔥', t: 'Lose weight', d: 'About 0.5 kg a week, gently. No crash diets.' },
  { key: 'gain', e: '💪', t: 'Gain weight', d: 'Lean gain, about 0.3 kg a week' },
];
const ACTIVITY = [
  { key: 'sedentary', e: '💻', t: 'Mostly sitting', d: 'Classes or desk work, little exercise' },
  { key: 'light', e: '🚶', t: 'Lightly active', d: 'Walk around campus, exercise 1–3× a week' },
  { key: 'moderate', e: '🚴', t: 'Active', d: 'Exercise 3–5× a week' },
  { key: 'active', e: '🏃', t: 'Very active', d: 'Hard training 6–7× a week' },
  { key: 'very_active', e: '🏋️', t: 'Athlete', d: 'Physical job or training twice a day' },
];
const BUDGETS = [15, 20, 30, 50, 80];
const INPUT_STEPS = ['goal', 'about', 'body', 'target', 'activity', 'food'];
const KG_PER_LB = 0.45359237;
const BACKUP_KEYS = ['profile', 'prefs', 'metrics', 'plan', 'weights', 'meals', 'chat', 'event', 'theme'];

const range = (a, b, step = 1) => { const out = []; for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 10) / 10); return out; };

const MARK = (
  <svg viewBox="20 20 88 88" fill="none" aria-hidden="true">
    <path d="M65.1 100.3C62.5 97.9 54.0 91.2 49.6 85.9C45.2 80.7 40.8 74.1 38.4 68.7C36.0 63.4 35.3 58.7 35.4 53.7C35.5 48.7 36.9 42.8 39.3 38.6C41.6 34.5 46.3 30.7 49.6 29.0C52.9 27.2 56.4 27.3 59.3 27.9C62.1 28.5 64.9 30.4 66.8 32.6C68.7 34.8 69.9 37.9 70.7 41.2C71.5 44.5 71.7 49.1 71.5 52.6C71.4 56.1 70.9 59.7 69.8 62.3C68.7 64.8 66.7 67.3 65.1 67.9C63.4 68.4 61.0 67.4 59.9 65.7C58.8 64.1 58.2 60.5 58.6 58.0C59.1 55.4 60.6 52.6 62.5 50.5C64.4 48.3 67.2 46.4 70.0 45.1C72.9 43.8 76.7 42.3 79.7 42.5C82.7 42.7 85.8 44.1 87.9 46.4C90.0 48.6 91.7 52.3 92.4 55.8C93.0 59.4 92.8 64.0 91.7 67.7C90.7 71.3 88.8 75.0 86.1 77.8C83.5 80.5 77.5 83.1 75.8 84.2" stroke="#EC4D86" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Onboarding({ route }) {
  const app = useApp();
  const initial = store.get();
  const editing = useRef(route === 'edit' && !!initial.profile).current;
  const [step, setStep] = useState(editing ? 'goal' : 'splash');
  const [d, setD] = useState(() => ({
    name: '', sex: 'female', age: 20, height_cm: 160, weight_kg: 60, activity: 'light', goal: 'lose', target_kg: null, ...(initial.profile || {}),
  }));
  const [prefs, setPrefs] = useState(() => ({ ...initial.prefs }));
  const [units, setUnits] = useState('metric');
  const upd = useCallback((patch) => setD((x) => ({ ...x, ...patch })), []);
  const toWelcome = useCallback(() => setStep('welcome'), []);

  const order = ['splash', 'welcome', 'goal', 'about', 'body', ...(d.goal !== 'maintain' ? ['target'] : []), 'activity', 'food', 'building', 'ready'];
  const go = (dir) => {
    const i = order.indexOf(step) + dir;
    if (step === 'welcome' && dir > 0) app.launch();   // leaving Welcome ends the launch screen
    if (editing && i < order.indexOf('goal')) { app.navigate('profile'); return; }
    setStep(order[clamp(i, 0, order.length - 1)]);
    window.scrollTo({ top: 0 });
  };
  const inputs = order.filter((x) => INPUT_STEPS.includes(x));
  const pct = Math.round(((inputs.indexOf(step) + 1) / inputs.length) * 100);
  const props = { d, upd, prefs, setPrefs, units, setUnits, go, pct, app, setStep };

  switch (step) {
    case 'splash': return <Splash next={toWelcome} />;
    case 'welcome': return <Welcome {...props} />;
    case 'goal': return <Goal {...props} />;
    case 'about': return <About {...props} />;
    case 'body': return <Body {...props} />;
    case 'target': return <Target {...props} />;
    case 'activity': return <Activity {...props} />;
    case 'food': return <Food {...props} />;
    case 'building': return <Building {...props} />;
    default: return <Ready {...props} />;
  }
}

// ---------- shared pieces ----------
function Top({ go, pct, pink = false }) {
  return (
    <div className="ob-top">
      <button className="ob-back" onClick={() => go(-1)} aria-label="Back"><Icon name="back" /></button>
      {!pink && <div className="ob-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ '--v': `${pct}%` }} /></div>}
    </div>
  );
}
const Head = ({ title, sub, style }) => <div className="ob-head" style={style}><h1>{title}</h1>{sub && <p>{sub}</p>}</div>;
const Foot = ({ label, onClick, kind = 'btn-primary' }) => (
  <div className="ob-foot"><button className={`btn ${kind} btn-lg btn-block`} onClick={onClick}>{label}</button></div>
);

// ---------- 01 Splash ----------
function Splash({ next }) {
  useEffect(() => { const t = setTimeout(next, 1500); return () => clearTimeout(t); }, [next]);
  return (
    <div className="ob pink ob-splash" role="button" tabIndex={0} aria-label="Start BodyWise" onClick={next}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') next(); }}>
      <span className="glow" style={{ width: 420, height: 420, top: '22%', left: '-18%' }} />
      <div className="mark">{MARK}</div><div className="word">BodyWise</div>
      <p className="tag">Makan smart. Live well.</p>
    </div>
  );
}

// ---------- 02 Welcome ----------
function Welcome({ go, app }) {
  const file = useRef(null);
  const saved = useStore().profile;          // live: cloud sync may load it while Welcome is showing
  const returning = !!saved;
  const [restore, setRestore] = useState(false);
  const google = async () => {
    try { await (await loadSync()).signInWithGoogle(); }
    catch { app.toast('Google sign-in isn’t switched on for this app yet.', 'error'); }
  };
  const importBackup = async (f) => {
    if (!f) return;
    try {
      if (f.size > 2_000_000) throw new Error('too big');
      const data = JSON.parse(await f.text());
      const p = data?.profile;
      const ok = p && ['male', 'female'].includes(p.sex) && [p.age, p.height_cm, p.weight_kg].every(Number.isFinite)
        && (!data.weights || Array.isArray(data.weights)) && (!data.meals || typeof data.meals === 'object');
      if (!ok) throw new Error('invalid');
      store.set(Object.fromEntries(BACKUP_KEYS.filter((k) => k in data).map((k) => [k, data[k]])));
      await app.refreshMetrics();
      app.toast('Welcome back! Your plan and progress are restored.');
      app.launch('home');
    } catch {
      app.toast('That file isn’t a BodyWise backup. Export one from Settings → Export my data.', 'error');
    }
  };
  const bubbles = [['🍌', '6%', '14%'], ['🥥', '78%', '8%'], ['🍗', '80%', '58%'], ['🍵', '4%', '66%'], ['🍉', '64%', '86%']];
  return (
    <div className="ob">
      <div className="ob-wash" />
      <Head style={{ paddingTop: 'max(36px, env(safe-area-inset-top))' }} title={<span style={{ fontSize: '1.95rem' }}>Your body, your plan.<br />Made smarter 🌿</span>}
        sub="AI meal plans, food snaps and a 3D you, built for Malaysian makan." />
      <div className="ob-hero"><span className="disc" />
        <Body3D bmi={22.5} sex="female" />
        {bubbles.map(([e, l, t]) => <span key={e} className="bubble" style={{ left: l, top: t }} aria-hidden="true">{e}</span>)}
      </div>
      <div style={{ flex: 1 }} />
      <div className="ob-foot">
        {returning ? (<>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => app.launch(true)}>{saved.name ? `Continue as ${saved.name}` : 'Continue'}</button>
          <button className="btn btn-soft btn-lg btn-block" onClick={() => go(1)}>Start a new plan</button>
        </>) : (<>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => go(1)}>Get started</button>
          {syncEnabled && restore ? (
            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn-soft btn-lg" style={{ flex: 1 }} onClick={google}>Sign in with Google</button>
              <button className="btn btn-soft btn-lg" style={{ flex: 1 }} onClick={() => file.current.click()}>Backup file</button>
            </div>
          ) : (
            <button className="btn btn-soft btn-lg btn-block" onClick={() => (syncEnabled && !isNative ? setRestore(true) : file.current.click())}>I already have a plan</button>
          )}
        </>)}
        <input ref={file} type="file" accept="application/json,.json" className="sr-only" aria-label="Restore a BodyWise backup file"
          onChange={(e) => importBackup(e.target.files[0])} />
      </div>
    </div>
  );
}

// ---------- 03 Goal ----------
function Goal({ d, upd, go, pct }) {
  const car = useRef(null);
  const cards = useRef({});
  const centre = (key, smooth) => {
    const c = cards.current[key];
    if (c && car.current) car.current.scrollTo({ left: c.offsetLeft - (car.current.clientWidth - c.clientWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  };
  useEffect(() => { centre(d.goal, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = useMemo(() => debounce(() => {
    const el = car.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = null, dist = Infinity;
    for (const [key, c] of Object.entries(cards.current)) {
      const dd = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid);
      if (dd < dist) { dist = dd; best = key; }
    }
    if (best) upd({ goal: best });
  }, 80), [upd]);

  return (
    <div className="ob pink">
      <span className="glow" style={{ width: 380, height: 380, top: '34%', left: '-22%' }} />
      <Top go={go} pct={pct} pink />
      <Head title="What’s your goal?" sub="Pick one. It sets your calorie target and how fast we go. You can change it any time." />
      <div className="carousel" ref={car} onScroll={onScroll}>
        {GOALS.map((g) => (
          <button key={g.key} ref={(el) => { if (el) cards.current[g.key] = el; }} className="goal-card" aria-pressed={d.goal === g.key}
            onClick={() => { upd({ goal: g.key }); centre(g.key, true); }}>
            <span className="e">{g.e}</span><b>{g.t}</b><small>{g.d}</small>
          </button>
        ))}
      </div>
      <div className="dots" aria-hidden="true">{GOALS.map((g) => <i key={g.key} className={d.goal === g.key ? 'on' : ''} />)}</div>
      <div style={{ flex: 1 }} />
      <Foot label="Select goal" kind="btn-glass" onClick={() => { if (d.goal === 'maintain') upd({ target_kg: null }); go(1); }} />
    </div>
  );
}

// ---------- About you ----------
const AGES = range(13, 80);
function About({ d, upd, go, pct }) {
  return (
    <div className="ob"><Top go={go} pct={pct} />
      <Head title="Tell us about you 👋" sub="Used for your calorie formula. Your data stays on this device." />
      <div className="ob-body">
        <label className="field"><span>What should we call you? (optional)</span>
          <input className="input" maxLength={40} autoComplete="given-name" value={d.name} placeholder="e.g. Aina" onChange={(e) => upd({ name: e.target.value })} /></label>
        <div className="field"><span className="label">Sex (for the calorie formula)</span>
          <div className="seg" role="group" aria-label="Sex">
            {['female', 'male'].map((x) => <button key={x} type="button" aria-pressed={d.sex === x} onClick={() => upd({ sex: x })}>{x === 'female' ? 'Female' : 'Male'}</button>)}
          </div></div>
        <div className="wheels"><Wheel label="Age · years" values={AGES} value={d.age} onChange={(v) => upd({ age: v })} /></div>
      </div>
      <Foot label="Continue" onClick={() => { upd({ name: d.name.trim() }); go(1); }} />
    </div>
  );
}

// ---------- 04 Body ----------
const H_METRIC = range(130, 210), H_IMP = range(51, 83);
const W_METRIC = range(35, 160, 0.5), W_IMP = range(77, 353);
function bmiText(d) {
  const b = bmiOf(d.weight_kg, d.height_cm);
  const where = b < 18.5 ? 'below the healthy range' : b < 23 ? 'in the healthy range' : b < 27.5 ? 'above the healthy range' : 'in the obese range';
  return `BMI ${b}, ${where} for your height (Malaysian cut-offs).`;
}
function Body({ d, upd, units, setUnits, go, pct }) {
  const metric = units === 'metric';
  return (
    <div className="ob"><Top go={go} pct={pct} />
      <Head title="Your height & weight 📏" sub="We use this to work out your daily calorie target." />
      <div className="ob-body">
        <div className="seg" role="group" aria-label="Units">
          <button type="button" aria-pressed={metric} onClick={() => setUnits('metric')}>Metric</button>
          <button type="button" aria-pressed={!metric} onClick={() => setUnits('imperial')}>Imperial</button>
        </div>
        <div className="wheels" key={units}>
          <Wheel label={metric ? 'Height · cm' : 'Height · ft'} values={metric ? H_METRIC : H_IMP}
            value={metric ? d.height_cm : d.height_cm / 2.54} format={(v) => (metric ? String(v) : `${Math.floor(v / 12)}′${v % 12}″`)}
            onChange={(v) => upd({ height_cm: metric ? v : Math.round(v * 2.54) })} />
          <Wheel label={metric ? 'Weight · kg' : 'Weight · lb'} values={metric ? W_METRIC : W_IMP}
            value={metric ? d.weight_kg : d.weight_kg / KG_PER_LB} format={(v) => (metric ? v.toFixed(1) : String(v))}
            onChange={(v) => upd({ weight_kg: metric ? v : Math.round(v * KG_PER_LB * 10) / 10 })} />
        </div>
        <div className="hint"><span>💡</span><span>{bmiText(d)}</span></div>
      </div>
      <Foot label="Continue" onClick={() => go(1)} />
    </div>
  );
}

// ---------- Goal weight (3D body + glow) ----------
function Target({ d, upd, go, pct }) {
  const lowest = Math.ceil(18.5 * (d.height_cm / 100) ** 2 * 2) / 2;          // never offer an unhealthy target
  const vals = useMemo(() => (d.goal === 'lose' ? range(lowest, d.weight_kg - 0.5, 0.5) : range(d.weight_kg + 0.5, d.weight_kg + 30, 0.5)),
    [d.goal, lowest, d.weight_kg]);
  const [hint, setHint] = useState(null);

  useEffect(() => {
    if (!vals.length) { upd({ target_kg: null }); go(1); return; }
    if (!d.target_kg || !vals.includes(d.target_kg)) {
      const want = d.goal === 'lose' ? d.weight_kg - 5 : d.weight_kg + 4;
      upd({ target_kg: vals.reduce((a, v) => (Math.abs(v - want) < Math.abs(a - want) ? v : a), vals[0]) });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const assess = useMemo(() => debounce((draft) => {
    api.assess(draft).then(setHint).catch(() => {});
  }, 300), []);
  useEffect(() => { if (d.target_kg) assess(d); }, [d.target_kg]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!vals.length || !d.target_kg) return <div className="ob" />;
  return (
    <div className="ob"><Top go={go} pct={pct} />
      <Head title="Your goal weight 🎯" sub="The glow on your 3D body shows your goal." />
      <div className="ob-body">
        <div className="target-stage">
          <Body3D bmi={bmiOf(d.weight_kg, d.height_cm)} sex={d.sex} ghostBmi={bmiOf(d.target_kg, d.height_cm)} instant label="Your 3D body; the glow shows your goal" />
          <div className="wheels" style={{ padding: '10px 4px' }}>
            <Wheel label="Goal · kg" values={vals} value={d.target_kg} format={(v) => v.toFixed(1)} onChange={(v) => upd({ target_kg: v })} />
          </div>
        </div>
        {hint && (
          <div className="stack" style={{ gap: 10 }} aria-live="polite">
            <div className="hint pinkish"><span>✨</span><span>About <b>{fmt.kcal(hint.daily_kcal)} kcal a day</b>
              {hint.eta_date && <>, reaching your goal around <b>{fmt.date(hint.eta_date)}</b></>}. Healthy weight for your height: {hint.healthy_range_kg[0]}–{hint.healthy_range_kg[1]} kg.</span></div>
            {hint.warnings.map((w) => <div key={w} className="hint"><span>⚠️</span><span>{w}</span></div>)}
          </div>
        )}
      </div>
      <Foot label="Continue" onClick={() => go(1)} />
    </div>
  );
}

// ---------- 05 Activity ----------
function Activity({ d, upd, go, pct }) {
  return (
    <div className="ob"><Top go={go} pct={pct} />
      <Head title="How active are you? 👟" sub="Think about a normal week, not your best one." />
      <div className="ob-body" role="radiogroup" aria-label="Activity level">
        {ACTIVITY.map((a) => (
          <button key={a.key} className="opt" aria-pressed={d.activity === a.key} onClick={() => upd({ activity: a.key })}>
            <span className="em" aria-hidden="true">{a.e}</span><span className="tx"><b>{a.t}</b><small>{a.d}</small></span>
            <span className="radio"><Icon name="check" /></span>
          </button>
        ))}
      </div>
      <Foot label="Continue" onClick={() => go(1)} />
    </div>
  );
}

// ---------- 06 Food ----------
function Food({ prefs, setPrefs, go, pct }) {
  const diet = [['halal', '☪️ Halal'], ['vegetarian', '🥬 Vegetarian'], ['puasa', '🌙 Puasa mode']];
  return (
    <div className="ob"><Top go={go} pct={pct} />
      <Head title="Any way you like to eat? 🍛" sub="Your plan and Smart Swaps will respect these." />
      <div className="ob-body">
        <span className="eyebrow" style={{ color: 'var(--ink-3)' }}>Diet</span>
        <div className="pick-chips">{diet.map(([k, l]) => <button key={k} className="pick" aria-pressed={!!prefs[k]} onClick={() => setPrefs((p) => ({ ...p, [k]: !p[k] }))}>{l}</button>)}</div>
        <span className="eyebrow" style={{ color: 'var(--ink-3)', marginTop: 6 }}>Daily food budget</span>
        <div className="pick-chips" role="radiogroup" aria-label="Daily budget">
          {BUDGETS.map((b) => <button key={b} className="pick" aria-pressed={prefs.budget_rm === b} onClick={() => setPrefs((p) => ({ ...p, budget_rm: b }))}>RM{b}</button>)}
        </div>
        <label className="field" style={{ marginTop: 6 }}><span className="eyebrow" style={{ color: 'var(--ink-3)' }}>Anything you avoid?</span>
          <input className="input" maxLength={120} value={prefs.dislikes} placeholder="e.g. durian, prawns, peanuts" onChange={(e) => setPrefs((p) => ({ ...p, dislikes: e.target.value }))} /></label>
      </div>
      <Foot label="Build my plan" onClick={() => go(1)} />
    </div>
  );
}

// ---------- 07 Building (real work: formulas, then AI plan) ----------
const STEPS = ['Base metabolic rate (Mifflin-St Jeor)', 'Daily calorie target', 'Macro split', '7-day Malaysian meal plan (AI)'];
function Building({ d, prefs, app, setStep }) {
  const [pctDone, setPct] = useState(0);
  const [states, setStates] = useState(['todo', 'todo', 'todo', 'todo']);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;      // React StrictMode runs effects twice in development
    started.current = true;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const mark = (i, st) => setStates((s) => s.map((x, j) => (j === i ? st : x)));
    (async () => {
      const draft = { name: d.name, sex: d.sex, age: d.age, height_cm: d.height_cm, weight_kg: d.weight_kg, activity: d.activity, goal: d.goal, target_kg: d.goal === 'maintain' ? null : d.target_kg };
      let metrics;
      try {
        mark(0, 'doing'); setPct(8);
        metrics = await api.assess(draft);
        for (let i = 0; i < 3; i++) { mark(i, 'done'); mark(i + 1, 'doing'); setPct(20 + i * 18); await wait(350); }
      } catch (err) {
        app.toast(err.message, 'error'); setStep('body'); return;
      }
      const profile = { ...draft, goal: metrics.goal, target_kg: metrics.target_kg };
      let plan = null;
      const creep = setInterval(() => setPct((p) => (p < 92 ? p + 2 : p)), 600);
      try { ({ plan, metrics } = await api.plan(profile, prefs)); }
      catch { app.toast('Your meal plan will be ready on the Plan tab.'); }
      clearInterval(creep);
      store.set({ profile, prefs, metrics, plan });
      addWeight(localISO(), profile.weight_kg);
      mark(3, 'done'); setPct(100);
      await wait(600);
      setStep('ready');
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const R = 80, C = 2 * Math.PI * R;
  return (
    <div className="ob">
      <div className="build">
        <div className="build-ring">
          <svg viewBox="0 0 180 180" aria-hidden="true"><circle className="track" cx="90" cy="90" r={R} />
            <circle className="bar" cx="90" cy="90" r={R} strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - pctDone / 100)).toFixed(1)} /></svg>
          <b className="num" aria-live="polite">{Math.round(pctDone)}%</b>
        </div>
        <h2>Building your plan ⚙️</h2>
        <p className="muted tiny">Crunching your numbers. This takes a few seconds.</p>
        <div className="steps-card">
          {STEPS.map((t, i) => <div key={t} className={`step-row ${states[i]}`}><span className="dot"><Icon name="check" /></span>{t}</div>)}
        </div>
      </div>
    </div>
  );
}

// ---------- 08 Plan ready ----------
function MacroRing({ share, color }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r={r} stroke="var(--surface-2)" />
      <circle cx="24" cy="24" r={r} stroke={color} strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * (1 - clamp(share, 0, 1))).toFixed(1)} />
    </svg>
  );
}
function Ready({ app }) {
  const { profile: p, metrics: m } = store.get();
  if (!m) return <div className="ob" />;
  const macros = [['Protein', m.macros.protein_g, 4, 'var(--primary)'], ['Carbs', m.macros.carbs_g, 4, 'var(--gold)'], ['Fat', m.macros.fat_g, 9, 'var(--sky)']];
  return (
    <div className="ob" style={{ background: 'var(--bg)' }}>
      <div className="ready-head"><div className="e">🎉</div>
        <h1>Your plan is ready{p.name ? `, ${p.name}` : ''}</h1>
        <p>{m.target_kg && m.eta_date ? `Reach ${fmt.kg(m.target_kg)} kg by ${fmt.date(m.eta_date)} by eating about this every day.` : 'Eat about this every day to stay healthy and strong.'}</p>
      </div>
      <div className="ready-body">
        <section className="card kcal-card"><span className="eyebrow" style={{ color: 'var(--ink-3)' }}>Daily calories</span>
          <div className="n num">{fmt.kcal(m.daily_kcal)}</div><span className="tiny muted">kcal a day</span></section>
        <div className="macro-cards">
          {macros.map(([l, g, k, col]) => {
            const share = (g * k) / m.daily_kcal;
            return (
              <section key={l} className="card"><MacroRing share={share} color={col} /><b className="num">{g} g</b>
                <span className="tiny muted" style={{ textAlign: 'center', lineHeight: 1.3 }}>{l}<br />{Math.round(share * 100)}% of kcal</span></section>
            );
          })}
        </div>
        {m.warnings.map((w) => <div key={w} className="alert"><Icon name="alert" /><span>{w}</span></div>)}
        <section className="card" style={{ padding: '4px 16px' }}>
          {[['📸', 'Log meals', 'Snap every plate'], ['💧', 'Water', '8 glasses a day'], ['👟', 'Steps', '8,000 a day']].map(([e, t, v]) => (
            <div key={t} className="habit"><span aria-hidden="true">{e}</span><b>{t}</b><span className="tiny muted">{v}</span></div>
          ))}
        </section>
      </div>
      <div style={{ flex: 1, minHeight: 16 }} />
      <Foot label="Let’s start" onClick={() => app.navigate('home')} />
    </div>
  );
}
