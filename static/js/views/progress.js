// Progress tracking with ML forecast (linear regression) and Plateau Detector.
import { api } from '../api.js';
import { store, addWeight, removeWeight, seedDemoData } from '../store.js';
import { html, raw, mount, icon, toast, $, $$, fmt, localISO, daysBetween, addDays } from '../ui.js';

export function render(root, ctx) {
  const s = store.get();
  const m = s.metrics;
  const weights = s.weights;
  if (!m && s.profile) { ctx.refreshMetrics().then((x) => x && render(root, ctx)); }

  mount(root, html`
    <header class="page-head">
      <div><h1>Your <em>progress</em></h1></div>
      ${weights.length < 3 ? html`<button class="btn" id="seed">${icon.sparkle} Load 8 weeks of sample data</button>` : ''}
    </header>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)" id="pgrid">
      <section class="card">
        <div class="spread" style="margin-bottom:8px">
          <div class="card-title" style="margin:0">${icon.chart} Weight trend</div>
          <div class="row tiny muted">
            <span class="row" style="gap:4px"><i style="width:14px;height:3px;background:var(--ink);display:inline-block"></i>Weigh-ins</span>
            <span class="row" style="gap:4px"><i style="width:14px;height:3px;background:var(--primary);display:inline-block"></i>AI trend</span>
            <span class="row" style="gap:4px"><i style="width:14px;height:0;border-top:2px dashed var(--accent);display:inline-block"></i>Goal</span>
          </div>
        </div>
        <div id="chart">${weights.length < 2 ? html`<div class="thinking"><p class="muted">Log at least 2 weigh-ins to see your trend and forecast.</p></div>` : html`<div class="skeleton" style="height:260px"></div>`}</div>
      </section>
      <div class="stack">
        <section class="card">
          <div class="card-title">${icon.scale} Log weight</div>
          <form id="wf" class="stack">
            <div class="grid grid-2" style="gap:8px">
              <input class="input" type="date" id="wd" max="${localISO()}" value="${localISO()}" required aria-label="Date">
              <div class="unit-input"><input class="input" type="number" id="wk" step="0.1" min="30" max="300" value="${s.profile.weight_kg}" required aria-label="Weight"><span class="unit">kg</span></div>
            </div>
            <button class="btn btn-primary" type="submit">${icon.plus} Save</button>
          </form>
        </section>
        <section class="card" id="forecast"><div class="card-title">${icon.sparkle} AI forecast</div><p class="muted tiny">Waiting for data…</p></section>
      </div>
    </div>
    <section class="card" style="margin-top:16px">
      <div class="card-title">History</div>
      ${weights.length ? html`<div class="food-list">${[...weights].reverse().map((w, i, arr) => {
        const prev = arr[i + 1];
        const diff = prev ? Math.round((w.kg - prev.kg) * 10) / 10 : null;
        return html`<div class="food-item"><span>${fmt.date(w.date)}</span><span class="row">
          ${diff !== null ? html`<span class="tiny num" style="color:${diff < 0 ? 'var(--ok)' : diff > 0 ? 'var(--accent)' : 'var(--ink-3)'}">${diff > 0 ? '+' : ''}${diff}</span>` : ''}
          <b class="num">${fmt.kg(w.kg)} kg</b><button class="icon-btn" data-del="${w.date}" aria-label="Delete ${w.date}">${icon.trash}</button></span></div>`;
      })}</div>` : html`<p class="muted tiny">No weigh-ins yet.</p>`}
    </section>`);

  const grid = $('#pgrid', root);
  const mq = matchMedia('(max-width: 860px)');
  const layout = () => { grid.style.gridTemplateColumns = mq.matches ? '1fr' : 'minmax(0,2fr) minmax(0,1fr)'; };
  layout(); mq.addEventListener('change', layout);

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
      .then((r) => { drawChart($('#chart', root), weights, r, m?.target_kg); drawForecast($('#forecast', root), r, m); })
      .catch((e) => toast(e.message, 'error'));
  }
  return () => mq.removeEventListener('change', layout);
}

function drawForecast(box, r, m) {
  if (!r.ok) { mount(box, html`<div class="card-title">${icon.sparkle} AI forecast</div><p class="muted tiny">${r.reason}</p>`); return; }
  mount(box, html`
    <div class="card-title" style="margin-bottom:12px">${icon.sparkle} AI forecast</div>
    <div class="stack" style="gap:14px">
      <div><div class="tiny muted">Current pace</div><div class="big-number num">${r.slope_kg_per_week > 0 ? '+' : ''}${r.slope_kg_per_week}<small>kg / week</small></div></div>
      <div><div class="tiny muted">Predicted goal date</div><div class="big-number" style="font-size:1.5rem">${r.eta_date ? fmt.date(r.eta_date) : m?.target_kg ? 'Not on current trend' : 'No target set'}</div></div>
      <div class="tiny muted">Linear regression on ${r.points} weigh-ins · R² = ${r.r2}</div>
      ${r.plateau ? html`<span class="badge excl" style="align-self:flex-start">PLATEAU DETECTED</span>` : ''}
      ${r.alerts.map((a) => html`<div class="alert ${a.startsWith('Plateau') ? 'info' : ''}">${icon.info}<span>${a}</span></div>`)}
    </div>`);
}

function drawChart(box, weights, r, target) {
  const W = 640, H = 280, P = { l: 44, r: 20, t: 18, b: 30 };
  const first = weights[0].date;
  let lastDate = weights[weights.length - 1].date;
  if (r.ok && r.eta_date) lastDate = r.eta_date;
  const span = Math.max(7, daysBetween(first, lastDate));
  const ys = weights.map((w) => w.kg).concat(target ? [target] : []);
  const yMin = Math.floor(Math.min(...ys) - 1), yMax = Math.ceil(Math.max(...ys) + 1);
  const x = (date) => P.l + (daysBetween(first, date) / span) * (W - P.l - P.r);
  const y = (kg) => P.t + (1 - (kg - yMin) / (yMax - yMin)) * (H - P.t - P.b);
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const line = weights.map((w, i) => `${i ? 'L' : 'M'}${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`).join('');
  const area = `${line}L${x(weights[weights.length - 1].date).toFixed(1)},${H - P.b}L${x(first).toFixed(1)},${H - P.b}Z`;
  const mid = addDays(first, Math.round(span / 2));

  mount(box, html`${rawSvg(`
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart with trend and goal forecast">
      <defs><linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="var(--primary)" stop-opacity=".22"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((t) => `<line class="grid-line" x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-text" x="${P.l - 8}" y="${y(t) + 4}" text-anchor="end">${t.toFixed(1)}</text>`).join('')}
      ${[first, mid, lastDate].map((d, i) => `<text class="axis-text" x="${x(d)}" y="${H - 8}" text-anchor="${['start', 'middle', 'end'][i]}">${fmt.date(d, { day: 'numeric', month: 'short' })}</text>`).join('')}
      ${target ? `<line class="target-line" x1="${P.l}" x2="${W - P.r}" y1="${y(target)}" y2="${y(target)}"/><text class="target-text" x="${W - P.r}" y="${y(target) - 6}" text-anchor="end">Goal ${target} kg</text>` : ''}
      <path class="weight-area" d="${area}"/>
      ${r.ok ? `<line class="trend-line draw" x1="${x(r.trend[0].date)}" y1="${y(r.trend[0].kg)}" x2="${x(r.trend[1].date)}" y2="${y(r.trend[1].kg)}"/>` : ''}
      ${r.ok && r.projection.length ? `<line class="proj-line" x1="${x(r.projection[0].date)}" y1="${y(r.projection[0].kg)}" x2="${x(r.projection[1].date)}" y2="${y(r.projection[1].kg)}"/>
        <g transform="translate(${x(r.projection[1].date)},${y(r.projection[1].kg)})"><circle r="7" class="goal-flag"/><circle r="3" fill="#fff"/></g>` : ''}
      <path class="weight-line draw" d="${line}"/>
      ${weights.map((w) => `<circle class="pt" cx="${x(w.date)}" cy="${y(w.kg)}" r="4"><title>${fmt.date(w.date)}: ${w.kg} kg</title></circle>`).join('')}
    </svg>`)}`);
}

// Chart markup is built only from numbers and formatted dates we generate ourselves.
const rawSvg = raw;
