// "Meal logged" success screen (Figma screen 10): a full-screen pink moment after logging.
import { useEffect, useRef } from 'react';
import { useStore, todayTotals, targetFor } from '../lib/store.js';
import { fmt } from '../lib/format.js';
import { Icon } from '../lib/icons.jsx';

const TIPS = [
  [/teh tarik|milo|kopi|teh\b/i, 'Next time order it “kurang manis”. It saves about 60 kcal a cup.'],
  [/roti canai|roti telur/i, 'Thosai is a lighter mamak pick, about 130 kcal less than roti canai.'],
  [/goreng/i, 'Choose bakar or rebus instead of goreng to save 100–200 kcal.'],
  [/laksa|mee|bihun|kuey teow/i, 'Ask for “kuah sikit” (less gravy) to cut calories and salt.'],
  [/nasi/i, 'Ask for “nasi separuh” (half rice) to save about 150 kcal.'],
];
const DEFAULT_TIP = 'Drink a glass of water with every meal. It helps you feel full.';

export default function Logged({ meal, onClose, onHome }) {
  const s = useStore();
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = todayTotals(s);
  const left = targetFor(undefined, s).kcal - t.kcal;
  const tip = (TIPS.find(([re]) => re.test(meal.name)) || [null, DEFAULT_TIP])[1];
  const title = meal.slot ? `${meal.slot} is logged 🎉` : 'Meal logged 🎉';

  return (
    <div className="logged" role="dialog" aria-modal="true" aria-label={title}>
      <div className="logged-inner">
        <div className="check"><Icon name="check" /></div>
        <h1>{title}</h1>
        <p className="sub">
          {meal.name} · {fmt.kcal(meal.kcal)} kcal.{' '}
          {left >= 0 ? `You have ${fmt.kcal(left)} kcal left today.` : `You're ${fmt.kcal(-left)} kcal over today's target.`}
        </p>
        <div className="glass-stats">
          <div><b className="num">{fmt.kcal(t.kcal)}</b><span>eaten</span></div>
          <div><b className="num">{t.protein} g</b><span>protein</span></div>
          <div><b className="num">{fmt.kcal(Math.max(0, left))}</b><span>kcal left</span></div>
        </div>
        <div className="glass-tip"><span aria-hidden="true">💡</span><span>{tip}</span></div>
        <div className="actions">
          <button ref={first} className="btn btn-white btn-lg btn-block" onClick={onHome}>Back to today</button>
          <button className="btn btn-ghost btn-block" onClick={onClose}>Log another meal</button>
        </div>
      </div>
    </div>
  );
}
