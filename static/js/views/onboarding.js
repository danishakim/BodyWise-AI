// Onboarding v2 (Figma "Mobile v2 — Pink", screens 01–08):
// Splash → Welcome → Goal → About you → Body → Goal weight → Activity → Food → Building → Plan ready.
// Editing an existing profile starts at Goal and returns to Profile on Back.
import { api } from '../api.js';
import { store, addWeight } from '../store.js';
import { mountAvatar } from '../avatar.js';
import { html, raw, mount, icon, toast, $, $$, bmiOf, debounce, localISO, fmt, clamp } from '../ui.js';

const MARK = raw('<svg viewBox="0 0 128 128" aria-hidden="true"><path d="M64 108C42 94 35 77 39 61C43 48 53 42 64 39C75 42 85 48 89 61C93 77 86 94 64 108Z" fill="#EC4D86"/><path d="M64 101V53M64 77L50 63M64 77L78 63" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="64" cy="27" r="9" fill="#EC4D86"/></svg>');
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
const ITEM_H = 44;
const KG_PER_LB = 0.45359237;

let flow = null;

const range = (a, b, step = 1) => { const out = []; for (let v = a; v <= b + 1e-9; v += step) out.push(Math.round(v * 10) / 10); return out; };
const nearest = (arr, v) => arr.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(arr[bi] - v) ? i : bi), 0);
const splashSeen = () => { try { return sessionStorage.getItem('bw-splash') === '1'; } catch { return false; } };
const markSplash = () => { try { sessionStorage.setItem('bw-splash', '1'); } catch { /* ignore */ } };

export function render(root, ctx) {
  const s = store.get();
  const editing = !!s.profile;
  flow = {
    step: editing ? 'goal' : splashSeen() ? 'welcome' : 'splash',
    d: { name: '', sex: 'female', age: 20, height_cm: 160, weight_kg: 60, activity: 'light', goal: 'lose', target_kg: null, ...(s.profile || {}) },
    prefs: { ...s.prefs },
    units: 'metric',
    editing,
    building: false,
  };
  show(root, ctx);
}

function order() {
  return ['splash', 'welcome', 'goal', 'about', 'body', ...(flow.d.goal !== 'maintain' ? ['target'] : []), 'activity', 'food', 'building', 'ready'];
}

function go(root, ctx, dir) {
  const o = order();
  const i = o.indexOf(flow.step) + dir;
  if (flow.editing && i < o.indexOf('goal')) { ctx.navigate('profile'); return; }
  flow.step = o[clamp(i, 0, o.length - 1)];
  show(root, ctx);
}

function progressPct() {
  const steps = order().filter((x) => INPUT_STEPS.includes(x));
  return Math.round(((steps.indexOf(flow.step) + 1) / steps.length) * 100);
}

const top = (pink = false) => html`
  <div class="ob-top">
    <button class="ob-back" id="back" aria-label="Back">${icon.back}</button>
    ${pink ? '' : html`<div class="ob-progress" role="progressbar" aria-valuenow="${progressPct()}" aria-valuemin="0" aria-valuemax="100"><i style="--v:${progressPct()}%"></i></div>`}
  </div>`;
const head = (title, sub) => html`<div class="ob-head"><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>`;
const foot = (label, kind = 'btn-primary') => html`<div class="ob-foot"><button class="btn ${kind} btn-lg btn-block" id="next">${label}</button></div>`;

function show(root, ctx) {
  const screens = { splash, welcome, goal, about, body, target, activity, food, building, ready };
  screens[flow.step](root, ctx);
  $('#back', root)?.addEventListener('click', () => go(root, ctx, -1));
  window.scrollTo({ top: 0 });
}

// Scroll-snap wheel picker (iOS style). Keyboard: ↑/↓ change the value.
function wheel(el, values, value, format, onChange) {
  let cur = nearest(values, value);
  el.innerHTML = `<div class="wheel-pad"></div>${values.map((v, i) => `<div class="wheel-item" data-i="${i}">${format(v)}</div>`).join('')}<div class="wheel-pad"></div>`;
  el.setAttribute('role', 'spinbutton');
  const items = [...el.querySelectorAll('.wheel-item')];
  const mark = () => {
    items.forEach((n, i) => n.classList.toggle('on', i === cur));
    el.setAttribute('aria-valuetext', format(values[cur]));
  };
  el.scrollTop = cur * ITEM_H;
  mark();
  el.addEventListener('scroll', () => {
    const i = clamp(Math.round(el.scrollTop / ITEM_H), 0, values.length - 1);
    if (i !== cur) { cur = i; mark(); onChange(values[i]); }
  }, { passive: true });
  el.addEventListener('click', (e) => {
    const it = e.target.closest('.wheel-item');
    if (it) el.scrollTo({ top: Number(it.dataset.i) * ITEM_H, behavior: 'smooth' });
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = clamp(cur + (e.key === 'ArrowDown' ? 1 : -1), 0, values.length - 1);
    el.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
  });
}

const wheelCol = (id, label) => html`<div class="wheel-col"><span class="eyebrow">${label}</span>
  <div class="wheel-wrap"><span class="wheel-band"></span><div class="wheel" id="${id}" tabindex="0" aria-label="${label}"></div></div></div>`;

// ---------------- 01 Splash ----------------
function splash(root, ctx) {
  mount(root, html`<div class="ob pink ob-splash" id="splash" role="button" tabindex="0" aria-label="Start BodyWise">
    <span class="glow" style="width:420px;height:420px;top:22%;left:-18%"></span>
    <div class="mark">${MARK}</div><div class="word">BodyWise</div>
    <p class="tag">Makan smart. Live well.</p></div>`);
  markSplash();
  const next = () => { if (flow?.step === 'splash' && root.isConnected) { flow.step = 'welcome'; show(root, ctx); } };
  setTimeout(next, 1500);
  $('#splash', root).addEventListener('click', next);
  $('#splash', root).addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') next(); });
}

// ---------------- 02 Welcome ----------------
function welcome(root, ctx) {
  const bubbles = [['🍌', '6%', '14%'], ['🥥', '78%', '8%'], ['🍗', '80%', '58%'], ['🍵', '4%', '66%'], ['🍉', '64%', '86%']];
  mount(root, html`<div class="ob">
    <div class="ob-wash"></div>
    <div class="ob-head" style="padding-top:max(36px, env(safe-area-inset-top))">
      <h1 style="font-size:1.95rem">Your body, your plan.<br>Made smarter 🌿</h1>
      <p>AI meal plans, food snaps and a 3D you, built for Malaysian makan.</p></div>
    <div class="ob-hero"><span class="disc"></span><div id="w-av"></div>
      ${bubbles.map(([e, l, t]) => html`<span class="bubble" style="left:${l};top:${t}" aria-hidden="true">${e}</span>`)}</div>
    <div style="flex:1"></div>
    <div class="ob-foot">
      <button class="btn btn-primary btn-lg btn-block" id="next">Get started</button>
      <button class="btn btn-soft btn-lg btn-block" id="import">I already have a plan</button>
      <input type="file" id="import-file" accept="application/json,.json" class="sr-only" aria-label="Restore a BodyWise backup file">
    </div></div>`);
  mountAvatar($('#w-av', root), { bmi: 22.5, sex: 'female', ghostBmi: null, label: 'Your 3D body' });
  $('#next', root).addEventListener('click', () => go(root, ctx, 1));
  $('#import', root).addEventListener('click', () => $('#import-file', root).click());
  $('#import-file', root).addEventListener('change', (e) => importBackup(e.target.files[0], ctx));
}

const BACKUP_KEYS = ['profile', 'prefs', 'metrics', 'plan', 'weights', 'meals', 'chat', 'event', 'theme'];
async function importBackup(file, ctx) {
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('too big');
    const data = JSON.parse(await file.text());
    const p = data?.profile;
    const ok = p && ['male', 'female'].includes(p.sex) && [p.age, p.height_cm, p.weight_kg].every(Number.isFinite)
      && (!data.weights || Array.isArray(data.weights)) && (!data.meals || typeof data.meals === 'object');
    if (!ok) throw new Error('invalid');
    store.set(Object.fromEntries(BACKUP_KEYS.filter((k) => k in data).map((k) => [k, data[k]])));
    await ctx.refreshMetrics();
    toast('Welcome back! Your plan and progress are restored.');
    ctx.navigate('home');
  } catch {
    toast('That file isn’t a BodyWise backup. Export one from Settings → Export my data.', 'error');
  }
}

// ---------------- 03 Goal ----------------
function goal(root, ctx) {
  mount(root, html`<div class="ob pink">
    <span class="glow" style="width:380px;height:380px;top:34%;left:-22%"></span>
    ${top(true)}
    ${head('What’s your goal?', 'Pick one. It sets your calorie target and how fast we go. You can change it any time.')}
    <div class="carousel" id="car">${GOALS.map((g) => html`
      <button class="goal-card" data-goal="${g.key}" aria-pressed="${flow.d.goal === g.key}"><span class="e">${g.e}</span><b>${g.t}</b><small>${g.d}</small></button>`)}</div>
    <div class="dots" aria-hidden="true">${GOALS.map((g) => html`<i class="${flow.d.goal === g.key ? 'on' : ''}"></i>`)}</div>
    <div style="flex:1"></div>
    ${foot('Select goal', 'btn-glass')}</div>`);
  const car = $('#car', root);
  const cards = $$('.goal-card', root);
  const dots = $$('.dots i', root);
  const select = (key) => {
    flow.d.goal = key;
    cards.forEach((c, i) => { const on = c.dataset.goal === key; c.setAttribute('aria-pressed', String(on)); dots[i].classList.toggle('on', on); });
  };
  const centre = (card, smooth) => car.scrollTo({ left: card.offsetLeft - (car.clientWidth - card.clientWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  centre(cards.find((c) => c.dataset.goal === flow.d.goal) || cards[1], false);
  car.addEventListener('scroll', debounce(() => {
    const mid = car.scrollLeft + car.clientWidth / 2;
    const near = cards.reduce((a, c) => (Math.abs(c.offsetLeft + c.clientWidth / 2 - mid) < Math.abs(a.offsetLeft + a.clientWidth / 2 - mid) ? c : a));
    select(near.dataset.goal);
  }, 80), { passive: true });
  cards.forEach((c) => c.addEventListener('click', () => { select(c.dataset.goal); centre(c, true); }));
  $('#next', root).addEventListener('click', () => { if (flow.d.goal === 'maintain') flow.d.target_kg = null; go(root, ctx, 1); });
}

// ---------------- About you ----------------
function about(root, ctx) {
  mount(root, html`<div class="ob">${top()}
    ${head('Tell us about you 👋', 'Used for your calorie formula. Your data stays on this device.')}
    <div class="ob-body">
      <label class="field"><span>What should we call you? (optional)</span>
        <input class="input" id="name" maxlength="40" autocomplete="given-name" value="${flow.d.name}" placeholder="e.g. Aina"></label>
      <div class="field"><span class="label">Sex (for the calorie formula)</span>
        <div class="seg" role="group" aria-label="Sex">${['female', 'male'].map((x) => html`<button type="button" data-sex="${x}" aria-pressed="${flow.d.sex === x}">${x === 'female' ? 'Female' : 'Male'}</button>`)}</div></div>
      <div class="wheels">${wheelCol('w-age', 'Age · years')}</div>
    </div>${foot('Continue')}</div>`);
  wheel($('#w-age', root), range(13, 80), flow.d.age, String, (v) => { flow.d.age = v; });
  $('#name', root).addEventListener('input', (e) => { flow.d.name = e.target.value.trim(); });
  $$('[data-sex]', root).forEach((b) => b.addEventListener('click', () => {
    flow.d.sex = b.dataset.sex;
    $$('[data-sex]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('#next', root).addEventListener('click', () => go(root, ctx, 1));
}

// ---------------- 04 Body ----------------
function bmiText() {
  const b = bmiOf(flow.d.weight_kg, flow.d.height_cm);
  const where = b < 18.5 ? 'below the healthy range' : b < 23 ? 'in the healthy range' : b < 27.5 ? 'above the healthy range' : 'in the obese range';
  return `BMI ${b}, ${where} for your height (Malaysian cut-offs).`;
}
const heightVals = () => (flow.units === 'metric' ? range(130, 210) : range(51, 83));
const weightVals = () => (flow.units === 'metric' ? range(35, 160, 0.5) : range(77, 353));
const fmtHeight = (v) => (flow.units === 'metric' ? String(v) : `${Math.floor(v / 12)}′${v % 12}″`);
const toCm = (v) => (flow.units === 'metric' ? v : Math.round(v * 2.54));
const toKg = (v) => (flow.units === 'metric' ? v : Math.round(v * KG_PER_LB * 10) / 10);
const fromCm = (cm) => (flow.units === 'metric' ? cm : cm / 2.54);
const fromKg = (kg) => (flow.units === 'metric' ? kg : kg / KG_PER_LB);

function body(root, ctx) {
  const metric = flow.units === 'metric';
  mount(root, html`<div class="ob">${top()}
    ${head('Your height & weight 📏', 'We use this to work out your daily calorie target.')}
    <div class="ob-body">
      <div class="seg" role="group" aria-label="Units">
        <button type="button" data-units="metric" aria-pressed="${metric}">Metric</button>
        <button type="button" data-units="imperial" aria-pressed="${!metric}">Imperial</button></div>
      <div class="wheels">${wheelCol('w-h', metric ? 'Height · cm' : 'Height · ft')}${wheelCol('w-w', metric ? 'Weight · kg' : 'Weight · lb')}</div>
      <div class="hint"><span>💡</span><span id="bmi-hint">${bmiText()}</span></div>
    </div>${foot('Continue')}</div>`);
  const upd = () => { $('#bmi-hint', root).textContent = bmiText(); };
  wheel($('#w-h', root), heightVals(), fromCm(flow.d.height_cm), fmtHeight, (v) => { flow.d.height_cm = toCm(v); upd(); });
  wheel($('#w-w', root), weightVals(), fromKg(flow.d.weight_kg), (v) => (metric ? v.toFixed(1) : String(v)), (v) => { flow.d.weight_kg = toKg(v); upd(); });
  $$('[data-units]', root).forEach((b) => b.addEventListener('click', () => { flow.units = b.dataset.units; body(root, ctx); $('#back', root).addEventListener('click', () => go(root, ctx, -1)); }));
  $('#next', root).addEventListener('click', () => go(root, ctx, 1));
}

// ---------------- Goal weight (3D body + glow) ----------------
function target(root, ctx) {
  const d = flow.d;
  const m2 = (d.height_cm / 100) ** 2;
  const lowest = Math.ceil(18.5 * m2 * 2) / 2;                 // never offer an unhealthy target
  const vals = d.goal === 'lose' ? range(lowest, d.weight_kg - 0.5, 0.5) : range(d.weight_kg + 0.5, d.weight_kg + 30, 0.5);
  if (!vals.length) { d.target_kg = null; go(root, ctx, 1); return; }
  if (!d.target_kg || !vals.includes(d.target_kg)) {
    d.target_kg = d.goal === 'lose' ? vals[Math.max(0, nearest(vals, d.weight_kg - 5))] : vals[nearest(vals, d.weight_kg + 4)];
  }
  mount(root, html`<div class="ob">${top()}
    ${head('Your goal weight 🎯', 'The glow on your 3D body shows your goal.')}
    <div class="ob-body">
      <div class="target-stage"><div id="t-av"></div>
        <div class="wheels" style="padding:10px 4px">${wheelCol('w-t', 'Goal · kg')}</div></div>
      <div id="t-hint" aria-live="polite"></div>
    </div>${foot('Continue')}</div>`);
  const av = mountAvatar($('#t-av', root), { bmi: bmiOf(d.weight_kg, d.height_cm), sex: d.sex, ghostBmi: bmiOf(d.target_kg, d.height_cm), label: 'Your 3D body; the glow shows your goal' });
  const assess = debounce(async () => {
    try {
      const m = await api.assess(d);
      const box = $('#t-hint', root);
      if (!box) return;
      mount(box, html`<div class="stack" style="gap:10px">
        <div class="hint pinkish"><span>✨</span><span>About <b>${fmt.kcal(m.daily_kcal)} kcal a day</b>${m.eta_date ? html`, reaching your goal around <b>${fmt.date(m.eta_date)}</b>` : ''}. Healthy weight for your height: ${m.healthy_range_kg[0]}–${m.healthy_range_kg[1]} kg.</span></div>
        ${m.warnings.map((w) => html`<div class="hint"><span>⚠️</span><span>${w}</span></div>`)}</div>`);
    } catch { /* offline: hint stays empty */ }
  }, 300);
  wheel($('#w-t', root), vals, d.target_kg, (v) => v.toFixed(1), (v) => { d.target_kg = v; av.update({ ghostBmi: bmiOf(v, d.height_cm) }, { animate: false }); assess(); });
  assess();
  $('#next', root).addEventListener('click', () => go(root, ctx, 1));
}

// ---------------- 05 Activity ----------------
function activity(root, ctx) {
  mount(root, html`<div class="ob">${top()}
    ${head('How active are you? 👟', 'Think about a normal week, not your best one.')}
    <div class="ob-body" role="radiogroup" aria-label="Activity level">${ACTIVITY.map((a) => html`
      <button class="opt" data-act="${a.key}" aria-pressed="${flow.d.activity === a.key}">
        <span class="em" aria-hidden="true">${a.e}</span><span class="tx"><b>${a.t}</b><small>${a.d}</small></span>
        <span class="radio">${icon.check}</span></button>`)}</div>${foot('Continue')}</div>`);
  $$('[data-act]', root).forEach((b) => b.addEventListener('click', () => {
    flow.d.activity = b.dataset.act;
    $$('[data-act]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('#next', root).addEventListener('click', () => go(root, ctx, 1));
}

// ---------------- 06 Food ----------------
function food(root, ctx) {
  const p = flow.prefs;
  const diet = [['halal', '☪️ Halal'], ['vegetarian', '🥬 Vegetarian'], ['puasa', '🌙 Puasa mode']];
  mount(root, html`<div class="ob">${top()}
    ${head('Any way you like to eat? 🍛', 'Your plan and Smart Swaps will respect these.')}
    <div class="ob-body">
      <span class="eyebrow" style="color:var(--ink-3)">Diet</span>
      <div class="pick-chips">${diet.map(([k, l]) => html`<button class="pick" data-diet="${k}" aria-pressed="${!!p[k]}">${l}</button>`)}</div>
      <span class="eyebrow" style="color:var(--ink-3);margin-top:6px">Daily food budget</span>
      <div class="pick-chips" role="radiogroup" aria-label="Daily budget">${BUDGETS.map((b) => html`<button class="pick" data-budget="${b}" aria-pressed="${p.budget_rm === b}">RM${b}</button>`)}</div>
      <label class="field" style="margin-top:6px"><span class="eyebrow" style="color:var(--ink-3)">Anything you avoid?</span>
        <input class="input" id="dislikes" maxlength="120" value="${p.dislikes}" placeholder="e.g. durian, prawns, peanuts"></label>
    </div>${foot('Build my plan')}</div>`);
  $$('[data-diet]', root).forEach((b) => b.addEventListener('click', () => { p[b.dataset.diet] = !p[b.dataset.diet]; b.setAttribute('aria-pressed', String(p[b.dataset.diet])); }));
  $$('[data-budget]', root).forEach((b) => b.addEventListener('click', () => {
    p.budget_rm = Number(b.dataset.budget);
    $$('[data-budget]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('#dislikes', root).addEventListener('input', (e) => { p.dislikes = e.target.value; });
  $('#next', root).addEventListener('click', () => go(root, ctx, 1));
}

// ---------------- 07 Building (real work: formulas, then AI plan) ----------------
function building(root, ctx) {
  const STEPS = ['Base metabolic rate (Mifflin-St Jeor)', 'Daily calorie target', 'Macro split', '7-day Malaysian meal plan (AI)'];
  const R = 80, C = 2 * Math.PI * R;
  mount(root, html`<div class="ob">
    <div class="build">
      <div class="build-ring"><svg viewBox="0 0 180 180" aria-hidden="true"><circle class="track" cx="90" cy="90" r="${R}"/>
        <circle class="bar" id="bar" cx="90" cy="90" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/></svg>
        <b class="num" id="pct" aria-live="polite">0%</b></div>
      <h2>Building your plan ⚙️</h2>
      <p class="muted tiny">Crunching your numbers. This takes a few seconds.</p>
      <div class="steps-card">${STEPS.map((t, i) => html`<div class="step-row todo" data-step="${i}"><span class="dot">${icon.check}</span>${t}</div>`)}</div>
    </div></div>`);
  const setPct = (v) => {
    $('#bar', root).style.strokeDashoffset = String(C * (1 - v / 100));
    $('#pct', root).textContent = `${Math.round(v)}%`;
  };
  const setStep = (i, state) => { const r = $(`[data-step="${i}"]`, root); if (r) r.className = `step-row ${state}`; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (flow.building) return;
  flow.building = true;

  (async () => {
    const d = flow.d;
    const draft = { name: d.name, sex: d.sex, age: d.age, height_cm: d.height_cm, weight_kg: d.weight_kg, activity: d.activity, goal: d.goal, target_kg: d.goal === 'maintain' ? null : d.target_kg };
    let metrics;
    try {
      setStep(0, 'doing'); setPct(8);
      metrics = await api.assess(draft);
      for (let i = 0; i < 3; i++) { setStep(i, 'done'); setStep(i + 1, 'doing'); setPct(20 + i * 18); await wait(350); }
    } catch (err) {
      flow.building = false;
      toast(err.message, 'error');
      flow.step = 'body'; show(root, ctx);
      return;
    }
    const profile = { ...draft, goal: metrics.goal, target_kg: metrics.target_kg };
    let plan = null;
    const creep = setInterval(() => { const cur = parseFloat($('#pct', root)?.textContent) || 70; if (cur < 92) setPct(cur + 2); }, 600);
    try {
      ({ plan, metrics } = await api.plan(profile, flow.prefs));
    } catch {
      toast('Your meal plan will be ready on the Plan tab.');
    }
    clearInterval(creep);
    store.set({ profile, prefs: flow.prefs, metrics, plan });
    addWeight(localISO(), profile.weight_kg);
    setStep(3, 'done'); setPct(100);
    await wait(600);
    flow.building = false;
    if (root.isConnected && flow) { flow.step = 'ready'; show(root, ctx); }
  })();
}

// ---------------- 08 Plan ready ----------------
function ready(root, ctx) {
  const { profile: p, metrics: m } = store.get();
  const macros = [['Protein', m.macros.protein_g, 4, 'var(--primary)'], ['Carbs', m.macros.carbs_g, 4, 'var(--gold)'], ['Fat', m.macros.fat_g, 9, 'var(--sky)']];
  const r = 20, c = 2 * Math.PI * r;
  const ring = (share, color) => raw(`<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="${r}" stroke="var(--surface-2)"/>
    <circle cx="24" cy="24" r="${r}" stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - clamp(share, 0, 1))).toFixed(1)}"/></svg>`);
  mount(root, html`<div class="ob" style="background:var(--bg)">
    <div class="ready-head"><div class="e">🎉</div>
      <h1>Your plan is ready${p.name ? `, ${p.name}` : ''}</h1>
      <p>${m.target_kg && m.eta_date ? `Reach ${fmt.kg(m.target_kg)} kg by ${fmt.date(m.eta_date)} by eating about this every day.` : 'Eat about this every day to stay healthy and strong.'}</p></div>
    <div class="ready-body">
      <section class="card kcal-card"><span class="eyebrow" style="color:var(--ink-3)">Daily calories</span>
        <div class="n num">${fmt.kcal(m.daily_kcal)}</div><span class="tiny muted">kcal a day</span></section>
      <div class="macro-cards">${macros.map(([l, g, k, col]) => html`<section class="card">${ring((g * k) / m.daily_kcal, col)}<b class="num">${g} g</b><span class="tiny muted" style="text-align:center;line-height:1.3">${l}<br>${Math.round(((g * k) / m.daily_kcal) * 100)}% of kcal</span></section>`)}</div>
      ${m.warnings.map((w) => html`<div class="alert">${icon.alert}<span>${w}</span></div>`)}
      <section class="card" style="padding:4px 16px">
        ${[['📸', 'Log meals', 'Snap every plate'], ['💧', 'Water', '8 glasses a day'], ['👟', 'Steps', '8,000 a day']].map(([e, t, v]) => html`
          <div class="habit"><span aria-hidden="true">${e}</span><b>${t}</b><span class="tiny muted">${v}</span></div>`)}
      </section>
    </div>
    <div style="flex:1;min-height:16px"></div>
    ${foot('Let’s start')}</div>`);
  $('#next', root).addEventListener('click', () => { flow = null; ctx.navigate('home'); });
}
