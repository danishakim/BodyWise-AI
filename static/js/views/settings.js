// Settings (v2): change how the app works, quickly and safely.
// Grouped by frequency of use; toggles apply instantly; the destructive action is isolated.
import { store, seedDemoData } from '../store.js';
import { applyTheme } from '../theme.js';
import { exportData } from './profile.js';
import { html, mount, icon, toast, $, $$, fmt } from '../ui.js';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function render(root, ctx) {
  const s = store.get();
  const m = s.metrics;
  if (!m && s.profile) { ctx.refreshMetrics().then((x) => x && render(root, ctx)); }
  const chev = icon.chevron;
  const toggle = (id, title, sub, on, ic) => html`
    <label class="lrow" for="${id}"><span class="ic">${ic}</span><span class="tx"><b>${title}</b>${sub ? html`<small>${sub}</small>` : ''}</span>
      <input type="checkbox" class="toggle" id="${id}" role="switch" ${on ? 'checked' : ''}></label>`;

  mount(root, html`
    <div class="list-wrap">
      <a href="#/profile" class="back-link">${icon.back} Profile</a>
      <h1 style="margin-top:6px">Settings</h1>

      <div class="group-label">Goals & plan</div>
      <div class="group">
        <a class="lrow" href="#/welcome"><span class="ic">${icon.target}</span><span class="tx"><b>Weight goal</b><small>${m ? `${m.weekly_change_kg > 0 ? '+' : ''}${m.weekly_change_kg} kg per week` : ''}</small></span>
          <span class="val">${m?.target_kg ? `${fmt.kg(m.target_kg)} kg` : 'Maintain'}</span>${chev}</a>
        <div class="lrow static"><span class="ic">${icon.flame}</span><span class="tx"><b>Daily calorie target</b><small>Auto-calculated for you</small></span>
          <span class="val num">${m ? `${fmt.kcal(m.daily_kcal)} kcal` : '—'}</span></div>
        <button class="lrow" id="regen"><span class="ic">${icon.refresh}</span><span class="tx"><b>Regenerate meal plan</b><small>Apply your latest preferences</small></span>${chev}</button>
      </div>
      <p class="footnote">Targets use the Mifflin-St Jeor formula and never go below the safe minimum.</p>

      <div class="group-label">Food preferences</div>
      <div class="group">
        ${toggle('p-halal', 'Halal only', '', s.prefs.halal, icon.check)}
        ${toggle('p-veg', 'Vegetarian', '', s.prefs.vegetarian, icon.leaf)}
        ${toggle('p-puasa', 'Puasa mode', 'Sahur, Iftar & Moreh plan', s.prefs.puasa, icon.moon)}
        <label class="lrow" for="p-budget"><span class="ic">${icon.wallet}</span><span class="tx"><b>Daily food budget</b><small id="bud-v">RM${s.prefs.budget_rm} per day</small></span>
          <input type="range" id="p-budget" min="10" max="80" step="1" value="${s.prefs.budget_rm}" aria-label="Daily budget in ringgit"></label>
      </div>
      <p class="footnote" id="pref-note">Changes apply the next time you regenerate your plan.</p>

      <div class="group-label">Appearance</div>
      <div class="group"><div class="lrow static"><span class="ic">${icon.moon}</span><span class="tx"><b>Theme</b></span>
        <div class="seg" role="group" aria-label="Theme">${['system', 'light', 'dark'].map((t) => html`<button data-theme-btn="${t}" aria-pressed="${s.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`)}</div></div></div>

      <div class="group-label">App</div>
      <div class="group">
        ${isStandalone() ? html`<div class="lrow static"><span class="ic">${icon.phone}</span><span class="tx"><b>Installed</b><small>BodyWise is on your home screen and works offline</small></span>${icon.check}</div>`
          : html`<button class="lrow" id="install"><span class="ic">${icon.phone}</span><span class="tx"><b>Install BodyWise</b>
            <small>${isIOS() ? 'In Safari: Share → Add to Home Screen' : 'Add to your home screen, opens like an app'}</small></span>${chev}</button>`}
      </div>

      <div class="group-label">Privacy & data</div>
      <div class="group">
        <div class="lrow static"><span class="ic">${icon.shield}</span><span class="tx"><b>Your data stays private</b><small>Stored on this device. Food photos are analysed, never saved.</small></span></div>
        <button class="lrow" id="export"><span class="ic">${icon.download}</span><span class="tx"><b>Export my data</b><small>Download as JSON (unencrypted, so keep it safe)</small></span>${chev}</button>
        <button class="lrow" id="seed"><span class="ic">${icon.chart}</span><span class="tx"><b>Load sample progress</b><small>8 weeks of demo weigh-ins</small></span>${chev}</button>
      </div>

      <div class="group-label">About</div>
      <div class="group"><details class="lrow" style="display:block"><summary class="row" style="cursor:pointer;list-style:none;gap:12px">
          <span class="ic">${icon.info}</span><span class="tx"><b>Responsible AI & disclaimer</b><small>Not medical advice</small></span></summary>
        <ul class="tiny muted stack" style="gap:6px;padding:10px 0 4px 18px;margin:0">
          <li>Calorie targets come from formulas, not the AI. The AI only writes meals around them, and the server re-checks every total.</li>
          <li>Guardrails: no weight-loss plans when underweight, calorie floors of 1200/1500 kcal, at most 0.5 kg/week loss, warnings for under-18s.</li>
          <li>BMI uses Malaysian (Asian) cut-offs. The 3D body is a stylised estimate, not a body scan.</li>
          <li>BodyWise is a student prototype (SDT2143 Mini AI Hackathon). Please consult a doctor or dietitian for medical conditions.</li>
        </ul></details></div>

      <div class="group-label">Danger zone</div>
      <div class="group"><button class="lrow danger" id="wipe"><span class="ic">${icon.trash}</span><span class="tx"><b>Delete my data on this device</b><small>Removes profile, plan, logs and chat</small></span></button></div>
      <p class="footnote" style="text-align:center;margin:24px 0 8px">BodyWise AI · v2.0</p>
    </div>`);

  root.querySelectorAll('.lrow > svg:last-child').forEach((svg) => svg.classList.add('chev'));

  // Food preferences: apply instantly
  const setPref = (key, val) => { store.set({ prefs: { ...store.get().prefs, [key]: val } }); $('#pref-note', root).style.color = 'var(--primary)'; };
  $('#p-halal', root).addEventListener('change', (e) => setPref('halal', e.target.checked));
  $('#p-veg', root).addEventListener('change', (e) => setPref('vegetarian', e.target.checked));
  $('#p-puasa', root).addEventListener('change', (e) => setPref('puasa', e.target.checked));
  const bud = $('#p-budget', root);
  bud.addEventListener('input', () => { $('#bud-v', root).textContent = `RM${bud.value} per day`; });
  bud.addEventListener('change', () => setPref('budget_rm', Number(bud.value)));
  $('#regen', root).addEventListener('click', () => { store.set({ plan: null }); ctx.navigate('plan'); });

  $$('[data-theme-btn]', root).forEach((b) => b.addEventListener('click', () => {
    store.set({ theme: b.dataset.themeBtn });
    applyTheme(b.dataset.themeBtn);
    $$('[data-theme-btn]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  $('#install', root)?.addEventListener('click', async () => {
    if (ctx.installPrompt) { ctx.installPrompt.prompt(); await ctx.installPrompt.userChoice; ctx.installPrompt = null; return; }
    toast(isIOS() ? 'In Safari tap Share, then “Add to Home Screen”.' : 'Use your browser menu → “Install app” or “Add to Home screen”.');
  });
  $('#export', root).addEventListener('click', exportData);
  $('#seed', root).addEventListener('click', async () => { seedDemoData(); await ctx.refreshMetrics(); toast('Sample progress loaded'); ctx.navigate('progress'); });
  $('#wipe', root).addEventListener('click', () => {
    if (!confirm('Delete your profile, plan, logs and chat from this device? This cannot be undone.')) return;
    store.wipe();
    applyTheme('system');
    toast('Your data was removed from this device');
    ctx.navigate('welcome');
  });
}
