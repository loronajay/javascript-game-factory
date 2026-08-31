import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js';

const TILE = 2.25;
const WALL_H = 3.15;
const EYE_H = 1.58;
const PLAYER_R = 0.34;
const WALK_SPEED = 3.35;
const SPRINT_SPEED = 5.15;
const FIXED_DT = 1 / 60;
const POWER_MS = 9000;

const FALLBACK_RAW = [
  '###################################',
  '#S.........#......#...#.#...#...#T#',
  '####.#####.#.####.#.#.#.#.#.#.#.#.#',
  '#........#.#.#...A#.#.#.###...#P#.#',
  '#.######.#.#.#.######.#.....#####.#',
  '#..#.....#.#.#.#......##.####.....#',
  '##.#P#####.....#.#.##..#......#.#.#',
  '##.###...#######.#....#########.#.#',
  '##.#...#......#######.....#.....#.#',
  '##.#.########P#.......###.#.#####.#',
  '##D#.#......#.#######.#A#.#.#.....#',
  '##.#.#.####.#.#BBBBB#.#.#.#.#.#####',
  '##...#..#.#.#.#BBBBB#.#.#.#.#.....#',
  '##.######.....#BBBBB#.#.#.#.#####A#',
  '##.#.#.P#.###.#BBBBB#.#.#.#.....###',
  '##.#.#.##.#.#.#BBBBB#.#.#.#####D#P#',
  '#....#.####.#####D###.#.#P#...#.#.#',
  '#.##.#..........#.#.#.#.###.#.#.#.#',
  '#.#..#.####.###.#...#.......#.#.#.#',
  '#.#.##...A#.#.#.###.#.#####.#...#.#',
  '#.#.#######.#.#.#.#.....#.#.#.###.#',
  '#.#.#.....#.#.#.#.#.#.#...#.......#',
  '#.#.#####.#.#.###.#.#.######.######',
  '#.#.....#.........#.#.##.#P#......#',
  '#.#######.###.#####.#.##.#.#.####.#',
  '#P........#.........#....#........#',
  '###################################'
];


const app = document.querySelector('#app');
const statusText = document.querySelector('#statusText');
const messageEl = document.querySelector('#message');
const minimap = document.querySelector('#minimap');
const minimapCtx = minimap.getContext('2d');
const minimapWrap = document.querySelector('#minimapWrap');
const lockScreen = document.querySelector('#lockScreen');
const movePad = document.querySelector('#movePad');
const moveKnob = document.querySelector('#moveKnob');
const lookZone = document.querySelector('#lookZone');
const sprintBtn = document.querySelector('#sprintBtn');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b151b);
// Readability-first facility fog. The original proof was too dense/dark for navigation.
scene.fog = new THREE.FogExp2(0x0d1a21, 0.015);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 180);
camera.rotation.order = 'YXZ';
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.domElement.className = 'webgl';
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
app.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xb8e7f2, 0x233038, 1.35);
scene.add(hemi);

// Constant base illumination keeps the maze readable without relying on the flashlight.
const ambient = new THREE.AmbientLight(0x78939c, 0.82);
scene.add(ambient);

const facilityFill = new THREE.DirectionalLight(0xcbeef5, 0.72);
facilityFill.position.set(-0.35, 1, 0.25);
scene.add(facilityFill);

const flashlight = new THREE.SpotLight(0xd9fbff, 19, 26, Math.PI / 4.2, 0.48, 1.2);
flashlight.position.set(0, -0.02, 0.04);
flashlight.target.position.set(0, -0.05, -1);
camera.add(flashlight);
camera.add(flashlight.target);

const suitGlow = new THREE.PointLight(0x66e8ff, 2.6, 7.5, 1.45);
suitGlow.position.set(0, -0.35, 0.15);
camera.add(suitGlow);

const state = {
  def: null,
  raw: [],
  width: 0,
  height: 0,
  start: { x: 1, y: 1 },
  chips: 0,
  powerUntil: 0,
  won: false,
  pickups: new Map(),
  doors: new Map(),
  goalCells: new Set(),
  meshes: { pickups: new Map(), doors: new Map(), core: [] },
  keys: new Set(),
  yaw: 0,
  pitch: 0,
  velocity: new THREE.Vector3(),
  touchMove: new THREE.Vector2(),
  touchSprint: false,
  lastCellKey: '',
  elapsed: 0,
  accumulator: 0,
  lastFrame: performance.now(),
  messageTimer: 0,
};

function cellKey(x, y) { return `${x},${y}`; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function hash2(x, y) {
  let n = (x * 374761393 + y * 668265263) >>> 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return (n ^ (n >> 16)) >>> 0;
}

async function loadMap() {
  let def;
  try {
    const response = await fetch('../maps/map-01.txt', { cache: 'no-store' });
    if (!response.ok) throw new Error(`map-01 load failed (${response.status})`);
    const source = await response.text();
    try {
      // Trusted authored file from this repository. This preserves the existing JS-object map format.
      def = Function(`"use strict"; return (${source});`)();
    } catch (error) {
      console.warn('Full map object parse failed; using raw-grid parser.', error);
      def = { id: 'map-01', raw: extractRawGrid(source), hazards: {} };
    }
  } catch (error) {
    // Portable demo fallback. In the repository, ../maps/map-01.txt remains the source of truth.
    console.warn('Canonical map file unavailable; using bundled map-01 grid snapshot.', error);
    def = { id: 'map-01-fallback', raw: FALLBACK_RAW, hazards: {} };
  }
  if (!Array.isArray(def.raw) || !def.raw.length) throw new Error('map-01 has no raw grid');
  const width = def.raw[0].length;
  if (!def.raw.every((row) => row.length === width)) throw new Error('map-01 rows are not rectangular');
  return def;
}

function extractRawGrid(source) {
  const rawMatch = source.match(/raw\s*:\s*\[([\s\S]*?)\]\s*,\s*hazards\s*:/);
  if (!rawMatch) throw new Error('Could not locate raw map array');
  return [...rawMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function parseGrid(def) {
  state.def = def;
  state.raw = def.raw;
  state.width = def.raw[0].length;
  state.height = def.raw.length;
  state.pickups.clear();
  state.doors.clear();
  state.goalCells.clear();

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.raw[y][x];
      if (cell === 'S') state.start = { x, y };
      if (cell === 'A') state.pickups.set(cellKey(x, y), { x, y, type: 'chip', active: true });
      if (cell === 'P') state.pickups.set(cellKey(x, y), { x, y, type: 'power', active: true });
      if (cell === 'D') state.doors.set(cellKey(x, y), { x, y, open: false, lift: 0 });
      if (cell === 'B') state.goalCells.add(cellKey(x, y));
    }
  }
}

function gridToWorld(x, y) {
  return {
    x: (x + 0.5 - state.width / 2) * TILE,
    z: (y + 0.5 - state.height / 2) * TILE,
  };
}

function worldToGrid(x, z) {
  return {
    x: Math.floor(x / TILE + state.width / 2),
    y: Math.floor(z / TILE + state.height / 2),
  };
}

function rawCell(x, y) {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return '#';
  return state.raw[y][x];
}

function isWallCell(x, y) { return rawCell(x, y) === '#'; }
function isClosedDoorCell(x, y) {
  const door = state.doors.get(cellKey(x, y));
  return Boolean(door && !door.open);
}

function buildWorld() {
  const worldW = state.width * TILE;
  const worldH = state.height * TILE;

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2a3c44, emissive: 0x0c171b, emissiveIntensity: 0.45,
    roughness: 0.82, metalness: 0.18
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x26343a, emissive: 0x0b1417, emissiveIntensity: 0.38,
    roughness: 0.9, metalness: 0.08, side: THREE.DoubleSide
  });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H;
  scene.add(ceiling);

  const wallCells = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) if (isWallCell(x, y)) wallCells.push({ x, y });
  }

  const wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x43575f, emissive: 0x101b20, emissiveIntensity: 0.42,
    roughness: 0.7, metalness: 0.24
  });
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  walls.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const matrix = new THREE.Matrix4();
  wallCells.forEach((cell, index) => {
    const p = gridToWorld(cell.x, cell.y);
    matrix.makeTranslation(p.x, WALL_H / 2, p.z);
    walls.setMatrixAt(index, matrix);
  });
  scene.add(walls);

  // Deterministic corridor light strips. Visual dressing is coordinate-derived, not random.
  const lightGeo = new THREE.BoxGeometry(0.46, 0.025, 0.08);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xb9f7ff });
  const stripCells = [];
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - 1; x++) {
      if (isWallCell(x, y)) continue;
      if (hash2(x, y) % 19 === 0) stripCells.push({ x, y });
    }
  }
  const strips = new THREE.InstancedMesh(lightGeo, lightMat, stripCells.length);
  stripCells.forEach((cell, index) => {
    const p = gridToWorld(cell.x, cell.y);
    matrix.makeTranslation(p.x, WALL_H - 0.035, p.z);
    strips.setMatrixAt(index, matrix);
  });
  scene.add(strips);

  // A limited number of real ceiling lights provide readable corridor fill on desktop and mobile.
  // Placement is coordinate-derived, so the lighting layout is deterministic for a given map.
  for (const cell of stripCells) {
    if (hash2(cell.x + 91, cell.y + 47) % 3 !== 0) continue;
    const p = gridToWorld(cell.x, cell.y);
    const light = new THREE.PointLight(0xb9f7ff, 2.1, TILE * 4.2, 1.65);
    light.position.set(p.x, WALL_H - 0.22, p.z);
    scene.add(light);
  }

  const borderGlow = new THREE.GridHelper(Math.max(worldW, worldH), Math.max(state.width, state.height), 0x12323a, 0x09151a);
  borderGlow.position.y = 0.006;
  borderGlow.material.opacity = 0.18;
  borderGlow.material.transparent = true;
  scene.add(borderGlow);

  buildPickups();
  buildDoors();
  buildBeaconCore();
}

function buildPickups() {
  const chipGeo = new THREE.OctahedronGeometry(0.24, 0);
  const powerGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.54, 10);
  const chipMat = new THREE.MeshStandardMaterial({ color: 0x5bf4ff, emissive: 0x0dc3df, emissiveIntensity: 2.8, metalness: 0.35, roughness: 0.2 });
  const powerMat = new THREE.MeshStandardMaterial({ color: 0xffdd68, emissive: 0xff9b13, emissiveIntensity: 2.1, metalness: 0.25, roughness: 0.22 });

  for (const [key, pickup] of state.pickups) {
    const mesh = new THREE.Mesh(pickup.type === 'chip' ? chipGeo : powerGeo, pickup.type === 'chip' ? chipMat : powerMat);
    const p = gridToWorld(pickup.x, pickup.y);
    mesh.position.set(p.x, pickup.type === 'chip' ? 0.74 : 0.53, p.z);
    mesh.userData.baseY = mesh.position.y;
    mesh.userData.phase = (hash2(pickup.x, pickup.y) % 1000) / 1000 * Math.PI * 2;
    scene.add(mesh);
    state.meshes.pickups.set(key, mesh);
  }
}

function buildDoors() {
  const geoX = new THREE.BoxGeometry(0.11, WALL_H * 0.92, TILE * 0.82);
  const geoZ = new THREE.BoxGeometry(TILE * 0.82, WALL_H * 0.92, 0.11);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff5375, emissive: 0xff1647, emissiveIntensity: 3.6,
    transparent: true, opacity: 0.68, metalness: 0.08, roughness: 0.25,
  });

  for (const [key, door] of state.doors) {
    const lrOpen = !isWallCell(door.x - 1, door.y) || !isWallCell(door.x + 1, door.y);
    const udOpen = !isWallCell(door.x, door.y - 1) || !isWallCell(door.x, door.y + 1);
    const corridorEastWest = lrOpen && !udOpen ? true : (lrOpen && udOpen ? true : false);
    const mesh = new THREE.Mesh(corridorEastWest ? geoX : geoZ, mat.clone());
    const p = gridToWorld(door.x, door.y);
    mesh.position.set(p.x, WALL_H * 0.46, p.z);
    scene.add(mesh);
    state.meshes.doors.set(key, mesh);
  }
}

function buildBeaconCore() {
  const goalMat = new THREE.MeshStandardMaterial({ color: 0x2aa4b2, emissive: 0x12ddef, emissiveIntensity: 2.8, metalness: 0.32, roughness: 0.28 });
  const tileGeo = new THREE.BoxGeometry(TILE * 0.94, 0.08, TILE * 0.94);
  const centers = [];
  for (const key of state.goalCells) {
    const [x, y] = key.split(',').map(Number);
    const p = gridToWorld(x, y);
    const tile = new THREE.Mesh(tileGeo, goalMat);
    tile.position.set(p.x, 0.045, p.z);
    scene.add(tile);
    state.meshes.core.push(tile);
    centers.push(p);
  }

  if (centers.length) {
    const center = centers.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 });
    center.x /= centers.length; center.z /= centers.length;
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.92, 1.05, 12),
      new THREE.MeshStandardMaterial({ color: 0x163038, emissive: 0x0b5763, emissiveIntensity: 1.2, metalness: 0.75, roughness: 0.2 })
    );
    pedestal.position.set(center.x, 0.52, center.z);
    scene.add(pedestal);

    const beacon = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.54, 1),
      new THREE.MeshStandardMaterial({ color: 0xc6fbff, emissive: 0x27e7ff, emissiveIntensity: 5, roughness: 0.12, metalness: 0.15 })
    );
    beacon.position.set(center.x, 1.55, center.z);
    beacon.userData.beacon = true;
    scene.add(beacon);
    state.meshes.beacon = beacon;

    const light = new THREE.PointLight(0x72f2ff, 9.5, TILE * 9, 1.35);
    light.position.set(center.x, 1.7, center.z);
    scene.add(light);
  }
}

function resetPlayer() {
  const p = gridToWorld(state.start.x, state.start.y);
  camera.position.set(p.x, EYE_H, p.z);
  state.yaw = 0;
  state.pitch = 0;
  state.chips = 0;
  state.powerUntil = 0;
  state.won = false;
  state.lastCellKey = '';
  for (const [key, pickup] of state.pickups) {
    pickup.active = true;
    const mesh = state.meshes.pickups.get(key);
    if (mesh) mesh.visible = true;
  }
  for (const [key, door] of state.doors) {
    door.open = false;
    door.lift = 0;
    const mesh = state.meshes.doors.get(key);
    if (mesh) { mesh.visible = true; mesh.position.y = WALL_H * 0.46; }
  }
  showMessage('Emergency recall: returned to start.', 1200);
  updateStatus();
}

function attemptDoorOpen(x, y) {
  const key = cellKey(x, y);
  const door = state.doors.get(key);
  if (!door || door.open) return true;
  if (state.chips <= 0) {
    showMessage('Laser Door requires an Access Chip.', 900);
    return false;
  }
  state.chips--;
  door.open = true;
  showMessage('Laser Door disabled.', 900);
  updateStatus();
  return true;
}

function circleIntersectsCell(px, pz, cx, cy, radius) {
  const p = gridToWorld(cx, cy);
  const half = TILE / 2;
  const nearestX = clamp(px, p.x - half, p.x + half);
  const nearestZ = clamp(pz, p.z - half, p.z + half);
  const dx = px - nearestX;
  const dz = pz - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

function canOccupy(px, pz, canOpenDoors = true) {
  const g = worldToGrid(px, pz);
  for (let y = g.y - 1; y <= g.y + 1; y++) {
    for (let x = g.x - 1; x <= g.x + 1; x++) {
      const blockedWall = isWallCell(x, y);
      const door = state.doors.get(cellKey(x, y));
      if (!blockedWall && (!door || door.open)) continue;
      if (!circleIntersectsCell(px, pz, x, y, PLAYER_R)) continue;
      if (door && !door.open && canOpenDoors && attemptDoorOpen(x, y)) continue;
      return false;
    }
  }
  return true;
}

function fixedUpdate(dt) {
  if (!state.def || state.won) return;

  let forward = 0;
  let strafe = 0;
  if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) forward += 1;
  if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) forward -= 1;
  if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) strafe += 1;
  if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) strafe -= 1;
  strafe += state.touchMove.x;
  forward += -state.touchMove.y;

  const mag = Math.hypot(strafe, forward);
  if (mag > 1) { strafe /= mag; forward /= mag; }

  const sprint = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') || state.touchSprint;
  const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
  const sin = Math.sin(state.yaw);
  const cos = Math.cos(state.yaw);
  const dx = (strafe * cos - forward * sin) * speed * dt;
  const dz = (-strafe * sin - forward * cos) * speed * dt;

  if (dx !== 0) {
    const nx = camera.position.x + dx;
    if (canOccupy(nx, camera.position.z, true)) camera.position.x = nx;
  }
  if (dz !== 0) {
    const nz = camera.position.z + dz;
    if (canOccupy(camera.position.x, nz, true)) camera.position.z = nz;
  }

  camera.position.y = EYE_H;
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;

  processCurrentCell();
}

function processCurrentCell() {
  const g = worldToGrid(camera.position.x, camera.position.z);
  const key = cellKey(g.x, g.y);
  const pickup = state.pickups.get(key);
  if (pickup?.active) {
    pickup.active = false;
    const mesh = state.meshes.pickups.get(key);
    if (mesh) mesh.visible = false;
    if (pickup.type === 'chip') {
      state.chips++;
      showMessage('Access Chip collected.', 900);
    } else {
      state.powerUntil = performance.now() + POWER_MS;
      showMessage('Suit light overcharged.', 900);
    }
    updateStatus();
  }

  if (!state.won && state.goalCells.has(key)) {
    state.won = true;
    showMessage('Beacon Core reached. Deterministic map proof complete.', 6000);
    updateStatus();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  state.lastCellKey = key;
}

function updateVisuals(now, dt) {
  const powerActive = now < state.powerUntil;
  flashlight.intensity = powerActive ? 31 : 19;
  flashlight.distance = powerActive ? 36 : 26;
  suitGlow.intensity = powerActive ? 6.2 : 2.6;
  suitGlow.distance = powerActive ? 11 : 7.5;

  for (const [key, pickup] of state.pickups) {
    if (!pickup.active) continue;
    const mesh = state.meshes.pickups.get(key);
    if (!mesh) continue;
    mesh.rotation.y += dt * (pickup.type === 'chip' ? 1.7 : 0.9);
    mesh.position.y = mesh.userData.baseY + Math.sin(now * 0.0023 + mesh.userData.phase) * 0.08;
  }

  for (const [key, door] of state.doors) {
    const mesh = state.meshes.doors.get(key);
    if (!mesh) continue;
    const target = door.open ? WALL_H + 0.2 : WALL_H * 0.46;
    mesh.position.y += (target - mesh.position.y) * Math.min(1, dt * 7);
    mesh.material.opacity = door.open ? 0.12 : 0.68;
    if (door.open && mesh.position.y > WALL_H) mesh.visible = false;
  }

  if (state.meshes.beacon) {
    state.meshes.beacon.rotation.y += dt * 0.72;
    state.meshes.beacon.rotation.x = Math.sin(now * 0.0007) * 0.15;
  }

  if (state.messageTimer > 0) {
    state.messageTimer -= dt * 1000;
    if (state.messageTimer <= 0) messageEl.classList.remove('show');
  }
}

function drawMinimap() {
  if (!state.def) return;
  const sx = minimap.width / state.width;
  const sy = minimap.height / state.height;
  minimapCtx.clearRect(0, 0, minimap.width, minimap.height);
  minimapCtx.fillStyle = '#020608';
  minimapCtx.fillRect(0, 0, minimap.width, minimap.height);

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const c = rawCell(x, y);
      let color = '#102027';
      if (c === '#') color = '#32454a';
      else if (state.goalCells.has(cellKey(x, y))) color = '#18a7b8';
      else if (state.doors.has(cellKey(x, y))) color = state.doors.get(cellKey(x, y)).open ? '#284348' : '#cf3154';
      else {
        const p = state.pickups.get(cellKey(x, y));
        if (p?.active) color = p.type === 'chip' ? '#58e7f5' : '#f6c64d';
      }
      minimapCtx.fillStyle = color;
      minimapCtx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
    }
  }

  const g = worldToGrid(camera.position.x, camera.position.z);
  const cx = (g.x + 0.5) * sx;
  const cy = (g.y + 0.5) * sy;
  minimapCtx.save();
  minimapCtx.translate(cx, cy);
  minimapCtx.rotate(-state.yaw);
  minimapCtx.fillStyle = '#ffffff';
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, -5);
  minimapCtx.lineTo(4, 4);
  minimapCtx.lineTo(-4, 4);
  minimapCtx.closePath();
  minimapCtx.fill();
  minimapCtx.restore();
}

function updateStatus() {
  if (!state.def) return;
  const activePower = Math.max(0, state.powerUntil - performance.now());
  const powerText = activePower > 0 ? `OVERCHARGE ${Math.ceil(activePower / 1000)}s` : 'NORMAL';
  const goal = state.won ? 'CORE REACHED' : 'FIND BEACON CORE';
  statusText.innerHTML = `Grid ${state.width}×${state.height} · Chips <b>${state.chips}</b><br>Suit ${powerText} · ${goal}`;
}

function showMessage(text, ms = 1000) {
  messageEl.textContent = text;
  messageEl.classList.add('show');
  state.messageTimer = ms;
}

function frame(now) {
  const frameDt = Math.min(0.1, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  state.accumulator += frameDt;
  while (state.accumulator >= FIXED_DT) {
    fixedUpdate(FIXED_DT);
    state.accumulator -= FIXED_DT;
  }
  updateVisuals(now, frameDt);
  drawMinimap();
  if ((now | 0) % 350 < 18) updateStatus();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Desktop input
window.addEventListener('keydown', (event) => {
  state.keys.add(event.code);
  if (event.code === 'KeyM') minimapWrap.style.display = minimapWrap.style.display === 'none' ? '' : 'none';
  if (event.code === 'KeyR') resetPlayer();
});
window.addEventListener('keyup', (event) => state.keys.delete(event.code));
lockScreen.addEventListener('click', () => renderer.domElement.requestPointerLock?.());
renderer.domElement.addEventListener('click', () => {
  if (matchMedia('(pointer: fine)').matches && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => {
  lockScreen.style.display = document.pointerLockElement === renderer.domElement ? 'none' : (matchMedia('(pointer: fine)').matches ? 'grid' : 'none');
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  state.yaw -= event.movementX * 0.0022;
  state.pitch = clamp(state.pitch - event.movementY * 0.0019, -1.18, 1.18);
});

// Touch: left virtual stick, right look area, sprint button.
let movePointer = null;
let lookPointer = null;
let lookLast = null;
function updateStick(clientX, clientY) {
  const rect = movePad.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const max = rect.width * 0.34;
  const len = Math.hypot(dx, dy);
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  state.touchMove.set(dx / max, dy / max);
  moveKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}
movePad.addEventListener('pointerdown', (e) => { movePointer = e.pointerId; movePad.setPointerCapture(e.pointerId); updateStick(e.clientX, e.clientY); });
movePad.addEventListener('pointermove', (e) => { if (e.pointerId === movePointer) updateStick(e.clientX, e.clientY); });
function releaseMove(e) { if (e.pointerId !== movePointer) return; movePointer = null; state.touchMove.set(0, 0); moveKnob.style.transform = ''; }
movePad.addEventListener('pointerup', releaseMove); movePad.addEventListener('pointercancel', releaseMove);

lookZone.addEventListener('pointerdown', (e) => { lookPointer = e.pointerId; lookZone.setPointerCapture(e.pointerId); lookLast = { x: e.clientX, y: e.clientY }; });
lookZone.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookPointer || !lookLast) return;
  const dx = e.clientX - lookLast.x;
  const dy = e.clientY - lookLast.y;
  state.yaw -= dx * 0.0061;
  state.pitch = clamp(state.pitch - dy * 0.0049, -1.18, 1.18);
  lookLast = { x: e.clientX, y: e.clientY };
});
function releaseLook(e) { if (e.pointerId === lookPointer) { lookPointer = null; lookLast = null; } }
lookZone.addEventListener('pointerup', releaseLook); lookZone.addEventListener('pointercancel', releaseLook);
sprintBtn.addEventListener('pointerdown', (e) => { state.touchSprint = true; sprintBtn.setPointerCapture(e.pointerId); });
sprintBtn.addEventListener('pointerup', () => state.touchSprint = false);
sprintBtn.addEventListener('pointercancel', () => state.touchSprint = false);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
});

(async function boot() {
  try {
    const def = await loadMap();
    parseGrid(def);
    buildWorld();
    resetPlayer();
    statusText.textContent = `Loaded ${def.id} from authored diagram.`;
    showMessage('Map-01 loaded directly from canonical data.', 1800);
    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    statusText.textContent = `BOOT ERROR: ${error.message}`;
    showMessage(`Boot error: ${error.message}`, 999999);
  }
})();
