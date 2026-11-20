// AI meal plan + Smart Swap, Puasa mode and Kenduri Rebalancer.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { store, useStore, addMeal, eventActive } from '../lib/store.js';
import { fmt, localISO, addDays } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOT_COLORS = { Breakfast: 'var(--gold)', Sahur: 'var(--sky)', Lunch: 'var(--primary)', Iftar: 'var(--accent)', Snack: 'var(--sky)', Moreh: 'var(--gold)', Dinner: 'var(--accent)' };
const FEASTS = [
  { name: 'Kenduri kahwin', kcal: 900 },
  { name: 'Hari Raya open house', kcal: 1200 },
  { name: 'Buffet dinner', kcal: 1000 },
  { name: 'Birthday party', kcal: 600 },
];
let selectedDayMemo = WEEK[(new Date().getDay() + 6) % 7];
let generatingGlobal = false;   // survives React StrictMode double-mount, prevents double AI calls

function Thinking({ puasa }) {
  return (
    <div className="card thinking" style={{ minHeight: '60vh', justifyContent: 'center' }}>
      <div className="thinking-dots"><i /><i /><i /></div>
      <h2>Cooking up your {puasa ? 'Ramadan ' : ''}plan…</h2>
      <p className="muted">Calculating your calories with the Mifflin-St Jeor formula, then asking the AI to pick Malaysian meals that fit.</p>
    </div>
  );
}

export default function Plan() {
  const s = useStore();
  const { toast, refreshMetrics } = useApp();
  const [generating, setGenerating] = useState(generatingGlobal);
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState(selectedDayMemo);
  const [prefsChanged, setPrefsChanged] = useState(false);
  const [swaps, setSwaps] = useState({});        // meal index → swaps[] (open panels)

  const generate = async () => {
    if (generatingGlobal) return;
    generatingGlobal = true; setGenerating(true); setFailed(false);
    try {
      const { profile, prefs } = store.get();
      const { plan, metrics } = await api.plan(profile, prefs);
      store.set({ plan, metrics });
      setPrefsChanged(false); setSwaps({});
      toast(plan.source === 'gemini' ? 'Fresh AI plan ready!' : 'Plan ready');
    } catch (err) {
      toast(err.message, 'error'); setFailed(true);
    } finally {
      generatingGlobal = false; setGenerating(false);
    }
  };

  useEffect(() => {
    if (!generatingGlobal) setGenerating(false);           // a generation that finished while we were away
    if (!s.plan && !generatingGlobal && !failed) generate();
  }, [s.plan]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!s.metrics && s.profile) refreshMetrics(); }, [s.metrics, s.profile, refreshMetrics]);

  if (generating || (!s.plan && !failed)) return <Thinking puasa={s.prefs.puasa} />;
  if (!s.plan) {
    return <div className="card thinking"><p>Couldn't build a plan.</p><button className="btn btn-primary" onClick={generate}><Icon name="refresh" /> Try again</button></div>;
  }

  const plan = s.plan;
  const current = plan.days.find((d) => d.day === day) || plan.days[0];
  const target = plan.target_kcal;
  const pct = Math.min(100, (current.total_kcal / target) * 100);

  const togglePref = (key) => { store.set({ prefs: { ...s.prefs, [key]: !s.prefs[key] } }); setPrefsChanged(true); };
  const pickDay = (d) => { selectedDayMemo = d; setDay(d); setSwaps({}); };

  const logMeal = (meal) => {
    addMeal({ name: meal.name, kcal: meal.kcal, protein: meal.protein_g, slot: meal.slot, source: 'plan' });
    toast(`Logged ${meal.name} (${meal.kcal} kcal)`);
  };

  const toggleSwaps = async (i, meal) => {
    if (swaps[i]) { setSwaps(({ [i]: _, ...rest }) => rest); return; }
    try {
      const r = await api.swap(meal.slot, meal.kcal, s.prefs.vegetarian, meal.name);
      setSwaps((x) => ({ ...x, [i]: r.swaps }));
    } catch (err) { toast(err.message, 'error'); }
  };

  const applySwap = (index, sw) => {
    const days = plan.days.map((d) => {
      if (d.day !== current.day) return d;
      const meals = d.meals.map((m, i) => (i !== index ? m : {
        slot: m.slot, name: sw.name, description: `Smart swap: saves ${sw.saves_kcal} kcal vs ${m.name}.`,
        kcal: sw.kcal, protein_g: sw.protein, cost_rm: sw.rm,
      }));
      const total = meals.reduce((a, m) => a + m.kcal, 0);
      return {
        ...d, meals, total_kcal: total,
        total_protein_g: meals.reduce((a, m) => a + m.protein_g, 0),
        total_cost_rm: Math.round(meals.reduce((a, m) => a + m.cost_rm, 0) * 100) / 100,
        on_target: Math.abs(total - plan.target_kcal) <= plan.target_kcal * 0.15,
      };
    });
    store.set({ plan: { ...plan, days } });
    setSwaps({});
    toast(`Swapped in ${sw.name}`);
  };

  return (
    <>
      <header className="page-head">
        <div><h1>Your <em>{s.prefs.puasa ? 'Ramadan' : 'makan'}</em> plan</h1></div>
        <div className="row">
          {plan.source === 'gemini' && <span className="badge ai"><Icon name="sparkle" /> Generated by Gemini</span>}
          <button className="btn btn-primary" onClick={generate}><Icon name="refresh" /> Regenerate</button>
        </div>
      </header>

      {plan.notice && <div className="alert" style={{ marginBottom: 16 }}><Icon name="info" /><span>{plan.notice}</span></div>}

      <section className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="chips" role="group" aria-label="Plan preferences">
            <button className="chip" aria-pressed={s.prefs.puasa} onClick={() => togglePref('puasa')}><Icon name="moon" /> Puasa mode</button>
            <button className="chip" aria-pressed={s.prefs.vegetarian} onClick={() => togglePref('vegetarian')}><Icon name="leaf" /> Vegetarian</button>
            <button className="chip" aria-pressed={s.prefs.halal} onClick={() => togglePref('halal')}>Halal</button>
          </div>
          <label className="row tiny" style={{ minWidth: 220, flex: 1, maxWidth: 340 }}>
            <Icon name="wallet" /><span style={{ whiteSpace: 'nowrap' }}>Budget <b>RM{s.prefs.budget_rm}</b>/day</span>
            <input type="range" min="10" max="80" value={s.prefs.budget_rm} aria-label="Daily budget"
              onChange={(e) => { store.set({ prefs: { ...s.prefs, budget_rm: Number(e.target.value) } }); setPrefsChanged(true); }} />
          </label>
        </div>
        <p className="tiny muted" style={{ marginTop: 8, color: prefsChanged ? 'var(--accent)' : undefined }}>Changed a preference? Tap <b>Regenerate</b> to apply it.</p>
      </section>

      <div className="day-tabs" role="tablist" aria-label="Days of the week">
        {plan.days.map((d) => (
          <button key={d.day} className="day-tab" role="tab" aria-selected={d.day === current.day} onClick={() => pickDay(d.day)}>
            {d.day.slice(0, 3)}<small className="num">{fmt.kcal(d.total_kcal)}</small>
            <i className={`dot ${d.on_target ? '' : 'off'}`} title={d.on_target ? 'On target' : 'Off target by more than 15%'} />
          </button>
        ))}
      </div>

      <section className="card" style={{ margin: '12px 0 16px' }}>
        <div className="grid grid-3" style={{ gap: 20 }}>
          <div><div className="tiny muted">Calories</div><div className="big-number num">{fmt.kcal(current.total_kcal)}<small>/ {fmt.kcal(target)}</small></div>
            <div className="bar-track" style={{ marginTop: 8 }}><div className={`bar-fill ${current.on_target ? '' : 'gold'}`} style={{ '--v': `${pct}%` }} /></div></div>
          <div><div className="tiny muted">Protein</div><div className="big-number num">{current.total_protein_g}<small>g / {s.metrics?.macros.protein_g ?? '–'}g</small></div></div>
          <div><div className="tiny muted">Estimated cost</div><div className="big-number num">{fmt.rm(current.total_cost_rm)}</div>
            <span className={`badge ${current.total_cost_rm <= s.prefs.budget_rm ? 'good' : 'warn'}`} style={{ marginTop: 6 }}>
              {current.total_cost_rm <= s.prefs.budget_rm ? 'Within budget' : 'Over budget'}</span></div>
        </div>
      </section>

      <div className="grid grid-2">
        {current.meals.map((meal, i) => (
          <article key={`${current.day}-${i}`} className="card meal-card" style={{ '--slot-color': SLOT_COLORS[meal.slot] || 'var(--primary)' }}>
            <div className="spread"><span className="slot-tag" style={{ color: 'var(--slot-color)' }}>{meal.slot}</span>
              <span className="badge num">{fmt.kcal(meal.kcal)} kcal</span></div>
            <h3>{meal.name}</h3>
            <p className="muted tiny">{meal.description}</p>
            <div className="meal-meta"><span>Protein <b className="num">{meal.protein_g}g</b></span><span>Cost <b className="num">{fmt.rm(meal.cost_rm)}</b></span></div>
            <div className="row">
              <button className="btn btn-sm btn-primary" onClick={() => logMeal(meal)}><Icon name="plus" /> Log it</button>
              <button className="btn btn-sm" onClick={() => toggleSwaps(i, meal)}><Icon name="swap" /> Smart swap</button>
            </div>
            {swaps[i] && (swaps[i].length ? (
              <div className="swap-list">
                <span className="tiny muted"><b>Lighter local swaps</b> that keep you full</span>
                {swaps[i].map((sw) => (
                  <div key={sw.id} className="swap-item"><span>{sw.name} <span className="muted num">· {sw.kcal} kcal</span></span>
                    <span className="row"><span className="save num">−{sw.saves_kcal}</span><button className="btn btn-sm" onClick={() => applySwap(i, sw)}>Use</button></span></div>
                ))}
              </div>
            ) : <div className="swap-list tiny">Already a light choice. No lighter swap needed! 👍</div>)}
          </article>
        ))}
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-title"><Icon name="sparkle" /> Tips for you</div>
          <p style={{ marginBottom: 10 }}>{plan.summary}</p>
          <ul className="stack" style={{ paddingLeft: 18, margin: 0, gap: 6 }}>{plan.tips.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
        <Kenduri />
      </div>
    </>
  );
}

// ---- Kenduri Rebalancer ----
function Kenduri() {
  const s = useStore();
  const { toast } = useApp();
  const [form, setForm] = useState({ name: 'Kenduri kahwin', date: addDays(localISO(), 3), extra_kcal: 900, days_before: 3, days_after: 2 });
  const [result, setResult] = useState(null);
  const ev = eventActive(s) ? s.event : null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'number' || k.startsWith('days') ? Number(e.target.value) : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.date || form.date < localISO()) { toast('Pick a date from today onwards.', 'error'); return; }
    try { setResult(await api.rebalance(s.profile, form.extra_kcal, form.days_before, form.days_after)); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 12 }}><div className="card-title" style={{ margin: 0 }}><Icon name="party" /> Kenduri Rebalancer</div><span className="badge excl">EXCLUSIVE</span></div>
      {ev ? (
        <div className="stack">
          <p><b>{ev.name}</b> on {fmt.date(ev.date)} (+{fmt.kcal(ev.extra_kcal)} kcal)</p>
          <p className="muted">Eat <b className="num" style={{ color: 'var(--ink)' }}>{fmt.kcal(ev.result.adjusted_daily_kcal)} kcal/day</b> for {ev.days_before} day(s) before and {ev.days_after} day(s) after, then enjoy the feast guilt-free.</p>
          <button className="btn btn-sm" onClick={() => { store.set({ event: null }); setResult(null); toast('Event cancelled'); }}><Icon name="trash" /> Cancel event</button>
        </div>
      ) : (
        <>
          <p className="muted tiny" style={{ marginBottom: 12 }}>Got a wedding or open house coming up? Don't skip it. We'll spread the extra calories safely over the days around it.</p>
          <form className="stack" onSubmit={submit}>
            <div className="chips">{FEASTS.map((f) => <button key={f.name} type="button" className="chip" onClick={() => setForm((x) => ({ ...x, name: f.name, extra_kcal: f.kcal }))}>{f.name}</button>)}</div>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <label className="field"><span>Event</span><input className="input" required maxLength={40} value={form.name} onChange={set('name')} /></label>
              <label className="field"><span>Date</span><input className="input" type="date" required min={localISO()} value={form.date} onChange={set('date')} /></label>
              <label className="field"><span>Extra kcal (est.)</span><input className="input" type="number" min="100" max="5000" step="50" required value={form.extra_kcal} onChange={set('extra_kcal')} /></label>
              <label className="field"><span>Spread over (days before / after)</span>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <select className="input" value={form.days_before} onChange={set('days_before')} aria-label="Days before">{[0, 1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
                  <select className="input" value={form.days_after} onChange={set('days_after')} aria-label="Days after">{[0, 1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
                </div></label>
            </div>
            <button className="btn btn-primary" type="submit">Rebalance my week</button>
            {result && (
              <div className="swap-list">
                <p>Trim <b className="num">{result.trim_per_day} kcal</b> on {result.spread_days} day(s) → eat <b className="num">{fmt.kcal(result.adjusted_daily_kcal)} kcal/day</b>.</p>
                <p className="tiny muted">{result.unabsorbed_kcal > 0
                  ? `${fmt.kcal(result.unabsorbed_kcal)} kcal can't be offset safely (we never go below ${result.floor_kcal} kcal or cut more than 300/day). That's okay: one feast won't undo your progress.`
                  : 'The whole feast is balanced out safely. 🎉'}</p>
                <button type="button" className="btn btn-sm btn-accent" onClick={() => { store.set({ event: { ...form, name: form.name.trim() || 'Event', result } }); toast('Kenduri mode on! Your daily targets have been adjusted.'); }}>Activate</button>
              </div>
            )}
          </form>
        </>
      )}
    </section>
  );
}
