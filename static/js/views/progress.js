// Progress (Figma screen 11): current weight + chart (actual vs AI projection),
// AI forecast (linear regression), calories this week, weigh-in form and history.
import { api } from '../api.js';
import { store, addWeight, removeWeight, seedDemoData, mealsOn, targetFor } from '../store.js';
import { html, raw, mount, icon, toast, $, $$, fmt, localISO, daysBetween, addDays } from '../ui.js';

const RANGES = [['Week', 7], ['Month', 30], ['3 months', 90]];
let rangeDays = 90;

export function render(root, ctx) {
  const s = store.get();
  const m = s.metrics;
  const weights = s.weights;
  if (!m && s.profile) { ctx.refreshMetrics().then((x) => x && render(root, ctx)); }

  const from = addDays(localISO(), -rangeDays);
  const shown = weights.filter((w) => w.date >= from);
  const first = shown[0];
  const change = first ? Math.round((s.profile.weight_kg - first.kg) * 10) / 10 : 0;
  const weeks = first ? Math.max(1, Math.round(daysBetween(first.date, localISO()) / 7)) : 0;
  const changeTone = !m || m.goal === 'maintain' ? '' : (m.goal === 'lose' ? change < 0 : change > 0) ? 'good' : 'warn';

  mount(root, html`
    <div class="list-wrap" style="max-width:720px">
      <div class="prog-head"><h1>Progress</h1>
        <button class="btn btn-brand btn-sm" id="jump">${icon.plus} Weigh in</button></div>

      <div class="range" role="group" aria-label="Chart range">${RANGES.map(([l, d]) => html`<button data-range="${d}" aria-pressed="${rangeDays === d}">${l}</button>`)}</div>

      <section class="card" style="margin-top:14px">
        <div class="spread" style="align-items:flex-end">
          <div><span class="eyebrow" style="color:var(--ink-3)">Current weight</span>
            <div class="weight-big"><b class="num">${fmt.kg(s.profile.weight_kg)}</b><span class="muted">kg</span></div></div>
          ${first && shown.length > 1 ? html`<span class="badge ${changeTone}">${change > 0 ? '+' : ''}${change} kg in ${weeks} week${weeks > 1 ? 's' : ''}</span>` : ''}
        </div>
        <div id="chart" style="margin-top:10px">${shown.length < 2
          ? html`<div class="thinking"><p class="muted">Log at least 2 weigh-ins in this range to see your trend.</p>
              ${weights.length < 3 ? html`<button class="btn btn-sm" id="seed">${icon.sparkle} Load 8 weeks of sample data</button>` : ''}</div>`
          : html`<div class="skeleton" style="height:220px"></div>`}</div>
        ${shown.length >= 2 ? html`<div class="row tiny muted" style="justify-content:center;gap:16px;margin-top:6px">
          <span><i class="legend-dot" style="background:var(--primary)"></i>Your weigh-ins</span>
          <span><i class="legend-dot" style="background:repeating-linear-gradient(90deg,var(--primary) 0 3px,transparent 3px 7px)"></i>AI projection</span>
          ${m?.target_kg ? html`<span><i class="legend-dot" style="background:var(--gold)"></i>Goal</span>` : ''}</div>` : ''}
      </section>

      <div id="forecast" style="margin-top:14px"></div>

      <section class="card" style="margin-top:14px" id="week"></section>

      <section class="card weigh-sheet" id="weigh" style="margin-top:14px">
        <div class="card-title">${icon.scale} Log weight</div>
        <form id="wf" class="stack">
          <div class="grid grid-2" style="gap:8px">
            <input class="input" type="date" id="wd" max="${localISO()}" value="${localISO()}" required aria-label="Date">
            <div class="unit-input"><input class="input" type="number" id="wk" step="0.1" min="30" max="300" value="${s.profile.weight_kg}" required aria-label="Weight in kg"><span class="unit">kg</span></div>
          </div>
          <button class="btn btn-primary" type="submit">${icon.check} Save weigh-in</button>
        </form>
      </section>

      <section class="card" style="margin-top:14px">
        <div class="card-title">History</div>
        ${weights.length ? html`<div class="food-list">${[...weights].reverse().map((w, i, arr) => {
          const prev = arr[i + 1];
          const diff = prev ? Math.round((w.kg - prev.kg) * 10) / 10 : null;
          return html`<div class="food-item"><span>${fmt.date(w.date)}</span><span class="row">
            ${diff !== null ? html`<span class="tiny num" style="color:${diff < 0 ? 'var(--ok)' : diff > 0 ? 'var(--accent)' : 'var(--ink-3)'}">${diff > 0 ? '+' : ''}${diff}</span>` : ''}
            <b class="num">${fmt.kg(w.kg)} kg</b><button class="icon-btn" data-del="${w.date}" aria-label="Delete weigh-in on ${fmt.date(w.date)}">${icon.trash}</button></span></div>`;
        })}</div>` : html`<p class="muted tiny">No weigh-ins yet.</p>`}
      </section>
    </div>`);

  drawWeek($('#week', root));

  $$('[data-range]', root).forEach((b) => b.addEventListener('click', () => { rangeDays = Number(b.dataset.range); render(root, ctx); }));
  $('#jump', root).addEventListener('click', () => { $('#weigh', root).scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#wk', root).focus({ preventScroll: true }); });
  $('#seed', root)?.addEventListener('click', async () => { seedDemoData(); await ctx.refreshMetrics(); toast('Sample data loaded'); render(root, ctx); });
  $('#wf', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const kg = Number($('#wk', root).value);
    const date = $('#wd', root).value;
    if (!(kg >= 30 && kg <= 300) || !date) { toast('Enter a valid date and weight.', 'error'); return; }
    addWeight(date, kg);
    await ctx.refreshMetrics();
    toast('Weigh-in saved');
    render(root, ctx);
  });
  $$('[data-del]', root).forEach((b) => b.addEventListener('click', () => { removeWeight(b.dataset.del); render(root, ctx); }));

  if (weights.length >= 2) {
    api.predict(weights, m?.target_kg ?? null, m?.goal ?? 'maintain')
      .then((r) => {
        if (shown.length >= 2) drawChart($('#chart', root), shown, r, m?.target_kg);
        drawForecast($('#forecast', root), r, m);
      })
      .catch((e) => toast(e.message, 'error'));
  }
}

function drawForecast(box, r, m) {
  if (!box) return;
  if (!r.ok) { mount(box, ''); return; }
  const title = r.eta_date ? `Goal by ${fmt.date(r.eta_date)}`
    : !m?.target_kg ? 'Holding steady' : 'Not on track yet';
  mount(box, html`
    <section class="forecast-card">
      <span class="ic">${icon.sparkle}</span>
      <div style="flex:1;min-width:0"><b>${title}</b>
        <p class="tiny muted">AI forecast from ${r.points} weigh-ins · ${r.slope_kg_per_week > 0 ? '+' : ''}${r.slope_kg_per_week} kg/week · R² ${r.r2}</p></div>
    </section>
    ${r.alerts.map((a) => html`<div class="alert ${a.startsWith('Plateau') ? 'info' : ''}" style="margin-top:10px">${icon.info}<span>${a}</span></div>`)}`);
}

function drawWeek(box) {
  const today = localISO();
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, kcal: mealsOn(date).reduce((a, x) => a + x.kcal, 0) };
  });
  const logged = days.filter((d) => d.kcal > 0);
  const avg = logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal, 0) / logged.length) : 0;
  const max = Math.max(targetFor().kcal * 1.2, ...days.map((d) => d.kcal));
  mount(box, html`
    <div class="spread"><b>Calories this week</b><span class="tiny muted">${avg ? `avg ${fmt.kcal(avg)} kcal` : 'No meals logged yet'}</span></div>
    <div class="bars" role="img" aria-label="Calories logged each day this week">${days.map((d, i) => html`
      <div><i class="${d.date === today ? 'today' : d.kcal ? '' : 'empty'}" style="--h:${d.kcal ? Math.max(8, Math.round((d.kcal / max) * 100)) : 6}%"></i>
        <span>${'MTWTFSS'[i]}</span></div>`)}</div>`);
}

function drawChart(box, weights, r, target) {
  const W = 640, H = 240, P = { l: 40, r: 16, t: 16, b: 28 };
  const first = weights[0].date;
  let lastDate = weights[weights.length - 1].date;
  const proj = r.ok && r.projection.length ? r.projection : null;
  if (proj) lastDate = proj[1].date;
  const span = Math.max(7, daysBetween(first, lastDate));
  const ys = weights.map((w) => w.kg).concat(target ? [target] : []);
  const yMin = Math.floor(Math.min(...ys) - 1), yMax = Math.ceil(Math.max(...ys) + 1);
  const x = (date) => P.l + (daysBetween(first, date) / span) * (W - P.l - P.r);
  const y = (kg) => P.t + (1 - (kg - yMin) / (yMax - yMin)) * (H - P.t - P.b);
  const ticks = Array.from({ length: 4 }, (_, i) => yMin + ((yMax - yMin) * i) / 3);
  const line = weights.map((w, i) => `${i ? 'L' : 'M'}${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`).join('');
  const lastW = weights[weights.length - 1];
  const area = `${line}L${x(lastW.date).toFixed(1)},${H - P.b}L${x(first).toFixed(1)},${H - P.b}Z`;

  // Chart markup is built only from numbers and formatted dates we generate ourselves.
  mount(box, raw(`
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart: your weigh-ins and the AI projection to your goal">
      <defs><linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#EC4D86" stop-opacity=".28"/><stop offset="1" stop-color="#EC4D86" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-text" x="${P.l - 8}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(1)}</text>`).join('')}
      <text class="axis-text" x="${x(first)}" y="${H - 6}" text-anchor="start">${fmt.date(first, { day: 'numeric', month: 'short' })}</text>
      <text class="axis-text" x="${x(lastW.date)}" y="${H - 6}" text-anchor="middle">Today</text>
      ${proj ? `<text class="axis-text" x="${W - P.r}" y="${H - 6}" text-anchor="end">${fmt.date(lastDate, { day: 'numeric', month: 'short' })}</text>` : ''}
      ${target ? `<line class="target-line" x1="${P.l}" x2="${W - P.r}" y1="${y(target)}" y2="${y(target)}"/><text class="target-text" x="${W - P.r}" y="${y(target) - 6}" text-anchor="end">Goal ${target} kg</text>` : ''}
      <path class="weight-area" d="${area}"/>
      ${proj ? `<line class="proj-line" x1="${x(lastW.date)}" y1="${y(lastW.kg)}" x2="${x(proj[1].date)}" y2="${y(proj[1].kg)}"/>
        <circle cx="${x(proj[1].date)}" cy="${y(proj[1].kg)}" r="6" class="goal-flag"/>` : ''}
      <path class="weight-line draw" d="${line}"/>
      ${weights.map((w) => `<circle class="pt" cx="${x(w.date)}" cy="${y(w.kg)}" r="${w === lastW ? 6 : 3.5}"><title>${fmt.date(w.date)}: ${w.kg} kg</title></circle>`).join('')}
    </svg>`));
}
