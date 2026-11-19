// Multi-step onboarding with a live avatar that morphs as the user types.
import { api } from '../api.js';
import { store, addWeight } from '../store.js';
import { mountAvatar } from '../avatar.js';
import { html, mount, icon, toast, $, $$, bmiOf, debounce, localISO, fmt } from '../ui.js';

const ACTIVITY = [
  { key: 'sedentary', title: 'Mostly sitting', desc: 'Classes, desk work, little exercise', ic: icon.sofa },
  { key: 'light', title: 'Lightly active', desc: 'Walk around campus, exercise 1-3×/week', ic: icon.walk },
  { key: 'moderate', title: 'Moderate', desc: 'Exercise 3-5×/week', ic: icon.bike },
  { key: 'active', title: 'Very active', desc: 'Hard training 6-7×/week', ic: icon.run },
  { key: 'very_active', title: 'Athlete', desc: 'Physical job or twice-daily training', ic: icon.bolt },
];
const GOALS = [
  { key: 'lose', title: 'Lose weight', desc: 'Gentle deficit, ~0.5 kg/week', ic: icon.down },
  { key: 'maintain', title: 'Stay healthy', desc: 'Keep weight, eat better', ic: icon.equal },
  { key: 'gain', title: 'Gain weight', desc: 'Lean surplus, ~0.3 kg/week', ic: icon.up },
];
const TOTAL = 5;

export function render(root, ctx) {
  const s = store.get();
  const draft = {
    name: '', sex: 'male', age: 20, height_cm: 168, weight_kg: 65, activity: 'light', goal: 'lose', target_kg: null,
    ...(s.profile || {}),
  };
  const prefs = { ...s.prefs };
  let step = 0;
  let assessed = null;

  mount(root, html`
    <div class="onboard">
      <section class="card onboard-form" aria-live="polite">
        <div class="steps" id="steps"></div>
        <div id="step"></div>
        <div class="onboard-nav">
          <button class="btn btn-ghost" id="back">${icon.arrowL} Back</button>
          <button class="btn btn-primary" id="next">Continue ${icon.arrowR}</button>
        </div>
      </section>
      <aside class="onboard-stage batik">
        <div id="stage-avatar"></div>
        <div>
          <div class="stage-stats" id="stage-stats"></div>
          <p class="tiny" style="opacity:.75;margin-top:10px;text-align:center">Your 3D body updates live · the glow shows your goal</p>
        </div>
      </aside>
    </div>`);

  const av = mountAvatar($('#stage-avatar', root), avatarOpts());

  function avatarOpts() {
    return {
      bmi: bmiOf(draft.weight_kg, draft.height_cm), sex: draft.sex,
      ghostBmi: draft.target_kg ? bmiOf(draft.target_kg, draft.height_cm) : null,
    };
  }
  function refreshStage() {
    av.update(avatarOpts());
    const b = bmiOf(draft.weight_kg, draft.height_cm);
    mount($('#stage-stats', root), html`
      <span class="pill num">${draft.height_cm} cm</span>
      <span class="pill num">${fmt.kg(draft.weight_kg)} kg</span>
      <span class="pill num">BMI ${b}</span>`);
  }

  const liveAssess = debounce(async () => {
    try {
      assessed = await api.assess(draft);
      const box = $('#assess', root);
      if (box) mount(box, assessView(assessed));
    } catch (err) { /* validation errors show once user fixes input */ }
  }, 350);

  function assessView(m) {
    return html`
      <div class="live-hint stack">
        <div class="spread"><span>Daily target</span><b class="num">${fmt.kcal(m.daily_kcal)} kcal</b></div>
        <div class="spread"><span>Healthy weight for your height</span><b class="num">${m.healthy_range_kg[0]}–${m.healthy_range_kg[1]} kg</b></div>
        ${m.eta_date ? html`<div class="spread"><span>Estimated goal date</span><b>${fmt.date(m.eta_date)}</b></div>` : ''}
      </div>
      ${m.warnings.map((w) => html`<div class="alert">${icon.alert}<span>${w}</span></div>`)}`;
  }

  const steps = [
    () => html`
      <div class="step-body">
        <span class="eyebrow">Step 1 · About you</span>
        <h1 class="step-title">Hai! Let's build your <em>body plan</em>.</h1>
        <label class="field"><span>What should we call you? (optional)</span>
          <input class="input" id="f-name" maxlength="40" autocomplete="given-name" value="${draft.name}" placeholder="e.g. Aina"></label>
        <div class="field"><span class="label">Sex (for calorie formula)</span>
          <div class="seg" role="group" aria-label="Sex">
            ${['male', 'female'].map((x) => html`<button type="button" data-sex="${x}" aria-pressed="${draft.sex === x}">${x === 'male' ? 'Male' : 'Female'}</button>`)}
          </div></div>
        <label class="field"><span>Age</span>
          <div class="unit-input"><input class="input" id="f-age" type="number" inputmode="numeric" min="13" max="100" value="${draft.age}"><span class="unit">years</span></div></label>
      </div>`,
    () => html`
      <div class="step-body">
        <span class="eyebrow">Step 2 · Your body today</span>
        <h1 class="step-title">Height & weight</h1>
        <label class="field"><span>Height</span>
          <div class="unit-input"><input class="input input-big" id="f-h" type="number" inputmode="decimal" min="120" max="230" step="0.5" value="${draft.height_cm}"><span class="unit">cm</span></div>
          <input type="range" id="r-h" min="130" max="210" step="0.5" value="${draft.height_cm}" aria-label="Height slider"></label>
        <label class="field"><span>Weight</span>
          <div class="unit-input"><input class="input input-big" id="f-w" type="number" inputmode="decimal" min="30" max="300" step="0.1" value="${draft.weight_kg}"><span class="unit">kg</span></div>
          <input type="range" id="r-w" min="35" max="160" step="0.1" value="${draft.weight_kg}" aria-label="Weight slider"></label>
      </div>`,
    () => html`
      <div class="step-body">
        <span class="eyebrow">Step 3 · Lifestyle</span>
        <h1 class="step-title">How active are you?</h1>
        <div class="choice-grid">
          ${ACTIVITY.map((a) => html`<button type="button" class="choice" data-activity="${a.key}" aria-pressed="${draft.activity === a.key}">
            <span class="choice-icon">${a.ic}</span><strong>${a.title}</strong><small>${a.desc}</small></button>`)}
        </div>
      </div>`,
    () => html`
      <div class="step-body">
        <span class="eyebrow">Step 4 · Goal</span>
        <h1 class="step-title">What's your goal?</h1>
        <div class="choice-grid">
          ${GOALS.map((g) => html`<button type="button" class="choice" data-goal="${g.key}" aria-pressed="${draft.goal === g.key}">
            <span class="choice-icon">${g.ic}</span><strong>${g.title}</strong><small>${g.desc}</small></button>`)}
        </div>
        ${draft.goal !== 'maintain' ? html`
          <label class="field"><span>Target weight (the dashed outline shows your goal body)</span>
            <div class="unit-input"><input class="input" id="f-t" type="number" inputmode="decimal" min="30" max="300" step="0.5" value="${draft.target_kg ?? ''}" placeholder="e.g. ${draft.goal === 'lose' ? Math.round(draft.weight_kg - 5) : Math.round(draft.weight_kg + 4)}"><span class="unit">kg</span></div></label>` : ''}
        <div id="assess"></div>
      </div>`,
    () => html`
      <div class="step-body">
        <span class="eyebrow">Step 5 · Make it yours</span>
        <h1 class="step-title">Food preferences</h1>
        <div>
          ${toggle('p-halal', 'Halal only', 'Only halal dishes in your plan', prefs.halal)}
          ${toggle('p-veg', 'Vegetarian', 'No meat or seafood', prefs.vegetarian)}
          ${toggle('p-puasa', 'Puasa mode', 'Ramadan plan: Sahur, Iftar & Moreh', prefs.puasa)}
        </div>
        <label class="field"><span>Daily food budget: <b id="budget-v">RM${prefs.budget_rm}</b></span>
          <input type="range" id="p-budget" min="10" max="80" step="1" value="${prefs.budget_rm}"></label>
        <label class="field"><span>Foods you dislike or are allergic to (optional)</span>
          <input class="input" id="p-dislikes" maxlength="120" value="${prefs.dislikes}" placeholder="e.g. durian, prawns"></label>      </div>`,
  ];

  function toggle(id, title, desc, on) {
    return html`<label class="switch" for="${id}"><span class="switch-text"><strong>${title}</strong><small>${desc}</small></span>
      <input type="checkbox" id="${id}" role="switch" ${on ? 'checked' : ''}></label>`;
  }

  function showStep() {
    mount($('#steps', root), Array.from({ length: TOTAL }, (_, i) => html`<i class="${i <= step ? 'done' : ''}"></i>`));
    mount($('#step', root), steps[step]());
    $('#back', root).style.visibility = step === 0 ? 'hidden' : 'visible';
    mount($('#next', root), step === TOTAL - 1 ? html`${icon.sparkle} Build my plan` : html`Continue ${icon.arrowR}`);
    bindStep();
    refreshStage();
    if (step === 3) liveAssess();
  }

  function bindStep() {
    const on = (sel, ev, fn) => { const el = $(sel, root); if (el) el.addEventListener(ev, fn); };
    on('#f-name', 'input', (e) => { draft.name = e.target.value.trim(); });
    $$('[data-sex]', root).forEach((b) => b.addEventListener('click', () => {
      draft.sex = b.dataset.sex;
      $$('[data-sex]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      refreshStage();
    }));
    on('#f-age', 'input', (e) => { draft.age = Number(e.target.value); });
    const pair = (num, range, key) => {
      on(num, 'input', (e) => { const v = Number(e.target.value); if (v) { draft[key] = v; $(range, root).value = v; refreshStage(); } });
      on(range, 'input', (e) => { draft[key] = Number(e.target.value); $(num, root).value = draft[key]; refreshStage(); });
    };
    pair('#f-h', '#r-h', 'height_cm');
    pair('#f-w', '#r-w', 'weight_kg');
    $$('[data-activity]', root).forEach((b) => b.addEventListener('click', () => {
      draft.activity = b.dataset.activity;
      $$('[data-activity]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $$('[data-goal]', root).forEach((b) => b.addEventListener('click', () => {
      draft.goal = b.dataset.goal;
      if (draft.goal === 'maintain') draft.target_kg = null;
      showStep();
    }));
    on('#f-t', 'input', (e) => { draft.target_kg = Number(e.target.value) || null; refreshStage(); liveAssess(); });
    on('#p-halal', 'change', (e) => { prefs.halal = e.target.checked; });
    on('#p-veg', 'change', (e) => { prefs.vegetarian = e.target.checked; });
    on('#p-puasa', 'change', (e) => { prefs.puasa = e.target.checked; });
    on('#p-budget', 'input', (e) => { prefs.budget_rm = Number(e.target.value); $('#budget-v', root).textContent = `RM${prefs.budget_rm}`; });
    on('#p-dislikes', 'input', (e) => { prefs.dislikes = e.target.value; });
  }

  function validate() {
    if (step === 0 && !(draft.age >= 13 && draft.age <= 100)) return 'Age must be between 13 and 100.';
    if (step === 1 && !(draft.height_cm >= 120 && draft.height_cm <= 230)) return 'Height must be 120–230 cm.';
    if (step === 1 && !(draft.weight_kg >= 30 && draft.weight_kg <= 300)) return 'Weight must be 30–300 kg.';
    return null;
  }

  $('#back', root).addEventListener('click', () => { if (step > 0) { step--; showStep(); } });
  $('#next', root).addEventListener('click', async () => {
    const err = validate();
    if (err) { toast(err, 'error'); return; }
    if (step < TOTAL - 1) { step++; showStep(); return; }

    const btn = $('#next', root);
    btn.disabled = true;
    try {
      const metrics = await api.assess(draft);
      const profile = { ...draft, goal: metrics.goal, target_kg: metrics.target_kg };
      store.set({ profile, prefs, metrics, plan: null });
      addWeight(localISO(), profile.weight_kg);
      toast(`Welcome${profile.name ? `, ${profile.name}` : ''}! Building your plan…`);
      ctx.navigate('plan');
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false;
    }
  });

  showStep();
}
