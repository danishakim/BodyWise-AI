// Snap & Scan: food photos → Teachable Machine only (runs on the device);
// nutrition labels and menu boards → server-side AI via /api/label/scan and /api/menu/scan.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { store, useStore, addMeal, removeMeal, mealsOn, todayTotals, targetFor } from '../lib/store.js';
import { fmt, resizeImage } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';

const TM_MIN_CONFIDENCE = 0.6;
let modeMemo = 'food';
let foodsCache = null;
let tmModel = null;

async function loadTM(url) {
  if (tmModel) return tmModel;
  const tmImage = await import('@teachablemachine/image');      // TensorFlow.js + TM bundled, lazy chunk
  const base = url.endsWith('/') ? url : `${url}/`;
  tmModel = await tmImage.load(`${base}model.json`, `${base}metadata.json`);
  return tmModel;
}

function useFoods() {
  const [foods, setFoods] = useState(foodsCache);
  useEffect(() => { if (!foods) api.foods().then((r) => { foodsCache = r.foods; setFoods(r.foods); }).catch(() => {}); }, [foods]);
  return foods;
}

// Camera / upload area with drag-and-drop, preview and a scanning animation.
function Dropzone({ id, title, sub, preview, scanning, onFile }) {
  const [drag, setDrag] = useState(false);
  return (
    <label className={`dropzone ${drag ? 'drag' : ''}`} htmlFor={`${id}-file`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
      <span className="cam"><Icon name="camera" /></span>
      <b>{title}</b><span className="muted tiny">{sub}</span>
      <input type="file" id={`${id}-file`} accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only"
        onChange={(e) => { const f = e.target.files[0]; if (f) onFile(f); e.target.value = ''; }} />
      {preview && <img className="preview" alt="Your photo" src={preview} />}
      {scanning && <span className="scan-line" />}
    </label>
  );
}

function usePhoto() {
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const img = useRef(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const prepare = async (file) => {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
    const blob = await resizeImage(file);
    const url = URL.createObjectURL(blob);
    setPreview(url);
    const el = new Image();
    el.src = url;
    await el.decode();
    img.current = el;
    return { blob, img: el };
  };
  return { preview, scanning, setScanning, prepare };
}

export default function Snap() {
  const [mode, setMode] = useState(modeMemo);
  const pick = (m) => { modeMemo = m; setMode(m); };
  return (
    <>
      <header className="page-head">
        <div><h1>Snap <em>&amp;</em> Scan</h1></div>
        <div className="seg" role="group" aria-label="Mode">
          <button aria-pressed={mode === 'food'} onClick={() => pick('food')}>Food</button>
          <button aria-pressed={mode === 'label'} onClick={() => pick('label')}>Label</button>
          <button aria-pressed={mode === 'menu'} onClick={() => pick('menu')}>Menu</button>
        </div>
      </header>
      {mode === 'food' ? <FoodMode /> : mode === 'label' ? <LabelMode /> : <MenuMode />}
    </>
  );
}

// ---------------- Food photo (Teachable Machine) ----------------
function FoodMode() {
  const { status, toast, showLogged } = useApp();
  const foods = useFoods();
  const photo = usePhoto();
  const [result, setResult] = useState(null);   // { kind: 'busy'|'info'|'unsure'|'found', ... }
  const [query, setQuery] = useState('');

  const recognise = async (file) => {
    let p;
    try { p = await photo.prepare(file); } catch (e) { toast(e.message, 'error'); return; }
    if (!status.tm_model_url) { setResult({ kind: 'info', text: "The food recognition model isn't set up yet. Search for your food instead." }); return; }
    setResult({ kind: 'busy' }); photo.setScanning(true);
    try {
      const model = await loadTM(status.tm_model_url);
      const preds = (await model.predict(p.img)).sort((a, b) => b.probability - a.probability);
      const list = foodsCache || (await api.foods()).foods;
      foodsCache = list;
      const known = preds.map((x) => ({ p: x, f: list.find((f) => f.id === x.className) })).filter((x) => x.f);
      const best = known[0];
      if (best && best.p === preds[0] && best.p.probability >= TM_MIN_CONFIDENCE) setResult({ kind: 'found', food: best.f });
      else setResult({ kind: 'unsure', guesses: known.filter((x) => x.p.probability >= 0.1).slice(0, 3).map((x) => x.f) });
    } catch (e) {
      console.warn('Teachable Machine failed', e);
      setResult({ kind: 'info', text: "Couldn't load the food model. Check your internet connection, or search for your food instead." });
    } finally { photo.setScanning(false); }
  };

  const shown = (foods || []).filter((f) => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 40);

  return (
    <div className="grid grid-2">
      <div className="stack">
        <Dropzone id="food" title="Take or upload a photo of your meal" sub="Our Teachable Machine model recognises the dish"
          preview={photo.preview} scanning={photo.scanning} onFile={recognise} />
        <p className="tiny muted">Recognised on your device. Photos are never uploaded or stored.</p>
        {result?.kind === 'busy' && <div className="card thinking"><div className="thinking-dots"><i /><i /><i /></div><p className="muted">Recognising your food…</p></div>}
        {result?.kind === 'info' && <div className="alert"><Icon name="info" /><span>{result.text}</span></div>}
        {result?.kind === 'unsure' && (
          <section className="card result-card stack" style={{ gap: 10 }}>
            <b>Not sure what this is</b>
            <p className="tiny muted">{result.guesses.length ? 'Is it one of these?' : "This food isn't in our model yet. Search for it instead."}</p>
            {result.guesses.length > 0 && <div className="chips">{result.guesses.map((g) => <button key={g.id} className="chip" onClick={() => setResult({ kind: 'found', food: g })}>{g.name}</button>)}</div>}
          </section>
        )}
        {result?.kind === 'found' && (
          <FoodResult food={result.food} onAdd={(servings) => {
            const f = result.food;
            addMeal({ name: servings === 1 ? f.name : `${f.name} ×${servings}`, kcal: f.kcal * servings, protein: f.protein * servings, source: 'Food photo' });
            setResult(null);
            showLogged({ name: f.name, kcal: f.kcal * servings });
          }} />
        )}
      </div>
      <div className="stack">
        <section className="card">
          <div className="card-title"><Icon name="plus" /> Add manually</div>
          <input className="input" placeholder="Search: nasi lemak, roti, teh tarik…" aria-label="Search foods" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="food-list">
            {shown.map((f) => (
              <div key={f.id} className="food-item"><span>{f.name} <span className="muted num">· {f.kcal} kcal</span></span>
                <button className="btn btn-sm" aria-label={`Add ${f.name}`} onClick={() => { addMeal({ name: f.name, kcal: f.kcal, protein: f.protein, source: 'manual' }); toast(`Logged ${f.name}`); }}>
                  <Icon name="plus" /></button></div>
            ))}
          </div>
        </section>
        <TodayLog />
      </div>
    </div>
  );
}

function FoodResult({ food, onAdd }) {
  const [servings, setServings] = useState(1);
  return (
    <section className="card result-card">
      <h2 style={{ margin: '0 0 4px' }}>{food.name}</h2>
      <p className="muted tiny">1 standard serving · {food.protein} g protein</p>
      <div className="spread" style={{ marginTop: 14 }}>
        <div className="big-number num">{Math.round(food.kcal * servings)}<small>kcal</small></div>
        <Stepper value={servings} max={4} onChange={setServings} />
      </div>
      <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => onAdd(servings)}><Icon name="check" /> Add to today</button>
    </section>
  );
}

function Stepper({ value, max, onChange }) {
  return (
    <div className="stepper" aria-label="Servings">
      <button type="button" aria-label="Fewer servings" onClick={() => onChange(Math.max(0.5, value - 0.5))}>−</button>
      <output>{value}×</output>
      <button type="button" aria-label="More servings" onClick={() => onChange(Math.min(max, value + 0.5))}>+</button>
    </div>
  );
}

function TodayLog() {
  const s = useStore();
  const list = mealsOn(undefined, s);
  const t = todayTotals(s);
  const tgt = targetFor(undefined, s);
  return (
    <section className="card">
      <div className="spread" style={{ marginBottom: 8 }}><div className="card-title" style={{ margin: 0 }}><Icon name="flame" /> Today's log</div>
        <span className={`badge ${t.kcal > tgt.kcal ? 'bad' : 'good'} num`}>{fmt.kcal(t.kcal)} / {fmt.kcal(tgt.kcal)} kcal</span></div>
      <div className="bar-track"><div className={`bar-fill ${t.kcal > tgt.kcal ? 'accent' : ''}`} style={{ '--v': `${Math.min(100, (t.kcal / tgt.kcal) * 100)}%` }} /></div>
      {list.length ? (
        <div className="food-list" style={{ marginTop: 8 }}>
          {list.map((m, i) => (
            <div key={`${m.at}-${i}`} className="food-item"><span>{m.name}<br /><span className="tiny muted">{m.source || ''}</span></span>
              <span className="row"><b className="num">{m.kcal}</b>
                <button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => removeMeal(i)}><Icon name="trash" /></button></span></div>
          ))}
        </div>
      ) : <p className="muted tiny" style={{ marginTop: 12 }}>Nothing logged yet today.</p>}
    </section>
  );
}

// ---------------- Nutrition label scanner ----------------
function LabelMode() {
  const { status, showLogged } = useApp();
  const photo = usePhoto();
  const [state, setState] = useState(null);   // null | 'busy' | { error } | label
  const [servings, setServings] = useState(1);

  const scan = async (file) => {
    let p;
    try { p = await photo.prepare(file); } catch (e) { setState({ error: e.message }); return; }
    setState('busy'); setServings(1); photo.setScanning(true);
    try {
      const r = await api.scanLabel(p.blob);
      setState(r.ok ? r : { error: r.reason });
    } catch (e) { setState({ error: e.message }); }
    finally { photo.setScanning(false); }
  };

  const r = state && state !== 'busy' && !state.error ? state : null;
  const x = (v) => Math.round(v * servings * 10) / 10;
  const add = () => {
    if (r.warnings.length && !confirm('The numbers may be misread. Add anyway?')) return;
    addMeal({ name: `${r.product_name}${servings === 1 ? '' : ` ×${servings}`}`, kcal: r.kcal * servings, protein: r.protein_g * servings, source: 'Label scan' });
    setState(null);
    showLogged({ name: r.product_name, kcal: r.kcal * servings });
  };

  return (
    <div className="grid grid-2">
      <div className="stack">
        <Dropzone id="label" title="Photograph the nutrition table on the pack" sub="Maklumat Pemakanan / Nutrition Information, flat and well-lit"
          preview={photo.preview} scanning={photo.scanning} onFile={scan} />
        <p className="tiny muted">For packaged food like bread, Milo or Mamee. The AI reads the exact numbers printed by the manufacturer, then checks that they add up.</p>
        {!status.ai_enabled && <div className="alert"><Icon name="alert" /><span>Label scanning isn't available right now.</span></div>}
      </div>
      <div>
        {!state && <section className="card thinking"><span className="eyebrow">How it works</span>
          <p className="muted">1. Snap the label · 2. AI reads energy, protein, carbs and fat per serving · 3. Choose servings and add to today.</p></section>}
        {state === 'busy' && <div className="card thinking"><div className="thinking-dots"><i /><i /><i /></div><p className="muted">Reading the label…</p></div>}
        {state?.error && <div className="alert"><Icon name="info" /><span>{state.error}</span></div>}
        {r && (
          <section className="card result-card stack" style={{ gap: 14 }}>
            <div><h2>{r.product_name}</h2><p className="tiny muted">Per serving: {r.serving_desc}{r.serving_g ? ` (${r.serving_g} g)` : ''}</p></div>
            <div className="spread">
              <div className="big-number num">{Math.round(r.kcal * servings)}<small>kcal</small></div>
              <Stepper value={servings} max={10} onChange={setServings} />
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              {[['Protein', r.protein_g, 'sky'], ['Carbs', r.carbs_g, 'gold'], ['Fat', r.fat_g, 'accent']].map(([l, v, tone]) => (
                <div key={l} className="stat" style={{ textAlign: 'center' }}><small>{l}</small>
                  <b className="num" style={{ fontSize: '1.15rem', color: `var(--${tone})` }}>{x(v)}<span>g</span></b></div>
              ))}
            </div>
            {r.sugar_g != null && <p className="tiny muted">Sugar {x(r.sugar_g)} g{r.sodium_mg != null ? ` · Sodium ${Math.round(r.sodium_mg * servings)} mg` : ''}</p>}
            {r.warnings.map((w) => <div key={w} className="alert"><Icon name="alert" /><span>{w}</span></div>)}
            <button className="btn btn-primary btn-block" onClick={add}><Icon name="check" /> Add to today</button>
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------- Menu Scanner ----------------
const VERDICT = { best: 'Best pick', ok: 'OK with tweak', limit: 'Treat day' };

function MenuMode() {
  const s = useStore();
  const { status, showLogged } = useApp();
  const photo = usePhoto();
  const [state, setState] = useState(null);
  const remaining = Math.max(0, targetFor(undefined, s).kcal - todayTotals(s).kcal);

  const scan = async (file) => {
    let p;
    try { p = await photo.prepare(file); } catch (e) { setState({ error: e.message }); return; }
    setState('busy'); photo.setScanning(true);
    try {
      const st = store.get();
      const r = await api.scanMenu(p.blob, { remaining_kcal: String(remaining), goal: st.metrics?.goal || 'maintain', prefs: st.prefs });
      setState(r.ok ? r : { error: r.reason });
    } catch (e) { setState({ error: e.message }); }
    finally { photo.setScanning(false); }
  };

  return (
    <div className="grid grid-2">
      <div className="stack">
        <Dropzone id="menu" title="Photograph a menu or hawker signboard" sub="AI reads every dish and ranks them for your goal"
          preview={photo.preview} scanning={photo.scanning} onFile={scan} />
        <div className="alert info"><Icon name="info" /><span>You have <b className="num">{fmt.kcal(remaining)} kcal</b> left today. The AI picks dishes that fit, with an ordering tip for each.</span></div>
        {!status.ai_enabled && <div className="alert"><Icon name="alert" /><span>Menu scanning isn't available right now.</span></div>}
      </div>
      <div>
        {!state && <section className="card thinking"><span className="badge excl">EXCLUSIVE</span><h2>Menu Scanner</h2>
          <p className="muted">Most calorie apps can only log food <i>after</i> you eat it. BodyWise helps you choose <i>before</i> you order.</p></section>}
        {state === 'busy' && <div className="card thinking"><div className="thinking-dots"><i /><i /><i /></div><p className="muted">Reading the menu…</p></div>}
        {state?.error && <div className="alert"><Icon name="info" /><span>{state.error}</span></div>}
        {state?.picks && (
          <div className="stack">
            <p>{state.summary}</p>
            {state.picks.map((pk) => (
              <article key={pk.dish} className={`card meal-card verdict-${pk.verdict}`}>
                <div className="spread"><span className="slot-tag" style={{ color: 'var(--slot-color)' }}>{VERDICT[pk.verdict]}</span><span className="badge num">~{pk.est_kcal} kcal</span></div>
                <h3>{pk.dish}</h3><p className="tiny muted">{pk.reason}</p>
                <p className="tiny"><b>Order it like this:</b> {pk.tweak}</p>
                <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }}
                  onClick={() => { addMeal({ name: pk.dish, kcal: pk.est_kcal, protein: 0, source: 'Menu Scanner' }); showLogged({ name: pk.dish, kcal: pk.est_kcal }); }}>
                  <Icon name="plus" /> I ordered this</button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
