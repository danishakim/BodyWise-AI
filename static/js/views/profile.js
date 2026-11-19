// Profile (v2): who you are in the app and how far you've come.
// Configuration lives in Settings (gear, top-right).
import { api } from '../api.js';
import { store, mealsOn } from '../store.js';
import { mountAvatar } from '../avatar.js';
import { goalProgress } from './home.js';
import { html, mount, icon, $, fmt, localISO, addDays } from '../ui.js';

function streak() {
  let d = localISO();
  if (!mealsOn(d).length) d = addDays(d, -1);           // today not logged yet doesn't break a streak
  let n = 0;
  while (mealsOn(d).length && n < 365) { n++; d = addDays(d, -1); }
  return n;
}

export function exportData() {
  const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'bodywise-data.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function render(root, ctx) {
  const s = store.get();
  const p = s.profile;
  const m = s.metrics;
  if (!m) { ctx.refreshMetrics().then((x) => x && render(root, ctx)); }
  const start = s.weights[0]?.kg ?? p.weight_kg;
  const moved = Math.abs(p.weight_kg - start);
  const toGo = m?.target_kg ? Math.abs(m.target_kg - start) : 0;
  const pct = Math.round(goalProgress(s) * 100);
  const days = streak();
  const towardGoal = m?.target_kg ? (start - p.weight_kg) * Math.sign(start - m.target_kg) : 0;
  const bmiTone = { normal: 'good', underweight: 'warn', overweight: 'warn', obese: 'bad' }[m?.bmi_category] || '';
  const goalLabel = { lose: 'Goal: lose weight', gain: 'Goal: gain weight', maintain: 'Goal: stay healthy' }[m?.goal || p.goal];

  mount(root, html`
    <div class="list-wrap stack" style="gap:16px">
      <header class="spread"><h1>Profile</h1>
        <a class="icon-btn" href="#/settings" aria-label="Settings">${icon.settings}</a></header>

      <section class="card identity">
        <div id="pav"></div>
        <div class="stack" style="gap:6px;flex:1;min-width:0">
          <h2>${p.name || 'BodyWise friend'}</h2>
          <span class="tiny muted">${p.age} · ${p.sex === 'female' ? 'Female' : 'Male'} · ${p.height_cm} cm</span>
          <div class="row" style="gap:6px"><span class="badge good">${goalLabel}</span></div>
          <a class="btn btn-sm" href="#/welcome" style="align-self:flex-start">${icon.edit} Edit profile</a>
        </div>
      </section>

      <div class="grid grid-2" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        <section class="card stat"><small>Current weight</small><b class="num">${fmt.kg(p.weight_kg)}<span>kg</span></b></section>
        <section class="card stat"><small>Goal weight</small><b class="num">${m?.target_kg ? fmt.kg(m.target_kg) : '—'}<span>kg</span></b></section>
        <section class="card stat"><small>BMI</small><b class="num">${m?.bmi ?? '—'}</b>
          ${m ? html`<span class="badge ${bmiTone}" style="margin-top:6px">${m.bmi_label}</span>` : ''}</section>
        <section class="card stat"><small>Daily target</small><b class="num">${m ? fmt.kcal(m.daily_kcal) : '—'}<span>kcal</span></b></section>
      </div>

      ${m?.target_kg ? html`<section class="card stack" style="gap:10px">
        <div class="spread"><span class="card-title" style="margin:0">${icon.target} Goal progress</span><b style="color:var(--primary)">${pct}%</b></div>
        <h2 class="num">${fmt.kg(moved)} kg ${m.goal === 'gain' ? 'gained' : 'lost'} of ${fmt.kg(toGo)} kg</h2>
        <div class="progress"><i style="--v:${pct}%"></i></div>
        <span class="tiny muted" id="forecast">${m.eta_date ? `Formula estimate: goal by ${fmt.date(m.eta_date)}` : 'Log weigh-ins to get an AI forecast.'}</span>
      </section>` : ''}

      <div class="section-head"><h2>Achievements</h2></div>
      <div class="ach">
        <div class="${days ? 'tone-pink' : 'locked'}"><span class="e">🔥</span><b>${days || 0}-day streak</b><small>Meals logged</small></div>
        <div class="${towardGoal >= 2 ? 'tone-gold' : 'locked'}"><span class="e">🏅</span><b>First 2 kg</b><small>${towardGoal >= 2 ? 'Unlocked' : `${fmt.kg(Math.max(0, 2 - towardGoal))} kg to go`}</small></div>
        <div class="${s.weights.length >= 5 ? 'tone-sky' : 'locked'}"><span class="e">📈</span><b>Consistent</b><small>${s.weights.length}/5 weigh-ins</small></div>
      </div>

      <div class="group-label">My plan</div>
      <div class="group">
        <a class="lrow" href="#/welcome"><span class="ic">${icon.edit}</span><span class="tx"><b>Body & goal</b><small>Height, weight, target</small></span>
          <span class="val">${m?.target_kg ? `${m.goal === 'gain' ? 'Gain' : 'Lose'} · ${fmt.kg(m.target_kg)} kg` : 'Maintain'}</span>${icon.chevron}</a>
        <a class="lrow" href="#/settings"><span class="ic">${icon.leaf}</span><span class="tx"><b>Food preferences</b><small>Halal, budget, Puasa mode</small></span>
          <span class="val">RM${s.prefs.budget_rm}/day</span>${icon.chevron}</a>
        <a class="lrow" href="#/progress"><span class="ic">${icon.calendar}</span><span class="tx"><b>Weigh-in history</b><small>${s.weights.length} entries</small></span>${icon.chevron}</a>
        <button class="lrow" id="export"><span class="ic">${icon.download}</span><span class="tx"><b>Export my data</b><small>Download as JSON</small></span>${icon.chevron}</button>
      </div>
    </div>`);

  root.querySelectorAll('.lrow > svg:last-child').forEach((svg) => svg.classList.add('chev'));
  mountAvatar($('#pav', root), { bmi: m?.bmi ?? 22, sex: p.sex, ghostBmi: null, label: 'Your 3D body' });
  $('#export', root).addEventListener('click', exportData);

  if (s.weights.length >= 2 && m?.target_kg) {
    api.predict(s.weights, m.target_kg, m.goal).then((r) => {
      const el = $('#forecast', root);
      if (r.ok && r.eta_date && el) el.textContent = `AI forecast: goal by ${fmt.date(r.eta_date)} · ${r.slope_kg_per_week > 0 ? '+' : ''}${r.slope_kg_per_week} kg/week`;
    }).catch(() => {});
  }
}
