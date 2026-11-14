/* Навигатор МГСУ — мини-приложение Telegram с 3D-картой кампуса.
   Геометрия, тексты и окружение приходят из campus.js (генерирует export_webapp.py). */
(() => {
"use strict";

const tg = window.Telegram && window.Telegram.WebApp;
const C = window.CAMPUS;
const X = C.extras;
const FH = C.fh;
const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------- тема и Telegram ----------
const inTelegram = !!(tg && tg.initData);
const dark = inTelegram && tg.colorScheme ? tg.colorScheme === "dark"
  : window.matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.dataset.theme = dark ? "dark" : "light";
const BG = dark ? "#061229" : "#EEF2F8";
if (tg) {
  tg.ready(); tg.expand();
  try { tg.setHeaderColor(BG); tg.setBackgroundColor(BG); } catch (e) {}
  try { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {}
}
const haptic = (t) => { try { tg.HapticFeedback.impactOccurred(t || "light"); } catch (e) {} };
const tick = () => { try { tg.HapticFeedback.selectionChanged(); } catch (e) {} };

// Фирменная гамма: тёмно-синий логотипа, синий сайта, золото эмблемы
// Гамма по эмблеме МГСУ: тёмно-синий #1D3B6F, синий #2E62B0, голубой #4FA3E0, много белого
const PAL = dark ? {
  bg: 0x0b1830, ground: 0x0f2142, grid1: 0x23406f, grid2: 0x18305a,
  wall: "#2a4677", win: "#3c5f95", winLit: "#bfe0ff", roof: 0x4069a8, edge: 0x6f93c9, edgeOp: .5,
  accent: 0x2e62b0, accentRoof: 0x4f9be0, floor: 0x6cb8f0, route: 0x6cc0f5, start: 0x3cc4e0,
  target: 0x6cb8f0, glass: 0x6fa6e6, park: 0x12304a, road: 0x0a1428, pave: 0x24406c, dirt: 0x5c4c3c,
  tree: 0x2f7d66, trunk: 0x5a4436, concrete: 0x93a2ba, crane: 0x6cb8f0, detour: 0xff8a3d, blocked: 0xf87171,
  pitch: 0x226f55, hemiSky: 0xb6d4ff, hemiGround: 0x0b1830, hemi: .65, sun: .8,
} : {
  bg: 0xf3f7fc, ground: 0xe5eef9, grid1: 0xd2e0f2, grid2: 0xdde8f5,
  wall: "#fbfdff", win: "#bcd6f2", winLit: "#bcd6f2", roof: 0xffffff, edge: 0xa9c1e0, edgeOp: .95,
  accent: 0x2e62b0, accentRoof: 0x4fa3e0, floor: 0x4fa3e0, route: 0x2f8fe0, start: 0x169ec4,
  target: 0x1d3b6f, glass: 0xa6cff5, park: 0xdcefe6, road: 0xcad7e8, pave: 0xffffff, dirt: 0xd6c4a6,
  tree: 0x62aa82, trunk: 0x8a6e58, concrete: 0xbac4d4, crane: 0x2e62b0, detour: 0xf07a2a, blocked: 0xe5484d,
  pitch: 0x8fcca8, hemiSky: 0xffffff, hemiGround: 0xbfd0e6, hemi: .84, sun: 1.0,
};

// ---------- поиск (как в navigator.py) ----------
const PARTS = ["А", "Б", "В", "Г"];
const ALIASES = { "КМК": "КМК", "УЛК": "УЛК", "КПА": "КПА", "РОМАШКА": "КПА", "УЛБ": "УЛБ" };
const LOOK = { A: "А", B: "В", C: "С", E: "Е", K: "К", M: "М", H: "Н", O: "О", P: "Р", T: "Т", X: "Х", Y: "У", "Ё": "Е" };
const SPORT = { "СОК": "Спорткомплекс МГСУ", "МАН": "Манеж МГСУ" };

function normalize(t) {
  t = t.toUpperCase().replace(/[A-ZЁ]/g, (ch) => LOOK[ch] || ch);
  for (let i = 0; i < 2; i++) t = t.replace(/([А-Я])(\d)/g, "$1 $2").replace(/(\d)([А-Я])/g, "$1 $2");
  return t.replace(/[^А-Я0-9]+/g, " ").trim();
}
function sportAlias(tok) {
  if (tok.startsWith("МАНЕЖ")) return "МАН";
  if (tok === "СОК" || /^(СПОРТ|ФИЗР|ФИЗК|БАССЕЙН|ТРЕНАЖ)/.test(tok)) return "СОК";
  return null;
}
function parse(text) {
  const q = { building: null, part: null, number: null, place: null };
  const tokens = normalize(text).split(" ").filter(Boolean);
  tokens.forEach((tok, idx) => {
    if (/^\d+$/.test(tok)) { if (!q.number && tok.length <= 4) q.number = tok; return; }
    const sp = sportAlias(tok);
    if (sp && !q.place) { q.place = sp; return; }
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
    steps = [`Вход через <b>Холл ${loc.hall}</b>`, floorStep(loc.floor), `В коридоре <b>${loc.side}</b> — ${zones[loc.zone]}`];
    note = "Номера в КМК растут слева направо: от Библиотеки к Столовой.";
    if (loc.floor === 3) note += " На 3 этаже кабинетов меньше — зоны могут сдвигаться.";
  } else if (b === "УЛК") {
    steps = ["Вход через <b>Холл 2</b>", "В коридоре направо — переход в УЛК напротив", floorStep(loc.floor)];
    note = "Первая цифра номера — этаж.";
  } else if (b === "КПА") {
    steps = ["Вход через <b>Холл 2</b>", "Направо, к Приёмной комиссии", "Рядом переход в КПА — «Ромашку»"];
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

function detourMeters(place) {
  const p = X.detour[place];
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return Math.round(s * X.planUnitM / 10) * 10;
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
  else if (loc.building === "КПА") return pts.concat([[167, cy, g], [167, 36, g], [173, 24, 2 * FH]]);
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
const V = (x, y, z) => new THREE.Vector3(x, z || 0, -y);
const host = $("#scene");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.bg);
scene.fog = new THREE.Fog(PAL.bg, 520, 1000);
const camera = new THREE.PerspectiveCamera(36, 1, 1, 2500);
// Управление как в картах: один палец / левая кнопка — двигать карту,
// два пальца — масштаб и поворот, правая кнопка (или Shift) — поворот и наклон.
const controls = new THREE.MapControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: .12, minPolarAngle: 0, maxPolarAngle: 1.2,
  minDistance: 35, maxDistance: 650, screenSpacePanning: false, rotateSpeed: .5, zoomSpeed: 1.1, panSpeed: 1 });
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
if (controls.listenToKeyEvents) controls.listenToKeyEvents(window);

scene.add(new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, PAL.hemi));
const sun = new THREE.DirectionalLight(0xffffff, PAL.sun);
const CENTER = V(100, 70, 0);
sun.position.copy(CENTER).add(new THREE.Vector3(-160, 230, 120));
sun.target.position.copy(CENTER);
sun.castShadow = true;
const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
sun.shadow.mapSize.set(mobile ? 1536 : 2048, mobile ? 1536 : 2048);
Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 10, far: 700 });
sun.shadow.bias = -.0006;
scene.add(sun, sun.target);

const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .9, metalness: .02 }, o || {}));

function box(x0, y0, x1, y1, z0, z1, material, shadow) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.01, x1 - x0), Math.max(.01, z1 - z0), Math.max(.01, y1 - y0)), material);
  m.position.set((x0 + x1) / 2, (z0 + z1) / 2, -(y0 + y1) / 2);
  m.castShadow = shadow !== false; m.receiveShadow = true;
  return m;
}
function flat(poly, color, h, opts) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat(color, Object.assign({ roughness: 1 }, opts || {})));
  m.position.y = h; m.receiveShadow = true;
  return m;
}
function segment(p0, p1, z0, z1, thick, material) {
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const m = new THREE.Mesh(new THREE.BoxGeometry(L, z1 - z0, thick), material);
  m.position.set((p0[0] + p1[0]) / 2, (z0 + z1) / 2, -(p0[1] + p1[1]) / 2);
  m.rotation.y = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  return m;
}
function strip(p0, p1, w) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L * w / 2, ny = dx / L * w / 2;
  return [[p0[0] + nx, p0[1] + ny], [p1[0] + nx, p1[1] + ny], [p1[0] - nx, p1[1] - ny], [p0[0] - nx, p0[1] - ny]];
}

// ---------- окружение ----------
const env = new THREE.Group();
scene.add(env);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat(PAL.ground, { roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.set(CENTER.x, 0, CENTER.z); ground.receiveShadow = true;
env.add(ground);
const grid = new THREE.GridHelper(560, 56, PAL.grid1, PAL.grid2);
grid.position.set(CENTER.x, .02, CENTER.z); grid.material.transparent = true; grid.material.opacity = .55;
env.add(grid);
env.add(flat(X.road, PAL.road, .03));
for (let x = -36; x < 266; x += 12) env.add(flat(strip([x, -54], [x + 6, -54], .5), dark ? 0x56627a : 0xffffff, .05));
env.add(flat([[0, -33], [229, -30], [229, 39], [0, 39]], PAL.park, .04));
X.paths.forEach((p) => { for (let i = 0; i < p.length - 1; i++) env.add(flat(strip(p[i], p[i + 1], 2.4), PAL.pave, .06)); });
X.pitches.forEach((p) => {
  env.add(flat(p, PAL.pitch, .05));
  const pts = p.concat([p[0]]).map((q) => V(q[0], q[1], .08));
  env.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 })));
});
const fenceMat = new THREE.MeshBasicMaterial({ color: dark ? 0x9fb6dd : 0x7d8fb0, transparent: true, opacity: .28, depthWrite: false });
const railMat = mat(dark ? 0xa9bde0 : 0x8d9dbb);
[X.fence, X.fenceBack].forEach((line) => {
  for (let i = 0; i < line.length - 1; i++) {
    env.add(segment(line[i], line[i + 1], 0, 1.3, .12, fenceMat));
    env.add(segment(line[i], line[i + 1], 1.25, 1.4, .2, railMat));
  }
});
(function trees() {
  const n = X.trees.length;
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 1), mat(PAL.tree, { flatShading: true }), n);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .3, 2.2, 6), mat(PAL.trunk), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  X.trees.forEach(([x, y], i) => {
    const k = .85 + ((i * 37) % 10) / 30;
    s.set(k, k * 1.1, k);
    m.compose(V(x, y, 2.2 + 1.9 * k), q, s); crowns.setMatrixAt(i, m);
    m.compose(V(x, y, 1.1), q, new THREE.Vector3(1, 1, 1)); trunks.setMatrixAt(i, m);
  });
  crowns.castShadow = trunks.castShadow = true;
  env.add(crowns, trunks);
})();

// ---------- текстура окон ----------
function windowTextures() {
  const lit = [];
  for (let i = 0; i < 16; i++) lit.push(Math.random() < (dark ? .17 : 0));
  const draw = (emissive) => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = emissive ? "#000" : PAL.wall; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
      const on = lit[r * 4 + k];
      g.fillStyle = emissive ? (on ? PAL.winLit : "#0b1430") : (on ? PAL.winLit : PAL.win);
      g.fillRect(k * 64 + 14, r * 64 + 12, 36, 40);
      if (!emissive) { g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(k * 64 + 14, r * 64 + 12, 36, 5); }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  return { map: draw(false), emis: draw(true) };
}
const WIN = windowTextures();
function sideMat(width, floors) {
  const map = WIN.map.clone(); map.needsUpdate = true;
  map.repeat.set(Math.max(1, width / 10.4), floors / 4);
  const o = { map, roughness: .85, metalness: .02 };
  if (dark) {
    const emis = WIN.emis.clone(); emis.needsUpdate = true; emis.repeat.copy(map.repeat);
    Object.assign(o, { emissive: 0xffffff, emissiveMap: emis, emissiveIntensity: .85 });
  }
  return new THREE.MeshStandardMaterial(o);
}
const roofMat = () => mat(PAL.roof);

// ---------- корпуса ----------
const blocks = {};
const pickables = [];
function bbox(poly) {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
const HALL_H = X.hallH || 4.4;
function blockHeight(b) {
  if (b.kind === "construction") return 4 * FH;
  if (b.kind === "arena") return b.floors * FH + X.arenaRise;
  if (b.kind === "hall") return HALL_H;
  if (b.kind === "tower") return b.floors * FH + 3;
  return b.floors * FH;
}
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
// надпись на холсте → текстура для плоскости на фасаде
function textPlane(text, wUnits, hUnits, color, vertical) {
  const c = document.createElement("canvas");
  c.width = vertical ? 128 : 2048; c.height = vertical ? 512 : 64;
  const g = c.getContext("2d");
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
  if (vertical) {
    g.font = "800 104px Onest, Arial, sans-serif";
    [...text].forEach((ch, i) => g.fillText(ch, 64, 64 + i * 128));
  } else {
    g.font = "800 46px Onest, Arial, sans-serif";
    g.fillText(text.split("").join(String.fromCharCode(8202)), 1024, 34, 2030);
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return new THREE.Mesh(new THREE.PlaneGeometry(wUnits, hUnits), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
}
function edges(mesh) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20),
    new THREE.LineBasicMaterial({ color: PAL.edge, transparent: true, opacity: PAL.edgeOp }));
  mesh.add(e);
  return e;
}

function buildMain(b, g, it) {
  const { x0, x1, y0, y1 } = it.bb, h = b.floors * FH, w = x1 - x0, d = y1 - y0;
  const mats = [sideMat(d, b.floors), sideMat(d, b.floors), roofMat(), roofMat(), sideMat(w, b.floors), sideMat(w, b.floors)];
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  body.position.set((x0 + x1) / 2, h / 2, -(y0 + y1) / 2); body.castShadow = body.receiveShadow = true;
  it.edges.push(edges(body));
  const plinth = box(x0 - .2, y0 - .2, x1 + .2, y1 + .2, 0, .7, mat(dark ? 0x1a2a48 : 0xdfe6f0));
  const cornice = box(x0 - .3, y0 - .3, x1 + .3, y1 + .3, h, h + .5, roofMat());
  g.add(body, plinth, cornice);
  it.mats.push(...mats, cornice.material); it.meshes.push(body, plinth, cornice);
  if (b.floors >= 3 && b.kind === "main") {
    const n = Math.max(1, Math.floor(w / 24));
    for (let i = 0; i < n; i++) {
      const bx = x0 + w * (i + .5) / n, by = y0 + d * (i % 2 ? .35 : .62);
      const v = box(bx - 2, by - 1.4, bx + 2, by + 1.4, h + .5, h + 1.8, mat(dark ? 0x4a6596 : 0xe9eef6));
      g.add(v); it.meshes.push(v);
    }
  }
}

// Холл — как на фото: низкий павильон перед КМК, толстая белая плита-крыша с выносом
// на тонких колоннах, под ней утопленные стены из стекла и терракоты, ступени к входу.
function buildHall(b, g, it) {
  const { x0, x1, y0, y1 } = it.bb, zr = HALL_H - 1.1, w = x1 - x0;
  const slab = box(x0, y0, x1, y1, zr, HALL_H, mat(PAL.wall, { roughness: .6 }));
  it.edges.push(edges(slab));
  g.add(slab); it.mats.push(slab.material); it.meshes.push(slab);
  const glass = mat(PAL.glass, { roughness: .12, metalness: .35 });
  const inner = box(x0 + 1.4, y0 + 2.2, x1 - 1.4, y1, 0, zr, glass, false);
  g.add(inner); it.mats.push(glass); it.meshes.push(inner);
  const terra = mat(dark ? 0x8a4a3c : 0xc47862);
  [[x0 + 1.4, x0 + 1.4 + w * .17], [x1 - 1.4 - w * .17, x1 - 1.4]].forEach(([a, c]) => g.add(box(a, y0 + 2.1, c, y0 + 2.4, 0, zr, terra, false)));
  const mull = mat(PAL.wall, { roughness: .5 });
  for (let x = x0 + 1.4 + w * .17; x < x1 - 1.4 - w * .17; x += 2.3) g.add(box(x - .07, y0 + 2.1, x + .07, y0 + 2.25, 0, zr, mull, false));
  const cx = (x0 + x1) / 2, doorMat = mat(dark ? 0x0a1426 : 0x24334f, { metalness: .3 });
  [-3, -1, 1].forEach((dx) => g.add(box(cx + dx + .1, y0 + 2.0, cx + dx + 1.8, y0 + 2.15, 0, 2.2, doorMat, false)));
  const colMat = mat(PAL.wall, { roughness: .5 });
  const n = Math.round(w / 3.6);
  for (let k = 0; k <= n; k++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, zr, 10), colMat);
    col.position.copy(V(x0 + .8 + (w - 1.6) * k / n, y0 + .8, zr / 2)); col.castShadow = true; g.add(col);
  }
  g.add(box(x0 + 4, y0 - 2.4, x1 - 4, y0 + .4, 0, .25, mat(dark ? 0x31466e : 0xe6edf6)));
  g.add(box(cx - 1.6, y0 - .08, cx + 1.6, y0 - .02, zr + .25, zr + .85, mat(PAL.target), false));
}

// КМК — как на фото: утопленный 1 этаж, сплошная стеклянная лента 2 этажа, вывеска
// «МОСКОВСКИЙ ГОСУДАРСТВЕННЫЙ СТРОИТЕЛЬНЫЙ УНИВЕРСИТЕТ» и решётка глубоких квадратных окон.
function kmkFacade(width, floors) {
  const draw = (emissive) => {
    const c = document.createElement("canvas"), up = floors - 1;
    c.width = 128; c.height = 64 * up;
    const g = c.getContext("2d");
    g.fillStyle = emissive ? "#000" : PAL.wall; g.fillRect(0, 0, 128, c.height);
    for (let r = 0; r < up - 1; r++) {                // решётка окон (этажи 3+)
      const top = r * 64;
      if (!emissive) { g.fillStyle = "rgba(0,0,0,.07)"; g.fillRect(22, top + 3, 84, 40); }
      g.fillStyle = emissive ? (Math.random() < (dark ? .2 : 0) ? PAL.winLit : "#0b1430") : PAL.win;
      g.fillRect(28, top + 7, 76, 33);
    }
    const band = (up - 1) * 64;                        // стеклянная лента 2 этажа
    g.fillStyle = emissive ? "#0b1430" : hex(PAL.glass); g.fillRect(0, band + 4, 128, 56);
    if (!emissive) { g.fillStyle = PAL.wall; g.fillRect(0, band + 4, 5, 56); g.fillRect(64, band + 4, 3, 56); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.repeat.set(Math.max(1, Math.round(width / 2.25)), 1);
    return t;
  };
  const o = { map: draw(false), roughness: .85 };
  if (dark) Object.assign(o, { emissive: 0xffffff, emissiveMap: draw(true), emissiveIntensity: .8 });
  return new THREE.MeshStandardMaterial(o);
}
function buildKMK(b, g, it) {
  const { x0, x1, y0, y1 } = it.bb, h = b.floors * FH, w = x1 - x0, d = y1 - y0;
  const glass = mat(PAL.glass, { roughness: .12, metalness: .35 });
  const ground = box(x0, y0 + 1.6, x1 - 1.6, y1, 0, FH, glass);
  g.add(ground); it.mats.push(glass); it.meshes.push(ground);
  const pil = mat(PAL.wall, { roughness: .6 });
  for (let x = x0 + 1.5; x < x1 - 1.6; x += 3) g.add(box(x - .25, y0 + 1.4, x + .25, y0 + 1.8, 0, FH, pil, false));
  const soffit = mat(dark ? 0x1a2c4e : 0xdde6f2);
  const mats = [kmkFacade(d, b.floors), kmkFacade(d, b.floors), roofMat(), soffit, kmkFacade(w, b.floors), kmkFacade(w, b.floors)];
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - FH, d), mats);
  body.position.copy(V((x0 + x1) / 2, (y0 + y1) / 2, (h + FH) / 2)); body.castShadow = body.receiveShadow = true;
  it.edges.push(edges(body));
  const cornice = box(x0 - .3, y0 - .3, x1 + .3, y1 + .3, h, h + .5, roofMat());
  g.add(body, cornice); it.mats.push(...mats, cornice.material); it.meshes.push(body, cornice);
  const sign = textPlane("МОСКОВСКИЙ ГОСУДАРСТВЕННЫЙ СТРОИТЕЛЬНЫЙ УНИВЕРСИТЕТ", 92, 1.3, hex(PAL.target));
  sign.position.copy(V((x0 + x1) / 2, y0 - .06, 2 * FH + .55)); g.add(sign);
  for (let i = 0; i < 4; i++) {
    const bx = x0 + w * (i + .5) / 4;
    g.add(box(bx - 2, y0 + 7, bx + 2, y0 + 10, h + .5, h + 1.8, mat(dark ? 0x4a6596 : 0xe9eef6)));
  }
}

// Ректорат «Свечка»: середина с окнами между двумя глухими пилонами выше неё,
// на пилонах вертикальные надписи «МГСУ» и «МИСИ», наверху эмблемы.
function buildTower(b, g, it) {
  const { x0, x1, y0, y1 } = it.bb, h = b.floors * FH, w = x1 - x0 - 1.4, d = y1 - y0 - 6.4;
  const mats = [sideMat(d, b.floors), sideMat(d, b.floors), roofMat(), roofMat(), sideMat(w, b.floors), sideMat(w, b.floors)];
  const mid = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  mid.position.copy(V((x0 + x1) / 2, (y0 + y1) / 2, h / 2)); mid.castShadow = mid.receiveShadow = true;
  it.edges.push(edges(mid)); g.add(mid); it.mats.push(...mats); it.meshes.push(mid);
  const stone = mat(PAL.wall, { roughness: .6 });
  [[y0, y0 + 3.2, "МГСУ"], [y1 - 3.2, y1, "МИСИ"]].forEach(([a, c, word]) => {
    const p = box(x0, a, x1, c, 0, h + 3, stone);
    it.edges.push(edges(p)); g.add(p); it.mats.push(p.material); it.meshes.push(p);
    [1, -1].forEach((side) => {                       // буквы на обоих торцах пилона
      const t = textPlane(word, 2.4, 9.6, hex(PAL.target), true);
      t.rotation.y = side * Math.PI / 2;
      t.position.copy(V(side > 0 ? x1 + .06 : x0 - .06, (a + c) / 2, h - 4.2)); g.add(t);
      const em = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ color: PAL.target }));
      em.rotation.set(0, side * Math.PI / 2, Math.PI / 4);
      em.position.copy(V(side > 0 ? x1 + .07 : x0 - .07, (a + c) / 2, h + 1.4)); g.add(em);
    });
  });
  const mast = box((x0 + x1) / 2 - .12, (y0 + y1) / 2 - .12, (x0 + x1) / 2 + .12, (y0 + y1) / 2 + .12, h, h + 6, mat(PAL.edge), false);
  g.add(mast);
}

// КПА «Ромашка» — как на фото: глухие серые бетонные лепестки-аудитории без окон,
// приподнятые на колоннах над остеклённым первым этажом.
function buildFlower(b, g, it) {
  const cx = it.cx, cy = it.cy, z1 = FH * 1.05, z2 = 2 * FH + 1.6;
  const glass = mat(PAL.glass, { roughness: .12, metalness: .35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 9.6, z1, 24), glass);
  base.position.copy(V(cx, cy, z1 / 2)); base.receiveShadow = true;
  g.add(base); it.mats.push(glass); it.meshes.push(base);
  const conc = mat(PAL.concrete, { roughness: .95 });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, z2 + .4 - z1, 24), conc);
  core.position.copy(V(cx, cy, (z1 + z2 + .4) / 2)); core.castShadow = true;
  g.add(core); it.mats.push(conc); it.meshes.push(core);
  const colMat = mat(PAL.concrete);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8;
    const pm = mat(PAL.concrete, { roughness: .95 });
    const petal = new THREE.Mesh(new THREE.BoxGeometry(9.2, z2 - z1, 6.4), pm);
    petal.position.copy(V(cx + Math.cos(a) * 9.2, cy + Math.sin(a) * 9.2, (z1 + z2) / 2));
    petal.rotation.y = a; petal.castShadow = petal.receiveShadow = true;
    it.edges.push(edges(petal));
    g.add(petal); it.mats.push(pm); it.meshes.push(petal);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, z1, 8), colMat);
    col.position.copy(V(cx + Math.cos(a) * 12.4, cy + Math.sin(a) * 12.4, z1 / 2)); col.castShadow = true; g.add(col);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(PAL.glass, { roughness: .15, metalness: .3 }));
  dome.scale.y = .45; dome.position.copy(V(cx, cy, z2 + .4)); dome.castShadow = true;
  g.add(dome); it.mats.push(dome.material); it.meshes.push(dome);
}

function buildArena(b, g, it) {
  const { x0, x1, y0, y1 } = it.bb, h = b.floors * FH, w = x1 - x0, d = y1 - y0, r = d / 2;
  // как на фото: остеклённые стены и пологий светло-серый свод
  const glass = mat(PAL.glass, { roughness: .12, metalness: .35 });
  const walls = box(x0, y0, x1, y1, 0, h, glass);
  g.add(walls); it.mats.push(glass); it.meshes.push(walls);
  const mull = mat(PAL.wall, { roughness: .5 });
  for (let x = x0; x <= x1 + .01; x += w / Math.round(w / 2.6)) [y0, y1].forEach((y) => g.add(box(x - .1, y - .1, x + .1, y + .1, 0, h, mull, false)));
  g.add(box(x0 - .2, y0 - .2, x1 + .2, y1 + .2, h - .4, h, mull));
  const vg = new THREE.CylinderGeometry(r, r, w, 40, 1, false, 0, Math.PI); vg.rotateZ(Math.PI / 2);
  const vault = new THREE.Mesh(vg, mat(PAL.concrete, { roughness: .5, metalness: .2, side: THREE.DoubleSide }));
  vault.scale.y = X.arenaRise / r; vault.position.copy(V(it.cx, it.cy, h)); vault.castShadow = true;
  g.add(vault); it.mats.push(vault.material); it.meshes.push(vault);
  const rib = mat(dark ? 0x9fc0ee : 0x8fa4c6, { metalness: .4 });
  for (let i = 1; i < 8; i++) {
    const tg2 = new THREE.TorusGeometry(r, .14, 6, 32, Math.PI); tg2.rotateY(Math.PI / 2);
    const t = new THREE.Mesh(tg2, rib); t.scale.y = X.arenaRise / r;
    t.position.copy(V(x0 + w * i / 8, it.cy, h + .05)); g.add(t);
  }
}

function buildConstruction(b, g, it, crane) {
  const { x0, x1, y0, y1 } = it.bb;
  g.add(flat(b.poly, PAL.dirt, .07));
  const orange = mat(PAL.detour), white = mat(0xf2f4f7);
  const ring = b.poly.concat([b.poly[0]]);
  for (let i = 0; i < ring.length - 1; i++) {
    const p0 = ring[i], p1 = ring[i + 1], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.max(1, Math.round(L / 2.4));
    for (let k = 0; k < n; k++) {
      const a = [p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n];
      const c = [p0[0] + (p1[0] - p0[0]) * (k + 1) / n, p0[1] + (p1[1] - p0[1]) * (k + 1) / n];
      const s = segment(a, c, 0, 1.7, .14, k % 2 ? orange : white); s.castShadow = true; g.add(s);
    }
  }
  let fx0 = x0 + 4, fx1 = x1 - 4, fy0 = y0 + 18, fy1 = y1 - 8;
  if (fy1 - fy0 < 8) { fy0 = y0 + 3; fy1 = y1 - 3; }
  const conc = mat(PAL.concrete), levels = b.floors;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 6; j++) {
    const px = fx0 + (fx1 - fx0) * i / 4, py = fy0 + (fy1 - fy0) * j / 6;
    g.add(box(px - .3, py - .3, px + .3, py + .3, 0, levels * FH, conc));
  }
  for (let lv = 1; lv <= levels; lv++) {
    const top = lv < levels ? fy1 : (fy0 + fy1) / 2;
    g.add(box(fx0 - .4, fy0 - .4, fx1 + .4, top + .4, lv * FH - .35, lv * FH, conc));
  }
  const pick = box(x0, y0, x1, y1, 0, levels * FH, new THREE.MeshBasicMaterial({ visible: false }), false);
  g.add(pick); it.meshes.push(pick);
  if (!crane) return;
  const yel = mat(PAL.crane, { metalness: .3, roughness: .5 }), mx = fx1 + 1.5, my = fy0 - 6, top = 15 * FH;
  g.add(box(mx - .45, my - .45, mx + .45, my + .45, 0, top, yel));
  g.add(box(mx - .35, my - 10, mx + .35, my + 34, top, top + .8, yel));
  g.add(box(mx - .9, my - 11.5, mx + .9, my - 8.5, top - 1.6, top, mat(0x5b6578)));
  g.add(box(mx - 1, my + .5, mx + 1, my + 2.5, top - 2.2, top, mat(0x2b3a55)));
  g.add(box(mx - .05, my + 23.95, mx + .05, my + 24.05, top - 16, top, mat(0x9aa3b2), false));
  g.add(box(mx - .8, my + 23.2, mx + .8, my + 24.8, top - 17, top - 16, mat(0x6a7385)));
}

C.blocks.forEach((b) => {
  const bb = bbox(b.poly);
  const it = { b, bb, cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2, h: blockHeight(b), mats: [], meshes: [], edges: [], group: new THREE.Group() };
  if (b.kind === "flower") {
    const xs = b.poly.map((p) => p[0]), ys = b.poly.map((p) => p[1]);
    it.cx = xs.reduce((a, v) => a + v) / xs.length; it.cy = ys.reduce((a, v) => a + v) / ys.length;
  }
  if (b.kind === "hall") buildHall(b, it.group, it);
  else if (b.kind === "kmk") buildKMK(b, it.group, it);
  else if (b.kind === "tower") buildTower(b, it.group, it);
  else if (b.kind === "flower") buildFlower(b, it.group, it);
  else if (b.kind === "arena") buildArena(b, it.group, it);
  else if (b.kind === "construction") buildConstruction(b, it.group, it, b.key === "СТРОЙ");
  else buildMain(b, it.group, it);
  it.mats.forEach((m) => { m.userData.base = m.color.clone(); });
  it.meshes.forEach((m) => { m.userData.key = b.key; });
  if (b.kind !== "link") pickables.push(...it.meshes);
  scene.add(it.group);
  blocks[b.key] = it;
});

// ---------- подписи и метки ----------
const labelsHost = $("#labels");
const labels = [];
C.blocks.forEach((b) => {
  if (!b.label) return;
  const it = blocks[b.key];
  const cls = "lbl" + (b.kind === "hall" ? " small" : "") + (b.kind === "construction" ? " warn" : "");
  const node = el("div", cls, b.label);
  node.addEventListener("click", (e) => { e.stopPropagation(); selectBlock(b.key); });
  labelsHost.appendChild(node);
  const at = b.labelAt || [it.cx, it.cy];
  labels.push({ key: b.key, node, pos: V(at[0], at[1], it.h + (b.kind === "hall" ? 1 : 2)) });
});
const pins = [];
function addPin(text, pos, cls) {
  const node = el("div", "pin" + (cls ? " " + cls : ""), text);
  labelsHost.appendChild(node);
  pins.push({ node, pos, pin: true });
}
function clearPins() { pins.splice(0).forEach((p) => p.node.remove()); }

const tmp = new THREE.Vector3();
function placeLabels() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const far = camera.position.distanceTo(controls.target);
  for (const it of labels) {
    tmp.copy(it.pos).project(camera);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.15 && Math.abs(tmp.y) < 1.15;
    const tiny = it.node.classList.contains("small") && far > 330 && !(focusKeys && focusKeys.has(it.key));
    it.node.style.display = vis && !tiny ? "" : "none";
    if (vis) it.node.style.transform = `translate(${(tmp.x * .5 + .5) * w}px, ${(-tmp.y * .5 + .5) * h}px) translate(-50%, -100%)`;
  }
  for (const it of pins) {
    tmp.copy(it.pos).project(camera);
    const vis = tmp.z < 1;
    it.node.style.display = vis ? "" : "none";
    if (vis) it.node.style.transform = `translate(${(tmp.x * .5 + .5) * w}px, ${(-tmp.y * .5 + .5) * h}px) translate(-50%, calc(-100% - 12px))`;
  }
}

// ---------- подсветка ----------
const ACC = new THREE.Color(PAL.accent), ACC_ROOF = new THREE.Color(PAL.accentRoof), WHITE = new THREE.Color(0xffffff);
let focusKeys = null;
function applyFocus(keys) {
  focusKeys = keys && keys.length ? new Set(keys) : null;
  for (const key in blocks) {
    const it = blocks[key];
    const on = focusKeys && focusKeys.has(key);
    const dim = focusKeys && !on && it.b.kind !== "construction";
    it.mats.forEach((m) => {
      const roof = m.map == null && !m.userData.glass;
      m.color.copy(on ? (roof ? ACC_ROOF : ACC) : m.userData.base);
      if (on && !roof && !dark) m.color.lerp(WHITE, .35);
      m.transparent = dim || !!m.userData.glass;
      m.opacity = dim ? .2 : (m.userData.glass ? .5 : 1);
      m.depthWrite = !dim && !m.userData.glass;
      m.needsUpdate = true;
    });
    it.group.traverse((o) => { if (o.isMesh) o.castShadow = !dim && o.material.visible !== false; });
    it.edges.forEach((e) => { e.material.opacity = dim ? PAL.edgeOp * .3 : PAL.edgeOp; });
  }
  labels.forEach((l) => {
    l.node.classList.toggle("on", !!(focusKeys && focusKeys.has(l.key)) && !l.node.classList.contains("warn"));
    l.node.classList.toggle("dim", !!(focusKeys && !focusKeys.has(l.key)));
  });
}

const floorGroup = new THREE.Group();
scene.add(floorGroup);
let floorPulse = null, currentZone = null, floorKey = null;
function clearFloor() {
  floorGroup.children.slice().forEach((c) => { floorGroup.remove(c); c.geometry.dispose(); });
  floorPulse = null;
}
function slab(it, floor, x0, x1, pad, opacity) {
  const y = (floor - .5) * FH;
  let geo;
  if (it.b.kind === "flower") { geo = new THREE.CylinderGeometry(15.5, 15.5, FH * .9, 24); }
  else geo = new THREE.BoxGeometry((x1 != null ? x1 - x0 : it.bb.x1 - it.bb.x0) + pad, FH * .9, it.bb.y1 - it.bb.y0 + pad);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PAL.floor, transparent: true, opacity, depthWrite: false }));
  m.position.copy(V(x1 != null ? (x0 + x1) / 2 : it.cx, it.cy, y));
  m.renderOrder = 5;
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: PAL.floor, transparent: true, opacity: .95 })));
  floorGroup.add(m);
  return m;
}
function showFloor(key, floor, xRange) {
  clearFloor();
  const it = blocks[key];
  if (!it || !floor) return;
  floorKey = key;
  slab(it, floor, null, null, .8, dark ? .3 : .35);
  if (xRange) floorPulse = slab(it, floor, xRange[0], xRange[1], 1.5, .85);
  renderFloors(key, floor);
}
const floorsBox = $("#floors");
function renderFloors(key, active) {
  const it = blocks[key];
  if (!it || !["main", "flower", "kmk", "tower"].includes(it.b.kind)) { floorsBox.classList.add("hidden"); return; }
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

// ---------- маршруты ----------
const routeGroup = new THREE.Group();
scene.add(routeGroup);
const flows = [];
let startRing = null;
function clearRoute() {
  routeGroup.children.slice().forEach((c) => { routeGroup.remove(c); if (c.geometry) c.geometry.dispose(); });
  flows.length = 0; startRing = null; clearPins();
}
function onTop(m) { m.depthTest = false; m.depthWrite = false; m.transparent = true; return m; }

function tube(pts, color, radius, opts) {
  const v = pts.map((p) => V(p[0], p[1], p[2] == null ? .3 : p[2]));
  const path = new THREE.CurvePath();
  for (let i = 0; i < v.length - 1; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
  const seg = Math.max(60, v.length * 50);
  const core = new THREE.Mesh(new THREE.TubeGeometry(path, seg, radius, 10, false), onTop(new THREE.MeshBasicMaterial({ color })));
  const glow = new THREE.Mesh(new THREE.TubeGeometry(path, seg, radius * 2.6, 10, false),
    onTop(new THREE.MeshBasicMaterial({ color, opacity: dark ? .3 : .2, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending })));
  core.renderOrder = 21; glow.renderOrder = 20;
  routeGroup.add(glow, core);
  if (opts && opts.dots) {
    const dots = [];
    for (let i = 0; i < opts.dots; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 14, 10), onTop(new THREE.MeshBasicMaterial({ color: 0xffffff })));
      s.renderOrder = 22; s.userData.u = i / opts.dots; routeGroup.add(s); dots.push(s);
    }
    flows.push({ path, dots, speed: opts.speed || .1 });
  }
  return v;
}
function startMarker(p, label) {
  startRing = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.8, 48), onTop(new THREE.MeshBasicMaterial({ color: PAL.start, side: THREE.DoubleSide })));
  startRing.rotation.x = -Math.PI / 2; startRing.position.copy(p).setY(.4); startRing.renderOrder = 22;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), onTop(new THREE.MeshBasicMaterial({ color: PAL.start, side: THREE.DoubleSide })));
  dot.rotation.x = -Math.PI / 2; dot.position.copy(p).setY(.42); dot.renderOrder = 23;
  routeGroup.add(startRing, dot);
  addPin(label, p.clone().setY(1), "start");
}
function endMarker(p, label) {
  const end = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 16), onTop(new THREE.MeshBasicMaterial({ color: PAL.target })));
  end.position.copy(p); end.renderOrder = 23; routeGroup.add(end);
  addPin(label, p.clone());
}
function showRoute(pts, label) {
  clearRoute();
  const v = tube(pts, PAL.route, .6, { dots: 8, speed: .12 });
  startMarker(v[0], "Вход");
  endMarker(v[v.length - 1], label);
}
function showBlocked() {
  const p = X.blocked, red = onTop(new THREE.MeshBasicMaterial({ color: PAL.blocked }));
  for (let i = 0; i < p.length - 1; i++) {
    const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]), n = Math.floor(L / 3);
    for (let k = 0; k < n; k++) {
      const a = [p[i][0] + (p[i + 1][0] - p[i][0]) * k / n, p[i][1] + (p[i + 1][1] - p[i][1]) * k / n];
      const c = [p[i][0] + (p[i + 1][0] - p[i][0]) * (k + .55) / n, p[i][1] + (p[i + 1][1] - p[i][1]) * (k + .55) / n];
      const s = segment(a, c, .5, 1.1, .6, red); s.renderOrder = 21; routeGroup.add(s);
    }
  }
  const mid = p[1];
  addPin("✕ Прохода нет", V(mid[0], mid[1], 2), "stop");
}
function showDetour(place) {
  clearRoute();
  showBlocked();
  const v = tube(X.detour[place].map((q) => [q[0], q[1], .35]), PAL.detour, .7, { dots: 10, speed: .05 });
  startMarker(v[0], "Выход: Холл 2");
  endMarker(v[v.length - 1], SPORT[place].split(" ")[0]);
}

// ---------- камера ----------
let fly = null, topView = false;
const ease = (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const VIEW_DIR = new THREE.Vector3(.42, .7, .58).normalize();
const narrow = () => camera.aspect < .9;
function flyTo(target, dist, dir, dur) {
  const d = (dir || camera.position.clone().sub(controls.target).normalize()).clone();
  if (!topView && d.y < .42) { d.y = .42; d.normalize(); }
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: target.clone().add(d.multiplyScalar(dist)),
    t1: target.clone(), start: performance.now(), dur: dur || 900 };
}
function frame(x0, y0, x1, y1, hgt, opts) {
  opts = opts || {};
  const span = Math.max(x1 - x0, y1 - y0, hgt || 0, 30);
  let dir = topView ? new THREE.Vector3(0, 1, .02) : (opts.dir || camera.position.clone().sub(controls.target)).clone();
  dir.normalize();
  if (!topView && dir.y < .42) { dir.y = .42; dir.normalize(); }
  const dist = Math.min(680, Math.max(narrow() ? 160 : 110, span * (narrow() ? 2.7 : 1.7) * (opts.k || 1)));
  // шторка снизу закрывает часть экрана — сдвигаем центр к камере, чтобы цель была выше
  const ground = new THREE.Vector3(dir.x, 0, dir.z);
  const lift = ground.length() > .01 ? ground.normalize().multiplyScalar(dist * (narrow() ? .085 : .03)) : new THREE.Vector3();
  const center = V((x0 + x1) / 2, (y0 + y1) / 2, (hgt || 0) * .3).add(lift);
  flyTo(center, dist, dir);
}
// на телефоне смотрим вдоль длинного КМК — так кампус помещается в вертикальный экран
const VIEW_DIR_NARROW = new THREE.Vector3(.78, .66, .2).normalize();
function overview(animate) {
  const d = narrow() ? 420 : 330;
  const c = narrow() ? V(118, 62, 0) : CENTER.clone();
  const dir = topView ? new THREE.Vector3(0, 1, .02).normalize() : (narrow() ? VIEW_DIR_NARROW : VIEW_DIR);
  if (animate) flyTo(c, d, dir);
  else { camera.position.copy(c.clone().add(dir.clone().multiplyScalar(d))); controls.target.copy(c); }
}
function frameKeys(keys) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, h = 0;
  keys.forEach((k) => { const it = blocks[k]; if (!it) return;
    x0 = Math.min(x0, it.bb.x0); x1 = Math.max(x1, it.bb.x1); y0 = Math.min(y0, it.bb.y0); y1 = Math.max(y1, it.bb.y1); h = Math.max(h, it.h); });
  frame(x0, y0, x1, y1, h);
}
function framePts(pts, k, dir) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  frame(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 0, { k, dir });
}
// ---------- кнопки и жесты камеры ----------
const camDist = () => camera.position.distanceTo(controls.target);
const camDir = () => camera.position.clone().sub(controls.target).normalize();
const clampDist = (d) => Math.min(controls.maxDistance, Math.max(controls.minDistance, d));

// точка на земле под пальцем/курсором
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 }, camera);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(groundPlane, p) ? p : null;
}
// масштаб к точке: то, что под курсором, остаётся под курсором
function zoomAt(clientX, clientY, f) {
  const d = camDist(), nd = clampDist(d * f);
  f = nd / d;
  const p = groundAt(clientX, clientY) || controls.target.clone();
  camera.position.sub(p).multiplyScalar(f).add(p);
  controls.target.sub(p).multiplyScalar(f).add(p);
}
function zoomBy(f) { flyTo(controls.target.clone(), clampDist(camDist() * f), camDir(), 320); }
function rotateBy(angle) {
  const dir = camDir().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  flyTo(controls.target.clone(), camDist(), dir, 420);
}

$("#t-home").onclick = () => { tick(); overview(true); };
$("#t-top").onclick = () => {
  tick(); topView = !topView; $("#t-top").classList.toggle("on", topView);
  $("#t-top").querySelector("b").textContent = topView ? "3D" : "2D";
  const dir = topView ? new THREE.Vector3(0, 1, .02).normalize() : (narrow() ? VIEW_DIR_NARROW : VIEW_DIR);
  flyTo(controls.target.clone(), camDist(), dir, 600);
};
$("#t-in").onclick = () => { tick(); zoomBy(.6); };
$("#t-out").onclick = () => { tick(); zoomBy(1.65); };
$("#t-left").onclick = () => { tick(); rotateBy(-Math.PI / 4); };
$("#t-right").onclick = () => { tick(); rotateBy(Math.PI / 4); };
// компас: выровнять вид — фасад КМК с холлами к себе
$("#t-north").onclick = () => {
  tick();
  const dir = camDir(), polar = Math.acos(Math.min(1, dir.y));
  flyTo(controls.target.clone(), camDist(), new THREE.Vector3(0, Math.cos(polar), Math.sin(polar)), 500);
};
const needle = $("#t-north svg");

// колесо мыши — масштаб к курсору (перехватываем раньше стандартного)
host.addEventListener("wheel", (e) => {
  e.preventDefault(); e.stopPropagation();
  fly = null;
  const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  zoomAt(e.clientX, e.clientY, Math.exp(Math.max(-120, Math.min(120, dy)) * .0016));
  sheet.classList.add("peek");
}, { capture: true, passive: false });

// подсказка по жестам — один раз
try {
  if (!localStorage.getItem("nav-hint")) {
    setTimeout(() => toast(matchMedia("(pointer: coarse)").matches
      ? "Один палец — двигать карту · два — масштаб и поворот"
      : "Тяни — двигать · правая кнопка — поворот · колесо — масштаб"), 1200);
    localStorage.setItem("nav-hint", "1");
  }
} catch (e) {}

// ---------- шторка ----------
const sheet = $("#sheet"), sheetBody = $("#sheet-body");
function setSheet(title, sub, tags, body, expanded) {
  sheetBody.innerHTML = `
    <div class="sheet-head" id="sh-head"><div class="tt"><h2>${title}</h2><div class="sub">${sub}</div></div>
      <svg class="i more" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></div>
    ${tags ? `<div class="row">${tags}</div>` : ""}${body || ""}`;
  sheet.classList.toggle("peek", !expanded);
  sheet.scrollTop = 0;
  $("#sh-head").onclick = () => { tick(); sheet.classList.toggle("peek"); };
}
const QUICK = [["КМК 415", "КМК 415"], ["511 Г УЛБ", "511 Г УЛБ"], ["УЛК 108", "УЛК 108"], ["🏃 Спорткомплекс", "спорткомплекс", "sport"],
  ["Манеж", "манеж", "sport"], ["КПА 5", "КПА 5"]];
function homeSheet() {
  const ids = ["КМК", "УЛК", "КПА", "УЛБ", "Ректорат", "Спорт"];
  const minis = ids.map((id) => { const p = C.places.find((x) => x.id === id); return p ?
    `<button class="mini" data-place="${id}">${id === "Спорт" ? "Спорт" : p.title.split(" ")[0]}<b>${id === "Спорт" ? "в обход" : (p.chips[0] || "")}</b></button>` : ""; }).join("");
  setSheet(`<img class="emb" src="emblem.png" alt="">Навигатор МГСУ`, "Найди аудиторию или нажми на корпус", "", `<div class="mini-grid">${minis}</div>`, false);
  sheetBody.querySelectorAll("[data-place]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); tick(); selectPlace(C.places.find((p) => p.id === b.dataset.place)); });
}
function resultSheet(loc) {
  const d = describe(loc);
  const tags = (loc.floor ? `<span class="tag a">${loc.floor} этаж</span>` : "") + `<span class="tag g">Вход: Холл ${loc.hall}</span>` +
    (loc.side ? `<span class="tag">${loc.side[0].toUpperCase() + loc.side.slice(1)}</span>` : "");
  setSheet(d.title, d.sub, tags, `
    <ol class="steps">${d.steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${s}</span></li>`).join("")}</ol>
    <div class="note">${d.note}</div>
    <div class="actions"><button class="btn" id="reset">Сбросить</button><button class="btn primary" id="again">Другая аудитория</button></div>`, true);
  $("#reset").onclick = () => { tick(); reset(); };
  $("#again").onclick = () => { tick(); $("#q").value = ""; $("#q").focus(); };
}
function sportSheet(place) {
  const m = detourMeters(place), min = Math.max(1, Math.round(m / 75));
  const steps = ["Выйди из КМК на улицу через <b>Холл 2</b>", "Позади КМК <b>стройка</b> — напрямую через территорию не пройти",
    "Иди <b>направо</b> вдоль фасада, мимо Столовой и КПА, за угол ограды",
    `Обогни кампус по улице вдоль забора — до входа в <b>${SPORT[place].split(" ")[0]}</b>`];
  setSheet(SPORT[place], "Позади КМК стройка — идём в обход снаружи",
    `<span class="tag a">≈${m} м · ~${min} мин</span><span class="tag o">Обход снаружи</span><span class="tag g">Выход: Холл 2</span>`, `
    <ol class="steps">${steps.map((s, i) => `<li><span class="n">${i + 1}</span><span>${s}</span></li>`).join("")}</ol>
    <div class="note warn">Оранжевая линия — обход, красная — закрытый прямой путь. Проходы у стройки могут меняться — сверяйся на месте.</div>
    <div class="actions"><button class="btn" id="reset">Сбросить</button><button class="btn primary" id="other">${place === "СОК" ? "Манеж" : "Спорткомплекс"}</button></div>`, true);
  $("#reset").onclick = () => { tick(); reset(); };
  $("#other").onclick = () => { tick(); selectSport(place === "СОК" ? "МАН" : "СОК"); };
}
function placeSheet(place, key) {
  const it = blocks[key];
  const tags = place.chips.map((c, i) => `<span class="tag${i === 0 ? " a" : ""}">${c}</span>`).join("");
  const title = it && it.b.label && PARTS.includes(key) ? it.b.label : place.title;
  setSheet(title, place.subtitle, tags, `<div class="html" style="margin-top:10px">${place.html}</div>
    <div class="actions"><button class="btn" id="reset">Сбросить</button></div>`, true);
  $("#reset").onclick = () => { tick(); reset(); };
}

// ---------- действия ----------
function toast(text) {
  const t = $("#toast"); t.textContent = text; t.classList.add("show");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 2400);
}
function resetState() { clearRoute(); clearFloor(); applyFocus(null); currentZone = null; floorsBox.classList.add("hidden"); }
function reset() { resetState(); homeSheet(); overview(true); }

function selectSport(place) {
  showTab("map"); resetState();
  applyFocus([place]);
  showDetour(place);
  sportSheet(place);
  framePts(X.detour[place].concat(X.blocked), .72, new THREE.Vector3(.35, .9, .25));
  haptic("medium");
}
function selectPlace(place) {
  if (!place) return;
  if (place.id === "Спорт") { selectSport("СОК"); return; }
  showTab("map"); resetState();
  applyFocus(place.keys);
  const keys = place.keys.filter((k) => blocks[k]);
  if (keys.length === 1) renderFloors(keys[0], null);
  placeSheet(place, keys[0]);
  frameKeys(keys);
  haptic();
}
function selectBlock(key) {
  const it = blocks[key];
  if (!it) return;
  tick();
  if (key === "СОК" || key === "МАН") { selectSport(key); return; }
  if (it.b.kind === "construction") {
    showTab("map"); resetState(); applyFocus([key]); showBlocked();
    setSheet(it.b.label, "Территория огорожена", `<span class="tag o">Прохода нет</span>`,
      `<div class="note warn" style="margin-top:10px">Позади КМК строят второй корпус — пройти между холлами к спорткомплексу и манежу нельзя. Иди в обход снаружи.</div>
      <div class="actions"><button class="btn" id="reset">Сбросить</button><button class="btn primary" id="go">Как пройти в спорткомплекс</button></div>`, true);
    $("#reset").onclick = () => { tick(); reset(); };
    $("#go").onclick = () => { tick(); selectSport("СОК"); };
    frameKeys([key]);
    return;
  }
  const place = C.places.find((p) => p.keys.includes(key));
  if (!place) return;
  if (PARTS.includes(key)) {
    showTab("map"); resetState(); applyFocus([key]); renderFloors(key, null); placeSheet(place, key); frameKeys([key]);
    return;
  }
  selectPlace(place);
}

function search(text) {
  const q = parse(text || "");
  if (q.place && !q.number) { selectSport(q.place); return; }
  if (!q.number) {
    if (q.building) { const p = C.places.find((pl) => pl.id === q.building); if (p) { selectPlace(p); return; } }
    toast("Напиши номер: например, КМК 415"); return;
  }
  if (!q.building) { toast(`В каком корпусе ${q.number}? Например: КМК ${q.number}`); return; }
  if (q.building === "УЛБ" && !q.part) { toast(`Укажи корпус УЛБ — например «${q.number} Г УЛБ»`); return; }
  const loc = locate(q.building, q.number, q.part);
  if (loc.building === "КМК" && loc.floor == null) { toast("В КМК номер трёхзначный: этаж + кабинет"); return; }
  showTab("map"); resetState();
  const key = loc.building === "УЛБ" ? loc.part : loc.building;
  applyFocus([key, loc.hall === 1 ? "Х1" : "Х2"]);
  if (loc.building === "КМК" && loc.zone != null) {
    const h1 = C.hallX["1"], h2 = C.hallX["2"];
    currentZone = [[C.kmkX[0], h1], [h1, 114], [114, h2], [h2, C.kmkX[1]]][loc.zone];
  }
  if (loc.floor) showFloor(key, loc.floor, currentZone);
  const pts = routePoints(loc);
  showRoute(pts, loc.number);
  resultSheet(loc);
  framePts(pts, 1.25);
  haptic("medium");
  if (document.activeElement) document.activeElement.blur();
}

$("#search").addEventListener("submit", (e) => { e.preventDefault(); search($("#q").value); });
QUICK.forEach(([t, q, cls]) => {
  const b = el("button", "chip glass" + (cls ? " " + cls : ""), t);
  b.onclick = () => { tick(); $("#q").value = q === "спорткомплекс" || q === "манеж" ? "" : q; search(q); };
  $("#quick").appendChild(b);
});

// жесты: пока крутишь карту — интерфейс полупрозрачный, шторка сворачивается
controls.addEventListener("start", () => { document.body.classList.add("dragging"); sheet.classList.add("peek"); fly = null; });
controls.addEventListener("end", () => document.body.classList.remove("dragging"));
let down = null, lastTap = null, tapTimer = null;
renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 450) return;
  const now = performance.now();
  // двойной тап — приблизить в эту точку
  if (lastTap && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
    clearTimeout(tapTimer); lastTap = null;
    const p = groundAt(e.clientX, e.clientY);
    if (p) { haptic(); flyTo(p, clampDist(camDist() * .5), camDir(), 450); }
    return;
  }
  lastTap = { x: e.clientX, y: e.clientY, t: now };
  const cx = e.clientX, cy = e.clientY;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => pickAt(cx, cy), 260);
});
function pickAt(clientX, clientY) {
  const e = { clientX, clientY };
  const r = renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
  const hit = ray.intersectObjects(pickables, false).find((h) => {
    const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
    return !(focusKeys && m && m.opacity < .3);
  });
  if (hit) selectBlock(hit.object.userData.key);
}

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
  crane: '<path d="M6 21V4M6 4h14M6 8l4-4M16 4v6M3 21h6"/><rect x="14" y="10" width="4" height="3"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
};
const svg = (n) => `<svg class="i" viewBox="0 0 24 24">${ICON[n]}</svg>`;

(function buildPlaces() {
  const abbr = { "КМК": "КМК", "УЛК": "УЛК", "КПА": "КПА", "УЛБ": "УЛБ", "Ректорат": "РЕК", "Библиотека": "НТБ", "Столовая": "ЕДА", "Спорт": "СОК", "Ещё": "•••" };
  const page = $("#places");
  page.innerHTML = `<h1>Корпуса</h1><p class="lead">Аббревиатуры из расписания и как дойти</p>
    <div class="section">Учебные корпуса</div><div class="list" id="pl-main"></div>
    <div class="section">Корпуса УЛБ</div><div class="grid2" id="pl-ulb"></div>
    <div class="section">Спорт · только в обход</div><div class="list" id="pl-sport"></div>
    <div class="section">Кампус</div><div class="list" id="pl-other"></div>`;
  C.places.forEach((p) => {
    const sport = p.id === "Спорт";
    const item = el("button", "item", `<span class="abbr${sport ? " o" : ""}">${abbr[p.id] || p.title.slice(0, 3)}</span>
      <span><div class="t">${p.title === p.id ? p.subtitle.split(" · ")[0] : p.title}</div><div class="d">${p.subtitle}</div></span>
      <span class="chev">${svg("chev")}</span>`);
    item.onclick = () => { tick(); selectPlace(p); };
    $(["КМК", "УЛК", "КПА", "УЛБ"].includes(p.id) ? "#pl-main" : sport ? "#pl-sport" : "#pl-other").appendChild(item);
  });
  const colors = { "А": "#1D3B6F", "Б": "#2E62B0", "В": "#169EC4", "Г": "#4FA3E0" };
  const desc = { "А": "Сразу за переходом из КМК · деканат ФМО", "Б": "Через А и Г, прямо", "В": "Через А и Г, налево", "Г": "Центральный, за корпусом А" };
  PARTS.forEach((k) => {
    const t = el("button", "tile", `<span class="ico" style="background:${colors[k]}">${k}</span>
      <span class="t">Корпус ${k}</span><span class="d">${desc[k]}</span>`);
    t.onclick = () => { selectBlock(k); showTab("map"); };
    $("#pl-ulb").appendChild(t);
  });
})();

(function buildUseful() {
  const S = [
    ["Туалеты", [["wc", "#2E62B0", "Холл 1", "У входа в КМК", ["Х1"]], ["wc", "#2E62B0", "Холл 2", "У входа в КМК", ["Х2"]],
      ["wc", "#2E62B0", "Библиотека", "Рядом с Инфоцентром", ["НТБ"]], ["wc", "#2E62B0", "УЛК", "Внутри корпуса", ["УЛК"]],
      ["wc", "#2E62B0", "Столовая", "Правый край КМК", ["СТОЛ"]]]],
    ["Здоровье", [["plus", "#E5484D", "Здравпункт", "У перехода из КМК в корпус А", ["А"]],
      ["pill", "#169EC4", "Аптека", "Рядом со здравпунктом", ["А"]]]],
    ["Справка", [["info", "#1D3B6F", "Инфоцентр", "У главного входа, между Ректоратом и Библиотекой", ["РЕК", "НТБ"]],
      ["cap", "#3B7FCB", "Деканат ФМО", "Корпус А, УЛБ", ["А"]],
      ["shield", "#566C93", "Военно-учётный стол", "«Свечка» · 4 этаж, каб. 404", ["РЕК"], 4],
      ["door", "#4FA3E0", "Приёмная комиссия", "В КМК, правее Холла 2", ["КМК"]]]],
    ["Спорт и отдых", [["ball", "#F07A2A", "Спорткомплекс", "За стройкой · только в обход", "СОК"],
      ["ball", "#F07A2A", "Манеж", "За стройкой · только в обход", "МАН"],
      ["food", "#4FA3E0", "Столовая «Грабли»", "За Холлом 2", ["СТОЛ"]],
      ["book", "#2E62B0", "Библиотека", "МОЦОС — на 2 этаже", ["НТБ"]],
      ["crane", "#F07A2A", "Стройка", "Позади КМК, прохода нет", ["СТРОЙ"]]]],
  ];
  const page = $("#useful");
  page.innerHTML = `<h1>Полезное</h1><p class="lead">Нажми на карточку — покажу на 3D-карте</p>`;
  S.forEach(([title, items]) => {
    page.appendChild(el("div", "section", title));
    const grid = el("div", "grid2");
    items.forEach(([ic, color, t, d, keys, floor]) => {
      const tile = el("button", "tile", `<span class="ico" style="background:${color}">${svg(ic)}</span><span class="t">${t}</span><span class="d">${d}</span>`);
      tile.onclick = () => {
        tick();
        if (typeof keys === "string") { selectSport(keys); return; }
        if (keys[0] === "СТРОЙ") { selectBlock("СТРОЙ"); return; }
        showTab("map"); resetState(); applyFocus(keys);
        if (floor) showFloor(keys[0], floor);
        setSheet(t, d, "", `<div class="actions"><button class="btn" id="reset">Сбросить</button></div>`, false);
        $("#reset").onclick = () => { tick(); reset(); };
        frameKeys(keys);
      };
      grid.appendChild(tile);
    });
    page.appendChild(grid);
  });
})();

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
      <div class="item"><span class="abbr o">СОК</span><span><div class="t">Спорткомплекс и Манеж</div><div class="d">Позади КМК стройка — только в обход снаружи, ≈1 км</div></span></div>
    </div>
    <div class="section">Из расписания</div>
    <div class="card"><div style="font-weight:800">Вставь как есть</div>
      <div style="color:var(--muted);font-size:12px;margin-top:4px">В расписании аудитории записаны так: <b>511 Г УЛБ</b>, <b>108 УЛК</b>. Скопируй и вставь в поиск на карте.</div>
      <div class="chips" style="margin-top:10px" id="g-try"></div></div>`;
  ["511 Г УЛБ", "108 УЛК", "КМК 415", "спорткомплекс"].forEach((q) => {
    const b = el("button", "chip glass", q); b.onclick = () => { tick(); $("#q").value = q; search(q); };
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

const LIMIT = { x0: -30, x1: 250, y0: -60, y1: 320 };
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
  // камера не улетает от кампуса
  const tgt = controls.target;
  const cx = Math.min(LIMIT.x1, Math.max(LIMIT.x0, tgt.x)), cz = Math.min(-LIMIT.y0, Math.max(-LIMIT.y1, tgt.z));
  if (cx !== tgt.x || cz !== tgt.z) { camera.position.x += cx - tgt.x; camera.position.z += cz - tgt.z; tgt.x = cx; tgt.z = cz; }
  controls.update();
  needle.style.transform = `rotate(${controls.getAzimuthalAngle()}rad)`;
  flows.forEach((f) => f.dots.forEach((d) => d.position.copy(f.path.getPointAt((d.userData.u + t * f.speed) % 1))));
  if (startRing) { const s = 1 + .35 * Math.sin(t * 4); startRing.scale.set(s, s, s); }
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
