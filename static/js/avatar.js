// Virtual body: 3D mannequin (Three.js) whose shape is generated from BMI.

export function fullness(bmi) {
  return Math.min(1, Math.max(0, (bmi - 16) / (38 - 16)));
}

// Mount a 3D body. Shows a soft placeholder while Three.js loads; calls to
// update() before it is ready are remembered and applied on load.
export function mountAvatar(el, opts) {
  el.classList.add('avatar-host');
  el.innerHTML = '<div class="avatar avatar-loading" role="img" aria-label="Loading 3D body"><span></span></div>';
  let latest = { ...opts };
  let impl = null;

  import('./avatar3d.js')
    .then((m) => {
      if (!m.webglAvailable()) throw new Error('WebGL not supported');
      return m.mount3D(el, latest);
    })
    .then((impl3d) => {
      if (!el.isConnected) { impl3d.destroy(); return; }
      impl = impl3d;
      impl.update(latest, { animate: false });
      el.dataset.mode = '3d';
    })
    .catch((err) => {
      console.warn('3D body unavailable', err);
      el.innerHTML = '<div class="avatar avatar-loading is-error"><p>3D preview needs WebGL and an internet connection.</p></div>';
    });

  return {
    update(next, options) {
      latest = { ...latest, ...next };
      impl?.update(next, options);
    },
  };
}
