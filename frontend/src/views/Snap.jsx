// Snap: food photos → Teachable Machine only (runs on the device, photos never leave the phone).
// Some foods look alike in a photo (a latte vs teh tarik), so after every photo the user picks the exact food
// from the model's answer plus its lookalikes (LOOKALIKES in bodywise/foods.py).
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore, addMeal, removeMeal, mealsOn, todayTotals, targetFor } from '../lib/store.js';
import { fmt, resizeImage } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';

const TM_MIN_CONFIDENCE = 0.6;
const PICKS_KEY = 'bodywise:tm-picks';    // { modelClass: foodId } the user last chose for that class
let foodsCache = null;                    // /api/foods response: { foods, tm_classes, lookalikes }
let tmModel = null;

async function loadTM(url) {
  if (tmModel) return tmModel;
  const tmImage = await import('@teachablemachine/image');      // TensorFlow.js + TM bundled, lazy chunk
  const base = url.endsWith('/') ? url : `${url}/`;
  tmModel = await tmImage.load(`${base}model.json`, `${base}metadata.json`);
  return tmModel;
}

async function getFoods() {
  if (!foodsCache) foodsCache = await api.foods();
  return foodsCache;
}

function useFoods() {
  const [data, setData] = useState(foodsCache);
  useEffect(() => { if (!data) getFoods().then(setData).catch(() => {}); }, [data]);
  return data;
}

const readPicks = () => { try { return JSON.parse(localStorage.getItem(PICKS_KEY)) || {}; } catch { return {}; } };
function rememberPick(cls, foodId) {
  try { localStorage.setItem(PICKS_KEY, JSON.stringify({ ...readPicks(), [cls]: foodId })); } catch { /* private mode */ }
}

// Turn the model's predictions into the choices shown under "Which one are you having?".
function choicesFor(preds, data) {
  const byId = Object.fromEntries(data.foods.map((f) => [f.id, f]));
  const known = preds.filter((p) => byId[p.className]);
  const top = preds[0];
  const sure = !!top && known[0] === top && top.probability >= TM_MIN_CONFIDENCE;
  const guesses = sure ? [top] : known.filter((p) => p.probability >= 0.1).slice(0, 3);
  const ids = guesses.map((g) => g.className);
  if (guesses[0]) ids.push(...(data.lookalikes?.[guesses[0].className] || []));
  const options = [...new Set(ids)].map((id) => byId[id]).filter(Boolean).slice(0, 7);
  // Confident: preselect the model's answer, or what this user picked last time for it (e.g. their usual latte).
  const usual = sure ? byId[readPicks()[top.className]] : null;
  const selected = sure ? (usual && options.includes(usual) ? usual : byId[top.className]) : null;
  return { kind: 'pick', sure, cls: guesses[0]?.className || null, options, selected };
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
  return (
    <>
      <header className="page-head"><div><h1>Snap <em>&amp;</em> Scan</h1></div></header>
      <FoodMode />
    </>
  );
}

// ---------------- Food photo (Teachable Machine) ----------------
function FoodMode() {
  const { status, toast, showLogged } = useApp();
  const data = useFoods();
  const photo = usePhoto();
  const search = useRef(null);
  const [result, setResult] = useState(null);   // { kind: 'busy' | 'info' | 'pick', ... }
  const [query, setQuery] = useState('');

  const recognise = async (file) => {
    let p;
    try { p = await photo.prepare(file); } catch (e) { toast(e.message, 'error'); return; }
    if (!status.tm_model_url) { setResult({ kind: 'info', text: "The food recognition model isn't set up yet. Search for your food instead." }); return; }
    setResult({ kind: 'busy' }); photo.setScanning(true);
    try {
      const [model, foods] = await Promise.all([loadTM(status.tm_model_url), getFoods()]);
      const preds = (await model.predict(p.img)).sort((a, b) => b.probability - a.probability);
      setResult(choicesFor(preds, foods));
    } catch (e) {
      console.warn('Teachable Machine failed', e);
      setResult({ kind: 'info', text: "Couldn't load the food model. Check your internet connection, or search for your food instead." });
    } finally { photo.setScanning(false); }
  };

  const somethingElse = () => {
    setResult(null);
    search.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    search.current?.focus({ preventScroll: true });
  };

  const add = (f, servings) => {
    if (result?.cls) rememberPick(result.cls, f.id);
    addMeal({ name: servings === 1 ? f.name : `${f.name} ×${servings}`, kcal: f.kcal * servings, protein: f.protein * servings, source: 'Food photo' });
    setResult(null);
    showLogged({ name: f.name, kcal: f.kcal * servings });
  };

  const foods = data?.foods || [];
  const shown = foods.filter((f) => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 40);
  const knows = (data?.tm_classes || []).map((id) => id.replace(/_/g, ' ')).join(', ');
  const pick = result?.kind === 'pick' ? result : null;

  return (
    <div className="grid grid-2">
      <div className="stack">
        <Dropzone id="food" title="Take or upload a photo of your meal" sub="Our Teachable Machine model recognises the dish"
          preview={photo.preview} scanning={photo.scanning} onFile={recognise} />
        <p className="tiny muted">Recognised on your device. Photos are never uploaded or stored.{knows && ` Works best on ${knows}.`}</p>
        {result?.kind === 'busy' && <div className="card thinking"><div className="thinking-dots"><i /><i /><i /></div><p className="muted">Recognising your food…</p></div>}
        {result?.kind === 'info' && <div className="alert"><Icon name="info" /><span>{result.text}</span></div>}
        {pick && (
          <section className="card result-card stack" style={{ gap: 10 }}>
            <b>{pick.options.length ? 'Which one are you having?' : 'Not sure what this is'}</b>
            <p className="tiny muted">{!pick.options.length ? "This food isn't in our model yet. Search for it instead."
              : pick.sure ? 'Some foods look alike in photos, like latte and teh tarik. Tap the right one.'
              : 'Not sure about this photo. Is it one of these?'}</p>
            <div className="chips" role="group" aria-label="Choose your food">
              {pick.options.map((f) => (
                <button key={f.id} className="chip" aria-pressed={pick.selected?.id === f.id}
                  onClick={() => setResult({ ...pick, selected: f })}>{f.name}</button>
              ))}
              <button className="chip" onClick={somethingElse}><Icon name="search" /> Something else</button>
            </div>
          </section>
        )}
        {pick?.selected && <FoodResult key={pick.selected.id} food={pick.selected} onAdd={(servings) => add(pick.selected, servings)} />}
      </div>
      <div className="stack">
        <section className="card">
          <div className="card-title"><Icon name="plus" /> Add manually</div>
          <input ref={search} className="input" placeholder="Search: nasi lemak, latte, teh tarik…" aria-label="Search foods" value={query} onChange={(e) => setQuery(e.target.value)} />
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
