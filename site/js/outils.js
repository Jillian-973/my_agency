// Outils communs : hasard reproductible, couleurs, matériaux, formes de base, textures dessinées.
import * as THREE from 'three';

const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = rng(7);
const pick = (arr, r = R) => arr[Math.floor(r() * arr.length)];
const col = (h) => new THREE.Color(h);
const tint = (h, a) => '#' + col(h).lerp(col('#ffffff'), a).getHexString();
const shade = (h, a) => '#' + col(h).lerp(col('#000000'), a).getHexString();

const matCache = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, flatShading: true, ...o }));
  return matCache.get(key);
}
function glow(color, o = {}) {
  const key = 'glow' + color + JSON.stringify(o);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o }));
  return matCache.get(key);
}
const glassMat = new THREE.MeshStandardMaterial({ color: '#d4f1ff', transparent: true, opacity: 0.26, roughness: 0.08, metalness: 0.1, depthWrite: false });
const M = (m) => typeof m === 'string' ? mat(m) : m;

const G = { box: new THREE.BoxGeometry(1, 1, 1), plane: new THREE.PlaneGeometry(1, 1) };
const geoCache = {};
const cylGeo = (rt, rb, seg) => geoCache[`c${rt}_${rb}_${seg}`] ||= new THREE.CylinderGeometry(rt, rb, 1, seg);
const icoGeo = (det) => geoCache['i' + det] ||= new THREE.IcosahedronGeometry(1, det);

function finish(mesh, p, shadow = true) { mesh.castShadow = shadow; mesh.receiveShadow = true; p.add(mesh); return mesh; }
function grp(p, x = 0, y = 0, z = 0, r = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = r; p.add(g); return g; }
function box(p, w, h, d, x, y, z, m, shadow = true) {
  const mesh = new THREE.Mesh(G.box, M(m)); mesh.scale.set(w, h, d); mesh.position.set(x, y + h / 2, z);
  return finish(mesh, p, shadow && m !== glassMat);
}
function cyl(p, rt, rb, h, x, y, z, m, seg = 14) {
  const mesh = new THREE.Mesh(cylGeo(rt, rb, seg), M(m)); mesh.scale.y = h; mesh.position.set(x, y + h / 2, z);
  return finish(mesh, p, m !== glassMat);
}
function sph(p, r, x, y, z, m, det = 1) {
  const mesh = new THREE.Mesh(icoGeo(det), M(m)); mesh.scale.setScalar(r); mesh.position.set(x, y, z);
  return finish(mesh, p);
}
function plane(p, w, h, x, y, z, m, ry = 0) {
  const mesh = new THREE.Mesh(G.plane, M(m)); mesh.scale.set(w, h, 1); mesh.position.set(x, y, z); mesh.rotation.y = ry;
  p.add(mesh); return mesh;
}
function floorPlane(p, w, d, x, y, z, tex) {
  const m = new THREE.Mesh(G.plane, new THREE.MeshStandardMaterial({ map: tex, roughness: .8 }));
  m.scale.set(w, d, 1); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; p.add(m); return m;
}

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function tileTex(c1, c2) {
  return canvasTex(128, 128, (g) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? c1 : c2; g.fillRect(i * 64, j * 64, 64, 64);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(i * 64 + 3, j * 64 + 3, 58, 4);
      g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = 3; g.strokeRect(i * 64 + 1.5, j * 64 + 1.5, 61, 61);
    }
  }, true);
}
function woodTex(base) {
  const r = rng(base.length * 31 + base.charCodeAt(3));
  return canvasTex(256, 256, (g) => {
    for (let row = 0; row < 8; row++) {
      let x = -r() * 120;
      while (x < 256) {
        const len = 90 + r() * 90;
        g.fillStyle = tint(shade(base, r() * 0.12), r() * 0.12); g.fillRect(x, row * 32, len, 32);
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, row * 32, 2, 32);
        for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, row * 32 + 6 + r() * 20, len, 1.5); }
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, row * 32 + 30, 256, 2);
    }
  }, true);
}
function carpetTex(base, dots) {
  const r = rng(base.length * 17 + base.charCodeAt(2));
  return canvasTex(128, 128, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},.06)`; g.fillRect(r() * 128, r() * 128, 2, 2); }
    if (dots) for (let i = 0; i < 14; i++) { g.fillStyle = pick(dots, r); g.beginPath(); g.arc(r() * 128, r() * 128, 2.5, 0, 7); g.fill(); }
  }, true);
}
function floorTex(f, w, d) {
  let t;
  if (f.type === 'wood') { t = woodTex(f.c); t.repeat.set(w / 3, d / 3); }
  else if (f.type === 'carpet') { t = carpetTex(f.c, f.dots); t.repeat.set(w / 3, d / 3); }
  else { t = tileTex(f.c1, f.c2); t.repeat.set(w / 2, d / 2); }
  return t;
}

/* ---- textures d'écran ---- */
function screenTex(kind) {
  return canvasTex(256, 160, (g, w, h) => {
    const r = rng([...kind].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const bars = (x, y, n, colors, maxH, bw = 16, gap = 8) => { for (let i = 0; i < n; i++) { const bh = 12 + r() * maxH; g.fillStyle = colors[i % colors.length]; g.fillRect(x + i * (bw + gap), y - bh, bw, bh); } };
    const lines = (x, y, n, color, maxW, step = 12, hgt = 5) => { g.fillStyle = color; for (let i = 0; i < n; i++) g.fillRect(x, y + i * step, maxW * (0.4 + r() * 0.6), hgt); };
    switch (kind) {
      case 'code': case 'term': {
        g.fillStyle = kind === 'code' ? '#0f172a' : '#020a05'; g.fillRect(0, 0, w, h);
        const cs = kind === 'code' ? ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#e2e8f0'] : ['#4ade80', '#22c55e', '#86efac'];
        for (let i = 0; i < 12; i++) { let x = 12 + Math.floor(r() * 3) * 14; for (let j = 0; j < 3 && x < w - 30; j++) { const ww = 18 + r() * 55; g.fillStyle = pick(cs, r); g.fillRect(x, 10 + i * 12, ww, 6); x += ww + 8; } }
        break; }
      case 'mail': {
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#dbeafe'; g.fillRect(0, 0, 54, h);
        g.fillStyle = '#3b82f6'; g.fillRect(8, 10, 38, 12);
        for (let i = 0; i < 9; i++) { g.fillStyle = i % 3 === 0 ? '#3b82f6' : '#cbd5e1'; g.beginPath(); g.arc(66, 16 + i * 16, 3, 0, 7); g.fill(); g.fillStyle = i % 3 === 0 ? '#1e293b' : '#64748b'; g.fillRect(76, 12 + i * 16, 50 + r() * 40, 6); g.fillStyle = '#cbd5e1'; g.fillRect(150, 12 + i * 16, 60 + r() * 30, 6); }
        break; }
      case 'calendar': {
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#3b82f6'; g.fillRect(0, 0, w, 22);
        g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText('Agenda · semaine', 10, 16);
        g.strokeStyle = '#e2e8f0'; for (let i = 0; i <= 7; i++) { g.beginPath(); g.moveTo(i * w / 7, 22); g.lineTo(i * w / 7, h); g.stroke(); }
        for (let i = 0; i < 12; i++) { const d = Math.floor(r() * 7); g.fillStyle = pick(['#93c5fd', '#fca5a5', '#86efac', '#fde68a', '#c4b5fd'], r); g.fillRect(d * w / 7 + 3, 28 + r() * 110, w / 7 - 6, 12 + r() * 18); }
        break; }
      case 'sheet': {
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#16a34a'; g.fillRect(0, 0, w, 16);
        g.strokeStyle = '#d1d5db'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, 16 + i * 12); g.lineTo(w, 16 + i * 12); g.stroke(); }
        for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(i * 38, 16); g.lineTo(i * 38, h); g.stroke(); }
        for (let i = 0; i < 26; i++) { g.fillStyle = pick(['#bbf7d0', '#fecaca', '#e5e7eb', '#fde68a'], r); g.fillRect(Math.floor(r() * 7) * 38 + 3, 19 + Math.floor(r() * 11) * 12, 30, 7); }
        break; }
      case 'chart': {
        g.fillStyle = '#1e1b4b'; g.fillRect(0, 0, w, h); bars(16, 140, 9, ['#a78bfa', '#818cf8', '#f472b6'], 100, 18, 8);
        g.strokeStyle = '#facc15'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 9; i++) g.lineTo(25 + i * 26, 90 - i * 7 + r() * 20); g.stroke();
        break; }
      case 'seo': {
        g.fillStyle = '#fffbeb'; g.fillRect(0, 0, w, h); g.fillStyle = '#facc15'; g.fillRect(0, 0, w, 18);
        g.fillStyle = 'rgba(22,163,74,.15)'; g.fillRect(14, 60, 230, 90);
        g.strokeStyle = '#16a34a'; g.lineWidth = 4; g.beginPath(); for (let i = 0; i < 10; i++) g.lineTo(14 + i * 25, 140 - i * 10 - r() * 18); g.stroke();
        break; }
      case 'radar': {
        g.fillStyle = '#05140f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#22c55e'; g.lineWidth = 1.5;
        for (let i = 1; i < 5; i++) { g.beginPath(); g.arc(w / 2, h / 2, i * 18, 0, 7); g.stroke(); }
        g.fillStyle = 'rgba(74,222,128,.35)'; g.beginPath(); g.moveTo(w / 2, h / 2); g.arc(w / 2, h / 2, 72, -0.2, 0.7); g.fill();
        for (let i = 0; i < 6; i++) { g.fillStyle = pick(['#f472b6', '#facc15', '#a78bfa'], r); g.beginPath(); g.arc(w / 2 + (r() - .5) * 120, h / 2 + (r() - .5) * 120, 4, 0, 7); g.fill(); }
        break; }
      case 'web': {
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#e5e7eb'; g.fillRect(0, 0, w, 16);
        g.fillStyle = pick(['#c4b5fd', '#fbcfe8', '#a5f3fc', '#fde68a'], r); g.fillRect(12, 24, w - 24, 50);
        for (let i = 0; i < 3; i++) { g.fillStyle = '#f1f5f9'; g.fillRect(12 + i * 80, 84, 70, 60); g.fillStyle = '#94a3b8'; g.fillRect(18 + i * 80, 90, 40, 6); }
        break; }
      case 'design': case 'brand': {
        g.fillStyle = '#f1f5f9'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f2937'; g.fillRect(0, 0, 20, h);
        for (let i = 0; i < 3; i++) { g.fillStyle = '#fff'; g.fillRect(32 + i * 74, 20, 64, 120); g.fillStyle = pick(['#f472b6', '#a78bfa', '#fb923c', '#38bdf8'], r);
          if (kind === 'design') { g.fillRect(38 + i * 74, 28, 52, 30); lines(38 + i * 74, 66, 5, '#cbd5e1', 50); }
          else { g.beginPath(); g.arc(64 + i * 74, 60, 18, 0, 7); g.fill(); g.fillRect(44 + i * 74, 96, 40, 8); } }
        break; }
      case 'blender': {
        g.fillStyle = '#2b2b2b'; g.fillRect(0, 0, w, h); g.fillStyle = '#3d3d3d'; g.fillRect(0, 0, w, 14); g.fillRect(w - 50, 14, 50, h);
        g.strokeStyle = '#4a4a4a'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(i * 20, 14); g.lineTo(i * 20, h); g.stroke(); }
        g.strokeStyle = '#f97316'; g.lineWidth = 3; g.strokeRect(70, 50, 60, 60); g.beginPath(); g.moveTo(70, 50); g.lineTo(95, 32); g.lineTo(155, 32); g.lineTo(130, 50); g.moveTo(155, 32); g.lineTo(155, 92); g.lineTo(130, 110); g.stroke();
        break; }
      case 'video': case 'wave': {
        g.fillStyle = '#111827'; g.fillRect(0, 0, w, h);
        if (kind === 'video') { const gr = g.createLinearGradient(0, 0, 0, 80); gr.addColorStop(0, '#fb7185'); gr.addColorStop(1, '#fbbf24'); g.fillStyle = gr; g.fillRect(60, 8, 136, 76); }
        else { g.strokeStyle = '#4ade80'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 240; i += 3) { const a = Math.sin(i * .2) * 20 * r(); g.moveTo(8 + i, 45 - a); g.lineTo(8 + i, 45 + a); } g.stroke(); }
        for (let t = 0; t < 4; t++) { let x = 8; while (x < w - 20) { const ww = 14 + r() * 40; g.fillStyle = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7'][t]; g.fillRect(x, 96 + t * 15, ww, 11); x += ww + 3 + r() * 10; } }
        break; }
      case 'thumbs': case 'social': {
        g.fillStyle = kind === 'thumbs' ? '#111827' : '#fff'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { g.fillStyle = pick(['#f43f5e', '#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ec4899'], r); g.fillRect(10 + i * 82, 10 + j * 74, 74, 66); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(16 + i * 82, 56 + j * 74, 40, 8); }
        break; }
      case 'notion': case 'slides': {
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#111827'; g.fillRect(16, 14, 110, 12);
        if (kind === 'slides') bars(30, 140, 6, ['#3b82f6', '#22c55e', '#f97316'], 70, 22, 14);
        else { for (let i = 0; i < 7; i++) { g.strokeStyle = '#9ca3af'; g.strokeRect(16, 38 + i * 16, 8, 8); lines(30, 39 + i * 16, 1, '#6b7280', 180); } }
        break; }
      case 'deploy': {
        g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) { g.fillStyle = i === 5 ? '#f59e0b' : '#22c55e'; g.beginPath(); g.arc(20, 16 + i * 18, 5, 0, 7); g.fill(); lines(34, 13 + i * 18, 1, '#cbd5e1', 160, 18, 6); }
        break; }
      case 'film': {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f97316'); gr.addColorStop(.55, '#fcd34d'); gr.addColorStop(.56, '#1e3a8a'); gr.addColorStop(1, '#0f172a');
        g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff7d6'; g.beginPath(); g.arc(160, 88, 22, Math.PI, 0); g.fill();
        g.fillStyle = '#7c2d12'; g.beginPath(); g.moveTo(0, 90); g.lineTo(60, 50); g.lineTo(110, 88); g.lineTo(0, 90); g.fill();
        g.fillStyle = '#000'; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12);
        break; }
      case 'menu': {
        g.fillStyle = '#1f2a24'; g.fillRect(0, 0, w, h); g.fillStyle = '#f5f5f4'; g.font = 'bold 20px sans-serif'; g.fillText('CAFÉ', 96, 26);
        for (let i = 0; i < 6; i++) { lines(20, 42 + i * 18, 1, '#e7e5e4', 140, 18, 4); g.fillStyle = '#fde68a'; g.fillRect(210, 42 + i * 18, 26, 4); }
        break; }
      default: { // arcade
        g.fillStyle = '#0b0420'; g.fillRect(0, 0, w, h);
        const cs = ['#f43f5e', '#22d3ee', '#a3e635', '#facc15', '#e879f9'];
        for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { g.fillStyle = cs[(i + j + kind.length) % cs.length]; g.fillRect(30 + i * 34, 20 + j * 24, 18, 12); }
        g.fillStyle = '#22d3ee'; g.fillRect(118, 135, 22, 10);
      }
    }
  });
}
const scrCache = {};
const screenMat = (kind) => scrCache[kind] ||= new THREE.MeshBasicMaterial({ map: screenTex(kind), toneMapped: false });

/* ---- Logo JILL KORP (lettres dorées ou blanches) ---- */
function korpTex(fill) {
  return canvasTex(512, 128, (c) => {
    c.font = '900 86px system-ui, "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    try { c.letterSpacing = '10px'; } catch (e) { /* navigateur sans letterSpacing */ }
    if (fill === 'gold') { const gr = c.createLinearGradient(0, 20, 0, 108); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(.5, '#facc15'); gr.addColorStop(1, '#b8860b'); c.fillStyle = gr; c.shadowColor = 'rgba(250,204,21,.6)'; c.shadowBlur = 14; }
    else c.fillStyle = fill;
    c.fillText('JILL KORP', 256, 68);
  });
}
const korpGold = new THREE.MeshBasicMaterial({ map: korpTex('gold'), transparent: true, toneMapped: false });
const korpWhite = new THREE.MeshBasicMaterial({ map: korpTex('#ffffff'), transparent: true, toneMapped: false });

/* ---- Animations : ces objets restent à part (non fusionnés) et ne projettent pas d'ombre ---- */
const anim = [];
function animate(o, fn) { o.traverse(c => { c.userData.keep = true; c.castShadow = false; }); anim.push({ o, fn }); return o; }
const spin = (o, axis, s) => animate(o, (t, dt) => { o.rotation[axis] += dt * s; });
const wiggle = (o, axis, s, amp, base = o.rotation[axis]) => animate(o, (t) => { o.rotation[axis] = base + Math.sin(t * s) * amp; });

export {
  rng, R, pick, col, tint, shade, mat, glow, glassMat, M, G, cylGeo, icoGeo, finish, grp, box, cyl, sph, plane, floorPlane,
  canvasTex, tileTex, woodTex, carpetTex, floorTex, screenTex, screenMat, korpGold, korpWhite, anim, animate, spin, wiggle,
};
