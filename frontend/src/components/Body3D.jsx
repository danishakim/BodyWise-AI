// 3D virtual body: a Three.js mannequin generated from BMI, with an optional
// glowing outline of the goal body. Three.js is lazy-loaded on first use.
//
// Three.js owns the inner <div ref={canvasHost}> completely (React renders no
// children into it), so React and the WebGL canvas never fight over the DOM.
import { useEffect, useRef, useState } from 'react';

export default function Body3D({ bmi, sex, ghostBmi = null, instant = false, label = 'Your 3D body', className = '' }) {
  const canvasHost = useRef(null);
  const impl = useRef(null);
  const latest = useRef({ bmi, sex, ghostBmi, label });
  latest.current = { bmi, sex, ghostBmi, label };
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let cancelled = false;
    import('../lib/avatar3d.js')
      .then(async (m) => {
        if (!m.webglAvailable()) throw new Error('WebGL not supported');
        const created = await m.mount3D(canvasHost.current, latest.current);
        if (cancelled) { created.destroy(); return; }
        impl.current = created;
        created.update(latest.current, { animate: false });
        setStatus('ready');
      })
      .catch((err) => { console.warn('3D body unavailable', err); if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; impl.current?.destroy(); impl.current = null; };
  }, []);

  useEffect(() => { impl.current?.update({ bmi, sex, ghostBmi }, { animate: !instant }); }, [bmi, sex, ghostBmi, instant]);

  return (
    <div className={`avatar-host ${className}`} data-mode={status === 'ready' ? '3d' : undefined}>
      <div ref={canvasHost} className="body3d-canvas" hidden={status !== 'ready'} />
      {status === 'loading' && <div className="avatar avatar-loading" role="img" aria-label="Loading 3D body"><span /></div>}
      {status === 'error' && <div className="avatar avatar-loading is-error"><p>3D preview needs WebGL and an internet connection.</p></div>}
    </div>
  );
}
