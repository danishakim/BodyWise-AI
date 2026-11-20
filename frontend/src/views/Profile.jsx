// Profile (Figma 12): who you are in the app and how far you've come.
// Configuration lives in Settings (gear, top-right).
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore, mealsOn, goalProgress, exportData } from '../lib/store.js';
import { fmt, localISO, addDays } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';
import Body3D from '../components/Body3D.jsx';

function streak(s) {
  let d = localISO();
  if (!mealsOn(d, s).length) d = addDays(d, -1);      // today not logged yet doesn't break a streak
  let n = 0;
  while (mealsOn(d, s).length && n < 365) { n++; d = addDays(d, -1); }
  return n;
}

function Row({ href, onClick, icon, title, sub, value }) {
  const inner = (<>
    <span className="ic"><Icon name={icon} /></span>
    <span className="tx"><b>{title}</b>{sub && <small>{sub}</small>}</span>
    {value && <span className="val">{value}</span>}
    <Icon name="chevron" className="chev" />
  </>);
  return href ? <a className="lrow" href={href}>{inner}</a> : <button className="lrow" onClick={onClick}>{inner}</button>;
}

export default function Profile() {
  const s = useStore();
  const { refreshMetrics } = useApp();
  const p = s.profile;
  const m = s.metrics;
  const [forecast, setForecast] = useState('');

  useEffect(() => { if (!m) refreshMetrics(); }, [m, refreshMetrics]);
  useEffect(() => {
    if (s.weights.length >= 2 && m?.target_kg) {
      api.predict(s.weights, m.target_kg, m.goal).then((r) => {
        if (r.ok && r.eta_date) setForecast(`AI forecast: goal by ${fmt.date(r.eta_date)} · ${r.slope_kg_per_week > 0 ? '+' : ''}${r.slope_kg_per_week} kg/week`);
      }).catch(() => {});
    }
  }, [s.weights, m?.target_kg, m?.goal]);

  const start = s.weights[0]?.kg ?? p.weight_kg;
  const moved = Math.abs(p.weight_kg - start);
  const toGo = m?.target_kg ? Math.abs(m.target_kg - start) : 0;
  const pct = Math.round(goalProgress(s) * 100);
  const days = streak(s);
  const towardGoal = m?.target_kg ? (start - p.weight_kg) * Math.sign(start - m.target_kg) : 0;
  const bmiTone = { normal: 'good', underweight: 'warn', overweight: 'warn', obese: 'bad' }[m?.bmi_category] || '';
  const goalLabel = { lose: 'Goal: lose weight', gain: 'Goal: gain weight', maintain: 'Goal: stay healthy' }[m?.goal || p.goal];

  return (
    <div className="list-wrap stack" style={{ gap: 16 }}>
      <header className="spread"><h1>Profile</h1>
        <a className="icon-btn" href="#/settings" aria-label="Settings"><Icon name="settings" /></a></header>

      <section className="card identity">
        <Body3D bmi={m?.bmi ?? 22} sex={p.sex} label="Your 3D body" />
        <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
          <h2>{p.name || 'BodyWise friend'}</h2>
          <span className="tiny muted">{p.age} · {p.sex === 'female' ? 'Female' : 'Male'} · {p.height_cm} cm</span>
          <div className="row" style={{ gap: 6 }}><span className="badge good">{goalLabel}</span></div>
          <a className="btn btn-sm" href="#/edit" style={{ alignSelf: 'flex-start' }}><Icon name="edit" /> Edit profile</a>
        </div>
      </section>

      <div className="grid grid-2" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <section className="card stat"><small>Current weight</small><b className="num">{fmt.kg(p.weight_kg)}<span>kg</span></b></section>
        <section className="card stat"><small>Goal weight</small><b className="num">{m?.target_kg ? fmt.kg(m.target_kg) : '—'}<span>kg</span></b></section>
        <section className="card stat"><small>BMI</small><b className="num">{m?.bmi ?? '—'}</b>
          {m && <span className={`badge ${bmiTone}`} style={{ marginTop: 6 }}>{m.bmi_label}</span>}</section>
        <section className="card stat"><small>Daily target</small><b className="num">{m ? fmt.kcal(m.daily_kcal) : '—'}<span>kcal</span></b></section>
      </div>

      {m?.target_kg && (
        <section className="card stack" style={{ gap: 10 }}>
          <div className="spread"><span className="card-title" style={{ margin: 0 }}><Icon name="target" /> Goal progress</span><b style={{ color: 'var(--primary)' }}>{pct}%</b></div>
          <h2 className="num">{fmt.kg(moved)} kg {m.goal === 'gain' ? 'gained' : 'lost'} of {fmt.kg(toGo)} kg</h2>
          <div className="progress"><i style={{ '--v': `${pct}%` }} /></div>
          <span className="tiny muted">{forecast || (m.eta_date ? `Formula estimate: goal by ${fmt.date(m.eta_date)}` : 'Log weigh-ins to get an AI forecast.')}</span>
        </section>
      )}

      <div className="section-head"><h2>Achievements</h2></div>
      <div className="ach">
        <div className={days ? 'tone-pink' : 'locked'}><span className="e">🔥</span><b>{days || 0}-day streak</b><small>Meals logged</small></div>
        <div className={towardGoal >= 2 ? 'tone-gold' : 'locked'}><span className="e">🏅</span><b>First 2 kg</b><small>{towardGoal >= 2 ? 'Unlocked' : `${fmt.kg(Math.max(0, 2 - towardGoal))} kg to go`}</small></div>
        <div className={s.weights.length >= 5 ? 'tone-sky' : 'locked'}><span className="e">📈</span><b>Consistent</b><small>{s.weights.length}/5 weigh-ins</small></div>
      </div>

      <div className="group-label">My plan</div>
      <div className="group">
        <Row href="#/edit" icon="edit" title="Body & goal" sub="Height, weight, target"
          value={m?.target_kg ? `${m.goal === 'gain' ? 'Gain' : 'Lose'} · ${fmt.kg(m.target_kg)} kg` : 'Maintain'} />
        <Row href="#/settings" icon="leaf" title="Food preferences" sub="Halal, budget, Puasa mode" value={`RM${s.prefs.budget_rm}/day`} />
        <Row href="#/progress" icon="calendar" title="Weigh-in history" sub={`${s.weights.length} entries`} />
        <Row onClick={exportData} icon="download" title="Export my data" sub="Download as JSON" />
      </div>
    </div>
  );
}
