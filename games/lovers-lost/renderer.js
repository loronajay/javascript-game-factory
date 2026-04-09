'use strict';

// ─── Layout ───────────────────────────────────────────────────────────────────
const CANVAS_W     = 960;
const CANVAS_H     = 540;
const HALF_W       = 480;
const DIVIDER_X    = HALF_W;

const FRAME_W      = 16;
const FRAME_H      = 16;
const SCALE        = 3;
const SPRITE_W     = FRAME_W * SCALE;   // 48
const SPRITE_H     = FRAME_H * SCALE;   // 48

const SWORD_SRC    = 32;
const SWORD_W      = SWORD_SRC * 2;     // 64 (2× scale keeps it proportionate to the 48px player)
const SWORD_H      = SWORD_W;           // 64

const GROUND_TOP   = 460;
const BOY_LOCAL_X  = 120;
const GIRL_LOCAL_X = HALF_W - SPRITE_W - 120;   // 312
const PLAYER_Y     = GROUND_TOP - SPRITE_H;      // 412

const PPU          = 4;      // pixels per distance unit
const RUN_DISTANCE = 5400;
const HARD_CUTOFF  = 90;
const TILE         = HALF_W * 3;   // parallax tile width (1440)

// ─── Environment transitions ──────────────────────────────────────────────────
// Aligned exactly to wave start positions from obstacles.js:
// WAVE_START_POSITIONS = [420, 1020, 1770, 2720, 3820]
// Warmup + wave 1 share env 0. Each new wave triggers the next environment.
//   env 0: 0     – 1020  (cave / desert ruins)
//   env 1: 1020  – 1770  (forest / frozen tundra)
//   env 2: 1770  – 2720  (stormy cliffs / lava fields)
//   env 3: 2720  – 3820  (sunken ruins / castle halls)
//   env 4: 3820  – 5400  (night sky — both sides converge)
const ENV_TRANSITIONS = [1020, 1770, 2720, 3820];   // distance units to crossfade


// ─── Palettes ─────────────────────────────────────────────────────────────────
const BOY_PALS = [
  { sky: '#0a0614', skyFar: '#180828', ground: '#2a1040', edge: '#4a2060' },   // cave
  { sky: '#040e08', skyFar: '#0a1a0c', ground: '#1a4020', edge: '#2a6030' },   // forest
  { sky: '#060a10', skyFar: '#0e1826', ground: '#203040', edge: '#304858' },   // stormy cliffs
  { sky: '#040c10', skyFar: '#081820', ground: '#0a2e40', edge: '#1a4858' },   // sunken ruins
  { sky: '#18082e', skyFar: '#200c3a', ground: '#4a2060', edge: '#7040a0' },   // night sky
];

const GIRL_PALS = [
  { sky: '#1c0e04', skyFar: '#2c1a08', ground: '#5a3010', edge: '#7a4820' },   // desert ruins
  { sky: '#06101a', skyFar: '#0c1a2e', ground: '#1a3048', edge: '#2a4860' },   // frozen tundra
  { sky: '#100402', skyFar: '#1e0804', ground: '#3a1006', edge: '#581808' },   // lava fields
  { sky: '#080810', skyFar: '#10141e', ground: '#252535', edge: '#353548' },   // castle halls
  { sky: '#18082e', skyFar: '#200c3a', ground: '#4a2060', edge: '#7040a0' },   // night sky
];

const NIGHT_STAR = 'rgba(255,220,255,0.6)';

// ─── Animation ────────────────────────────────────────────────────────────────
const WALK_FRAMES     = [3, 4];   // the two sideways-facing run frames
const WALK_SPEED      = 7;        // display frames per walk step
const ACTION_STEPS    = 3;        // visual steps for attack / block (in, hold, out)
const ACTION_STEP_DUR = 6;        // display frames per step → 18 frames ≈ 0.3s total

// ─── Seeded RNG / point generation ────────────────────────────────────────────
function _makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

// Generates points with { x: [0,TILE), r: [0,1) } using a seeded RNG.
// x drives horizontal position; r drives size/shape variation per element.
function _genPts(count, seed) {
  const rng = _makeRng(seed);
  return Array.from({ length: count }, () => ({ x: rng() * TILE, r: rng() }));
}

function _genStars(count, seed) {
  const rng = _makeRng(seed);
  return Array.from({ length: count }, () => ({
    x: rng() * (HALF_W - 4) + 2,
    y: rng() * (GROUND_TOP - 30) + 5,
  }));
}

// ─── Factory ──────────────────────────────────────────────────────────────────
function createRenderer(canvas, images) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;

  // Night sky star fields
  const boyStars  = _genStars(30, 1337);
  const girlStars = _genStars(30, 4242);

  // Pre-generated scene element positions (deterministic, seed per scene)
  const SD = {
    cave:   { stals:   _genPts(14, 1001), cols:    _genPts(8,  1002) },
    forest: { far:     _genPts(8,  2001), near:    _genPts(12, 2002) },
    cliffs: { peaks:   _genPts(6,  3001), rain:    _genPts(80, 3002) },
    sunken: { cols:    _genPts(7,  4001), debris:  _genPts(10, 4002) },
    desert: { dunes:   _genPts(6,  5001), pillars: _genPts(7,  5002) },
    tundra: { peaks:   _genPts(8,  6001), shards:  _genPts(10, 6002) },
    lava:   { rocks:   _genPts(9,  7001), cracks:  _genPts(7,  7002) },
    castle: { cols:    _genPts(6,  8001), torches: _genPts(5,  8002) },
  };

  // Scene function arrays indexed by env (0–4)
  const BOY_SCENES  = [_cave,   _forest, _cliffs, _sunken, _nightScene];
  const GIRL_SCENES = [_desert, _tundra, _lava,   _castle, _nightScene];

  const boyAnim  = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0, actionTick: 0, prevState: 'running' };
  const girlAnim = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0, actionTick: 0, prevState: 'running' };

  // ── Public API ──────────────────────────────────────────────────────────────
  // boyObstacles / girlObstacles: each side's own obstacle list
  // boyBoosts / girlBoosts: each side's boost list ({ distance, collected })
  // elapsed: seconds since run started
  function renderPlay(boyPlayer, girlPlayer, boyObstacles, girlObstacles, boyBoosts, girlBoosts, elapsed) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    _drawHalf(0,      'boy',  boyAnim,  boyPlayer,  boyObstacles,  boyBoosts);
    _drawHalf(HALF_W, 'girl', girlAnim, girlPlayer, girlObstacles, girlBoosts);
    _drawDivider();
    _drawHUD(boyPlayer, girlPlayer, elapsed);
  }

  // ── Half ────────────────────────────────────────────────────────────────────
  function _drawHalf(offsetX, side, animState, player, obstacles, boosts) {
    const facing = side === 'boy' ? 'right' : 'left';
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, 0, HALF_W, CANVAS_H);
    ctx.clip();
    _drawBackground(offsetX, side, player.distance);
    _drawFieldObstacles(offsetX, player, facing, obstacles);
    _drawFieldBoosts(offsetX, player, facing, boosts, side);
    _drawPlayerSprite(offsetX, player, facing, animState, side);
    ctx.restore();
  }

  // ── Background / environment scroll seam ────────────────────────────────────
  // The boundary between two environments travels across the screen at PPU speed
  // (same as obstacles). Old terrain scrolls out, new terrain scrolls in.
  // For boy (runs right): new env enters from the right.
  // For girl (runs left): new env enters from the left.
  const SEAM_SPEED = PPU;

  function _drawBackground(offsetX, side, distance) {
    let envIdx = 0;
    for (const t of ENV_TRANSITIONS) { if (distance >= t) envIdx++; }
    envIdx = Math.min(envIdx, 4);

    const pals       = side === 'boy' ? BOY_PALS   : GIRL_PALS;
    const scenes     = side === 'boy' ? BOY_SCENES  : GIRL_SCENES;
    const stars      = side === 'boy' ? boyStars    : girlStars;
    const playerLocX = side === 'boy' ? BOY_LOCAL_X : GIRL_LOCAL_X;

    // Check if a seam is currently crossing this half
    let seamX    = null;
    let prevEnv  = null;

    if (envIdx > 0) {
      const T   = ENV_TRANSITIONS[envIdx - 1];
      const raw = side === 'boy'
        ? playerLocX + (T - distance) * SEAM_SPEED   // boy: seam moves left
        : playerLocX - (T - distance) * SEAM_SPEED;  // girl: seam moves right
      if (raw > 0 && raw < HALF_W) {
        seamX   = raw;
        prevEnv = envIdx - 1;
      }
    }

    function drawEnvWithStars(ei) {
      _drawEnv(offsetX, pals[ei], scenes[ei], distance);
      if (ei === 4) _drawStars(offsetX, stars, distance);
    }

    if (seamX === null) {
      drawEnvWithStars(envIdx);
      return;
    }

    // Boy:  old env on the left,  new env on the right (seam moves leftward)
    // Girl: new env on the left,  old env on the right (seam moves rightward)
    const [leftEnv, rightEnv] = side === 'boy'
      ? [prevEnv, envIdx]
      : [envIdx,  prevEnv];

    ctx.save();
    ctx.beginPath(); ctx.rect(offsetX, 0, seamX, CANVAS_H); ctx.clip();
    drawEnvWithStars(leftEnv);
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(offsetX + seamX, 0, HALF_W - seamX, CANVAS_H); ctx.clip();
    drawEnvWithStars(rightEnv);
    ctx.restore();

    // Seam flash line — a thin crack of light at the world boundary
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(offsetX + seamX - 1, 0, 2, CANVAS_H);
  }

  function _drawEnv(offsetX, pal, sceneFn, distance) {
    ctx.fillStyle = pal.sky;
    ctx.fillRect(offsetX, 0, HALF_W, CANVAS_H);
    ctx.fillStyle = pal.skyFar;
    ctx.fillRect(offsetX, GROUND_TOP - 70, HALF_W, 70);
    sceneFn(offsetX, distance, 'sky');
    ctx.fillStyle = pal.ground;
    ctx.fillRect(offsetX, GROUND_TOP, HALF_W, CANVAS_H - GROUND_TOP);
    ctx.fillStyle = pal.edge;
    ctx.fillRect(offsetX, GROUND_TOP, HALF_W, 3);
    sceneFn(offsetX, distance, 'ground');
  }

  // ── Tile draw helper ─────────────────────────────────────────────────────────
  // Calls fn(localX, point) for each point, drawing two copies to handle seam wrap.
  // The clip rect on the half keeps stray pixels out of the other side.
  function _forTile(pts, scrollPx, fn) {
    const s = scrollPx % TILE;
    for (const p of pts) {
      const lx = (p.x - s + TILE * 2) % TILE;
      fn(lx, p);
      fn(lx - TILE, p);
    }
  }

  // ── Scene: cave (boy env 0) ──────────────────────────────────────────────────
  function _cave(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll  = distance * 0.7;
    const nearScroll = distance * 2.0;

    // Stalactites from ceiling
    ctx.fillStyle = '#140822';
    _forTile(SD.cave.stals, farScroll, (lx, p) => {
      const w = 10 + p.r * 28;
      const h = 30 + p.r * 100;
      ctx.beginPath();
      ctx.moveTo(offsetX + lx,         0);
      ctx.lineTo(offsetX + lx + w / 2, h);
      ctx.lineTo(offsetX + lx + w,     0);
      ctx.closePath();
      ctx.fill();
    });

    // Stone columns from ground
    ctx.fillStyle = '#1c0c34';
    _forTile(SD.cave.cols, nearScroll, (lx, p) => {
      const w = 14 + p.r * 22;
      const h = 40 + p.r * 90;
      ctx.fillRect(offsetX + lx, GROUND_TOP - h, w, h);
    });
  }

  // ── Scene: forest (boy env 1) ────────────────────────────────────────────────
  function _forest(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll  = distance * 0.6;
    const nearScroll = distance * 1.8;

    // Far trees: thin trunks + circular canopy
    ctx.fillStyle = '#0a1a0c';
    _forTile(SD.forest.far, farScroll, (lx, p) => {
      const w = 9 + p.r * 7;
      const h = 80 + p.r * 100;
      ctx.fillRect(offsetX + lx, GROUND_TOP - h, w, h);
      ctx.beginPath();
      ctx.arc(offsetX + lx + w / 2, GROUND_TOP - h, w * 1.8 + p.r * 10, 0, Math.PI * 2);
      ctx.fill();
    });

    // Near trees: thicker, darker
    ctx.fillStyle = '#060e07';
    _forTile(SD.forest.near, nearScroll, (lx, p) => {
      const w = 16 + p.r * 14;
      const h = 110 + p.r * 140;
      ctx.fillRect(offsetX + lx, GROUND_TOP - h, w, h);
      ctx.beginPath();
      ctx.arc(offsetX + lx + w / 2, GROUND_TOP - h, w * 2 + p.r * 14, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── Scene: stormy cliffs (boy env 2) ────────────────────────────────────────
  function _cliffs(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll = distance * 0.5;

    // Cliff silhouettes
    ctx.fillStyle = '#0c1828';
    _forTile(SD.cliffs.peaks, farScroll, (lx, p) => {
      const w = 60 + p.r * 90;
      const h = 70 + p.r * 130;
      ctx.beginPath();
      ctx.moveTo(offsetX + lx,           GROUND_TOP - 10);
      ctx.lineTo(offsetX + lx + w * 0.3, GROUND_TOP - h);
      ctx.lineTo(offsetX + lx + w * 0.6, GROUND_TOP - h * 0.65);
      ctx.lineTo(offsetX + lx + w,       GROUND_TOP - 10);
      ctx.closePath();
      ctx.fill();
    });

    // Animated rain streaks
    ctx.strokeStyle = 'rgba(100,140,180,0.3)';
    ctx.lineWidth   = 1;
    const t = Date.now();
    for (const p of SD.cliffs.rain) {
      const rx = offsetX + (p.x % HALF_W);
      const ry = (p.r * CANVAS_H + t * 0.25) % CANVAS_H;
      ctx.beginPath();
      ctx.moveTo(rx - 2, ry);
      ctx.lineTo(rx,     ry + 14);
      ctx.stroke();
    }
  }

  // ── Scene: sunken ruins (boy env 3) ─────────────────────────────────────────
  function _sunken(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const scroll = distance * 1.5;

    // Submerged column stumps
    ctx.fillStyle = '#0c2030';
    _forTile(SD.sunken.cols, scroll, (lx, p) => {
      const w = 14 + p.r * 18;
      const h = 50 + p.r * 130;
      ctx.fillRect(offsetX + lx, GROUND_TOP - h, w, h);
      ctx.fillRect(offsetX + lx - 4, GROUND_TOP - h, w + 8, 8);      // capital
      ctx.fillRect(offsetX + lx - 4, GROUND_TOP - h - 12, w + 8, 5); // abacus
    });

    // Water surface shimmer lines
    ctx.strokeStyle = 'rgba(80,190,220,0.18)';
    ctx.lineWidth   = 2;
    const shimT = Date.now() / 400;
    for (let i = 0; i < 5; i++) {
      const sy = GROUND_TOP - 6 - i * 11 + Math.sin(shimT + i * 1.4) * 4;
      ctx.beginPath();
      ctx.moveTo(offsetX,          sy);
      ctx.lineTo(offsetX + HALF_W, sy);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // ── Scene: desert ruins (girl env 0) ────────────────────────────────────────
  function _desert(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll  = distance * 0.6;
    const nearScroll = distance * 1.8;

    // Dune silhouettes
    ctx.fillStyle = '#3a1c06';
    _forTile(SD.desert.dunes, farScroll, (lx, p) => {
      const w = 100 + p.r * 130;
      const h = 30 + p.r * 55;
      ctx.beginPath();
      ctx.moveTo(offsetX + lx,         GROUND_TOP);
      ctx.quadraticCurveTo(
        offsetX + lx + w * 0.5, GROUND_TOP - h,
        offsetX + lx + w,       GROUND_TOP
      );
      ctx.closePath();
      ctx.fill();
    });

    // Broken obelisks
    ctx.fillStyle = '#4a2808';
    _forTile(SD.desert.pillars, nearScroll, (lx, p) => {
      const w = 10 + p.r * 8;
      const h = 45 + p.r * 90;
      ctx.fillRect(offsetX + lx, GROUND_TOP - h, w, h);
      // Wider base cap
      ctx.fillRect(offsetX + lx - 3, GROUND_TOP - h - 10 - p.r * 12, w + 6, 10 + p.r * 12);
      // Crack
      ctx.fillStyle = '#1c0e04';
      ctx.fillRect(offsetX + lx + 2, GROUND_TOP - h * 0.55, w - 4, 2);
      ctx.fillStyle = '#4a2808';
    });
  }

  // ── Scene: frozen tundra (girl env 1) ───────────────────────────────────────
  function _tundra(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const farScroll  = distance * 0.5;
    const nearScroll = distance * 1.5;

    // Distant mountain peaks
    ctx.fillStyle = '#0e1e30';
    _forTile(SD.tundra.peaks, farScroll, (lx, p) => {
      const w = 80 + p.r * 110;
      const h = 90 + p.r * 160;
      ctx.beginPath();
      ctx.moveTo(offsetX + lx,         GROUND_TOP - 10);
      ctx.lineTo(offsetX + lx + w / 2, GROUND_TOP - h);
      ctx.lineTo(offsetX + lx + w,     GROUND_TOP - 10);
      ctx.closePath();
      ctx.fill();
      // Snow cap
      ctx.fillStyle = 'rgba(200,220,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(offsetX + lx + w * 0.28, GROUND_TOP - h * 0.68);
      ctx.lineTo(offsetX + lx + w * 0.50, GROUND_TOP - h);
      ctx.lineTo(offsetX + lx + w * 0.72, GROUND_TOP - h * 0.68);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0e1e30';
    });

    // Ice shards at ground level
    ctx.fillStyle = 'rgba(140,190,235,0.55)';
    _forTile(SD.tundra.shards, nearScroll, (lx, p) => {
      const w = 6 + p.r * 10;
      const h = 22 + p.r * 55;
      ctx.beginPath();
      ctx.moveTo(offsetX + lx + w / 2,   GROUND_TOP - h);
      ctx.lineTo(offsetX + lx + w,       GROUND_TOP - h * 0.28);
      ctx.lineTo(offsetX + lx + w * 0.8, GROUND_TOP);
      ctx.lineTo(offsetX + lx + w * 0.2, GROUND_TOP);
      ctx.lineTo(offsetX + lx,           GROUND_TOP - h * 0.28);
      ctx.closePath();
      ctx.fill();
    });
  }

  // ── Scene: lava fields (girl env 2) ─────────────────────────────────────────
  function _lava(offsetX, distance, layer) {
    const scroll = distance * 1.5;

    if (layer === 'sky') {
      // Jagged rock silhouettes
      ctx.fillStyle = '#1a0804';
      _forTile(SD.lava.rocks, scroll, (lx, p) => {
        const w = 45 + p.r * 80;
        const h = 35 + p.r * 90;
        ctx.beginPath();
        ctx.moveTo(offsetX + lx,              GROUND_TOP);
        ctx.lineTo(offsetX + lx + w * 0.12,   GROUND_TOP - h * 0.55);
        ctx.lineTo(offsetX + lx + w * 0.32,   GROUND_TOP - h);
        ctx.lineTo(offsetX + lx + w * 0.58,   GROUND_TOP - h * 0.75);
        ctx.lineTo(offsetX + lx + w * 0.80,   GROUND_TOP - h * 0.45);
        ctx.lineTo(offsetX + lx + w,           GROUND_TOP);
        ctx.closePath();
        ctx.fill();
      });
    }

    if (layer === 'ground') {
      // Glowing cracks on the ground surface
      const t = Date.now() / 300;
      _forTile(SD.lava.cracks, scroll * 0.5, (lx, p) => {
        const glow = 0.55 + 0.45 * Math.sin(t + p.r * 6.28);
        const len  = 22 + p.r * 42;
        ctx.save();
        ctx.globalAlpha  = glow;
        ctx.strokeStyle  = '#ff6600';
        ctx.lineWidth    = 2;
        ctx.shadowColor  = '#ff4400';
        ctx.shadowBlur   = 8;
        ctx.beginPath();
        ctx.moveTo(offsetX + lx,             GROUND_TOP + 4);
        ctx.lineTo(offsetX + lx + len * 0.3, GROUND_TOP + 1);
        ctx.lineTo(offsetX + lx + len * 0.6, GROUND_TOP + 5);
        ctx.lineTo(offsetX + lx + len,       GROUND_TOP + 2);
        ctx.stroke();
        ctx.restore();
      });
    }
  }

  // ── Scene: castle halls (girl env 3) ────────────────────────────────────────
  function _castle(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    const colScroll    = distance * 1.0;
    const torchScroll  = distance * 0.5;

    // Corridor depth fill
    ctx.fillStyle = '#0e0e1c';
    ctx.fillRect(offsetX, 0, HALF_W, GROUND_TOP);

    // Stone columns
    _forTile(SD.castle.cols, colScroll, (lx, p) => {
      const w = 18 + p.r * 10;
      const h = 160 + p.r * 80;
      ctx.fillStyle = '#1c1c2e';
      ctx.fillRect(offsetX + lx, GROUND_TOP - h, w, h);
      ctx.fillStyle = '#282840';
      ctx.fillRect(offsetX + lx - 4, GROUND_TOP - h,      w + 8, 9);   // capital
      ctx.fillRect(offsetX + lx - 4, GROUND_TOP - h - 13, w + 8, 6);   // abacus
    });

    // Torch glow spots
    _forTile(SD.castle.torches, torchScroll, (lx, p) => {
      const ty      = GROUND_TOP - 90 - p.r * 60;
      const flicker = 0.35 + 0.30 * Math.sin(Date.now() / (170 + p.r * 90) + p.r * 5);
      ctx.save();
      ctx.globalAlpha = flicker;
      const grd = ctx.createRadialGradient(
        offsetX + lx, ty, 0,
        offsetX + lx, ty, 55 + p.r * 25
      );
      grd.addColorStop(0,   'rgba(255,180,55,0.65)');
      grd.addColorStop(0.5, 'rgba(255,100,20,0.22)');
      grd.addColorStop(1,   'rgba(255,60,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(offsetX + lx - 65, ty - 65, 130, 130);
      ctx.restore();
    });
  }

  // ── Scene: night sky (env 4, both sides) ────────────────────────────────────
  function _nightScene(offsetX, distance, layer) {
    if (layer !== 'sky') return;
    // Moon
    const mx = offsetX + HALF_W / 2;
    const my = 72;
    ctx.save();
    // Glow halo
    ctx.globalAlpha = 0.18;
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 64);
    glow.addColorStop(0, '#fff8e0');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 64, my - 64, 128, 128);
    // Disc
    ctx.globalAlpha = 0.88;
    ctx.fillStyle   = '#fff8e0';
    ctx.beginPath();
    ctx.arc(mx, my, 18, 0, Math.PI * 2);
    ctx.fill();
    // Craters
    ctx.globalAlpha = 0.28;
    ctx.fillStyle   = '#c8c0a0';
    ctx.beginPath(); ctx.arc(mx - 5, my + 5, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 7, my - 4, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Stars (night sky) ────────────────────────────────────────────────────────
  function _drawStars(offsetX, stars, distance) {
    const scroll = (distance * 1.2) % HALF_W;
    ctx.fillStyle = NIGHT_STAR;
    for (const s of stars) {
      const sx = (s.x - scroll + HALF_W * 2) % HALF_W;
      ctx.fillRect(offsetX + sx, s.y, 1.5, 1.5);
    }
  }

  // ── Obstacles ────────────────────────────────────────────────────────────────
  function _obsWidth(type) {
    switch (type) {
      case 'spikes':    return 36;
      case 'bird':      return 37;
      case 'arrowwall': return 24;
      case 'goblin':    return 24;
      default:          return 24;
    }
  }

  function _drawFieldObstacles(offsetX, player, facing, obstacles) {
    if (!obstacles || !obstacles.length) return;
    const localX = facing === 'right' ? BOY_LOCAL_X : GIRL_LOCAL_X;

    for (const obs of obstacles) {
      if (obs.cleared) continue;
      const distDelta = obs.distance - player.distance;
      if (distDelta < -10 || distDelta > 130) continue;

      const obsW      = _obsWidth(obs.type);
      const localObsX = facing === 'right'
        ? localX + distDelta * PPU
        : localX - distDelta * PPU - obsW;

      _drawObstacle(offsetX + localObsX, obs, facing === 'left');
    }
  }

  function _drawObstacle(x, obs, flip) {
    switch (obs.type) {
      case 'spikes':    _drawSpikes(x);             break;
      case 'bird':      _drawBird(x);               break;
      case 'arrowwall': _drawArrowWall(x, flip);    break;
      case 'goblin':    _drawGoblin(x, obs, flip);  break;
    }
  }

  // Spikes: 3 yellow triangles + brown base
  function _drawSpikes(x) {
    const triW = 12, triH = 20;
    ctx.fillStyle = '#cc9900';
    ctx.fillRect(x, GROUND_TOP - 3, triW * 3, 3);
    ctx.fillStyle = '#ffcc44';
    for (let i = 0; i < 3; i++) {
      const tx = x + i * triW;
      ctx.beginPath();
      ctx.moveTo(tx,           GROUND_TOP);
      ctx.lineTo(tx + triW / 2, GROUND_TOP - triH);
      ctx.lineTo(tx + triW,    GROUND_TOP);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Bird: animated wing flap, flies at standing-head height — must crouch to dodge
  function _drawBird(x) {
    const by   = PLAYER_Y + 4;   // body overlaps standing player's head; crouching clears it
    const flap = Math.sin(Date.now() / 150) > 0;
    ctx.fillStyle = '#3388cc';
    ctx.fillRect(x + 6, by + 5, 22, 10);     // body
    ctx.fillStyle = '#44aaff';
    ctx.fillRect(x + 24, by + 2, 10, 10);    // head
    ctx.fillStyle = '#ffcc44';
    ctx.fillRect(x + 33, by + 5, 5, 3);      // beak
    ctx.fillStyle = '#5599dd';
    if (flap) {
      ctx.fillRect(x, by,      20, 8);        // wings up
    } else {
      ctx.fillRect(x, by + 10, 20, 8);        // wings down
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 27, by + 3, 3, 3);      // eye
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 28, by + 4, 2, 2);      // pupil
  }

  // Arrow wall: canonical = arrows pointing LEFT (toward boy); flip for girl
  function _drawArrowWall(x, flip) {
    ctx.save();
    if (flip) { ctx.translate(x + 24, 0); ctx.scale(-1, 1); x = 0; }
    for (let i = 0; i < 3; i++) {
      const ay = GROUND_TOP - 15 - i * 15;
      ctx.fillStyle = '#885522';
      ctx.fillRect(x + 4, ay + 3, 20, 6);    // shaft
      ctx.fillStyle = '#ccaa44';
      ctx.beginPath();
      ctx.moveTo(x,      ay + 6);             // arrowhead pointing left
      ctx.lineTo(x + 10, ay);
      ctx.lineTo(x + 10, ay + 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#aa4422';
      ctx.fillRect(x + 21, ay,     3, 4);    // fletching
      ctx.fillRect(x + 21, ay + 8, 3, 4);
    }
    ctx.restore();
  }

  // Goblin: canonical = facing LEFT (toward boy); flip for girl
  function _drawGoblin(x, obs, flip) {
    ctx.save();
    if (flip) { ctx.translate(x + 24, 0); ctx.scale(-1, 1); x = 0; }
    const gy = GROUND_TOP - 32;
    // Legs
    ctx.fillStyle = '#336633';
    ctx.fillRect(x + 5,  gy + 24, 5, 8);
    ctx.fillRect(x + 14, gy + 24, 5, 8);
    // Torso
    ctx.fillStyle = '#44aa44';
    ctx.fillRect(x + 3, gy + 10, 18, 16);
    // Head
    ctx.fillStyle = '#55bb55';
    ctx.fillRect(x + 5, gy, 14, 12);
    // Ears
    ctx.fillRect(x + 3,  gy + 2, 3, 5);
    ctx.fillRect(x + 18, gy + 2, 3, 5);
    // Eyes
    ctx.fillStyle = '#ff3333';
    ctx.fillRect(x + 7,  gy + 3, 3, 3);
    ctx.fillRect(x + 14, gy + 3, 3, 3);
    // Mouth
    ctx.fillStyle = '#222222';
    ctx.fillRect(x + 8, gy + 8, 8, 2);
    // Arm extended toward runner
    ctx.fillStyle = '#44aa44';
    ctx.fillRect(x - 5, gy + 12, 9, 5);
    ctx.fillStyle = '#55bb55';
    ctx.fillRect(x - 8, gy + 10, 5, 8);   // fist
    // Windup phase: goblin draws a bow
    if (obs.phase === 'windup') {
      ctx.fillStyle = '#885522';
      ctx.fillRect(x - 12, gy + 12, 14, 3);
      ctx.fillStyle = '#ccaa44';
      ctx.beginPath();
      ctx.moveTo(x - 12, gy + 13);
      ctx.lineTo(x - 5,  gy + 10);
      ctx.lineTo(x - 5,  gy + 17);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Boosts ───────────────────────────────────────────────────────────────────
  function _drawFieldBoosts(offsetX, player, facing, boosts, side) {
    if (!boosts || !boosts.length) return;
    const localX  = facing === 'right' ? BOY_LOCAL_X : GIRL_LOCAL_X;
    const accentC = side === 'boy' ? '#b04eff' : '#44aaff';
    const bw = 16;

    for (const boost of boosts) {
      if (boost.collected) continue;
      const distDelta = boost.distance - player.distance;
      if (distDelta < -10 || distDelta > 130) continue;

      const localBX = facing === 'right'
        ? localX + distDelta * PPU
        : localX - distDelta * PPU - bw;

      _drawBoost(offsetX + localBX, accentC);
    }
  }

  function _drawBoost(x, accent) {
    const bw    = 16, bh = 16;
    const cy    = GROUND_TOP - SPRITE_H - 24;   // elevated — must jump to collect
    const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 300);
    ctx.save();
    // Glow
    ctx.globalAlpha = pulse * 0.35;
    ctx.fillStyle   = accent;
    ctx.fillRect(x - 5, cy - 5, bw + 10, bh + 10);
    // Diamond
    ctx.globalAlpha = pulse;
    ctx.fillStyle   = '#ffee44';
    ctx.beginPath();
    ctx.moveTo(x + bw / 2, cy);
    ctx.lineTo(x + bw,     cy + bh / 2);
    ctx.lineTo(x + bw / 2, cy + bh);
    ctx.lineTo(x,          cy + bh / 2);
    ctx.closePath();
    ctx.fill();
    // Shine
    ctx.fillStyle = '#ffffaa';
    ctx.fillRect(x + bw / 2 - 2, cy + 3, 4, 4);
    ctx.restore();
  }

  // ── Player sprite ─────────────────────────────────────────────────────────────
  function _drawPlayerSprite(offsetX, player, facing, animState, side) {
    const img    = side === 'boy' ? images.boy : images.girl;
    const localX = side === 'boy' ? BOY_LOCAL_X : GIRL_LOCAL_X;
    const flipX  = facing === 'left';

    _tickAnim(animState, player.state);

    const screenX = offsetX + localX;
    let   screenY = PLAYER_Y;
    let   scaleY  = 1;

    if (player.state === 'crouching') {
      scaleY  = 0.5;
      screenY = PLAYER_Y + SPRITE_H * 0.5;   // keep feet on ground
    }

    // Hit blink — walk cycle continues, only visibility changes
    const hitFlash = player.state === 'hit' && (Math.floor(Date.now() / 80) % 2 === 0);
    ctx.save();
    if (hitFlash) ctx.globalAlpha = 0.35;
    _blit(img, animState.frame, FRAME_W, FRAME_H, screenX, screenY, SPRITE_W, SPRITE_H, flipX, scaleY);
    ctx.restore();

    const step = _actionStep(animState.actionTick);
    if (player.state === 'attacking') _drawSword(screenX, screenY, flipX, step);
    if (player.state === 'blocking')  _drawShield(screenX, screenY, flipX, step);
  }

  // Walk cycle runs for ALL states — crouching just applies a Y-scale override.
  // actionTick resets on state change so attack/block animations always start fresh.
  function _tickAnim(animState, state) {
    if (state !== animState.prevState) {
      animState.actionTick = 0;
      animState.prevState  = state;
    }
    animState.tick++;
    if (animState.tick >= WALK_SPEED) {
      animState.tick    = 0;
      animState.walkIdx = (animState.walkIdx + 1) % WALK_FRAMES.length;
    }
    animState.frame = WALK_FRAMES[animState.walkIdx];
    if (state === 'attacking' || state === 'blocking') animState.actionTick++;
  }

  function _actionStep(actionTick) {
    return Math.min(Math.floor(actionTick / ACTION_STEP_DUR), ACTION_STEPS - 1);
  }

  // Sword: rotated to point forward, thrusts outward then retracts.
  // The sprite is assumed to have the blade pointing UP; rotating ±90° aims it forward.
  function _drawSword(screenX, screenY, flipX, step) {
    if (!images.sword) return;
    const ALPHAS   = [0.6, 1.0, 0.6];
    const OFFSETS  = [4,   12,  4  ];   // pixels of thrust
    const alpha    = ALPHAS[step];
    const thrust   = OFFSETS[step];

    // Center point at chest height, extended in facing direction
    const cx = flipX
      ? screenX - thrust - SWORD_W / 2
      : screenX + SPRITE_W + thrust + SWORD_W / 2;
    const cy = screenY + SPRITE_H * 0.38;

    // Rotate blade to face forward: UP sprite → ±90°
    const angle = flipX ? Math.PI / 2 : -Math.PI / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(images.sword, 0, 0, SWORD_SRC, SWORD_SRC, -SWORD_W / 2, -SWORD_H / 2, SWORD_W, SWORD_H);
    ctx.restore();
  }

  // Shield: glowing magic rectangle that extends in front of the player.
  function _drawShield(screenX, screenY, flipX, step) {
    const ALPHAS = [0.5, 1.0, 0.5];
    const SCALES = [0.5, 1.0, 0.5];
    const alpha  = ALPHAS[step];
    const scl    = SCALES[step];
    const sw     = 10;
    const sh     = SPRITE_H * scl;
    const sx     = flipX ? screenX - sw - 6 : screenX + SPRITE_W + 6;
    const sy     = screenY + (SPRITE_H - sh) / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#88aaff';
    ctx.shadowBlur  = 16;
    ctx.fillStyle   = '#aaccff';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle   = '#ffffff';
    ctx.fillRect(sx + 2, sy + 4, sw - 4, sh - 8);
    ctx.restore();
  }

  function _blit(img, frame, srcW, srcH, x, y, dw, dh, flipX, scaleY) {
    ctx.save();
    if (flipX && scaleY !== 1) {
      ctx.translate(x + dw, y); ctx.scale(-1, scaleY);
      ctx.drawImage(img, frame * srcW, 0, srcW, srcH, 0, 0, dw, dh);
    } else if (flipX) {
      ctx.translate(x + dw, y); ctx.scale(-1, 1);
      ctx.drawImage(img, frame * srcW, 0, srcW, srcH, 0, 0, dw, dh);
    } else if (scaleY !== 1) {
      ctx.translate(x, y); ctx.scale(1, scaleY);
      ctx.drawImage(img, frame * srcW, 0, srcW, srcH, 0, 0, dw, dh);
    } else {
      ctx.drawImage(img, frame * srcW, 0, srcW, srcH, x, y, dw, dh);
    }
    ctx.restore();
  }

  // ── Divider ───────────────────────────────────────────────────────────────────
  function _drawDivider() {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(DIVIDER_X - 1, 0, 2, CANVAS_H);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────────
  function _drawHUD(boyPlayer, girlPlayer, elapsed) {
    const remaining = Math.max(0, HARD_CUTOFF - elapsed);
    const urgent    = remaining < 20;
    const mins      = (remaining / 60) | 0;
    const secs      = (remaining % 60) | 0;
    const timeStr   = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Clock — center top
    ctx.save();
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 20px monospace';
    ctx.fillStyle   = urgent ? '#ff4466' : '#ffffff';
    ctx.shadowColor = urgent ? '#ff0044' : 'rgba(0,0,0,0.6)';
    ctx.shadowBlur  = urgent ? 10 : 4;
    ctx.fillText(timeStr, CANVAS_W / 2, 26);
    ctx.restore();

    // Boy side — score + chain
    ctx.save();
    ctx.font      = '13px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b04eff';
    ctx.fillText(boyPlayer.score, 8, 22);
    if (boyPlayer.chain >= 2) {
      ctx.fillStyle = '#ffcc44';
      ctx.fillText(`chain ×${boyPlayer.chain}`, 8, 40);
    }
    ctx.restore();

    // Girl side — score + chain
    ctx.save();
    ctx.font      = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#44aaff';
    ctx.fillText(girlPlayer.score, CANVAS_W - 8, 22);
    if (girlPlayer.chain >= 2) {
      ctx.fillStyle = '#ffcc44';
      ctx.fillText(`chain ×${girlPlayer.chain}`, CANVAS_W - 8, 40);
    }
    ctx.restore();

    // Progress bars — bottom edge; boy fills left→right, girl fills right→left
    _drawProgressBar(8,          CANVAS_H - 14, HALF_W - 16, boyPlayer,  '#b04eff', false);
    _drawProgressBar(HALF_W + 8, CANVAS_H - 14, HALF_W - 16, girlPlayer, '#44aaff', true);
  }

  function _drawProgressBar(x, y, w, player, color, rtl) {
    const pct = Math.min(player.distance / RUN_DISTANCE, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = color;
    rtl
      ? ctx.fillRect(x + w * (1 - pct), y, w * pct, 5)
      : ctx.fillRect(x, y, w * pct, 5);
    // Finish line marker
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(rtl ? x - 1 : x + w - 1, y - 2, 2, 9);
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  return { renderPlay };
}

if (typeof module !== 'undefined') {
  module.exports = { createRenderer, CANVAS_W, CANVAS_H };
} else {
  window.createRenderer    = createRenderer;
  window.RENDERER_CANVAS_W = CANVAS_W;
  window.RENDERER_CANVAS_H = CANVAS_H;
}
