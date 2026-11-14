/* Навигатор МГСУ — мини-приложение Telegram с 3D-картой кампуса.
   Геометрия и тексты приходят из campus.js (генерирует export_webapp.py). */
(() => {
"use strict";

const tg = window.Telegram && window.Telegram.WebApp;
const C = window.CAMPUS;
const FH = C.fh;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------- тема и Telegram ----------
const inTelegram = !!(tg && tg.initData);
const dark = inTelegram && tg.colorScheme ? tg.colorScheme === "dark"
  : window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme = dark ? "dark" : "light";
const BG = dark ? "#0A0E1A" : "#F2F3F7";
if (tg) {
  tg.ready(); tg.expand();
  try { tg.setHeaderColor(BG); tg.setBackgroundColor(BG); } catch (e) {}
  try { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}
}
const haptic = (t) => { try { tg.HapticFeedback.impactOccurred(t || "light"); } catch (e) {} };
const tick = () => { try { tg.HapticFeedback.selectionChanged(); } catch (e) {} };

const PAL = dark ? {
  bg: 0x0a0e1a, ground: 0x0f1529, grid1: 0x27325a, grid2: 0x19213f,
  wall: "#252e4f", win: "#36436f", winLit: "#f3c97a", roof: 0x3b4878, edge: 0x5566a8, edgeOp: .45,
  accent: 0x7c5cff, accentRoof: 0x9d85ff, floor: 0x22d3ee, route: 0x22d3ee, start: 0x34d399,
  target: 0xf472b6, glass: 0x6f8fe0, hemiSky: 0x9fb0ff, hemiGround: 0x0b1020, hemi: .6, sun: .8, lit: .13,
} : {
  bg: 0xeef0f6, ground: 0xe4e8f1, grid1: 0xd0d6e4, grid2: 0xdce0ea,
  wall: "#fbfcfe", win: "#ccd6ea", winLit: "#ccd6ea", roof: 0xffffff, edge: 0xb9c2d6, edgeOp: .9,
  accent: 0x5b54f0, accentRoof: 0x7a73ff, floor: 0x06b6d4, route: 0x2563eb, start: 0x10b981,
  target: 0xec4899, glass: 0xa9c6f2, hemiSky: 0xffffff, hemiGround: 0xb8c0d2, hemi: .8, sun: 1.0, lit: 0,
};

// ---------- поиск: разбор номера (как в navigator.py) ----------
const BUILDINGS = ["КМК", "УЛК", "КПА", "УЛБ"];
const PARTS = ["А", "Б", "В", "Г"];
const ALIASES = { "КМК": "КМК", "УЛК": "УЛК", "КПА": "КПА", "УЛБ": "УЛБ", "РОМАШКА": "КПА" };
const LOOK = { A: "А", B: "В", C: "С", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", T: "Т", X: "Х", Y: "У", "Ё": "Е" };

function normalize(t) {
  t = t.toUpperCase().replace(/[A-ZЁ]/g, (ch) => LOOK[ch] || ch);
  for (let i = 0; i < 2; i++) t = t.replace(/([А-Я])(\d)/g, "$1 $2").replace(/(\d)([А-Я])/g, "$1 $2");
  return t.replace(/[^А-Я0-9]+/g, " ").trim();
}

function parse(text) {
  const q = { building: null, part: null, number: null };
  const tokens = normalize(text).split(" ").filter(Boolean);
  tokens.forEach((tok, idx) => {
    if (/^\d+$/.test(tok)) { if (!q.number && tok.length <= 4) q.number = tok; return; }
    if (ALIASES[tok] && !q.building) { q.building = ALIASES[tok]; return; }
    if (PARTS.includes(tok) && !q.part) {
      const near = [idx - 1, idx + 1].some((j) => tokens[j] && /^\d+$/.test(tokens[j]));
      if (tok !== "В" || near) q.part = tok;
    }
  });
  if (q.part && !q.building) q.building = "УЛБ";
  if (q.building && q.building !== "УЛБ") q.part = null;
  return q;
}

function locate(building, number, part) {
  const floor = number.length >= 3 ? parseInt(number.slice(0, -2), 10) : null;
  const rest = parseInt(number.slice(-2), 10);
  const loc = { building, number, part: null, floor, rest, hall: 1, side: null, zone: null };
  if (building === "КПА") return Object.assign(loc, { floor: null, hall: 2 });
  if (building === "УЛК") return Object.assign(loc, { hall: 2 });
  if (building === "УЛБ") return Object.assign(loc, { part: part || "А", hall: 1 });
  if (floor == null) return loc;
  if (rest <= 10) Object.assign(loc, { hall: 1, side: "налево", zone: 0 });
  else if (rest <= 20) Object.assign(loc, { hall: 1, side: "направо", zone: 1 });
  else if (rest <= 30) Object.assign(loc, { hall: 2, side: "налево", zone: 2 });
  else Object.assign(loc, { hall: 2, side: "направо", zone: 3 });
  return loc;
}

const FULL = { "КМК": "Корпус младших курсов", "УЛК": "Учебно-лабораторный корпус",
  "КПА": "Корпус поточных аудиторий · «Ромашка»", "УЛБ": "Учебно-лабораторный блок" };

function floorStep(f) {
  if (f == null) return "Этаж по номеру не определить — смотри таблички";
  if (f === 1) return "Ты уже на месте: это <b>1 этаж</b>";
  return `Поднимись на <b>${f} этаж</b>`;
}

function describe(loc) {
  const b = loc.building;
  const title = b === "УЛБ" ? `Корпус ${loc.part} · ${loc.number}` : `${b} · ${loc.number}`;
  const sub = b === "УЛБ" ? `${FULL["УЛБ"]} · корпус ${loc.part}` : FULL[b];
  let steps, note;
  if (b === "КМК") {
    const zones = ["левое крыло, к Библиотеке", "середина, ближе к Холлу 1",
      "середина, ближе к Холлу 2", "правое крыло, к Столовой"];
    steps = [`Вход через <b>Холл ${loc.hall}</b>`, floorStep(loc.floor),
      `В коридоре <b>${loc.side}</b> — ${zones[loc.zone]}`];
    note = "Номера в КМК растут слева направо: от Библиотеки к Столовой.";
    if (loc.floor === 3) note += " На 3 этаже кабинетов меньше — зоны могут сдвигаться.";
  } else if (b === "УЛК") {
    steps = ["Вход через <b>Холл 2</b>", "В коридоре направо — переход в УЛК напротив", floorStep(loc.floor)];
    note = "Первая цифра номера — этаж.";
  } else if (b === "КПА") {
    steps = ["Вход через <b>Холл 2</b>", "Направо, к Приёмной комиссии", "Рядом переход в КПА — круглое здание"];
    note = "Там большие лекционные аудитории, номер — на дверях.";
  } else {
    const r = { "А": "Корпус А начинается сразу за переходом", "Г": "Пройди корпус А насквозь — дальше корпус Г",
      "В": "Через А в корпус Г, там <b>налево</b> — корпус В", "Б": "Через А в корпус Г и <b>прямо</b> — корпус Б" };
    steps = ["Вход через <b>Холл 1</b> или главный, через Ректорат",
      "В коридоре налево, к Библиотеке — переход в корпус А справа", r[loc.part], floorStep(loc.floor)];
    note = "Номера в УЛБ растут по мере удаления от КМК: А → Г → Б/В.";
    if (loc.part === "А") note += " В корпусе А — деканат ФМО.";
  }
  return { title, sub, steps, note };
}

// ---------- маршрут (как в render.py) ----------
function kmkRoomX(rest) {
  const [k0, k1] = C.kmkX, h1 = C.hallX["1"], h2 = C.hallX["2"];
  const zones = [[1, 10, k0 + 2, h1], [11, 30, h1, h2], [31, 40, h2, k1 - 2]];
  for (const [lo, hi, x0, x1] of zones) if (rest >= lo && rest <= hi) return x0 + (x1 - x0) * (rest - lo + .5) / (hi - lo + 1);
  return k1 - 4;
}

function routePoints(loc) {
  const hx = C.hallX[String(loc.hall)] || C.hallX["2"];
  const zf = loc.floor ? (loc.floor - .5) * FH : .3, g = .3, cy = C.corridorY;
  const pts = [[hx, 25, g], [hx, 42, g]];
  if (loc.building === "КМК") {
    const tx = loc.floor ? kmkRoomX(loc.rest) : hx;
    return pts.concat([[hx, 49.5, g], [hx, 49.5, zf], [tx, 49.5, zf]]);
  }
  pts.push([hx, cy, g]);
  let end;
  if (loc.building === "УЛК") { end = [141, 86]; pts.push([144.6, cy, g], [144.6, 76, g], [141, 86, g]); }
  else if (loc.building === "КПА") return pts.concat([[164, cy, g], [164, 36, g], [167.5, 20, 2 * FH]]);
  else {
    pts.push([74.5, cy, g]);
    end = { "А": [74.5, 78], "Г": [74.5, 94], "В": [52.5, 114], "Б": [74, 114] }[loc.part];
    if (loc.part === "А") pts.push([end[0], end[1], g]);
    else if (loc.part === "Г") pts.push([74.5, 94, g]);
    else if (loc.part === "Б") pts.push([74.5, 94, g], [end[0], end[1], g]);
    else pts.push([74.5, 94, g], [52.5, 94, g], [end[0], end[1], g]);
  }
  if (loc.floor && loc.floor > 1) pts.push([end[0], end[1], zf]);
  return pts;
}

// ---------- 3D-сцена ----------
const host = $("#scene");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.bg);
scene.fog = new THREE.Fog(PAL.bg, 380, 760);
const camera = new THREE.PerspectiveCamera(38, 1, 1, 2000);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08;
controls.maxPolarAngle = 1.32; controls.minDistance = 45; controls.maxDistance = 560;
controls.screenSpacePanning = false; controls.rotateSpeed = .6; controls.zoomSpeed = .9;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, PAL.hemi));
const sun = new THREE.DirectionalLight(0xffffff, PAL.sun);
sun.position.set(-60, 160, 90);
sun.target.position.set(100, 0, -68);
sun.castShadow = true;
const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 500 });
sun.shadow.bias = -.0008;
scene.add(sun, sun.target);

const CENTER = new THREE.Vector3(100, 0, -68);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
  new THREE.MeshStandardMaterial({ color: PAL.ground, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.set(CENTER.x, 0, CENTER.z); ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(420, 42, PAL.grid1, PAL.grid2);
grid.position.set(CENTER.x, .02, CENTER.z);
grid.material.transparent = true; grid.material.opacity = dark ? .55 : .7;
scene.add(grid);

// текстура окон: одна плитка 4×4 окна, общий случайный узор для цвета и свечения
function windowTextures() {
  const lit = [];
  for (let i = 0; i < 16; i++) lit.push(Math.random() < (dark ? .16 : 0));
  const draw = (emissive) => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = emissive ? "#000" : PAL.wall; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
      const on = lit[r * 4 + k];
      g.fillStyle = emissive ? (on ? PAL.winLit : "#0d1226") : (on ? PAL.winLit : PAL.win);
      g.fillRect(k * 64 + 15, r * 64 + 12, 34, 40);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  return { map: draw(false), emis: draw(true) };
}
const WIN = windowTextures();

function sideMat(width, floors, kind) {
  if (kind === "hall") {
    return new THREE.MeshStandardMaterial({ color: PAL.glass, transparent: true, opacity: .85,
      roughness: .15, metalness: .2, userData: { glass: true } });
  }
  const map = WIN.map.clone(); map.needsUpdate = true;
  map.repeat.set(Math.max(1, width / 10.4), floors / 4);
  const opts = { map, roughness: .85, metalness: .02 };
  if (dark) {
    const emis = WIN.emis.clone(); emis.needsUpdate = true; emis.repeat.copy(map.repeat);
    Object.assign(opts, { emissive: 0xffffff, emissiveMap: emis, emissiveIntensity: .85 });
  }
  return new THREE.MeshStandardMaterial(opts);
}
const roofMat = () => new THREE.MeshStandardMaterial({ color: PAL.roof, roughness: .9 });

const blocks = {};
const pickables = [];
function bbox(poly) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

C.blocks.forEach((b) => {
  const h = b.floors * FH;
  const bb = bbox(b.poly);
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  const group = new THREE.Group();
  let mesh, mats;
  if (b.poly.length === 4) {
    const w = bb.x1 - bb.x0, d = bb.y1 - bb.y0;
    mats = [sideMat(d, b.floors, b.kind), sideMat(d, b.floors, b.kind), roofMat(), roofMat(),
      sideMat(w, b.floors, b.kind), sideMat(w, b.floors, b.kind)];
    mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  } else {
    const r = Math.hypot(b.poly[0][0] - cx, b.poly[0][1] - cy);
    mats = [sideMat(2 * Math.PI * r, b.floors, b.kind), roofMat(), roofMat()];
    const geo = new THREE.CylinderGeometry(r, r, h, 8, 1);
    geo.rotateY(Math.PI / 8);
    mesh = new THREE.Mesh(geo, mats);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), roofMat());
    dome.scale.y = .35; dome.position.y = h / 2; dome.castShadow = true;
    mesh.add(dome); mats.push(dome.material);
  }
  mesh.position.set(cx, h / 2, -cy);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.key = b.key;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20),
    new THREE.LineBasicMaterial({ color: PAL.edge, transparent: true, opacity: PAL.edgeOp }));
  mesh.add(edges);
  mats.forEach((m) => { m.userData.base = m.color.clone(); });
  group.add(mesh);
  scene.add(group);
  blocks[b.key] = { b, mesh, mats, edges, h, bb, cx, cy };
  if (b.kind !== "link") pickables.push(mesh);
});

// ---------- подписи ----------
const labelsHost = $("#labels");
const labels = [];
C.blocks.forEach((b) => {
  if (!b.label) return;
  const node = el("div", "lbl" + (b.kind === "hall" ? " hall" : ""), b.label);
  node.addEventListener("click", (e) => { e.stopPropagation(); selectBlock(b.key); });
  labelsHost.appendChild(node);
  const at = b.labelAt || [blocks[b.key].cx, blocks[b.key].cy];
  labels.push({ key: b.key, node, pos: new THREE.Vector3(at[0], blocks[b.key].h + (b.kind === "hall" ? 1 : 2), -at[1]) });
});
const pins = [];
function addPin(text, pos, cls) {
  const node = el("div", "pin" + (cls ? " " + cls : ""), text);
  labelsHost.appendChild(node);
  pins.push({ node, pos });
}
function clearPins() { pins.splice(0).forEach((p) => p.node.remove()); }

const tmp = new THREE.Vector3();
function placeLabels() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const it of labels.concat(pins)) {
    tmp.copy(it.pos).project(camera);
    const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
    it.node.style.display = visible ? "" : "none";
    if (visible) it.node.style.transform =
      `translate(${(tmp.x * .5 + .5) * w}px, ${(-tmp.y * .5 + .5) * h}px) translate(-50%, ${it.node.classList.contains("pin") ? "calc(-100% - 14px)" : "-100%"})`;
  }
}
labels.concat(pins).forEach((it) => { it.node.style.left = "0"; it.node.style.top = "0"; });

// ---------- подсветка ----------
const ACC = new THREE.Color(PAL.accent), ACC_ROOF = new THREE.Color(PAL.accentRoof);
let focusKeys = null;

function applyFocus(keys) {
  focusKeys = keys && keys.length ? new Set(keys) : null;
  for (const key in blocks) {
    const it = blocks[key];
    const on = focusKeys && focusKeys.has(key);
    const dim = focusKeys && !on;
    it.mats.forEach((m, i) => {
      const roof = m.map == null && !m.userData.glass;
      m.color.copy(on ? (roof ? ACC_ROOF : ACC) : m.userData.base);
      if (on && !roof && !dark) m.color.lerp(new THREE.Color(0xffffff), .25);
      m.transparent = dim || !!m.userData.glass;
      m.opacity = dim ? .22 : (m.userData.glass ? .85 : 1);
      m.depthWrite = !dim;
      m.needsUpdate = true;
    });
    it.mesh.castShadow = !dim;
    it.edges.material.opacity = dim ? PAL.edgeOp * .35 : PAL.edgeOp;
  }
  labels.forEach((l) => {
    l.node.classList.toggle("on", !!(focusKeys && focusKeys.has(l.key)));
    l.node.classList.toggle("dim", !!(focusKeys && !focusKeys.has(l.key)));
  });
}

const floorGroup = new THREE.Group();
scene.add(floorGroup);
let floorPulse = null;

function clearFloor() {
  floorGroup.children.slice().forEach((c) => { floorGroup.remove(c); c.geometry.dispose(); });
  floorPulse = null;
}

function slab(it, floor, x0, x1, pad, opacity) {
  const y = (floor - .5) * FH;
  let geo;
  if (it.b.poly.length === 4) {
    const w = (x1 != null ? x1 - x0 : it.bb.x1 - it.bb.x0) + pad;
    geo = new THREE.BoxGeometry(w, FH * .9, it.bb.y1 - it.bb.y0 + pad);
  } else {
    const r = Math.hypot(it.b.poly[0][0] - it.cx, it.b.poly[0][1] - it.cy);
    geo = new THREE.CylinderGeometry(r + pad / 2, r + pad / 2, FH * .9, 8);
    geo.rotateY(Math.PI / 8);
  }
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PAL.floor, transparent: true,
    opacity, depthWrite: false }));
  m.position.set(x1 != null ? (x0 + x1) / 2 : it.cx, y, -it.cy);
  m.renderOrder = 5;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({
    color: PAL.floor, transparent: true, opacity: .95 }));
  m.add(e);
  floorGroup.add(m);
  return m;
}

function showFloor(key, floor, xRange) {
  clearFloor();
  const it = blocks[key];
  if (!it || !floor) return;
  slab(it, floor, null, null, .7, dark ? .32 : .28);
  if (xRange) floorPulse = slab(it, floor, xRange[0], xRange[1], 1.4, .8);
  renderFloors(key, floor);
}

const floorsBox = $("#floors");
function renderFloors(key, active) {
  const it = blocks[key];
  if (!it || it.b.kind !== "main") { floorsBox.classList.add("hidden"); return; }
  const n = Math.max(it.b.floors, active || 0);
  floorsBox.innerHTML = "";
  floorsBox.appendChild(el("div", "cap", "ЭТАЖ"));
  for (let f = n; f >= 1; f--) {
    const btn = el("button", f === active ? "on" : "", String(f));
    btn.onclick = () => { tick(); showFloor(key, f, f === active ? currentZone : null); };
    floorsBox.appendChild(btn);
  }
  floorsBox.classList.remove("hidden");
}
let currentZone = null;

// ---------- маршрут ----------
const routeGroup = new THREE.Group();
scene.add(routeGroup);
let routePath = null;
const dots = [];
let startRing = null;

function clearRoute() {
  routeGroup.children.slice().forEach((c) => { routeGroup.remove(c); if (c.geometry) c.geometry.dispose(); });
  dots.length = 0; routePath = null; startRing = null; clearPins();
}

function onTop(mat) { mat.depthTest = false; mat.depthWrite = false; mat.transparent = true; return mat; }

function showRoute(pts, label) {
  clearRoute();
  const v = pts.map((p) => new THREE.Vector3(p[0], p[2], -p[1]));
  const path = new THREE.CurvePath();
  for (let i = 0; i < v.length - 1; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
  routePath = path;
  const seg = Math.max(60, v.length * 60);
  const core = new THREE.Mesh(new THREE.TubeGeometry(path, seg, .6, 10, false),
    onTop(new THREE.MeshBasicMaterial({ color: PAL.route })));
  const glow = new THREE.Mesh(new THREE.TubeGeometry(path, seg, 1.6, 10, false),
    onTop(new THREE.MeshBasicMaterial({ color: PAL.route, opacity: dark ? .3 : .2,
      blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending })));
  core.renderOrder = 21; glow.renderOrder = 20;
  routeGroup.add(glow, core);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(.8, 16, 12), onTop(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    s.renderOrder = 22; s.userData.u = i / 8;
    routeGroup.add(s); dots.push(s);
  }
  startRing = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.8, 48),
    onTop(new THREE.MeshBasicMaterial({ color: PAL.start, side: THREE.DoubleSide })));
  startRing.rotation.x = -Math.PI / 2; startRing.position.copy(v[0]).setY(.4); startRing.renderOrder = 22;
  const startDot = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32),
    onTop(new THREE.MeshBasicMaterial({ color: PAL.start, side: THREE.DoubleSide })));
  startDot.rotation.x = -Math.PI / 2; startDot.position.copy(v[0]).setY(.42); startDot.renderOrder = 23;
  const end = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), onTop(new THREE.MeshBasicMaterial({ color: PAL.target })));
  end.position.copy(v[v.length - 1]); end.renderOrder = 23;
  routeGroup.add(startRing, startDot, end);
  addPin("Вход", v[0].clone().setY(1), "start");
  addPin(label, v[v.length - 1].clone());
}

// ---------- камера ----------
let fly = null;
const ease = (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function overviewDist() {
  const a = camera.aspect;
  return a < .7 ? 470 : a < 1.1 ? 360 : 270;
}
// на телефоне шторка снизу закрывает часть экрана — смещаем центр, чтобы кампус был выше
function overviewCenter() {
  return camera.aspect < .9 ? CENTER.clone().add(new THREE.Vector3(14, 0, 34)) : CENTER.clone();
}
const VIEW_DIR = new THREE.Vector3(.42, .68, .6).normalize();
function flyTo(target, dist, dir) {
  const d = (dir || camera.position.clone().sub(controls.target).normalize()).clone();
  if (d.y < .45) { d.y = .45; d.normalize(); }
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: target.clone().add(d.multiplyScalar(dist)),
    t1: target.clone(), start: performance.now(), dur: 950 };
}
function overview(animate) {
  const c = overviewCenter();
  const p = c.clone().add(VIEW_DIR.clone().multiplyScalar(overviewDist()));
  if (animate) flyTo(c, overviewDist(), VIEW_DIR);
  else { camera.position.copy(p); controls.target.copy(c); }
}
function focusDist(keys) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, h = 0;
  keys.forEach((k) => { const it = blocks[k]; if (!it) return;
    x0 = Math.min(x0, it.bb.x0); x1 = Math.max(x1, it.bb.x1); y0 = Math.min(y0, it.bb.y0); y1 = Math.max(y1, it.bb.y1); h = Math.max(h, it.h); });
  const size = Math.max(x1 - x0, y1 - y0, h);
  const shift = camera.aspect < .9 ? size * .2 : 0;
  return { center: new THREE.Vector3((x0 + x1) / 2 + shift * .3, h * .35, -(y0 + y1) / 2 + shift),
    dist: Math.min(360, Math.max(110, size * (camera.aspect < .8 ? 3.1 : 2.0))) };
}

// ---------- шторка ----------
const sheet = $("#sheet"), sheetBody = $("#sheet-body");
$("#grab").onclick = () => { tick(); sheet.classList.toggle("min"); };
function setSheet(html, min) {
  sheetBody.innerHTML = html;
  sheet.classList.toggle("min", !!min);
  sheet.scrollTop = 0;
}

const QUICK = [["КМК 415", "КМК 415"], ["511 Г УЛБ", "511 Г УЛБ"], ["УЛК 108", "УЛК 108"], ["КПА 5", "КПА 5"], ["А-207", "А-207"]];
function homeSheet() {
  const places = C.places.slice(0, 7).map((p, i) => `<button class="chip" data-place="${i}">${p.title}</button>`).join("");
  setSheet(`
    <h2>Навигатор МГСУ</h2>
    <div class="sub">Ярославское шоссе, 26 · крути карту пальцем, нажимай на корпуса</div>
    <div class="chips" style="margin-top:12px">${places}</div>`);
  sheetBody.querySelectorAll("[data-place]").forEach((b) => b.onclick = () => { tick(); selectPlace(C.places[+b.dataset.place]); });
}

function resultSheet(loc) {
  const d = describe(loc);
  const tags = [];
  if (loc.floor) tags.push(`<span class="tag a">${loc.floor} этаж</span>`);
  tags.push(`<span class="tag g">Вход: Холл ${loc.hall}</span>`);
  if (loc.side) tags.push(`<span class="tag">${loc.side[0].toUpperCase() + loc.side.slice(1)}</span>`);
  setSheet(`
    <h2>${d.title}</h2><div class="sub">${d.sub}</div>
    <div class="row">${tags.join("")}</div>
    <ol class="steps">${d.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${s}</span></li>`).join("")}</ol>
    <div class="note">${d.note}</div>
    <div class="actions"><button class="btn" id="reset">Сбросить</button><button class="btn primary" id="again">Другая аудитория</button></div>`);
  $("#reset").onclick = () => { tick(); reset(); };
  $("#again").onclick = () => { tick(); $("#q").value = ""; $("#q").focus(); };
}

function placeSheet(place, key) {
  const it = blocks[key];
  const tags = place.chips.map((c, i) => `<span class="tag${i === 0 ? " a" : ""}">${c}</span>`).join("");
  setSheet(`
    <h2>${it && it.b.label && PARTS.includes(key) ? it.b.label : place.title}</h2>
    <div class="sub">${place.subtitle}</div>
    ${tags ? `<div class="row">${tags}</div>` : ""}
    <div class="html" style="margin-top:12px">${place.html}</div>
    <div class="actions"><button class="btn" id="reset">Сбросить</button></div>`);
  $("#reset").onclick = () => { tick(); reset(); };
}

// ---------- действия ----------
function toast(text) {
  const t = $("#toast"); t.textContent = text; t.classList.add("show");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 2200);
}

function reset() {
  clearRoute(); clearFloor(); applyFocus(null); currentZone = null;
  floorsBox.classList.add("hidden"); homeSheet(); overview(true);
}

function selectPlace(place) {
  showTab("map");
  clearRoute(); clearFloor(); currentZone = null;
  applyFocus(place.keys);
  const keys = place.keys.filter((k) => blocks[k]);
  if (keys.length === 1) renderFloors(keys[0], null); else floorsBox.classList.add("hidden");
  placeSheet(place, keys[0]);
  const f = focusDist(keys);
  flyTo(f.center, f.dist);
  haptic();
}

function selectBlock(key) {
  const it = blocks[key];
  if (!it) return;
  const place = C.places.find((p) => p.keys.includes(key));
  tick();
  if (!place) { return; }
  if (PARTS.includes(key)) {
    clearRoute(); clearFloor(); currentZone = null;
    applyFocus([key]); renderFloors(key, null); placeSheet(place, key);
    const f = focusDist([key]); flyTo(f.center, f.dist);
    return;
  }
  selectPlace(place);
}

function search(text) {
  const q = parse(text || "");
  if (!q.number) {
    if (q.building) { const p = C.places.find((pl) => pl.id === q.building); if (p) { selectPlace(p); return; } }
    toast("Напиши номер: например, КМК 415"); return;
  }
  if (!q.building) { toast(`В каком корпусе ${q.number}? Например: КМК ${q.number}`); return; }
  if (q.building === "УЛБ" && !q.part) { toast(`Укажи корпус УЛБ: А, Б, В или Г — например «${q.number} Г УЛБ»`); return; }
  const loc = locate(q.building, q.number, q.part);
  if (loc.building === "КМК" && loc.floor == null) { toast("В КМК номер трёхзначный: этаж + кабинет"); return; }
  showTab("map");
  const key = loc.building === "УЛБ" ? loc.part : loc.building;
  const hallKey = loc.hall === 1 ? "Х1" : "Х2";
  applyFocus([key, hallKey]);
  currentZone = null;
  if (loc.building === "КМК" && loc.zone != null) {
    const h1 = C.hallX["1"], h2 = C.hallX["2"];
    currentZone = [[C.kmkX[0], h1], [h1, 114], [114, h2], [h2, C.kmkX[1]]][loc.zone];
  }
  if (loc.floor) showFloor(key, loc.floor, currentZone); else { clearFloor(); floorsBox.classList.add("hidden"); }
  const pts = routePoints(loc);
  showRoute(pts, loc.number);
  resultSheet(loc);
  // камера смотрит на маршрут целиком
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 30);
  const narrow = camera.aspect < .9;
  const shift = narrow ? span * .32 : 0;
  const center = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2 + shift * .2,
    (loc.floor || 1) * FH * .4, -(Math.min(...ys) + Math.max(...ys)) / 2 + shift);
  flyTo(center, Math.min(400, Math.max(narrow ? 210 : 140, span * (narrow ? 3.6 : 2.2))));
  haptic("medium");
  document.activeElement && document.activeElement.blur();
}

$("#search").addEventListener("submit", (e) => { e.preventDefault(); search($("#q").value); });
const quick = $("#quick");
QUICK.forEach(([t, q]) => {
  const b = el("button", "chip", t);
  b.onclick = () => { tick(); $("#q").value = q; search(q); };
  quick.appendChild(b);
});

// нажатие на корпус
let down = null;
renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
  const hit = ray.intersectObjects(pickables, false).find((h) => !(focusKeys && h.object.material[0] && h.object.material[0].opacity < .5));
  if (hit) selectBlock(hit.object.userData.key);
});

// ---------- вкладки ----------
function showTab(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "tab-" + name));
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  if (name === "map") resize();
  if (tg && tg.BackButton) { name === "map" ? tg.BackButton.hide() : tg.BackButton.show(); }
}
document.querySelectorAll(".tabbar button").forEach((b) => b.onclick = () => { tick(); showTab(b.dataset.tab); });
if (tg && tg.BackButton) tg.BackButton.onClick(() => showTab("map"));

const ICON = {
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  wc: '<circle cx="7" cy="4.5" r="1.8"/><circle cx="17" cy="4.5" r="1.8"/><path d="M5 22v-7H3.5L5 9h4l1.5 6H9v7M15 9h4v6h-1v7h-2v-7h-1z"/>',
  plus: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  food: '<path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 4-3 7h3v11"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 0 0 0 18M3 12h18"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4zM20 4h-6a3 3 0 0 0-3 3"/><path d="M20 4v13.5h-6.5A2.5 2.5 0 0 0 11 20"/>',
  door: '<path d="M4 21h16M6 21V4h12v17"/><path d="M14 12h.01"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
};
const svg = (name) => `<svg class="i" viewBox="0 0 24 24">${ICON[name]}</svg>`;

// Корпуса
(function buildPlaces() {
  const abbr = { "КМК": "КМК", "УЛК": "УЛК", "КПА": "КПА", "УЛБ": "УЛБ", "Ректорат": "РЕК", "Библиотека": "НТБ", "Столовая": "ЕДА", "Ещё": "•••" };
  const page = $("#places");
  page.innerHTML = `<h1>Корпуса</h1><p class="lead">Аббревиатуры из расписания и как дойти</p>
    <div class="section">Учебные корпуса</div><div class="list" id="pl-main"></div>
    <div class="section">Корпуса УЛБ</div><div class="grid2" id="pl-ulb"></div>
    <div class="section">Кампус</div><div class="list" id="pl-other"></div>`;
  C.places.forEach((p) => {
    const item = el("button", "item", `<span class="abbr">${abbr[p.id] || p.title.slice(0, 3)}</span>
      <span><div class="t">${p.title === p.id ? p.subtitle.split(" · ")[0] : p.title}</div><div class="d">${p.subtitle}</div></span>
      <span class="chev">${svg("chev")}</span>`);
    item.onclick = () => { tick(); selectPlace(p); };
    $(["КМК", "УЛК", "КПА", "УЛБ"].includes(p.id) ? "#pl-main" : "#pl-other").appendChild(item);
  });
  const colors = { "А": "#5B54F0", "Б": "#0EA5E9", "В": "#10B981", "Г": "#F59E0B" };
  const desc = { "А": "Сразу за переходом из КМК · деканат ФМО", "Б": "Через А и Г, прямо", "В": "Через А и Г, налево", "Г": "Центральный, за корпусом А" };
  PARTS.forEach((k) => {
    const t = el("button", "tile", `<span class="ico" style="background:${colors[k]};font-weight:800">${k}</span>
      <span class="t">Корпус ${k}</span><span class="d">${desc[k]}</span>`);
    t.onclick = () => { selectBlock(k); showTab("map"); };
    $("#pl-ulb").appendChild(t);
  });
})();

// Полезное
(function buildUseful() {
  const S = [
    ["Туалеты", [
      ["wc", "#0EA5E9", "Холл 1", "У входа в КМК", ["Х1"]], ["wc", "#0EA5E9", "Холл 2", "У входа в КМК", ["Х2"]],
      ["wc", "#0EA5E9", "Библиотека", "Рядом с Инфоцентром", ["НТБ"]], ["wc", "#0EA5E9", "УЛК", "Внутри корпуса", ["УЛК"]],
      ["wc", "#0EA5E9", "Столовая", "Правый край КМК", ["СТОЛ"]]]],
    ["Здоровье", [
      ["plus", "#EF4444", "Здравпункт", "У перехода из КМК в корпус А", ["А"]],
      ["pill", "#10B981", "Аптека", "Рядом со здравпунктом", ["А"]]]],
    ["Справка", [
      ["info", "#5B54F0", "Инфоцентр", "У главного входа, между Ректоратом и Библиотекой", ["РЕК", "НТБ"]],
      ["cap", "#7C3AED", "Деканат ФМО", "Корпус А, УЛБ", ["А"]],
      ["shield", "#64748B", "Военно-учётный стол", "«Свечка» · 4 этаж, каб. 404", ["РЕК"], 4],
      ["door", "#F59E0B", "Приёмная комиссия", "В КМК, правее Холла 2", ["КМК"]]]],
    ["Отдых", [
      ["food", "#F97316", "Столовая", "За Холлом 2", ["СТОЛ"]],
      ["ball", "#22C55E", "Спорткомплекс", "Отдельное здание · СОК", ["СОК"]],
      ["book", "#0EA5E9", "Библиотека", "МОЦОС — на 2 этаже", ["НТБ"]]]],
  ];
  const page = $("#useful");
  page.innerHTML = `<h1>Полезное</h1><p class="lead">Нажми на карточку — покажу на 3D-карте</p>`;
  S.forEach(([title, items]) => {
    page.appendChild(el("div", "section", title));
    const grid = el("div", "grid2");
    items.forEach(([ic, color, t, d, keys, floor]) => {
      const tile = el("button", "tile", `<span class="ico" style="background:${color}">${svg(ic)}</span>
        <span class="t">${t}</span><span class="d">${d}</span>`);
      tile.onclick = () => {
        tick(); showTab("map"); clearRoute(); clearFloor(); currentZone = null;
        applyFocus(keys);
        if (floor) showFloor(keys[0], floor); else floorsBox.classList.add("hidden");
        setSheet(`<h2>${t}</h2><div class="sub">${d}</div>
          <div class="actions"><button class="btn" id="reset">Сбросить</button></div>`);
        $("#reset").onclick = () => { tick(); reset(); };
        const f = focusDist(keys); flyTo(f.center, f.dist);
      };
      grid.appendChild(tile);
    });
    page.appendChild(grid);
  });
})();

// Номера
(function buildGuide() {
  const page = $("#guide");
  page.innerHTML = `<h1>Как читать номер</h1><p class="lead">Разберёшься за 10 секунд</p>
    <div class="hero"><h3>Номер аудитории</h3><p>Первая цифра — этаж, две последних — кабинет</p>
      <div class="big">4<span>15</span></div><div class="cap2"><span>этаж</span><span>кабинет</span></div></div>
    <div class="section">По корпусам</div>
    <div class="list">
      <div class="item"><span class="abbr">КМК</span><span><div class="t">01–20 → Холл 1 · 21–40 → Холл 2</div>
        <div class="d">01–10 налево, 11–20 направо, 21–30 налево, 31–40 направо. На 3 этаже кабинетов меньше.</div></span></div>
      <div class="item"><span class="abbr">УЛК</span><span><div class="t">Холл 2, переход напротив</div><div class="d">Первая цифра — этаж</div></span></div>
      <div class="item"><span class="abbr">КПА</span><span><div class="t">Холл 2, направо</div><div class="d">«Ромашка» — большие лекционные аудитории</div></span></div>
      <div class="item"><span class="abbr">УЛБ</span><span><div class="t">Холл 1, налево</div><div class="d">Буква — корпус: А → Г → Б / В</div></span></div>
    </div>
    <div class="section">Из расписания</div>
    <div class="card"><div class="t" style="font-weight:800">Вставь как есть</div>
      <div class="d" style="color:var(--muted);font-size:13px;margin-top:4px">В расписании аудитории записаны так: <b>511 Г УЛБ</b>, <b>108 УЛК</b>. Скопируй и вставь в поиск на карте.</div>
      <div class="chips" style="margin-top:12px" id="g-try"></div></div>`;
  ["511 Г УЛБ", "108 УЛК", "КМК 415", "КПА 5"].forEach((q) => {
    const b = el("button", "chip", q); b.onclick = () => { tick(); $("#q").value = q; search(q); };
    $("#g-try").appendChild(b);
  });
})();

// ---------- цикл ----------
function resize() {
  const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
if (tg) tg.onEvent("viewportChanged", resize);

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const t = clock.getElapsedTime();
  if (fly) {
    const k = Math.min(1, (performance.now() - fly.start) / fly.dur), e = ease(k);
    camera.position.lerpVectors(fly.p0, fly.p1, e);
    controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  if (routePath) {
    dots.forEach((d) => d.position.copy(routePath.getPointAt((d.userData.u + t * .12) % 1)));
    if (startRing) { const s = 1 + .35 * Math.sin(t * 4); startRing.scale.set(s, s, s); }
  }
  if (floorPulse) floorPulse.material.opacity = .55 + .3 * Math.sin(t * 3.2);
  renderer.render(scene, camera);
  placeLabels();
}

resize();
overview(false);
homeSheet();
loop();
setTimeout(() => $("#loader").classList.add("done"), 250);

// запрос из бота: ?q=КМК%20415 или startapp=КМК_415
const params = new URLSearchParams(location.search);
let initial = params.get("q");
if (!initial && tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) initial = tg.initDataUnsafe.start_param.replace(/_/g, " ");
if (initial) { $("#q").value = initial; setTimeout(() => search(initial), 400); }
})();
