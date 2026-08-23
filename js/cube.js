import * as THREE from '../vendor/three.module.min.js';

export async function initCube(slot, opts) {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    return { ok: false, reason: 'webgl2-unavailable' };
  }
  try {
    return buildCube(slot);
  } catch (err) {
    return { ok: false, reason: 'renderer-failed' };
  }
}

function roundedBoxGeometry(size, radius, seg) {
  const g = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const inner = size / 2 - radius;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(
      Math.max(-inner, Math.min(inner, v.x)),
      Math.max(-inner, Math.min(inner, v.y)),
      Math.max(-inner, Math.min(inner, v.z))
    );
    v.sub(c);
    if (v.lengthSq() > 1e-10) v.normalize(); else v.set(0, 0, 1);
    pos.setXYZ(i, c.x + v.x * radius, c.y + v.y * radius, c.z + v.z * radius);
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function stickerGeometry(side, r) {
  const h = side / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ShapeGeometry(s, 6);
}

const CUBE_KEYS_STORE = 'cube-keys';
const DEFAULT_KEYS = {
  face: { r: 'KeyR', l: 'KeyL', u: 'KeyU', d: 'KeyD', f: 'KeyF', b: 'KeyB' },
  orbit: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }
};
const RESERVED_KEYS = new Set(['Escape', 'Tab', 'Enter', 'Space', 'ShiftLeft', 'ShiftRight']);
const KEY_ACTIONS = [
  { id: 'r', label: 'R face' },
  { id: 'l', label: 'L face' },
  { id: 'u', label: 'U face' },
  { id: 'd', label: 'D face' },
  { id: 'f', label: 'F face' },
  { id: 'b', label: 'B face' },
  { id: 'left', label: 'Spin left' },
  { id: 'right', label: 'Spin right' },
  { id: 'up', label: 'Spin up' },
  { id: 'down', label: 'Spin down' }
];
const FACE_TURNS = { r: [0, 1], l: [0, -1], u: [1, 1], d: [1, -1], f: [2, 1], b: [2, -1] };

function defaultKeyBindings() {
  return {
    face: Object.assign({}, DEFAULT_KEYS.face),
    orbit: Object.assign({}, DEFAULT_KEYS.orbit)
  };
}

function loadKeyBindings() {
  const b = defaultKeyBindings();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CUBE_KEYS_STORE) || 'null'); } catch (_) { saved = null; }
  if (!saved || typeof saved !== 'object') return b;
  for (const group of ['face', 'orbit']) {
    const src = saved[group];
    if (!src || typeof src !== 'object') continue;
    for (const id in b[group]) {
      const code = src[id];
      if (typeof code === 'string' && code && !RESERVED_KEYS.has(code)) b[group][id] = code;
    }
  }
  const seen = new Set();
  for (const group of ['face', 'orbit']) {
    for (const id in b[group]) {
      if (seen.has(b[group][id])) return defaultKeyBindings();
      seen.add(b[group][id]);
    }
  }
  return b;
}

function buildCube(slot) {
  const SIZE = slot.clientWidth || 300;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(SIZE, SIZE, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(5.8, 4.6, 7.6);
  camera.lookAt(0, -0.15, 0);

  const amb = new THREE.AmbientLight(0xfff6e9, 1.05);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
  key.position.set(4, 7, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0xf2ecdf, 0.5);
  fill.position.set(-4, 2, -3);
  scene.add(amb, key, fill);

  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.16 });
  shadowMat.color = new THREE.Color(0x26241f);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), shadowMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.82;
  ground.receiveShadow = true;
  scene.add(ground);

  const S = 1;
  const GAP = 0.055;
  const STEP = S + GAP;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.42, metalness: 0.05 });
  const FACE_COLORS = {
    px: 0xb71234,
    nx: 0xff5800,
    py: 0xffffff,
    ny: 0xffd500,
    pz: 0x009b48,
    nz: 0x0046ad
  };
  const faceMats = {};
  for (const k in FACE_COLORS) {
    faceMats[k] = new THREE.MeshStandardMaterial({ color: FACE_COLORS[k], roughness: 0.35, metalness: 0.0 });
  }
  const boxGeo = roundedBoxGeometry(S, 0.085, 4);
  const stGeo = stickerGeometry(S * 0.78, 0.13);
  const FACE_DEFS = [
    { key: 'px', c: 0, v: 1, pos: [S / 2 + 0.011, 0, 0], rot: [0, Math.PI / 2, 0] },
    { key: 'nx', c: 0, v: -1, pos: [-S / 2 - 0.011, 0, 0], rot: [0, -Math.PI / 2, 0] },
    { key: 'py', c: 1, v: 1, pos: [0, S / 2 + 0.011, 0], rot: [-Math.PI / 2, 0, 0] },
    { key: 'ny', c: 1, v: -1, pos: [0, -S / 2 - 0.011, 0], rot: [Math.PI / 2, 0, 0] },
    { key: 'pz', c: 2, v: 1, pos: [0, 0, S / 2 + 0.011], rot: [0, 0, 0] },
    { key: 'nz', c: 2, v: -1, pos: [0, 0, -S / 2 - 0.011], rot: [0, Math.PI, 0] }
  ];

  const cubeRoot = new THREE.Group();
  scene.add(cubeRoot);
  const cubelets = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (x === 0 && y === 0 && z === 0) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo, bodyMat);
    body.castShadow = true;
    g.add(body);
    const coord = [x, y, z];
    for (const f of FACE_DEFS) {
      if (coord[f.c] !== f.v) continue;
      const st = new THREE.Mesh(stGeo, faceMats[f.key]);
      st.position.set(...f.pos);
      st.rotation.set(...f.rot);
      g.add(st);
    }
    g.userData = { isCubelet: true, c: [x, y, z], home: [x, y, z], q: new THREE.Quaternion() };
    g.position.set(x * STEP, y * STEP, z * STEP);
    cubeRoot.add(g);
    cubelets.push(g);
  }
  const pivot = new THREE.Group();
  cubeRoot.add(pivot);

  let raf = null;
  let visible = true;
  const tweens = [];
  let inertia = null;
  let dragging = false;
  let snapBusy = false;
  let orbitBusy = false;

  function animating() { return tweens.length > 0 || inertia !== null || dragging; }
  function requestRender() {
    if (raf === null && visible) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = null;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (tw.t0 === null) tw.t0 = now;
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      if (tw.update) tw.update(tw.ease ? tw.ease(k) : k);
      if (k >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
    }
    if (inertia) {
      applyOrbit(inertia.vx, inertia.vy);
      inertia.vx *= 0.93;
      inertia.vy *= 0.93;
      if (Math.abs(inertia.vx) + Math.abs(inertia.vy) < 0.0006) inertia = null;
    }
    renderer.render(scene, camera);
    if (animating()) requestRender();
  }
  function addTween(dur, ease, update, done, tag) {
    tweens.push({ t0: null, dur, ease, update, done, tag });
    requestRender();
  }
  function flushTweens() {
    while (tweens.length) {
      const tw = tweens.pop();
      if (tw.update) tw.update(1);
      if (tw.done) tw.done();
    }
  }
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeOutBack = (t) => { const k = 1.35; const u = t - 1; return 1 + (k + 1) * u * u * u + k * u * u; };

  const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  function rotCoord(c, axis, k) {
    let [x, y, z] = c;
    const n = ((k % 4) + 4) % 4;
    for (let i = 0; i < n; i++) {
      if (axis === 0) { const t = y; y = -z; z = t; }
      else if (axis === 1) { const t = x; x = z; z = -t; }
      else { const t = x; x = -y; y = t; }
    }
    return [x, y, z];
  }
  function layerOf(axis, v) { return cubelets.filter(c => c.userData.c[axis] === v); }
  function grabLayer(list) {
    pivot.position.set(0, 0, 0);
    pivot.quaternion.identity();
    list.forEach(c => pivot.add(c));
  }
  function bake(list, axis, quarters) {
    const q = new THREE.Quaternion().setFromAxisAngle(AXES[axis], quarters * Math.PI / 2);
    list.forEach(c => {
      cubeRoot.add(c);
      const d = c.userData;
      d.c = rotCoord(d.c, axis, quarters);
      d.q.premultiply(q);
      c.position.set(d.c[0] * STEP, d.c[1] * STEP, d.c[2] * STEP);
      c.quaternion.copy(d.q);
    });
  }
  function resetSolved() {
    cubelets.forEach(c => {
      cubeRoot.add(c);
      const d = c.userData;
      d.c = d.home.slice();
      d.q.identity();
      c.position.set(d.c[0] * STEP, d.c[1] * STEP, d.c[2] * STEP);
      c.quaternion.copy(d.q);
    });
  }

  let turnBusy = null;
  function animateTurn(axis, layerV, quarters, dur, ease, done) {
    const list = layerOf(axis, layerV);
    grabLayer(list);
    const target = quarters * Math.PI / 2;
    turnBusy = { list, axis, angle: 0 };
    addTween(dur, ease, (k) => {
      turnBusy.angle = target * k;
      pivot.quaternion.setFromAxisAngle(AXES[axis], turnBusy.angle);
    }, () => {
      bake(list, axis, quarters);
      turnBusy = null;
      if (done) done();
    }, 'replay');
  }

  const SCRAMBLE = [
    [1, 1, -1], [0, -1, 1], [2, 1, 1], [1, -1, -1], [0, 1, 1], [2, -1, -1]
  ];
  let replayActive = false;
  let replayDone = false;
  let replayTimer = null;
  const mReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  function runReplay() {
    if (replayActive || turnBusy || dragging) return;
    replayActive = true;
    const seq = [];
    SCRAMBLE.forEach(m => seq.push({ a: m[0], l: m[1], q: m[2], dur: 240, ease: easeInOut, gap: 45 }));
    seq.push({ pause: 220 });
    for (let i = SCRAMBLE.length - 1; i >= 0; i--) {
      const m = SCRAMBLE[i];
      seq.push({ a: m[0], l: m[1], q: -m[2], dur: 280, ease: easeOutBack, gap: 35 });
    }
    let i = 0;
    const next = () => {
      if (!replayActive) return;
      if (i >= seq.length) { replayActive = false; return; }
      const s = seq[i++];
      if (s.pause) { replayTimer = setTimeout(next, s.pause); return; }
      animateTurn(s.a, s.l, s.q, s.dur, s.ease, () => { replayTimer = setTimeout(next, s.gap); });
    };
    next();
  }
  function cancelReplay(reset) {
    if (!replayActive) return;
    replayActive = false;
    clearTimeout(replayTimer);
    for (let i = tweens.length - 1; i >= 0; i--) {
      if (tweens[i].tag === 'replay') tweens.splice(i, 1);
    }
    if (turnBusy) {
      const q = Math.round(turnBusy.angle / (Math.PI / 2));
      bake(turnBusy.list, turnBusy.axis, q);
      turnBusy = null;
    }
    if (reset) resetSolved();
    requestRender();
  }
  function maybeTriggerReplay() {
    if (replayDone || mReduce.matches) return;
    replayDone = true;
    runReplay();
  }
  mReduce.addEventListener('change', () => { if (mReduce.matches) cancelReplay(true); });

  let bufferCss = SIZE;
  let settleTimer = 0;
  function settleRenderer() {
    const w = Math.round(slot.getBoundingClientRect().width);
    if (w > 0 && w !== bufferCss) {
      bufferCss = w;
      renderer.setSize(w, w, false);
      requestRender();
    }
  }
  function settleSoon(ms) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settleRenderer, ms);
  }
  slot.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'max-width') settleRenderer();
  });
  window.addEventListener('resize', () => settleSoon(150));

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null;

  function pointerNdc(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return r;
  }
  function worldToScreen(v, rect) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2 * rect.width, y: (1 - p.y) / 2 * rect.height };
  }
  function applyOrbit(dx, dy) {
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const qx = new THREE.Quaternion().setFromAxisAngle(right, dy);
    cubeRoot.quaternion.premultiply(qy).premultiply(qx);
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (replayActive) cancelReplay(false);
    flushTweens();
    cubeRoot.updateMatrixWorld(true);
    const rect = pointerNdc(e);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(cubeRoot, true);
    inertia = null;
    dragging = true;
    renderer.domElement.setPointerCapture(e.pointerId);
    if (hits.length) {
      let node = hits[0].object;
      while (node.parent && !node.userData.isCubelet) node = node.parent;
      const invQ = cubeRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
      const nWorld = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld);
      const nLocal = nWorld.clone().applyQuaternion(invQ);
      const ax = [Math.abs(nLocal.x), Math.abs(nLocal.y), Math.abs(nLocal.z)];
      const faceAxis = ax.indexOf(Math.max(...ax));
      const pLocal = cubeRoot.worldToLocal(hits[0].point.clone());
      drag = {
        mode: 'layer', locked: false, rect,
        x0: e.clientX, y0: e.clientY,
        cubelet: node, faceAxis, nLocal, pLocal,
        hitWorld: hits[0].point.clone()
      };
    } else {
      drag = { mode: 'orbit', x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: performance.now() };
    }
    requestRender();
  });

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.mode === 'orbit') {
      const now = performance.now();
      const dt = Math.max(1, now - drag.t);
      const dx = (e.clientX - drag.x) * 0.008;
      const dy = (e.clientY - drag.y) * 0.008;
      applyOrbit(dx, dy);
      drag.vx = dx * (16 / dt);
      drag.vy = dy * (16 / dt);
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.t = now;
      requestRender();
      return;
    }
    const mx = e.clientX - drag.x0;
    const my = e.clientY - drag.y0;
    if (!drag.locked) {
      if (mx * mx + my * my < 64) return;
      const qW = cubeRoot.getWorldQuaternion(new THREE.Quaternion());
      let best = null;
      for (let a = 0; a < 3; a++) {
        if (a === drag.faceAxis) continue;
        const tCube = AXES[a].clone().cross(drag.pLocal);
        if (tCube.lengthSq() < 1e-8) continue;
        const tWorld = tCube.normalize().applyQuaternion(qW);
        const p1 = worldToScreen(drag.hitWorld, drag.rect);
        const p2 = worldToScreen(drag.hitWorld.clone().add(tWorld.multiplyScalar(0.6)), drag.rect);
        let sx = p2.x - p1.x;
        let sy = p2.y - p1.y;
        const sl = Math.hypot(sx, sy) || 1;
        sx /= sl;
        sy /= sl;
        const d = mx * sx + my * sy;
        if (!best || Math.abs(d) > Math.abs(best.d)) best = { a, sx, sy, d };
      }
      if (!best) return;
      drag.locked = true;
      drag.axis = best.a;
      drag.sx = best.sx;
      drag.sy = best.sy;
      drag.layerV = drag.cubelet.userData.c[best.a];
      drag.list = layerOf(best.a, drag.layerV);
      grabLayer(drag.list);
      drag.angle = 0;
    }
    const along = mx * drag.sx + my * drag.sy;
    drag.angle = (along / 140) * (Math.PI / 2);
    pivot.quaternion.setFromAxisAngle(AXES[drag.axis], drag.angle);
    requestRender();
  });

  function endDrag(e) {
    if (!drag) return;
    dragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (_) {}
    if (drag.mode === 'orbit') {
      if (Math.abs(drag.vx) + Math.abs(drag.vy) > 0.002) {
        inertia = { vx: drag.vx, vy: drag.vy };
      }
      drag = null;
      requestRender();
      return;
    }
    if (drag.locked) {
      const d = drag;
      const quarters = Math.round(d.angle / (Math.PI / 2));
      const target = quarters * Math.PI / 2;
      const from = d.angle;
      const dist = Math.abs(target - from);
      const dur = Math.max(110, Math.min(340, 110 + dist * 260));
      snapBusy = true;
      addTween(dur, easeOutBack, (k) => {
        pivot.quaternion.setFromAxisAngle(AXES[d.axis], from + (target - from) * k);
      }, () => {
        bake(d.list, d.axis, quarters);
        snapBusy = false;
      });
    }
    drag = null;
    requestRender();
  }
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      visible = en.isIntersecting;
      if (!visible) {
        cancelReplay(true);
        inertia = null;
        if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      } else {
        requestRender();
      }
    }
  }, { threshold: 0.05 });

  const mDark = window.matchMedia('(prefers-color-scheme: dark)');
  function isDark() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return mDark.matches;
  }
  function applyMode() {
    const dark = isDark();
    key.intensity = dark ? 1.5 : 2.4;
    amb.intensity = dark ? 0.55 : 1.05;
    fill.intensity = dark ? 0.3 : 0.5;
    shadowMat.opacity = dark ? 0.10 : 0.16;
    requestRender();
  }
  mDark.addEventListener('change', applyMode);
  const themeWatch = new MutationObserver(applyMode);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function expand() {
    requestRender();
    settleSoon(450);
    if (mReduce.matches) return;
    cancelReplay(false);
    flushTweens();
    resetSolved();
    replayDone = true;
    runReplay();
  }
  function collapse() {
    requestRender();
    settleSoon(450);
  }
  function replay() {
    cancelReplay(false);
    flushTweens();
    resetSolved();
    replayDone = true;
    runReplay();
  }

  let keyBindings = loadKeyBindings();
  function saveKeyBindings() {
    try { localStorage.setItem(CUBE_KEYS_STORE, JSON.stringify(keyBindings)); } catch (_) {}
  }
  function getKeyBindings() {
    return {
      face: Object.assign({}, keyBindings.face),
      orbit: Object.assign({}, keyBindings.orbit)
    };
  }
  function setKeyBinding(action, code) {
    if (typeof code !== 'string' || !code || RESERVED_KEYS.has(code)) return false;
    const group = action in keyBindings.face ? 'face' : action in keyBindings.orbit ? 'orbit' : null;
    if (!group) return false;
    if (keyBindings[group][action] === code) return true;
    for (const g in keyBindings) {
      for (const id in keyBindings[g]) {
        if (keyBindings[g][id] === code) return false;
      }
    }
    keyBindings[group][action] = code;
    saveKeyBindings();
    return true;
  }
  function resetKeyBindings() {
    keyBindings = defaultKeyBindings();
    try { localStorage.removeItem(CUBE_KEYS_STORE); } catch (_) {}
    return getKeyBindings();
  }
  function keyActionFor(code) {
    for (const id in keyBindings.face) if (keyBindings.face[id] === code) return { kind: 'face', id };
    for (const id in keyBindings.orbit) if (keyBindings.orbit[id] === code) return { kind: 'orbit', id };
    return null;
  }
  function orbitQuarter(action) {
    inertia = null;
    orbitBusy = true;
    const axis = (action === 'left' || action === 'right')
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const ang = (action === 'right' || action === 'down' ? 1 : -1) * Math.PI / 2;
    const q0 = cubeRoot.quaternion.clone();
    const spin = new THREE.Quaternion();
    addTween(340, easeOutBack, (k) => {
      spin.setFromAxisAngle(axis, ang * k);
      cubeRoot.quaternion.copy(q0).premultiply(spin);
    }, () => { orbitBusy = false; });
  }
  slot.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const hit = keyActionFor(e.code);
    if (!hit) return;
    e.preventDefault();
    if (hit.kind === 'face') {
      if (replayActive) cancelReplay(false);
      if (turnBusy || snapBusy || dragging) return;
      const def = FACE_TURNS[hit.id];
      animateTurn(def[0], def[1], e.shiftKey ? def[1] : -def[1], 220, easeOutBack);
      return;
    }
    if (replayActive) cancelReplay(false);
    if (orbitBusy || dragging) return;
    orbitQuarter(hit.id);
  });

  slot.replaceChildren(renderer.domElement);
  slot.addEventListener('pointerenter', maybeTriggerReplay);
  io.observe(slot);
  applyMode();

  return {
    ok: true,
    expand,
    collapse,
    replay,
    keys: {
      get: getKeyBindings,
      set: setKeyBinding,
      reset: resetKeyBindings,
      actions: KEY_ACTIONS.map(a => ({ id: a.id, label: a.label }))
    }
  };
}
