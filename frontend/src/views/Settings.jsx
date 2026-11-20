// Settings (Figma 13): change how the app works, quickly and safely.
// Grouped by frequency of use; toggles apply instantly; the destructive action is isolated.
import { useEffect, useState } from 'react';
import { store, useStore, seedDemoData, exportData, applyTheme } from '../lib/store.js';
import { fmt } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../components/AppContext.js';
import { syncEnabled, useSyncStatus, loadSync } from '../lib/syncState.js';
import { isNative } from '../lib/native.js';

const SYNC_LABEL = { connecting: 'Connecting…', saving: 'Saving…', synced: 'Synced', offline: 'Offline', error: 'Not synced' };

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function Toggle({ id, title, sub, icon, checked, onChange }) {
  return (
    <label className="lrow" htmlFor={id}>
      <span className="ic"><Icon name={icon} /></span>
      <span className="tx"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <input type="checkbox" className="toggle" id={id} role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function Settings() {
  const s = useStore();
  const { toast, navigate, refreshMetrics, installPrompt } = useApp();
  const m = s.metrics;
  const [prefsChanged, setPrefsChanged] = useState(false);
  const sync = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const cloud = async (action, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try { await (await loadSync())[action](); }
    catch (err) { toast(/manual linking|disabled|not enabled|provider/i.test(err.message) ? 'Google sign-in isn’t switched on for this app yet.' : err.message, 'error'); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (!m && s.profile) refreshMetrics(); }, [m, s.profile, refreshMetrics]);

  const setPref = (key, val) => { store.set({ prefs: { ...store.get().prefs, [key]: val } }); setPrefsChanged(true); };
  const setTheme = (t) => { store.set({ theme: t }); applyTheme(t); };
  const install = async () => {
    const ev = installPrompt.current;
    if (ev) { ev.prompt(); await ev.userChoice; installPrompt.current = null; return; }
    toast(isIOS() ? 'In Safari tap Share, then “Add to Home Screen”.' : 'Use your browser menu → “Install app” or “Add to Home screen”.');
  };
  const wipe = () => {
    if (!confirm(`Delete your profile, plan, logs and chat${syncEnabled ? ' from this device and the cloud' : ' from this device'}? This cannot be undone.`)) return;
    store.wipe();
    applyTheme('light');
    toast(syncEnabled ? 'Your data was deleted' : 'Your data was removed from this device');
    navigate('welcome');
  };

  return (
    <div className="list-wrap">
      <a href="#/profile" className="back-link"><Icon name="back" /> Profile</a>
      <h1 style={{ marginTop: 6 }}>Settings</h1>

      <div className="group-label">Goals &amp; plan</div>
      <div className="group">
        <a className="lrow" href="#/edit"><span className="ic"><Icon name="target" /></span>
          <span className="tx"><b>Weight goal</b><small>{m ? `${m.weekly_change_kg > 0 ? '+' : ''}${m.weekly_change_kg} kg per week` : ''}</small></span>
          <span className="val">{m?.target_kg ? `${fmt.kg(m.target_kg)} kg` : 'Maintain'}</span><Icon name="chevron" className="chev" /></a>
        <div className="lrow static"><span className="ic"><Icon name="flame" /></span>
          <span className="tx"><b>Daily calorie target</b><small>Auto-calculated for you</small></span>
          <span className="val num">{m ? `${fmt.kcal(m.daily_kcal)} kcal` : '—'}</span></div>
        <button className="lrow" onClick={() => { store.set({ plan: null }); navigate('plan'); }}><span className="ic"><Icon name="refresh" /></span>
          <span className="tx"><b>Regenerate meal plan</b><small>Apply your latest preferences</small></span><Icon name="chevron" className="chev" /></button>
      </div>
      <p className="footnote">Targets use the Mifflin-St Jeor formula and never go below the safe minimum.</p>

      <div className="group-label">Food preferences</div>
      <div className="group">
        <Toggle id="p-halal" title="Halal only" icon="check" checked={s.prefs.halal} onChange={(v) => setPref('halal', v)} />
        <Toggle id="p-veg" title="Vegetarian" icon="leaf" checked={s.prefs.vegetarian} onChange={(v) => setPref('vegetarian', v)} />
        <Toggle id="p-puasa" title="Puasa mode" sub="Sahur, Iftar & Moreh plan" icon="moon" checked={s.prefs.puasa} onChange={(v) => setPref('puasa', v)} />
        <label className="lrow" htmlFor="p-budget"><span className="ic"><Icon name="wallet" /></span>
          <span className="tx"><b>Daily food budget</b><small>RM{s.prefs.budget_rm} per day</small></span>
          <input type="range" id="p-budget" min="10" max="80" step="1" value={s.prefs.budget_rm} aria-label="Daily budget in ringgit"
            onChange={(e) => setPref('budget_rm', Number(e.target.value))} /></label>
      </div>
      <p className="footnote" style={{ color: prefsChanged ? 'var(--primary)' : undefined }}>Changes apply the next time you regenerate your plan.</p>

      <div className="group-label">Appearance</div>
      <div className="group"><div className="lrow static"><span className="ic"><Icon name="moon" /></span><span className="tx"><b>Theme</b></span>
        <div className="seg" role="group" aria-label="Theme">
          {['light', 'dark'].map((t) => <button key={t} aria-pressed={s.theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
        </div></div></div>

      {!isNative && (<>
      <div className="group-label">App</div>
      <div className="group">
        {isStandalone() ? (
          <div className="lrow static"><span className="ic"><Icon name="phone" /></span>
            <span className="tx"><b>Installed</b><small>BodyWise is on your home screen and works offline</small></span><Icon name="check" /></div>
        ) : (
          <button className="lrow" onClick={install}><span className="ic"><Icon name="phone" /></span>
            <span className="tx"><b>Install BodyWise</b><small>{isIOS() ? 'In Safari: Share → Add to Home Screen' : 'Add to your home screen, opens like an app'}</small></span>
            <Icon name="chevron" className="chev" /></button>
        )}
      </div>
      </>)}

      {syncEnabled && (<>
        <div className="group-label">Cloud backup</div>
        <div className="group">
          <div className="lrow static"><span className="ic"><Icon name="cloud" /></span>
            <span className="tx"><b>{sync.google ? 'Backed up with Google' : 'Saved to the cloud'}</b>
              <small>{sync.google ? sync.email : isNative ? 'No login needed. Saved privately to your cloud space.' : 'No login needed. Link Google to use BodyWise on another phone.'}</small></span>
            <span className={`val ${sync.state === 'error' || sync.state === 'offline' ? 'warn' : ''}`} title={sync.error || undefined}>{SYNC_LABEL[sync.state] || ''}</span></div>
          {isNative ? null : sync.google ? (
            <button className="lrow" disabled={busy} onClick={() => cloud('signOut', 'Sign out of Google on this device? Your data stays safe in your account.').then(() => navigate('welcome'))}>
              <span className="ic"><Icon name="logout" /></span><span className="tx"><b>Sign out</b><small>This phone starts fresh; sign in again any time</small></span></button>
          ) : (<>
            <button className="lrow" disabled={busy} onClick={() => cloud('linkGoogle')}>
              <span className="ic"><Icon name="shield" /></span><span className="tx"><b>Back up with Google</b><small>Keeps everything you have now</small></span><Icon name="chevron" className="chev" /></button>
            <button className="lrow" disabled={busy} onClick={() => cloud('signInWithGoogle', 'Switch to the BodyWise data saved in your Google account? What’s on this phone now will be replaced.')}>
              <span className="ic"><Icon name="user" /></span><span className="tx"><b>Sign in with Google</b><small>Already backed up on another device</small></span><Icon name="chevron" className="chev" /></button>
          </>)}
        </div>
      </>)}

      <div className="group-label">Privacy &amp; data</div>
      <div className="group">
        <div className="lrow static"><span className="ic"><Icon name="shield" /></span>
          <span className="tx"><b>Your data stays private</b><small>{syncEnabled ? 'Only you can read your cloud copy. Food photos are analysed, never saved.' : 'Stored on this device. Food photos are analysed, never saved.'}</small></span></div>
        <button className="lrow" onClick={exportData}><span className="ic"><Icon name="download" /></span>
          <span className="tx"><b>Export my data</b><small>Download as JSON (unencrypted, so keep it safe)</small></span><Icon name="chevron" className="chev" /></button>
        <button className="lrow" onClick={async () => { seedDemoData(); await refreshMetrics(); toast('Sample progress loaded'); navigate('progress'); }}>
          <span className="ic"><Icon name="chart" /></span><span className="tx"><b>Load sample progress</b><small>8 weeks of demo weigh-ins</small></span><Icon name="chevron" className="chev" /></button>
      </div>

      <div className="group-label">About</div>
      <div className="group">
        <details className="lrow" style={{ display: 'block' }}>
          <summary className="row" style={{ cursor: 'pointer', listStyle: 'none', gap: 12 }}>
            <span className="ic"><Icon name="info" /></span><span className="tx"><b>Responsible AI &amp; disclaimer</b><small>Not medical advice</small></span></summary>
          <ul className="tiny muted stack" style={{ gap: 6, padding: '10px 0 4px 18px', margin: 0 }}>
            <li>Calorie targets come from formulas, not the AI. The AI only writes meals around them, and the server re-checks every total.</li>
            <li>Guardrails: no weight-loss plans when underweight, calorie floors of 1200/1500 kcal, at most 0.5 kg/week loss, warnings for under-18s.</li>
            <li>BMI uses Malaysian (Asian) cut-offs. The 3D body is a stylised estimate, not a body scan.</li>
            <li>BodyWise is a student prototype (SDT2143 Mini AI Hackathon). Please consult a doctor or dietitian for medical conditions.</li>
          </ul>
        </details>
      </div>

      <div className="group-label">Danger zone</div>
      <div className="group"><button className="lrow danger" onClick={wipe}><span className="ic"><Icon name="trash" /></span>
        <span className="tx"><b>{syncEnabled ? 'Delete my data' : 'Delete my data on this device'}</b><small>Removes profile, plan, logs and chat</small></span></button></div>
      <p className="footnote" style={{ textAlign: 'center', margin: '24px 0 8px' }}>BodyWise AI · v2.1</p>
    </div>
  );
}
