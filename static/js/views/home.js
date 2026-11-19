// Home (v2): pink header with today's key number, quick actions, next best action,
// Future-You 3D body, and today's meals.
import { api } from '../api.js';
import { store, todayTotals, addMeal, mealsOn, targetFor, eventActive } from '../store.js';
import { mountAvatar } from '../avatar.js';
import { html, raw, mount, icon, toast, $, $$, bmiOf, fmt, localISO, addDays, clamp } from '../ui.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_EMOJI = { Breakfast: '🍳', Sahur: '🌙', Lunch: '🍛', Iftar: '🌅', Snack: '🍌', Moreh: '🍵', Dinner: '🐟' };
let foodsCache = null;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Selamat pagi';
  if (h < 15) return 'Selamat tengah hari';
  if (h < 19) return 'Selamat petang';
  return 'Selamat malam';
}

// Small progress ring for the pink header (pure numbers → raw SVG is safe).
function ring(pct, color) {
  const r = 14, c = 2 * Math.PI * r, off = c * (1 - clamp(pct, 0, 1));
  return raw(`<svg viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="${r}" stroke="rgba(255,255,255,.28)"/>
    <circle cx="17" cy="17" r="${r}" stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>`);
}

function weekStrip() {
  const today = localISO();
  const dow = (new Date().getDay() + 6) % 7;            // Monday = 0
  const monday = addDays(today, -dow);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const d = new Date(`${date}T00:00:00`);
    const cls = date === today ? 'today' : mealsOn(date).length ? 'done' : '';
    return html`<div class="week-day ${cls}"><b>${'MTWTFSS'[i]}</b><span>${d.getDate()}</span></div>`;
  });
}

// Share of the way from the first weigh-in to the target (works for lose and gain).
export function goalProgress(s) {
  const m = s.metrics, w = s.weights;
  if (!m?.target_kg || !w.length) return 0;
  const start = w[0].kg, now = s.profile.weight_kg;
  if (start === m.target_kg) return 1;
  return clamp((start - now) / (start - m.target_kg), 0, 1);
}

export function render(root, ctx) {
  const s = store.get();
  const p = s.profile;
  const m = s.metrics;
  if (!m) { ctx.refreshMetrics().then(() => render(root, ctx)); mount(root, html`<div class="skeleton" style="height:320px"></div>`); return; }

  const today = todayTotals();
  const tgt = targetFor();
  const left = tgt.kcal - today.kcal;
  const todayPlan = s.plan?.days?.find((d) => d.day === DAYS[new Date().getDay()]);
  const loggedNames = new Set(mealsOn().map((x) => x.name));
  const planned = todayPlan?.meals.length || 4;
  const proteinLeft = Math.max(0, m.macros.protein_g - today.protein);
  const maxWeeks = Math.max(4, Math.ceil(m.eta_weeks || 12));

  mount(root, html`
    <div class="stack" style="gap:16px">
      <section class="home-head batik" aria-label="Today">
        <div class="greet">
          <div><h1>${greeting()}${p.name ? `, ${p.name}` : ''} 👋</h1>
            <p>${left > 0 ? `${proteinLeft} g protein to go today 💪` : 'You’ve reached today’s target 🎉'}</p></div>
          <a class="glass-btn" href="#/coach" aria-label="Ask the AI coach">${icon.chat}</a>
        </div>
        <div class="week" aria-label="This week">${weekStrip()}</div>
        <div class="kcal-left">
          <div class="n num">${fmt.kcal(Math.abs(left))}<small>/ ${fmt.kcal(tgt.kcal)}</small></div>
          <div class="l">${left >= 0 ? 'KCAL LEFT TODAY' : 'KCAL OVER TODAY'}</div>
        </div>
        <div class="macro-rings">
          <div class="mring">${ring(today.protein / m.macros.protein_g, '#FFFFFF')}<div><b class="num">${today.protein} g</b><span>Protein</span></div></div>
          <div class="mring">${ring(mealsOn().length / planned, '#FFE08A')}<div><b class="num">${mealsOn().length}/${planned}</b><span>Meals</span></div></div>
          <div class="mring">${ring(goalProgress(s), '#A8DBFF')}<div><b class="num">${Math.round(goalProgress(s) * 100)}%</b><span>Goal</span></div></div>
        </div>
      </section>

      ${m.warnings.map((w) => html`<div class="alert">${icon.alert}<span>${w}</span></div>`)}
      ${eventActive() ? html`<div class="alert info">${icon.party}<span><b>${s.event.name}</b> on ${fmt.date(s.event.date, { day: 'numeric', month: 'short' })}: today's target is <b>${fmt.kcal(tgt.kcal)} kcal</b>.</span></div>` : ''}

      <nav class="quick" aria-label="Quick actions">
        <a href="#/progress"><i class="tone-pink">${icon.scale}</i>Log weight</a>
        <a href="#/snap"><i class="tone-gold">${icon.camera}</i>Snap meal</a>
        <a href="#/coach"><i class="tone-sky">${icon.chat}</i>Ask Coach</a>
      </nav>

      <section class="card suggest" id="suggest" aria-live="polite">
        <div class="emoji">💡</div><div style="flex:1"><b>Finding your next best bite…</b></div>
      </section>

      <section class="card future" aria-label="Future you">
        <div id="hero-avatar"></div>
        <div class="future-body">
          <span class="eyebrow">Future You</span>
          <b id="ff-title">${m.goal === 'maintain' ? 'Keep it steady' : `${fmt.kg(p.weight_kg)} → ${m.target_kg ? fmt.kg(m.target_kg) : '—'} kg`}</b>
          ${m.goal !== 'maintain' ? html`
            <input type="range" id="ff" min="0" max="${maxWeeks}" step="1" value="0" aria-label="Weeks into the future">
            <span class="tiny muted" id="ff-date">Drag to see your 3D body change week by week.</span>
            <span class="tiny muted" id="ff-forecast">${m.eta_date ? `Formula estimate: goal by ${fmt.date(m.eta_date)}` : ''}</span>` : html`
            <span class="tiny muted">Maintenance mode: steady habits keep your body as it is.</span>`}
        </div>
      </section>

      <div class="section-head"><h2>Today’s meals</h2><a href="#/plan">See plan</a></div>
      ${todayPlan ? html`<div class="hscroll">${todayPlan.meals.map((meal, i) => {
        const done = loggedNames.has(meal.name);
        return html`<article class="card meal-tile">
          <div class="top"><span class="emoji">${SLOT_EMOJI[meal.slot] || '🍽️'}</span>
            <button class="pill-btn ${done ? 'done' : ''}" data-log="${i}" ${done ? 'disabled' : ''}>${done ? 'Logged ✓' : '+ Log'}</button></div>
          <span class="eyebrow" style="color:var(--ink-3)">${meal.slot}</span>
          <b>${meal.name}</b><span class="tiny muted num">${meal.kcal} kcal · ${meal.protein_g} g protein</span>
        </article>`;
      })}</div>` : html`<section class="card thinking"><p class="muted">No plan yet. Let AI build a 7-day Malaysian meal plan for you.</p>
          <a class="btn btn-brand" href="#/plan">${icon.sparkle} Generate my plan</a></section>`}
    </div>`);

  // Future-You 3D body
  const goalBmi = m.target_kg ? bmiOf(m.target_kg, p.height_cm) : null;
  const av = mountAvatar($('#hero-avatar', root), { bmi: m.bmi, sex: p.sex, ghostBmi: goalBmi, label: 'Your 3D body today; the glow shows your goal.' });
  const slider = $('#ff', root);
  slider?.addEventListener('input', () => {
    const w = Number(slider.value);
    let kg = p.weight_kg + m.weekly_change_kg * w;
    if (m.target_kg) kg = m.goal === 'lose' ? Math.max(kg, m.target_kg) : Math.min(kg, m.target_kg);
    av.update({ bmi: bmiOf(kg, p.height_cm) }, { animate: false });
    $('#ff-title', root).textContent = w === 0 ? `${fmt.kg(p.weight_kg)} → ${fmt.kg(m.target_kg)} kg` : `Week ${w}: ${fmt.kg(kg)} kg`;
    $('#ff-date', root).textContent = w === 0 ? 'Drag to see your 3D body change week by week.' : fmt.date(addDays(localISO(), w * 7));
  });
  if (s.weights.length >= 2 && m.target_kg) {
    api.predict(s.weights, m.target_kg, m.goal).then((r) => {
      const el = $('#ff-forecast', root);
      if (r.ok && r.eta_date && el) el.textContent = `AI forecast from your weigh-ins: goal by ${fmt.date(r.eta_date)}`;
    }).catch(() => {});
  }

  // Log meals from today's plan
  $$('[data-log]', root).forEach((b) => b.addEventListener('click', () => {
    const meal = todayPlan.meals[Number(b.dataset.log)];
    addMeal({ name: meal.name, kcal: meal.kcal, protein: meal.protein_g, slot: meal.slot, source: 'plan' });
    toast(`Logged ${meal.name}`);
    render(root, ctx);
  }));

  // Next best action: a protein-rich local food that fits the calories left.
  const suggest = async () => {
    try { foodsCache ||= (await api.foods()).foods; } catch { return; }
    const box = $('#suggest', root);
    if (!box) return;
    if (left < 80) {
      mount(box, html`<div class="emoji">💧</div><div style="flex:1"><b>You're at today's target</b><p class="tiny muted">If you're hungry, try teh O kosong, plain water or a bowl of papaya.</p></div>`);
      return;
    }
    const fits = foodsCache.filter((f) => f.kcal <= left && !f.slots.includes('drink') && !f.slots.includes('fastfood')
      && (f.veg || !s.prefs.vegetarian));
    const pick = fits.sort((a, b) => (b.protein / b.kcal) - (a.protein / a.kcal))[proteinLeft > 15 ? 0 : 2] || fits[0];
    if (!pick) return;
    mount(box, html`<div class="emoji">✨</div>
      <div style="flex:1"><b>Add ${pick.name}</b><p class="tiny muted">+${pick.protein} g protein · ${pick.kcal} kcal · about RM${pick.rm.toFixed(2)}. Fits what's left today.</p></div>
      <button class="round-btn" id="add-sug" aria-label="Log ${pick.name}">${icon.plus}</button>`);
    $('#add-sug', box).addEventListener('click', () => {
      addMeal({ name: pick.name, kcal: pick.kcal, protein: pick.protein, source: 'suggestion' });
      toast(`Logged ${pick.name}`);
      render(root, ctx);
    });
  };
  suggest();
}
