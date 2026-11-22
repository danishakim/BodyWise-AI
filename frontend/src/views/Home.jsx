// Home (Figma 09): pink header with today's key number, quick actions,
// next best action, Future-You 3D body and today's meals.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore, todayTotals, addMeal, mealsOn, targetFor, eventActive, goalProgress } from '../lib/store.js';
import { fmt, localISO, addDays, clamp, bmiOf, greeting } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';
import Body3D from '../components/Body3D.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_EMOJI = { Breakfast: '🍳', Sahur: '🌙', Lunch: '🍛', Iftar: '🌅', Snack: '🍌', Moreh: '🍵', Dinner: '🐟' };
const PLAN_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
let foodsCache = null;

function Ring({ pct, color }) {
  const r = 14, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r={r} stroke="rgba(255,255,255,.28)" />
      <circle cx="17" cy="17" r={r} stroke={color} strokeDasharray={c.toFixed(1)} strokeDashoffset={(c * (1 - clamp(pct, 0, 1))).toFixed(1)} />
    </svg>
  );
}

function WeekStrip({ s }) {
  const today = localISO();
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const cls = date === today ? 'today' : mealsOn(date, s).length ? 'done' : '';
    return (
      <div key={date} className={`week-day ${cls}`}>
        <b>{'MTWTFSS'[i]}</b><span>{new Date(`${date}T00:00:00`).getDate()}</span>
      </div>
    );
  });
}

export default function Home() {
  const s = useStore();
  const { refreshMetrics, showLogged } = useApp();
  const p = s.profile;
  const m = s.metrics;
  const [weeks, setWeeks] = useState(0);
  const [forecast, setForecast] = useState('');
  const [foods, setFoods] = useState(foodsCache);

  useEffect(() => { if (!m) refreshMetrics(); }, [m, refreshMetrics]);
  useEffect(() => {
    if (!foods) api.foods().then((r) => { foodsCache = r.foods; setFoods(r.foods); }).catch(() => {});
  }, [foods]);
  useEffect(() => {
    if (s.weights.length >= 2 && m?.target_kg) {
      api.predict(s.weights, m.target_kg, m.goal)
        .then((r) => { if (r.ok && r.eta_date) setForecast(`AI forecast from your weigh-ins: goal by ${fmt.date(r.eta_date)}`); })
        .catch(() => {});
    }
  }, [s.weights, m?.target_kg, m?.goal]);

  if (!m) return <div className="skeleton" style={{ height: 320 }} />;

  const today = todayTotals(s);
  const tgt = targetFor(undefined, s);
  const left = tgt.kcal - today.kcal;
  const todayPlan = s.plan?.days?.find((d) => d.day === DAYS[new Date().getDay()]);
  const loggedNames = new Set(mealsOn(undefined, s).map((x) => x.name));
  const planned = todayPlan?.meals.length || 4;
  const mealsToday = mealsOn(undefined, s).length;
  const proteinLeft = Math.max(0, m.macros.protein_g - today.protein);
  const maxWeeks = Math.max(4, Math.ceil(m.eta_weeks || 12));
  const progress = goalProgress(s);

  // Future-You: weight after `weeks` at the formula pace, never past the goal.
  let futureKg = p.weight_kg + m.weekly_change_kg * weeks;
  if (m.target_kg) futureKg = m.goal === 'lose' ? Math.max(futureKg, m.target_kg) : Math.min(futureKg, m.target_kg);

  // Next best bite: a protein-rich local food that fits the calories left.
  let pick = null;
  if (foods && left >= 80) {
    // Only meal-plan foods: drinks, fast food and photo lookalikes ("other") are never suggested.
    const fits = foods.filter((f) => f.kcal <= left && f.slots.some((x) => PLAN_SLOTS.includes(x)) && (f.veg || !s.prefs.vegetarian));
    pick = [...fits].sort((a, b) => b.protein / b.kcal - a.protein / a.kcal)[proteinLeft > 15 ? 0 : 2] || fits[0] || null;
  }

  const logPlanMeal = (meal) => {
    addMeal({ name: meal.name, kcal: meal.kcal, protein: meal.protein_g, slot: meal.slot, source: 'plan' });
    showLogged({ name: meal.name, kcal: meal.kcal, slot: meal.slot });
  };
  const logPick = () => {
    addMeal({ name: pick.name, kcal: pick.kcal, protein: pick.protein, source: 'suggestion' });
    showLogged({ name: pick.name, kcal: pick.kcal });
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="home-head batik" aria-label="Today">
        <div className="greet">
          <div>
            <h1>{greeting()}{p.name ? `, ${p.name}` : ''} 👋</h1>
            <p>{left > 0 ? `${proteinLeft} g protein to go today 💪` : 'You’ve reached today’s target 🎉'}</p>
          </div>
          <a className="glass-btn" href="#/coach" aria-label="Ask the AI coach"><Icon name="chat" /></a>
        </div>
        <div className="week" aria-label="This week"><WeekStrip s={s} /></div>
        <div className="kcal-left">
          <div className="n num">{fmt.kcal(Math.abs(left))}<small>/ {fmt.kcal(tgt.kcal)}</small></div>
          <div className="l">{left >= 0 ? 'KCAL LEFT TODAY' : 'KCAL OVER TODAY'}</div>
        </div>
        <div className="macro-rings">
          <div className="mring"><Ring pct={today.protein / m.macros.protein_g} color="#FFFFFF" /><div><b className="num">{today.protein} g</b><span>Protein</span></div></div>
          <div className="mring"><Ring pct={mealsToday / planned} color="#FFE08A" /><div><b className="num">{mealsToday}/{planned}</b><span>Meals</span></div></div>
          <div className="mring"><Ring pct={progress} color="#A8DBFF" /><div><b className="num">{Math.round(progress * 100)}%</b><span>Goal</span></div></div>
        </div>
      </section>

      {m.warnings.map((w) => <div key={w} className="alert"><Icon name="alert" /><span>{w}</span></div>)}
      {eventActive(s) && (
        <div className="alert info"><Icon name="party" />
          <span><b>{s.event.name}</b> on {fmt.date(s.event.date, { day: 'numeric', month: 'short' })}: today's target is <b>{fmt.kcal(tgt.kcal)} kcal</b>.</span>
        </div>
      )}

      <nav className="quick" aria-label="Quick actions">
        <a href="#/progress"><i className="tone-pink"><Icon name="scale" /></i>Log weight</a>
        <a href="#/snap"><i className="tone-gold"><Icon name="camera" /></i>Snap meal</a>
        <a href="#/coach"><i className="tone-sky"><Icon name="chat" /></i>Ask Coach</a>
      </nav>

      <section className="card suggest" aria-live="polite">
        {left < 80 ? (
          <><div className="emoji">💧</div><div style={{ flex: 1 }}><b>You're at today's target</b><p className="tiny muted">If you're hungry, try teh O kosong, plain water or a bowl of papaya.</p></div></>
        ) : pick ? (
          <>
            <div className="emoji">✨</div>
            <div style={{ flex: 1 }}><b>Add {pick.name}</b>
              <p className="tiny muted">+{pick.protein} g protein · {pick.kcal} kcal · about RM{pick.rm.toFixed(2)}. Fits what's left today.</p></div>
            <button className="round-btn" onClick={logPick} aria-label={`Log ${pick.name}`}><Icon name="plus" /></button>
          </>
        ) : (
          <><div className="emoji">💡</div><div style={{ flex: 1 }}><b>Finding your next best bite…</b></div></>
        )}
      </section>

      <section className="card future" aria-label="Future you">
        <Body3D bmi={bmiOf(futureKg, p.height_cm)} sex={p.sex} instant={weeks > 0}
          ghostBmi={m.target_kg ? bmiOf(m.target_kg, p.height_cm) : null} label="Your 3D body today; the glow shows your goal." />
        <div className="future-body">
          <span className="eyebrow">Future You</span>
          <b>{m.goal === 'maintain' ? 'Keep it steady' : weeks === 0 ? `${fmt.kg(p.weight_kg)} → ${m.target_kg ? fmt.kg(m.target_kg) : '—'} kg` : `Week ${weeks}: ${fmt.kg(futureKg)} kg`}</b>
          {m.goal !== 'maintain' ? (
            <>
              <input type="range" min="0" max={maxWeeks} step="1" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Weeks into the future" />
              <span className="tiny muted">{weeks === 0 ? 'Drag to see your 3D body change week by week.' : fmt.date(addDays(localISO(), weeks * 7))}</span>
              <span className="tiny muted">{forecast || (m.eta_date ? `Formula estimate: goal by ${fmt.date(m.eta_date)}` : '')}</span>
            </>
          ) : <span className="tiny muted">Maintenance mode: steady habits keep your body as it is.</span>}
        </div>
      </section>

      <div className="section-head"><h2>Today’s meals</h2><a href="#/plan">See plan</a></div>
      {todayPlan ? (
        <div className="hscroll">
          {todayPlan.meals.map((meal, i) => {
            const done = loggedNames.has(meal.name);
            return (
              <article key={`${meal.slot}-${i}`} className="card meal-tile">
                <div className="top"><span className="emoji">{SLOT_EMOJI[meal.slot] || '🍽️'}</span>
                  <button className={`pill-btn ${done ? 'done' : ''}`} disabled={done} onClick={() => logPlanMeal(meal)}>{done ? 'Logged ✓' : '+ Log'}</button></div>
                <span className="eyebrow" style={{ color: 'var(--ink-3)' }}>{meal.slot}</span>
                <b>{meal.name}</b><span className="tiny muted num">{meal.kcal} kcal · {meal.protein_g} g protein</span>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="card thinking"><p className="muted">No plan yet. Let AI build a 7-day Malaysian meal plan for you.</p>
          <a className="btn btn-brand" href="#/plan"><Icon name="sparkle" /> Generate my plan</a></section>
      )}
    </div>
  );
}
