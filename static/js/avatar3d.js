// 3D virtual body (Three.js). A smooth mannequin in an A-pose whose shape is
// generated from BMI: torso, limbs and face proportions are lofted from
// elliptical cross-sections, so there are no external model files.
import { fullness } from './avatar.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
let THREE = null;

export async function loadThree() {
  THREE ||= await import(THREE_URL);
  return THREE;
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

// ---------- geometry helpers ----------
const catmull = (p0, p1, p2, p3, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};

// Resample sparse control rings {y, a, bf, bb} into a smooth dense profile.
// a = half-width, bf = front depth, bb = back depth.
function sample(ctrl, n) {
  const out = [];
  const y0 = ctrl[0].y, y1 = ctrl[ctrl.length - 1].y;
  const P = (j) => ctrl[Math.max(0, Math.min(ctrl.length - 1, j))];
  for (let k = 0; k < n; k++) {
    const y = y0 + ((y1 - y0) * k) / (n - 1);
    let i = 0;
    while (i < ctrl.length - 2 && y > ctrl[i + 1].y) i++;
    const t = Math.min(1, Math.max(0, (y - ctrl[i].y) / (ctrl[i + 1].y - ctrl[i].y)));
    const v = (key) => Math.max(0.002, catmull(P(i - 1)[key], P(i)[key], P(i + 1)[key], P(i + 2)[key], t));
    out.push({ y, a: v('a'), bf: v('bf'), bb: v('bb') });
  }
  return out;
}

const round = (pts) => pts.map(([y, r, depth = 0.95]) => ({ y, a: r, bf: r * depth, bb: r }));

function loft(rings, S = 44) {
  const pos = [];
  const idx = [];
  for (const r of rings) {
    for (let j = 0; j < S; j++) {
      const th = (j / S) * Math.PI * 2;
      const s = Math.sin(th);
      pos.push(r.a * Math.cos(th), r.y, (s >= 0 ? r.bf : r.bb) * s);
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < S; j++) {
      const a = k * S + j, b = k * S + ((j + 1) % S), c = (k + 1) * S + j, d = (k + 1) * S + ((j + 1) % S);
      idx.push(a, c, b, b, c, d);
    }
  }
  const last = rings.length - 1;
  const bot = pos.length / 3;
  pos.push(0, rings[0].y, 0, 0, rings[last].y, 0);
  for (let j = 0; j < S; j++) {
    idx.push(bot, (j + 1) % S, j);
    idx.push(bot + 1, last * S + j, last * S + ((j + 1) % S));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let sphereGeo = null;
function blob(material, [x, y, z], [sx, sy, sz]) {
  sphereGeo ||= new THREE.SphereGeometry(1, 40, 28);
  const m = new THREE.Mesh(sphereGeo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.userData.shared = true;
  return m;
}

// ---------- body ----------
export function buildBody(bmi, sex, material) {
  const f = fullness(bmi);
  const fem = sex === 'female';
  const g = new THREE.Group();

  const sh = (fem ? 0.172 : 0.198) + f * 0.04;    // shoulder half-width
  const ch = (fem ? 0.15 : 0.168) + f * 0.075;    // chest
  const wa = (fem ? 0.118 : 0.135) + f * 0.125;   // waist
  const hp = (fem ? 0.178 : 0.162) + f * 0.085;   // hips
  const nk = 0.05 + f * 0.018;                    // neck
  const bust = fem ? 0.032 + f * 0.03 : f * 0.015;
  const belly = f * 0.095;
  const glute = fem ? 0.1 : 0.04;

  const torso = sample([
    { y: 0.75, a: 0.02, bf: 0.02, bb: 0.02 },              // rounded crotch, no flat cap
    { y: 0.79, a: hp * 0.55, bf: hp * 0.4, bb: hp * 0.45 },
    { y: 0.82, a: hp * 0.8, bf: hp * 0.5, bb: hp * 0.58 },
    { y: 0.87, a: hp * 0.97, bf: hp * 0.6, bb: hp * (0.68 + glute) },
    { y: 0.94, a: hp, bf: hp * 0.6 + belly * 0.4, bb: hp * (0.62 + glute * 0.6) },
    { y: 1.02, a: (hp + wa) / 2, bf: wa * 0.62 + belly, bb: wa * 0.6 },
    { y: 1.10, a: wa, bf: wa * 0.6 + belly * 0.9, bb: wa * 0.56 },
    { y: 1.20, a: (wa + ch) / 2, bf: ch * 0.55 + bust * 0.4 + belly * 0.3, bb: ch * 0.55 },
    { y: 1.28, a: ch, bf: ch * 0.56 + bust, bb: ch * 0.56 },
    { y: 1.36, a: sh * 0.93, bf: ch * 0.5 + bust * 0.3, bb: ch * 0.52 },
    { y: 1.43, a: sh * 0.8, bf: 0.08 + f * 0.02, bb: 0.085 + f * 0.02 },
    { y: 1.47, a: nk * 1.6, bf: nk * 1.1, bb: nk * 1.2 },
    { y: 1.53, a: nk, bf: nk, bb: nk },
    { y: 1.60, a: nk * 0.95, bf: nk * 0.95, bb: nk * 0.95 },
  ], 64);
  g.add(new THREE.Mesh(loft(torso), material));

  // Head: smooth egg-shaped skull with a soft chin (mannequin style).
  const hs = 1 + f * 0.06;
  g.add(blob(material, [0, 1.672, 0.004], [0.084 * hs * (1 + f * 0.06), 0.114, 0.1]));

  // Legs (tapered tops tuck inside the hips)
  const legX = (fem ? 0.088 : 0.09) + f * 0.03;
  const thigh = 0.082 + f * 0.05;
  const leg = sample(round([
    [0.0, 0.032 + f * 0.005], [0.1, 0.04 + f * 0.012], [0.25, 0.054 + f * 0.024], [0.42, 0.045 + f * 0.018],
    [0.6, 0.068 + f * 0.04], [0.76, thigh], [0.84, thigh * 0.86], [0.9, 0.02],
  ]), 48);
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(loft(leg, 36), material);
    m.position.set(side * legX, 0.07, 0);
    m.rotation.z = side * -0.02;
    g.add(m);
    g.add(blob(material, [side * (legX + 0.004), 0.04, 0.045], [0.045, 0.04, 0.115]));
  }

  // Arms in an A-pose; they open wider as the torso gets fuller.
  const arm = sample(round([
    [-0.64, 0.024 + f * 0.005], [-0.52, 0.034 + f * 0.012], [-0.4, 0.036 + f * 0.014], [-0.33, 0.032 + f * 0.012],
    [-0.18, 0.042 + f * 0.026], [-0.04, 0.05 + f * 0.026], [0.02, 0.04 + f * 0.018], [0.06, 0.012],
  ]), 40);
  const delt = 0.056 + f * 0.022; // rounded shoulder joint
  const angle = 0.2 + f * 0.22;
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (sh - 0.04), 1.385, -0.005);
    pivot.rotation.z = side * angle;
    pivot.add(new THREE.Mesh(loft(arm, 32), material));
    pivot.add(blob(material, [0, -0.035, 0], [delt * 0.95, delt * 1.25, delt * 0.92]));
    pivot.add(blob(material, [0, -0.71, 0.005], [0.03 * (1 + f * 0.15), 0.078, 0.048]));
    g.add(pivot);
  }
  return g;
}

function disposeGroup(group) {
  group.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); });
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- mount ----------
export async function mount3D(el, opts) {
  await loadThree();
  let current = { ...opts };
  let shownBmi = current.bmi;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'avatar avatar-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', opts.label || '3D virtual body. Drag to rotate.');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(27, 1 / 1.85, 0.1, 30);
  camera.position.set(0, 0.95, 4.5);
  camera.lookAt(0, 0.89, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x29433e, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 3, 3);
  const fill = new THREE.DirectionalLight(0xdfe9ff, 0.7);
  fill.position.set(-2.5, 1.2, 2);
  const rim = new THREE.DirectionalLight(0xffd9a0, 1.6);
  rim.position.set(0, 2.2, -3);
  scene.add(key, fill, rim);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.5),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);

  const skin = new THREE.MeshStandardMaterial({ color: 0xe7e7ea, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  // Goal body: a hologram-style Fresnel glow. Surfaces facing the camera are
  // almost invisible and silhouette edges glow, so the goal shape reads as an
  // outline over both the body and the background.
  const ghostMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xffb547) } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color; varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = 0.015 + pow(rim, 2.6) * 0.9;
        gl_FragColor = vec4(color, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });

  const rig = new THREE.Group();
  scene.add(rig);
  let body = null;
  let ghost = null;
  let ghostKey = null;

  function rebuild(bmi) {
    if (body) { rig.remove(body); disposeGroup(body); }
    body = buildBody(bmi, current.sex, skin);
    rig.add(body);
    const gk = current.ghostBmi != null && Math.abs(current.ghostBmi - bmi) > 0.3 ? `${current.ghostBmi}|${current.sex}` : null;
    if (gk !== ghostKey) {
      if (ghost) { rig.remove(ghost); disposeGroup(ghost); ghost = null; }
      if (gk) {
        ghost = buildBody(current.ghostBmi, current.sex, ghostMat);
        ghost.traverse((o) => { o.renderOrder = 2; });
        rig.add(ghost);
      }
      ghostKey = gk;
    }
  }
  rebuild(shownBmi);

  el.replaceChildren(canvas);

  const resize = () => {
    const w = Math.max(60, el.clientWidth);
    renderer.setSize(w, w * 1.85, false);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  // Drag to rotate; gentle idle sway shows off the 3D shape.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let yaw = 0, dragging = false, lastX = 0, idleSince = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  const endDrag = () => { dragging = false; idleSince = performance.now(); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  let visible = true;
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  io.observe(canvas);

  let tween = null;
  let raf = 0;
  let destroyed = false;
  const t0 = performance.now();

  function frame(now) {
    if (destroyed) return;
    if (!canvas.isConnected) { destroy(); return; }
    raf = requestAnimationFrame(frame);
    if (tween) {
      const t = Math.min(1, (now - tween.start) / 650);
      shownBmi = tween.from + (tween.to - tween.from) * (1 - Math.pow(1 - t, 3));
      rebuild(shownBmi);
      if (t >= 1) tween = null;
    }
    if (!visible) return;
    if (!dragging && !reduce && now - idleSince > 2500) {
      const target = Math.sin((now - t0) / 2200) * 0.55;
      yaw += (target - yaw) * 0.02;
    }
    rig.rotation.y = yaw;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    if (body) disposeGroup(body);
    if (ghost) disposeGroup(ghost);
    skin.dispose();
    ghostMat.dispose();
    shadow.geometry.dispose();
    shadow.material.map.dispose();
    shadow.material.dispose();
    renderer.dispose();
  }

  return {
    update(next, { animate = true } = {}) {
      const sexChanged = next.sex && next.sex !== current.sex;
      current = { ...current, ...next };
      if (sexChanged) ghostKey = null;
      if (!animate || reduce || Math.abs(current.bmi - shownBmi) < 0.05) {
        tween = null;
        shownBmi = current.bmi;
        rebuild(shownBmi);
      } else {
        tween = { from: shownBmi, to: current.bmi, start: performance.now() };
      }
    },
    destroy,
  };
}
