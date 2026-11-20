// Progress (Figma 11): current weight + chart (weigh-ins vs AI projection),
// AI forecast (linear regression), calories this week, weigh-in form and history.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore, addWeight, removeWeight, seedDemoData, mealsOn, targetFor } from '../lib/store.js';
import { fmt, localISO, daysBetween, addDays } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';

const RANGES = [['Week', 7], ['Month', 30], ['3 months', 90]];
let rangeMemo = 90;

export default function Progress() {
  const s = useStore();
  const { toast, refreshMetrics } = useApp();
  const m = s.metrics;
  const [rangeDays, setRangeDays] = useState(rangeMemo);
  const [pred, setPred] = useState(null);
  const [date, setDate] = useState(localISO());
  const [kg, setKg] = useState(String(s.profile.weight_kg));
  const weighRef = useRef(null);
  const kgRef = useRef(null);

  useEffect(() => { if (!m && s.profile) refreshMetrics(); }, [m, s.profile, refreshMetrics]);
  useEffect(() => {
    if (s.weights.length < 2) { setPred(null); return; }
    api.predict(s.weights, m?.target_kg ?? null, m?.goal ?? 'maintain').then(setPred).catch((e) => toast(e.message, 'error'));
  }, [s.weights, m?.target_kg, m?.goal, toast]);

  const from = addDays(localISO(), -rangeDays);
  const shown = s.weights.filter((w) => w.date >= from);
  const first = shown[0];
  const change = first ? Math.round((s.profile.weight_kg - first.kg) * 10) / 10 : 0;
  const weeks = first ? Math.max(1, Math.round(daysBetween(first.date, localISO()) / 7)) : 0;
  const tone = !m || m.goal === 'maintain' ? '' : (m.goal === 'lose' ? change < 0 : change > 0) ? 'good' : 'warn';

  const save = async (e) => {
    e.preventDefault();
    const v = Number(kg);
    if (!(v >= 30 && v <= 300) || !date) { toast('Enter a valid date and weight.', 'error'); return; }
    addWeight(date, v);
    await refreshMetrics();
    toast('Weigh-in saved');
  };
  const seed = async () => { seedDemoData(); await refreshMetrics(); toast('Sample data loaded'); };

  return (
    <div className="list-wrap" style={{ maxWidth: 720 }}>
      <div className="prog-head"><h1>Progress</h1>
        <button className="btn btn-brand btn-sm" onClick={() => { weighRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); kgRef.current.focus({ preventScroll: true }); }}>
          <Icon name="plus" /> Weigh in</button></div>

      <div className="range" role="group" aria-label="Chart range">
        {RANGES.map(([l, d]) => <button key={d} aria-pressed={rangeDays === d} onClick={() => { rangeMemo = d; setRangeDays(d); }}>{l}</button>)}
      </div>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="spread" style={{ alignItems: 'flex-end' }}>
          <div><span className="eyebrow" style={{ color: 'var(--ink-3)' }}>Current weight</span>
            <div className="weight-big"><b className="num">{fmt.kg(s.profile.weight_kg)}</b><span className="muted">kg</span></div></div>
          {first && shown.length > 1 && <span className={`badge ${tone}`}>{change > 0 ? '+' : ''}{change} kg in {weeks} week{weeks > 1 ? 's' : ''}</span>}
        </div>
        <div style={{ marginTop: 10 }}>
          {shown.length < 2 ? (
            <div className="thinking"><p className="muted">Log at least 2 weigh-ins in this range to see your trend.</p>
              {s.weights.length < 3 && <button className="btn btn-sm" onClick={seed}><Icon name="sparkle" /> Load 8 weeks of sample data</button>}</div>
          ) : pred ? <Chart weights={shown} r={pred} target={m?.target_kg} /> : <div className="skeleton" style={{ height: 220 }} />}
        </div>
        {shown.length >= 2 && (
          <div className="row tiny muted" style={{ justifyContent: 'center', gap: 16, marginTop: 6 }}>
            <span><i className="legend-dot" style={{ background: 'var(--primary)' }} />Your weigh-ins</span>
            <span><i className="legend-dot" style={{ background: 'repeating-linear-gradient(90deg,var(--primary) 0 3px,transparent 3px 7px)' }} />AI projection</span>
            {m?.target_kg && <span><i className="legend-dot" style={{ background: 'var(--gold)' }} />Goal</span>}
          </div>
        )}
      </section>

      {pred?.ok && (
        <div style={{ marginTop: 14 }}>
          <section className="forecast-card">
            <span className="ic"><Icon name="sparkle" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{pred.eta_date ? `Goal by ${fmt.date(pred.eta_date)}` : !m?.target_kg ? 'Holding steady' : 'Not on track yet'}</b>
              <p className="tiny muted">AI forecast from {pred.points} weigh-ins · {pred.slope_kg_per_week > 0 ? '+' : ''}{pred.slope_kg_per_week} kg/week · R² {pred.r2}</p>
            </div>
          </section>
          {pred.alerts.map((a) => <div key={a} className={`alert ${a.startsWith('Plateau') ? 'info' : ''}`} style={{ marginTop: 10 }}><Icon name="info" /><span>{a}</span></div>)}
        </div>
      )}

      <section className="card" style={{ marginTop: 14 }}><Week s={s} /></section>

      <section className="card weigh-sheet" ref={weighRef} style={{ marginTop: 14 }}>
        <div className="card-title"><Icon name="scale" /> Log weight</div>
        <form className="stack" onSubmit={save}>
          <div className="grid grid-2" style={{ gap: 8 }}>
            <input className="input" type="date" max={localISO()} value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date" />
            <div className="unit-input"><input ref={kgRef} className="input" type="number" step="0.1" min="30" max="300" value={kg} onChange={(e) => setKg(e.target.value)} required aria-label="Weight in kg" /><span className="unit">kg</span></div>
          </div>
          <button className="btn btn-primary" type="submit"><Icon name="check" /> Save weigh-in</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-title">History</div>
        {s.weights.length ? (
          <div className="food-list">
            {[...s.weights].reverse().map((w, i, arr) => {
              const prev = arr[i + 1];
              const diff = prev ? Math.round((w.kg - prev.kg) * 10) / 10 : null;
              return (
                <div key={w.date} className="food-item"><span>{fmt.date(w.date)}</span><span className="row">
                  {diff !== null && <span className="tiny num" style={{ color: diff < 0 ? 'var(--ok)' : diff > 0 ? 'var(--accent)' : 'var(--ink-3)' }}>{diff > 0 ? '+' : ''}{diff}</span>}
                  <b className="num">{fmt.kg(w.kg)} kg</b>
                  <button className="icon-btn" aria-label={`Delete weigh-in on ${fmt.date(w.date)}`} onClick={() => removeWeight(w.date)}><Icon name="trash" /></button></span></div>
              );
            })}
          </div>
        ) : <p className="muted tiny">No weigh-ins yet.</p>}
      </section>
    </div>
  );
}

function Week({ s }) {
  const today = localISO();
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, kcal: mealsOn(date, s).reduce((a, x) => a + x.kcal, 0) };
  });
  const logged = days.filter((d) => d.kcal > 0);
  const avg = logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : 0;
  const max = Math.max(targetFor(undefined, s).kcal * 1.2, ...days.map((d) => d.kcal));
  return (
    <>
      <div className="spread"><b>Calories this week</b><span className="tiny muted">{avg ? `avg ${fmt.kcal(avg)} kcal` : 'No meals logged yet'}</span></div>
      <div className="bars" role="img" aria-label="Calories logged each day this week">
        {days.map((d, i) => (
          <div key={d.date}>
            <i className={d.date === today ? 'today' : d.kcal ? '' : 'empty'} style={{ '--h': `${d.kcal ? Math.max(8, Math.round((d.kcal / max) * 100)) : 6}%` }} />
            <span>{'MTWTFSS'[i]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Chart({ weights, r, target }) {
  const W = 640, H = 240, P = { l: 40, r: 16, t: 16, b: 28 };
  const first = weights[0].date;
  const lastW = weights[weights.length - 1];
  const proj = r.ok && r.projection.length ? r.projection : null;
  const lastDate = proj ? proj[1].date : lastW.date;
  const span = Math.max(7, daysBetween(first, lastDate));
  const ys = weights.map((w) => w.kg).concat(target ? [target] : []);
  const yMin = Math.floor(Math.min(...ys) - 1), yMax = Math.ceil(Math.max(...ys) + 1);
  const x = (d) => P.l + (daysBetween(first, d) / span) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - yMin) / (yMax - yMin)) * (H - P.t - P.b);
  const ticks = Array.from({ length: 4 }, (_, i) => yMin + ((yMax - yMin) * i) / 3);
  const line = weights.map((w, i) => `${i ? 'L' : 'M'}${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`).join('');
  const area = `${line}L${x(lastW.date).toFixed(1)},${H - P.b}L${x(first).toFixed(1)},${H - P.b}Z`;
  const short = { day: 'numeric', month: 'short' };

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight chart: your weigh-ins and the AI projection to your goal">
      <defs><linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#EC4D86" stopOpacity=".28" /><stop offset="1" stopColor="#EC4D86" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((t) => (
        <g key={t}><line className="grid-line" x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} />
          <text className="axis-text" x={P.l - 8} y={y(t) + 4} textAnchor="end">{t.toFixed(1)}</text></g>
      ))}
      <text className="axis-text" x={x(first)} y={H - 6} textAnchor="start">{fmt.date(first, short)}</text>
      <text className="axis-text" x={x(lastW.date)} y={H - 6} textAnchor="middle">Today</text>
      {proj && <text className="axis-text" x={W - P.r} y={H - 6} textAnchor="end">{fmt.date(lastDate, short)}</text>}
      {target && <>
        <line className="target-line" x1={P.l} x2={W - P.r} y1={y(target)} y2={y(target)} />
        <text className="target-text" x={W - P.r} y={y(target) - 6} textAnchor="end">Goal {target} kg</text></>}
      <path className="weight-area" d={area} />
      {proj && <>
        <line className="proj-line" x1={x(lastW.date)} y1={y(lastW.kg)} x2={x(proj[1].date)} y2={y(proj[1].kg)} />
        <circle cx={x(proj[1].date)} cy={y(proj[1].kg)} r="6" className="goal-flag" /></>}
      <path className="weight-line draw" d={line} />
      {weights.map((w) => <circle key={w.date} className="pt" cx={x(w.date)} cy={y(w.kg)} r={w === lastW ? 6 : 3.5}><title>{`${fmt.date(w.date)}: ${w.kg} kg`}</title></circle>)}
    </svg>
  );
}
