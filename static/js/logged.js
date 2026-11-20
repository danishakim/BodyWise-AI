// "Meal logged" success screen (Figma screen 10): a full-screen pink moment after logging.
import { todayTotals, targetFor } from './store.js';
import { html, mount, icon, fmt } from './ui.js';

const TIPS = [
  [/teh tarik|milo|kopi|teh\b/i, 'Next time order it “kurang manis”. It saves about 60 kcal a cup.'],
  [/roti canai|roti telur/i, 'Thosai is a lighter mamak pick, about 130 kcal less than roti canai.'],
  [/goreng/i, 'Choose bakar or rebus instead of goreng to save 100–200 kcal.'],
  [/laksa|mee|bihun|kuey teow/i, 'Ask for “kuah sikit” (less gravy) to cut calories and salt.'],
  [/nasi/i, 'Ask for “nasi separuh” (half rice) to save about 150 kcal.'],
];
const DEFAULT_TIP = 'Drink a glass of water with every meal. It helps you feel full.';

export function showLogged(ctx, meal) {
  document.querySelector('.logged')?.remove();
  const t = todayTotals();
  const left = targetFor().kcal - t.kcal;
  const tip = (TIPS.find(([re]) => re.test(meal.name)) || [null, DEFAULT_TIP])[1];
  const title = meal.slot ? `${meal.slot} is logged 🎉` : 'Meal logged 🎉';

  const el = document.createElement('div');
  el.className = 'logged';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  mount(el, html`<div class="logged-inner">
    <div class="check">${icon.check}</div>
    <h1>${title}</h1>
    <p class="sub">${meal.name} · ${fmt.kcal(meal.kcal)} kcal. ${left >= 0 ? `You have ${fmt.kcal(left)} kcal left today.` : `You're ${fmt.kcal(-left)} kcal over today's target.`}</p>
    <div class="glass-stats">
      <div><b class="num">${fmt.kcal(t.kcal)}</b><span>eaten</span></div>
      <div><b class="num">${t.protein} g</b><span>protein</span></div>
      <div><b class="num">${fmt.kcal(Math.max(0, left))}</b><span>kcal left</span></div>
    </div>
    <div class="glass-tip"><span aria-hidden="true">💡</span><span>${tip}</span></div>
    <div class="actions">
      <button class="btn btn-white btn-lg btn-block" id="lg-home">Back to today</button>
      <button class="btn btn-ghost btn-block" id="lg-more">Log another meal</button>
    </div></div>`);
  document.body.append(el);

  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.querySelector('#lg-home').addEventListener('click', () => { close(); ctx.navigate('home'); });
  el.querySelector('#lg-more').addEventListener('click', close);
  el.querySelector('#lg-home').focus();
}
