// iOS-style scroll-snap wheel picker. Keyboard: ↑/↓ change the value.
import { useEffect, useRef } from 'react';

const ITEM_H = 44;
const nearest = (arr, v) => arr.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(arr[bi] - v) ? i : bi), 0);

export default function Wheel({ label, values, value, format = String, onChange }) {
  const el = useRef(null);
  const idx = nearest(values, value);
  const cur = useRef(idx);

  // Position once on mount (and when the list itself changes, e.g. metric ↔ imperial).
  useEffect(() => {
    cur.current = nearest(values, value);
    if (el.current) el.current.scrollTop = cur.current * ITEM_H;
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const i = Math.min(values.length - 1, Math.max(0, Math.round(el.current.scrollTop / ITEM_H)));
    if (i !== cur.current) { cur.current = i; onChange(values[i]); }
  };
  const goTo = (i) => el.current.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
  const onKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    goTo(Math.min(values.length - 1, Math.max(0, cur.current + (e.key === 'ArrowDown' ? 1 : -1))));
  };

  return (
    <div className="wheel-col">
      <span className="eyebrow">{label}</span>
      <div className="wheel-wrap">
        <span className="wheel-band" />
        <div ref={el} className="wheel" tabIndex={0} role="spinbutton" aria-label={label} aria-valuetext={format(values[idx])}
          onScroll={onScroll} onKeyDown={onKey}>
          <div className="wheel-pad" />
          {values.map((v, i) => (
            <div key={v} className={`wheel-item ${i === idx ? 'on' : ''}`} onClick={() => goTo(i)}>{format(v)}</div>
          ))}
          <div className="wheel-pad" />
        </div>
      </div>
    </div>
  );
}
