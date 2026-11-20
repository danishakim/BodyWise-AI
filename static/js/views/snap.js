// Snap & Scan: food photos → Teachable Machine only (on-device);
// nutrition labels and menu boards → server-side AI (Gemini) via /api/label/scan and /api/menu/scan.
// and the exclusive Menu Scanner.
import { api } from '../api.js';
import { store, addMeal, removeMeal, mealsOn, todayTotals, targetFor } from '../store.js';
import { html, mount, icon, toast, $, $$, fmt, resizeImage } from '../ui.js';
import { showLogged } from '../logged.js';

let mode = 'food';
let foods = null;
let tmModel = null;
const TM_MIN_CONFIDENCE = 0.6;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

async function loadTM(url) {
  if (tmModel) return tmModel;
  await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.7.4/dist/tf.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js');
  const base = url.endsWith('/') ? url : `${url}/`;
  tmModel = await window.tmImage.load(`${base}model.json`, `${base}metadata.json`);
  return tmModel;
}

export function render(root, ctx) {
  mount(root, html`
    <header class="page-head">
      <div><h1>Snap <em>&</em> Scan</h1></div>
      <div class="seg" role="group" aria-label="Mode">
        <button data-mode="food" aria-pressed="${mode === 'food'}">Food</button>
        <button data-mode="label" aria-pressed="${mode === 'label'}">Label</button>
        <button data-mode="menu" aria-pressed="${mode === 'menu'}">Menu</button>
      </div>
    </header>
    <div id="mode-body"></div>`);
  $$('[data-mode]', root).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; render(root, ctx); }));
  const body = $('#mode-body', root);
  if (mode === 'food') renderFood(body, ctx);
  else if (mode === 'label') renderLabel(body, ctx);
  else renderMenu(body, ctx);
}

// ---------------- Nutrition label scanner ----------------
function renderLabel(root, ctx) {
  mount(root, html`
    <div class="grid grid-2">
      <div class="stack">
        ${dropzone('label', 'Photograph the nutrition table on the pack', 'Maklumat Pemakanan / Nutrition Information, flat and well-lit')}
        <p class="tiny muted">For packaged food like bread, Milo or Mamee. The AI reads the exact numbers printed by the manufacturer, then checks that they add up.</p>
        ${!ctx.status.ai_enabled ? html`<div class="alert">${icon.alert}<span>Label scanning isn't available right now.</span></div>` : ''}
      </div>
      <div id="label-result">
        <section class="card thinking"><span class="eyebrow">How it works</span>
          <p class="muted">1. Snap the label · 2. AI reads energy, protein, carbs and fat per serving · 3. Choose servings and add to today.</p></section>
      </div>
    </div>`);

  bindDrop(root, 'label', async (file) => {
    const out = $('#label-result', root);
    let photo;
    try { photo = await preparePhoto(root, 'label', file); } catch (e) { toast(e.message, 'error'); return; }
    mount(out, html`<div class="card thinking"><div class="thinking-dots"><i></i><i></i><i></i></div><p class="muted">Reading the label…</p></div>`);
    let r;
    try { r = await api.scanLabel(photo.blob); } catch (e) { r = { ok: false, reason: e.message }; }
    $('#label-zone .scan-line', root)?.remove();
    if (!r.ok) { mount(out, html`<div class="alert">${icon.info}<span>${r.reason}</span></div>`); return; }

    let servings = 1;
    const macro = (label, value, unit, tone) => html`<div class="stat" style="text-align:center"><small>${label}</small>
      <b class="num" style="font-size:1.15rem;color:var(--${tone})">${value ?? '—'}<span>${unit}</span></b></div>`;
    const draw = () => mount(out, html`
      <section class="card result-card stack" style="gap:14px">
        <div><h2>${r.product_name}</h2><p class="tiny muted">Per serving: ${r.serving_desc}${r.serving_g ? ` (${r.serving_g} g)` : ''}</p></div>
        <div class="spread">
          <div class="big-number num">${Math.round(r.kcal * servings)}<small>kcal</small></div>
          <div class="stepper" aria-label="Servings"><button type="button" id="l-minus" aria-label="Fewer servings">−</button>
            <output>${servings}×</output><button type="button" id="l-plus" aria-label="More servings">+</button></div>
        </div>
        <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
          ${macro('Protein', Math.round(r.protein_g * servings * 10) / 10, 'g', 'sky')}
          ${macro('Carbs', Math.round(r.carbs_g * servings * 10) / 10, 'g', 'gold')}
          ${macro('Fat', Math.round(r.fat_g * servings * 10) / 10, 'g', 'accent')}
        </div>
        ${r.sugar_g != null ? html`<p class="tiny muted">Sugar ${Math.round(r.sugar_g * servings * 10) / 10} g${r.sodium_mg != null ? ` · Sodium ${Math.round(r.sodium_mg * servings)} mg` : ''}</p>` : ''}
        ${r.warnings.map((w) => html`<div class="alert">${icon.alert}<span>${w}</span></div>`)}
        <button class="btn btn-primary btn-block" id="l-add">${icon.check} Add to today</button>
      </section>`);
    const bind = () => {
      $('#l-minus', out).addEventListener('click', () => { servings = Math.max(0.5, servings - 0.5); draw(); bind(); });
      $('#l-plus', out).addEventListener('click', () => { servings = Math.min(10, servings + 0.5); draw(); bind(); });
      $('#l-add', out).addEventListener('click', () => {
        if (r.warnings.length && !confirm('The numbers may be misread. Add anyway?')) return;
        addMeal({ name: `${r.product_name}${servings === 1 ? '' : ` ×${servings}`}`, kcal: r.kcal * servings, protein: r.protein_g * servings, source: 'Label scan' });
        showLogged(ctx, { name: r.product_name, kcal: r.kcal * servings });
        out.innerHTML = '';
      });
    };
    draw(); bind();
  });
}

function dropzone(id, title, sub) {
  return html`
    <label class="dropzone" id="${id}-zone" for="${id}-file">
      <span class="cam">${icon.camera}</span>
      <b>${title}</b><span class="muted tiny">${sub}</span>
      <input type="file" id="${id}-file" accept="image/jpeg,image/png,image/webp" capture="environment" class="sr-only">
    </label>`;
}

function bindDrop(root, id, onFile) {
  const zone = $(`#${id}-zone`, root);
  const input = $(`#${id}-file`, root);
  input.addEventListener('change', () => input.files[0] && onFile(input.files[0]));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  });
}

async function preparePhoto(root, id, file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  const blob = await resizeImage(file);
  const url = URL.createObjectURL(blob);
  const zone = $(`#${id}-zone`, root);
  zone.querySelector('img.preview')?.remove();
  zone.querySelector('.scan-line')?.remove();
  zone.insertAdjacentHTML('beforeend', `<img class="preview" alt="Your photo" src="${url}"><span class="scan-line"></span>`);
  return { blob, url, img: zone.querySelector('img.preview') };
}

// ---------------- Food mode ----------------
function renderFood(root, ctx) {
  mount(root, html`
    <div class="grid grid-2">
      <div class="stack">
        ${dropzone('food', 'Take or upload a photo of your meal', 'Our Teachable Machine model recognises the dish')}
        <p class="tiny muted">Recognised on your device. Photos are never uploaded or stored.</p>
        <div id="food-result"></div>
      </div>
      <div class="stack">
        <section class="card">
          <div class="card-title">${icon.plus} Add manually</div>
          <input class="input" id="search" placeholder="Search: nasi lemak, roti, teh tarik…" aria-label="Search foods">
          <div class="food-list" id="food-list"></div>
        </section>
        <section class="card" id="log"></section>
      </div>
    </div>`);

  bindDrop(root, 'food', (file) => recognise(root, ctx, file));
  renderLog(root);
  const list = $('#food-list', root);
  const draw = (q = '') => {
    const items = (foods || []).filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
    mount(list, items.map((f) => html`<div class="food-item"><span>${f.name} <span class="muted num">· ${f.kcal} kcal</span></span>
      <button class="btn btn-sm" data-add="${f.id}" aria-label="Add ${f.name}">${icon.plus}</button></div>`));
    $$('[data-add]', list).forEach((b) => b.addEventListener('click', () => {
      const f = foods.find((x) => x.id === b.dataset.add);
      addMeal({ name: f.name, kcal: f.kcal, protein: f.protein, source: 'manual' });
      toast(`Logged ${f.name}`);
      renderLog(root);
    }));
  };
  $('#search', root).addEventListener('input', (e) => draw(e.target.value));
  if (foods) draw();
  else api.foods().then((r) => { foods = r.foods; draw(); }).catch((e) => toast(e.message, 'error'));
}

// Food photos are recognised ONLY by our Teachable Machine model, on the device.
// Calories come from our food list (bodywise/foods.py), matched by the model's class name.
async function recognise(root, ctx, file) {
  const out = $('#food-result', root);
  let photo;
  try { photo = await preparePhoto(root, 'food', file); } catch (e) { toast(e.message, 'error'); return; }
  const stop = () => $('#food-zone .scan-line', root)?.remove();
  if (!ctx.status.tm_model_url) {
    stop();
    mount(out, html`<div class="alert">${icon.info}<span>The food recognition model isn't set up yet. Search for your food instead.</span></div>`);
    return;
  }
  mount(out, html`<div class="card thinking"><div class="thinking-dots"><i></i><i></i><i></i></div><p class="muted">Recognising your food…</p></div>`);

  let preds;
  try {
    const model = await loadTM(ctx.status.tm_model_url);
    preds = (await model.predict(photo.img)).sort((a, b) => b.probability - a.probability);
    foods ||= (await api.foods()).foods;
  } catch (e) {
    console.warn('Teachable Machine failed', e);
    stop();
    mount(out, html`<div class="alert">${icon.info}<span>Couldn't load the food model. Check your internet connection, or search for your food instead.</span></div>`);
    return;
  }
  stop();

  const known = preds.map((p) => ({ p, f: foods.find((x) => x.id === p.className) })).filter((x) => x.f);
  const best = known[0];
  if (best && best.p === preds[0] && best.p.probability >= TM_MIN_CONFIDENCE) { showFood(root, ctx, out, best.f); return; }

  // Not sure: offer the model's best guesses instead of guessing for the user.
  const guesses = known.filter((x) => x.p.probability >= 0.1).slice(0, 3);
  mount(out, html`<section class="card result-card stack" style="gap:10px">
    <b>Not sure what this is</b>
    <p class="tiny muted">${guesses.length ? 'Is it one of these?' : "This food isn't in our model yet. Search for it instead."}</p>
    ${guesses.length ? html`<div class="chips">${guesses.map((g, i) => html`<button class="chip" data-guess="${i}">${g.f.name}</button>`)}</div>` : ''}
  </section>`);
  $$('[data-guess]', out).forEach((b) => b.addEventListener('click', () => showFood(root, ctx, out, guesses[Number(b.dataset.guess)].f)));
}

function showFood(root, ctx, out, f) {
  const result = { name: f.name, kcal: f.kcal, protein: f.protein, portion: '1 standard serving' };
  let servings = 1;
  mount(out, html`
    <section class="card result-card">
      <h2 style="margin:0 0 4px">${result.name}</h2>
      <p class="muted tiny">${result.portion} · ${result.protein} g protein</p>
      <div class="spread" style="margin-top:14px">
        <div class="big-number num" id="r-kcal">${result.kcal}<small>kcal</small></div>
        <div class="stepper" aria-label="Servings"><button type="button" id="r-minus" aria-label="Fewer servings">−</button><output id="r-serv">1×</output><button type="button" id="r-plus" aria-label="More servings">+</button></div>
      </div>
      <button class="btn btn-primary btn-block" id="r-add" style="margin-top:14px">${icon.check} Add to today</button>
    </section>`);
  const upd = () => {
    $('#r-serv', out).textContent = `${servings}×`;
    $('#r-kcal', out).firstChild.textContent = Math.round(result.kcal * servings);
  };
  $('#r-minus', out).addEventListener('click', () => { servings = Math.max(0.5, servings - 0.5); upd(); });
  $('#r-plus', out).addEventListener('click', () => { servings = Math.min(4, servings + 0.5); upd(); });
  $('#r-add', out).addEventListener('click', () => {
    addMeal({ name: servings === 1 ? result.name : `${result.name} ×${servings}`, kcal: result.kcal * servings,
      protein: (result.protein || 0) * servings, source: 'Food photo' });
    showLogged(ctx, { name: result.name, kcal: result.kcal * servings });
    renderLog(root);
    out.innerHTML = '';
  });
}

function renderLog(root) {
  const box = $('#log', root);
  if (!box) return;
  const list = mealsOn();
  const t = todayTotals();
  const tgt = targetFor();
  mount(box, html`
    <div class="spread" style="margin-bottom:8px"><div class="card-title" style="margin:0">${icon.flame} Today's log</div>
      <span class="badge ${t.kcal > tgt.kcal ? 'bad' : 'good'} num">${fmt.kcal(t.kcal)} / ${fmt.kcal(tgt.kcal)} kcal</span></div>
    <div class="bar-track"><div class="bar-fill ${t.kcal > tgt.kcal ? 'accent' : ''}" style="--v:${Math.min(100, (t.kcal / tgt.kcal) * 100)}%"></div></div>
    ${list.length ? html`<div class="food-list" style="margin-top:8px">${list.map((m, i) => html`
      <div class="food-item"><span>${m.name}<br><span class="tiny muted">${m.source || ''}</span></span>
        <span class="row"><b class="num">${m.kcal}</b><button class="icon-btn" data-rm="${i}" aria-label="Remove ${m.name}">${icon.trash}</button></span></div>`)}</div>`
      : html`<p class="muted tiny" style="margin-top:12px">Nothing logged yet today.</p>`}`);
  $$('[data-rm]', box).forEach((b) => b.addEventListener('click', () => { removeMeal(Number(b.dataset.rm)); renderLog(root); }));
}

// ---------------- Exclusive: Menu Scanner ----------------
function renderMenu(root, ctx) {
  const t = todayTotals();
  const remaining = Math.max(0, targetFor().kcal - t.kcal);
  mount(root, html`
    <div class="grid grid-2">
      <div class="stack">
        ${dropzone('menu', 'Photograph a menu or hawker signboard', 'AI reads every dish and ranks them for your goal')}
        <div class="alert info">${icon.info}<span>You have <b class="num">${fmt.kcal(remaining)} kcal</b> left today. The AI picks dishes that fit, with an ordering tip for each.</span></div>
        ${!ctx.status.ai_enabled ? html`<div class="alert">${icon.alert}<span>Menu scanning isn't available right now.</span></div>` : ''}
      </div>
      <div id="menu-result">
        <section class="card thinking"><span class="badge excl">EXCLUSIVE</span><h2>Menu Scanner</h2>
          <p class="muted">Most calorie apps can only log food <i>after</i> you eat it. BodyWise helps you choose <i>before</i> you order.</p></section>
      </div>
    </div>`);
  bindDrop(root, 'menu', async (file) => {
    const out = $('#menu-result', root);
    let photo;
    try { photo = await preparePhoto(root, 'menu', file); } catch (e) { toast(e.message, 'error'); return; }
    mount(out, html`<div class="card thinking"><div class="thinking-dots"><i></i><i></i><i></i></div><p class="muted">Reading the menu…</p></div>`);
    try {
      const s = store.get();
      const r = await api.scanMenu(photo.blob, { remaining_kcal: String(remaining), goal: s.metrics?.goal || 'maintain', prefs: s.prefs });
      $('#menu-zone .scan-line', root)?.remove();
      if (!r.ok) { mount(out, html`<div class="alert">${icon.info}<span>${r.reason}</span></div>`); return; }
      const label = { best: 'Best pick', ok: 'OK with tweak', limit: 'Treat day' };
      mount(out, html`<div class="stack">
        <p>${r.summary}</p>
        ${r.picks.map((pk, i) => html`<article class="card meal-card verdict-${pk.verdict}">
          <div class="spread"><span class="slot-tag" style="color:var(--slot-color)">${label[pk.verdict]}</span><span class="badge num">~${pk.est_kcal} kcal</span></div>
          <h3>${pk.dish}</h3><p class="tiny muted">${pk.reason}</p>
          <p class="tiny"><b>Order it like this:</b> ${pk.tweak}</p>
          <button class="btn btn-sm" data-pick="${i}" style="align-self:flex-start">${icon.plus} I ordered this</button></article>`)}
      </div>`);
      $$('[data-pick]', out).forEach((b) => b.addEventListener('click', () => {
        const pk = r.picks[Number(b.dataset.pick)];
        addMeal({ name: pk.dish, kcal: pk.est_kcal, protein: 0, source: 'Menu Scanner' });
        showLogged(ctx, { name: pk.dish, kcal: pk.est_kcal });
      }));
    } catch (e) {
      $('#menu-zone .scan-line', root)?.remove();
      mount(out, html`<div class="alert danger">${icon.alert}<span>${e.message}</span></div>`);
    }
  });
}
