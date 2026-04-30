import { buildHudModel, createHudRenderer } from './renderer-hud.js';
import { createOnlineRenderer } from './renderer-online.js';
import { createSceneRenderer } from './renderer-scenes.js';

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

// Sword sprite: 65×20, blade points RIGHT
const SWORD_SRC_W  = 65;
const SWORD_SRC_H  = 20;
const SWORD_W      = 65;   // 1× (natural size — proportionate to 48px player)
const SWORD_H      = 20;

// Bird sprite frames: red1/red2/red3 (38px wide, heights 20/24/18)
const BIRD_SCALE      = 1.5;
const BIRD_BOTTOM     = 434;   // bottom anchored just above crouch-top (436) so crouching clears it
const BIRD_FRAME_DATA = [
  { w: 38, h: 20 },
  { w: 38, h: 24 },
  { w: 38, h: 18 },
];

// Goblin sprites — all 28px tall (take-hit is 27px), rendered at 2×.
// Source art faces RIGHT; flip on the boy side so enemies face the player.
const GOBLIN_SCALE   = 2;
const GOBLIN_H       = 28;

const GI_FW = 99;  const GI_FC = 4;   // goblin-idle.png    396×28
const GA_FW = 84;  const GA_FC = 6;   // goblin-attack.png  504×28
const GD_FW = 75;  const GD_FC = 5;   // goblin-death.png   375×28
const GH_FW = 87;  const GH_FC = 4;   const GH_H = 27; // goblin-take-hit.png 348×27
const GOBLIN_IDLE_BOXES = [
  { srcInset: 0,  srcWidth: 27 },
  { srcInset: 26, srcWidth: 25 },
  { srcInset: 49, srcWidth: 26 },
  { srcInset: 73, srcWidth: 26 },
];
const GOBLIN_ATTACK_BOXES = [
  { srcInset: 0,  srcWidth: 27 },
  { srcInset: 38, srcWidth: 22 },
  { srcInset: 74, srcWidth: 10 },
  { srcInset: 0,  srcWidth: 12 },
  { srcInset: 26, srcWidth: 22 },
  { srcInset: 62, srcWidth: 22 },
];
const GOBLIN_TAKE_HIT_BOXES = [
  { srcInset: 0,  srcWidth: 23 },
  { srcInset: 20, srcWidth: 24 },
  { srcInset: 39, srcWidth: 30 },
  { srcInset: 59, srcWidth: 28 },
];
const GOBLIN_DEATH_BOXES = [
  { srcInset: 0,  srcWidth: 32 },
  { srcInset: 42, srcWidth: 23 },
  { srcInset: 0,  srcWidth: 1 },
  { srcInset: 0,  srcWidth: 28 },
  { srcInset: 37, srcWidth: 38 },
];

// Bird visual approach speed multiplier — bird swoops in faster than other obstacles.
// Purely cosmetic: timing window is still game-logic based.
const BIRD_SPEED_MULT = 1.75;

// Arrow wall — single 48×44 image
const AR_W = 48;  const AR_H = 44;
const AR_SCALE = 1.5;   // rendered 72×66
const ARROW_ROW_BANDS = [
  { top: 0, bottom: 8 },
  { top: 18, bottom: 26 },
  { top: 35, bottom: 43 },
];
const SHIELD_W = 10;
const SHIELD_GAP = 6;
const SHIELD_SCALES = [0.5, 1.0, 0.5];
const SWORD_THRUSTS = [4, 12, 4];

const GROUND_TOP   = 460;
const BOY_LOCAL_X  = 120;
const GIRL_LOCAL_X = HALF_W - SPRITE_W - 120;   // 312
const PLAYER_Y     = GROUND_TOP - SPRITE_H;      // 412
const PLAYER_CONTACT_PAD = 6;
const BOY_CONTACT_X = BOY_LOCAL_X + SPRITE_W - PLAYER_CONTACT_PAD;
const GIRL_CONTACT_X = GIRL_LOCAL_X + PLAYER_CONTACT_PAD;

const PPU          = 4;      // pixels per distance unit
const RUN_DISTANCE = 5400;
const HARD_CUTOFF  = 90;
const TILE         = HALF_W * 3;   // parallax tile width (1440)
const ACTION_STEP_COUNT = 3;       // visual steps for attack / block (in, hold, out)
const ACTION_STEP_FRAMES = 6;      // display frames per step → 18 frames ≈ 0.3s total
const HUD_SPEED_MIN = 5;
const HUD_SPEED_SOFT_MAX = 30;
const HUD_CHAIN_SOFT_MAX = 8;

// ─── Emote bubble ─────────────────────────────────────────────────────────────
const EMOTE_DURATION    = 180;  // frames (~3s)
const EMOTE_FADE_FRAMES = 40;   // fade out over last N frames
const EMOTE_BUBBLE_W    = 80;
const EMOTE_BUBBLE_H    = 80;
const EMOTE_BUBBLE_Y    = 118;  // top edge of bubble
const EMOTE_BUBBLE_R    = 10;   // corner radius
const EMOTE_SPRITE_SIZE = 56;
const EMOTE_TAIL_LEN    = 18;   // pixels tail extends from bubble edge toward divider
const EMOTE_TAIL_HALF   = 10;   // half-width of tail base on bubble edge

function projectIncomingX(contactX, distDelta, facing, width, speedMult = 1) {
  const offset = distDelta * PPU * speedMult;
  return facing === 'right'
    ? contactX + offset
    : contactX - offset - width;
}

function getGoblinFrameMetrics(isAttack, frame) {
  const boxes = isAttack ? GOBLIN_ATTACK_BOXES : GOBLIN_IDLE_BOXES;
  return boxes[frame % boxes.length];
}

function getDyingGoblinFrameMetrics(tick) {
  const TAKE_HIT_DUR = GH_FC * 6;
  const DEATH_DUR = GD_FC * 8;

  if (tick < TAKE_HIT_DUR) {
    const frame = Math.min(Math.floor(tick / 6), GH_FC - 1);
    return {
      metrics: GOBLIN_TAKE_HIT_BOXES[frame],
      srcH: GH_H,
      active: true,
    };
  }

  if (tick < TAKE_HIT_DUR + DEATH_DUR) {
    const localTick = tick - TAKE_HIT_DUR;
    const frame = Math.min(Math.floor(localTick / 8), GD_FC - 1);
    return {
      metrics: GOBLIN_DEATH_BOXES[frame],
      srcH: GOBLIN_H,
      active: true,
    };
  }

  return {
    metrics: GOBLIN_DEATH_BOXES[GD_FC - 1],
    srcH: GOBLIN_H,
    active: false,
  };
}

function isObstacleOnScreen(localX, width) {
  return localX + width > 0 && localX < HALF_W;
}

function projectDyingGoblinX(position, playerDistance, facing, tick) {
  const contactX = facing === 'right' ? BOY_CONTACT_X : GIRL_CONTACT_X;
  const distDelta = position - playerDistance;
  const { metrics } = getDyingGoblinFrameMetrics(tick);
  const width = metrics.srcWidth * GOBLIN_SCALE;
  return projectIncomingX(contactX, distDelta, facing, width);
}

function shieldActionStep(actionTick = 0) {
  return Math.min(Math.floor(actionTick / ACTION_STEP_FRAMES), ACTION_STEP_COUNT - 1);
}

function findBoxIntersection(boxes, target) {
  if (!target || !boxes.length) return null;

  for (const box of boxes) {
    const left = Math.max(target.left, box.left);
    const top = Math.max(target.top, box.top);
    const right = Math.min(target.right, box.right);
    const bottom = Math.min(target.bottom, box.bottom);
    if (right >= left && bottom >= top) {
      return { left, top, right, bottom, label: box.label };
    }
  }

  return null;
}

function shieldBoxForSnapshot(side, player, snapshot) {
  if (snapshot?.action !== 'block') return null;

  const step = shieldActionStep(snapshot.actionTick || 0);
  const scale = SHIELD_SCALES[step];
  const height = SPRITE_H * scale;
  const left = side === 'girl'
    ? GIRL_LOCAL_X - SHIELD_W - SHIELD_GAP
    : BOY_LOCAL_X + SPRITE_W + SHIELD_GAP;
  const top = PLAYER_Y - (player.jumpY || 0) + (SPRITE_H - height) / 2;

  return {
    left,
    top,
    right: left + SHIELD_W,
    bottom: top + height,
  };
}

function swordBoxForSnapshot(side, player, snapshot) {
  if (snapshot?.action !== 'attack') return null;

  const step = shieldActionStep(snapshot.actionTick || 0);
  const thrust = SWORD_THRUSTS[step];
  const top = PLAYER_Y - (player.jumpY || 0) + SPRITE_H * 0.65 - SWORD_H / 2;

  if (side === 'girl') {
    const handleX = GIRL_LOCAL_X + SPRITE_W * 0.45 - thrust;
    return {
      left: handleX - SWORD_W,
      top,
      right: handleX,
      bottom: top + SWORD_H,
    };
  }

  const handleX = BOY_LOCAL_X + SPRITE_W * 0.55 + thrust;
  return {
    left: handleX,
    top,
    right: handleX + SWORD_W,
    bottom: top + SWORD_H,
  };
}

function getDebugOverlayGeometry(side, player, obstacles, snapshot, nowMs = 0) {
  const baseX = side === 'boy' ? BOY_LOCAL_X : GIRL_LOCAL_X;
  const facing = side === 'boy' ? 'right' : 'left';
  const contactX = side === 'boy' ? BOY_CONTACT_X : GIRL_CONTACT_X;
  const geometry = {
    playerColumns: [],
    playerBounds: null,
    obstacleColumns: [],
    obstacleBoxes: [],
    overlapColumns: [],
    swordBox: null,
    swordCollisionBox: null,
    shieldBox: null,
    shieldCollisionBox: null,
    collisionBox: null,
  };

  if (snapshot?.playerColumns?.length) {
    geometry.playerColumns = snapshot.playerColumns.map(col => ({
      x: baseX + col.x,
      top: col.top,
      bottom: col.bottom,
    }));
    const xs = geometry.playerColumns.map(col => col.x);
    const tops = geometry.playerColumns.map(col => col.top);
    const bottoms = geometry.playerColumns.map(col => col.bottom);
    geometry.playerBounds = {
      left: Math.min(...xs),
      top: Math.min(...tops),
      right: Math.max(...xs),
      bottom: Math.max(...bottoms),
    };
  }

  if (snapshot?.spikeColumns?.length) {
    geometry.obstacleColumns = snapshot.spikeColumns.map(col => ({
      x: baseX + col.x,
      top: col.top,
      bottom: col.bottom,
    }));
    const xs = geometry.obstacleColumns.map(col => col.x);
    const tops = geometry.obstacleColumns.map(col => col.top);
    const bottoms = geometry.obstacleColumns.map(col => col.bottom);
    geometry.obstacleBoxes.push({
      label: 'spikes',
      left: Math.min(...xs),
      top: Math.min(...tops),
      right: Math.max(...xs),
      bottom: Math.max(...bottoms),
    });
  }

  const frontObstacle = obstacles && obstacles[0];
  if (frontObstacle && frontObstacle.type !== 'spikes') {
    const distDelta = frontObstacle.position - player.distance;

    if (frontObstacle.type === 'bird') {
      const frameIndex = Math.floor(nowMs / 120) % 3;
      const frameData = BIRD_FRAME_DATA[frameIndex];
      const width = frameData.w * BIRD_SCALE;
      const height = frameData.h * BIRD_SCALE;
      const left = projectIncomingX(contactX, distDelta, facing, width, BIRD_SPEED_MULT);
      geometry.obstacleBoxes.push({
        label: 'bird',
        left,
        top: BIRD_BOTTOM - height,
        right: left + width,
        bottom: BIRD_BOTTOM,
      });
    } else if (frontObstacle.type === 'arrowwall') {
      const width = Math.round(AR_W * AR_SCALE);
      const height = Math.round(AR_H * AR_SCALE);
      const left = projectIncomingX(contactX, distDelta, facing, width);
      const top = GROUND_TOP - height;
      for (const band of ARROW_ROW_BANDS) {
        geometry.obstacleBoxes.push({
          label: 'arrowwall',
          left,
          top: top + band.top * AR_SCALE,
          right: left + width,
          bottom: top + (band.bottom + 1) * AR_SCALE,
        });
      }
    } else if (frontObstacle.type === 'goblin') {
      const frame = Math.floor(nowMs / 120) % GI_FC;
      const metrics = getGoblinFrameMetrics(false, frame);
      const width = metrics.srcWidth * GOBLIN_SCALE;
      const height = GOBLIN_H * GOBLIN_SCALE;
      const left = projectIncomingX(contactX, distDelta, facing, width);
      geometry.obstacleBoxes.push({
        label: 'goblin',
        left,
        top: GROUND_TOP - height,
        right: left + width,
        bottom: GROUND_TOP,
      });
    }
  }

  if (geometry.playerColumns.length && geometry.obstacleColumns.length) {
    const playerByX = new Map(geometry.playerColumns.map(col => [Math.round(col.x), col]));
    geometry.overlapColumns = geometry.obstacleColumns.flatMap(col => {
      const playerCol = playerByX.get(Math.round(col.x));
      if (!playerCol) return [];
      const top = Math.max(playerCol.top, col.top);
      const bottom = Math.min(playerCol.bottom, col.bottom);
      return bottom >= top ? [{ x: col.x, top, bottom }] : [];
    });
  }

  geometry.swordBox = swordBoxForSnapshot(side, player, snapshot);
  geometry.swordCollisionBox = findBoxIntersection(geometry.obstacleBoxes, geometry.swordBox);
  geometry.shieldBox = shieldBoxForSnapshot(side, player, snapshot);
  geometry.shieldCollisionBox = findBoxIntersection(geometry.obstacleBoxes, geometry.shieldBox);
  geometry.collisionBox = findBoxIntersection(geometry.obstacleBoxes, geometry.playerBounds);

  return geometry;
}

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
const WALK_FRAMES     = [2, 3];   // the two sideways-facing run frames (0-indexed; user calls these "3 and 4")
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
function createRenderer(canvas, images, emoteImages = {}) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const { drawBackground: drawSceneBackground } = createSceneRenderer(ctx, {
    HALF_W,
    CANVAS_H,
    GROUND_TOP,
    TILE,
    PPU,
    BOY_LOCAL_X,
    GIRL_LOCAL_X,
  });
  // Legacy scene helpers below still exist while the renderer split lands in stages.
  const boyStars = _genStars(30, 1337);
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

  const boyAnim  = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0 };
  const girlAnim = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0 };

  const menuBoyAnim  = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0 };
  const menuGirlAnim = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0 };
  const helpWalkAnim = { frame: WALK_FRAMES[0], tick: 0, walkIdx: 0 };

  let menuTick = 0;
  function _menuWalkFrame(offset = 0) {
    return WALK_FRAMES[Math.floor((menuTick + offset) / WALK_SPEED) % WALK_FRAMES.length];
  }

  const menuStars = (() => {
    const rng = _makeRng(9999);
    return Array.from({ length: 160 }, () => ({
      x: rng() * CANVAS_W,
      y: rng() * CANVAS_H,
      r: rng() * 1.2 + 0.4,
      a: rng() * 0.7 + 0.3,
    }));
  })();

  // Dying goblins — animated independently after being cleared.
  // Each entry: { position, tick }. They stay in world space so runners pass them.
  const boyDying = [];
  const girlDying = [];

  // Lingering cleared obstacles (spikes, bird) — scroll off naturally rather than popping out.
  // Each entry is a copy of the obstacle object (has .position, .type).
  // Caller adds via addTrailObstacle(). Pruned when distDelta < -10.
  const boyTrail = [];
  const girlTrail = [];
  const boyEffects = [];
  const girlEffects = [];

  const boyEmote  = { type: null, frames: 0 };
  const girlEmote = { type: null, frames: 0 };

  // ── Public API ──────────────────────────────────────────────────────────────
  // boyObstacles / girlObstacles: each side's own obstacle list
  // boyBoosts / girlBoosts: each side's boost list ({ distance, collected })
  // elapsed: seconds since run started
  // gameTick: raw 60hz tick count (gs.elapsed) — drives walk cycle deterministically
  function renderPlay(boyPlayer, girlPlayer, boyObstacles, girlObstacles, boyBoosts, girlBoosts, elapsed, debugState, uiState = {}, gameTick = Math.round(elapsed * 60)) {
    const nowMs = Date.now();
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    _drawHalf(0,      'boy',  boyAnim,  boyPlayer,  boyObstacles,  boyBoosts,  boyDying,  boyTrail,  boyEffects,  nowMs, debugState?.enabled ? debugState.boy : null, gameTick);
    _drawHalf(HALF_W, 'girl', girlAnim, girlPlayer, girlObstacles, girlBoosts, girlDying, girlTrail, girlEffects, nowMs, debugState?.enabled ? debugState.girl : null, gameTick);
    _drawDivider();
    _drawHUD(boyPlayer, girlPlayer, elapsed, uiState);
    _drawEmoteBubbles();
    if (debugState?.enabled) _drawDebugBanner(debugState);
  }

  // ─── Space background (menu / help) ────────────────────────────────────────
  function _drawSpaceBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0,    '#07141f');
    grad.addColorStop(0.55, '#0d2233');
    grad.addColorStop(1,    '#030c14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const blobs = [
      { cx: 640, cy: 130, r: 250, c0: 'rgba(80,30,140,0.18)',  c1: 'rgba(40,60,140,0.10)',  s: 0.45 },
      { cx: 490, cy: 290, r: 190, c0: 'rgba(10,80,100,0.15)',  c1: 'rgba(10,60,80,0.07)',   s: 0.5  },
      { cx: 350, cy: 170, r: 210, c0: 'rgba(130,35,75,0.10)',  c1: 'rgba(70,20,55,0.04)',   s: 0.6  },
    ];
    for (const b of blobs) {
      const ng = ctx.createRadialGradient(b.cx, b.cy, 10, b.cx, b.cy, b.r);
      ng.addColorStop(0, b.c0); ng.addColorStop(b.s, b.c1); ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    ctx.save();
    for (const s of menuStars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function _drawRedButton(x, y, w, h, text, hovered, fontSize) {
    ctx.save();
    if (hovered) { ctx.shadowColor = 'rgba(220,60,80,0.65)'; ctx.shadowBlur = 18; }
    ctx.fillStyle = hovered ? '#cc2a3a' : '#9a1b28';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 2, y + 2, w - 4, Math.floor(h / 2) - 2);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#550010';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px "Cinzel Decorative", serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, x + w / 2, y + h / 2 + Math.round(fontSize * 0.36));
    ctx.restore();
  }

  function renderMenu(debugState, btnHovered, btn2Hovered, btn3Hovered) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    _drawSpaceBackground();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 72px "Cinzel Decorative", serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.55)';
    ctx.shadowBlur = 28;
    ctx.fillText('LOVERS LOST', CANVAS_W / 2, 105);
    ctx.restore();

    const btnW = 360, btnH = 56;
    _drawRedButton(CANVAS_W / 2 - btnW / 2, 210, btnW, btnH, 'LOCAL MULTIPLAYER',  btnHovered,  20);
    _drawRedButton(CANVAS_W / 2 - btnW / 2, 286, btnW, btnH, 'ONLINE MULTIPLAYER', btn2Hovered, 20);
    const btn3W = 240, btn3H = 44;
    _drawRedButton(CANVAS_W / 2 - btn3W / 2, 362, btn3W, btn3H, 'HOW TO PLAY', btn3Hovered, 16);

    _blit(images.boy,  _menuWalkFrame(),    FRAME_W, FRAME_H, 90,                       PLAYER_Y, SPRITE_W, SPRITE_H, false, 1);
    _blit(images.girl, _menuWalkFrame(),    FRAME_W, FRAME_H, CANVAS_W - 90 - SPRITE_W, PLAYER_Y, SPRITE_W, SPRITE_H, true,  1);

    if (debugState?.enabled) _drawDebugBanner(debugState);
  }

  // ─── Shared online helpers (also used by result screens) ─────────────────────

  function _formatIdentityLabel(side, identity) {
    const sideLabel = side === 'girl' ? 'Girl' : 'Boy';
    const name = typeof identity?.displayName === 'string' ? identity.displayName.trim() : '';
    return name ? `${name} (${sideLabel})` : sideLabel;
  }

  function _drawOnlineLabel(text, x, y, opts = {}) {
    const font = opts.font || 'bold 12px monospace';
    const padX = opts.padX || 10;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = font;
    const textWidth = Math.max(72, ctx.measureText(text).width + padX * 2);
    const boxH = opts.height || 24;
    ctx.fillStyle = opts.bg || 'rgba(8,18,36,0.88)';
    ctx.fillRect(x - textWidth / 2, y - boxH / 2, textWidth, boxH);
    ctx.strokeStyle = opts.stroke || 'rgba(110,150,235,0.50)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - textWidth / 2, y - boxH / 2, textWidth, boxH);
    ctx.fillStyle = opts.textColor || '#ffffff';
    ctx.fillText(text, x, y + 4);
    ctx.restore();
  }

  const { drawHUD: _drawHUD } = createHudRenderer(ctx, {
    drawOnlineLabel: _drawOnlineLabel,
  });

  const {
    renderOnlineSideSelect,
    renderOnlineNameEntry,
    renderOnlineLobby,
    renderOnlineCountdown,
  } = createOnlineRenderer(ctx, images, {
    blit: _blit,
    drawSpaceBackground: _drawSpaceBackground,
    drawRedButton: _drawRedButton,
    menuWalkFrame: _menuWalkFrame,
    drawOnlineLabel: _drawOnlineLabel,
    formatIdentityLabel: _formatIdentityLabel,
  });

  function renderMenuHelp(debugState) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    _drawSpaceBackground();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 34px "Cinzel Decorative", serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.40)';
    ctx.shadowBlur = 16;
    ctx.fillText('HOW TO PLAY', CANVAS_W / 2, 72);
    ctx.restore();

    const walkFrame = _menuWalkFrame();
    const nowMs = Date.now();

    const CARD_W = 200, CARD_H = 230, CGAP = 20;
    const START_X = (CANVAS_W - (4 * CARD_W + 3 * CGAP)) / 2;
    const CARD_Y = 105;
    const GROUND_LINE_Y = CARD_Y + 195;
    const CARD_TY = GROUND_LINE_Y - GROUND_TOP;

    const HELP_CARDS = [
      { type: 'spikes',    label: 'JUMP',   obsX: BOY_LOCAL_X + 18,            jY: 28, vs: { state: 'running', actionTick: 0 }, ps: 'jumping'   },
      { type: 'bird',      label: 'CROUCH', obsX: BOY_LOCAL_X + SPRITE_W + 14, jY: 0,  vs: { state: 'crouch',  actionTick: 0 }, ps: 'crouching' },
      { type: 'arrowwall', label: 'BLOCK',  obsX: BOY_LOCAL_X + SPRITE_W + 2,  jY: 0,  vs: { state: 'block',   actionTick: 6 }, ps: 'running'   },
      { type: 'goblin',    label: 'ATTACK', obsX: BOY_LOCAL_X + SPRITE_W + 6,  jY: 0,  vs: { state: 'attack',  actionTick: 6 }, ps: 'running'   },
    ];

    HELP_CARDS.forEach((card, i) => {
      const cardX = START_X + i * (CARD_W + CGAP);
      const tx    = cardX + CARD_W / 2 - (BOY_LOCAL_X + SPRITE_W / 2);

      ctx.save();
      ctx.fillStyle = 'rgba(5,14,28,0.78)';
      ctx.fillRect(cardX, CARD_Y, CARD_W, CARD_H);
      ctx.strokeStyle = 'rgba(90,130,210,0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cardX, CARD_Y, CARD_W, CARD_H);

      ctx.beginPath();
      ctx.rect(cardX, CARD_Y, CARD_W, CARD_H);
      ctx.clip();
      ctx.translate(tx, CARD_TY);

      // Obstacle drawn first so weapon/shield renders on top
      _drawObstacle(card.obsX, { type: card.type }, 'right', BOY_CONTACT_X, 0, nowMs);

      ctx.fillStyle = 'rgba(90,130,220,0.18)';
      ctx.fillRect(BOY_LOCAL_X - 60, GROUND_TOP, 280, 1);

      let screenY = PLAYER_Y - card.jY;
      let scaleY  = 1;
      if (card.ps === 'crouching') { scaleY = 0.5; screenY = PLAYER_Y + SPRITE_H * 0.5; }

      const step = _actionStep(card.vs.actionTick);
      if (card.vs.state === 'attack') _drawSword(BOY_LOCAL_X, screenY, false, step);
      _blit(images.boy, walkFrame, FRAME_W, FRAME_H, BOY_LOCAL_X, screenY, SPRITE_W, SPRITE_H, false, scaleY);
      if (card.vs.state === 'block')  _drawShield(BOY_LOCAL_X, screenY, false, step);

      ctx.restore();

      ctx.fillStyle = 'rgba(255,220,100,0.9)';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(card.label, cardX + CARD_W / 2, CARD_Y + CARD_H - 16);
    });

    const MID = CANVAS_W / 2;
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(255,220,100,0.80)';
    ctx.fillText('LEFT SIDE (BOY):', MID, 418);
    ctx.fillStyle = 'rgba(210,215,255,0.80)';
    ctx.fillText('W \u2014 jump    S \u2014 duck    D \u2014 attack    A \u2014 block', MID, 434);
    ctx.fillStyle = 'rgba(255,220,100,0.80)';
    ctx.fillText('RIGHT SIDE (GIRL):', MID, 454);
    ctx.fillStyle = 'rgba(210,215,255,0.80)';
    ctx.fillText('\u2191 \u2014 jump    \u2193 \u2014 duck    \u2190 \u2014 attack    \u2192 \u2014 block', MID, 470);

    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(180,190,255,0.40)';
    ctx.fillText('press any key or click to go back', MID, 492);

    if (debugState?.enabled) _drawDebugBanner(debugState);
  }

  function renderGameOver(boyPlayer, girlPlayer, runSummary) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    _drawSpaceBackground();
    const title  = runSummary?.outcome === 'partial' ? 'One Lover Made It' : 'Time Up';
    const footer = runSummary?.disconnectNote
      ? 'Partner disconnected  ·  Score screen incoming...'
      : 'Score screen incoming...';
    _drawResultSummary(title, boyPlayer, girlPlayer, runSummary, footer);
  }

  function renderScore(boyPlayer, girlPlayer, runSummary) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    _drawSpaceBackground();
    let title = 'Lovers Reunited';
    if (runSummary?.outcome === 'partial') title = 'Partial Finish';
    if (runSummary?.outcome === 'game_over') title = 'Run Over';
    _drawResultSummary(title, boyPlayer, girlPlayer, runSummary, 'Press any action key to return to menu');
  }

  function addDyingGoblin(side, obstacle, playerDistance) {
    const list = side === 'boy' ? boyDying : girlDying;
    void playerDistance;
    list.push({ position: obstacle.position, tick: 0 });
  }

  // Call when a spike or bird obstacle is cleared/missed — keeps it rendering until
  // it scrolls off screen. Do NOT call for arrowwall or goblin (those vanish immediately).
  function addTrailObstacle(side, obs) {
    const list = side === 'boy' ? boyTrail : girlTrail;
    list.push({ ...obs });
  }

  function addOutcomeEffect(side, kind, obstacleType) {
    const list = side === 'boy' ? boyEffects : girlEffects;
    list.push({ kind, obstacleType, tick: 0 });
  }

  function clearSideObstacleVisuals(side) {
    const trail = side === 'boy' ? boyTrail : girlTrail;
    const dying = side === 'boy' ? boyDying : girlDying;
    const effects = side === 'boy' ? boyEffects : girlEffects;
    trail.length = 0;
    dying.length = 0;
    effects.length = 0;
  }

  function addEmote(recipientSide, type) {
    const state = recipientSide === 'boy' ? boyEmote : girlEmote;
    state.type   = type;
    state.frames = EMOTE_DURATION;
  }

  function _drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,      y + h, x,      y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y,     x + r, y,               r);
    ctx.closePath();
  }

  function _drawEmoteBubble(recipientSide, state) {
    if (!state.type || state.frames <= 0) return;

    const alpha   = state.frames <= EMOTE_FADE_FRAMES ? state.frames / EMOTE_FADE_FRAMES : 1;
    const centerY = EMOTE_BUBBLE_Y + EMOTE_BUBBLE_H / 2;

    let bubbleX, tailTipX, tailDir;
    if (recipientSide === 'boy') {
      bubbleX  = DIVIDER_X - EMOTE_TAIL_LEN - EMOTE_BUBBLE_W;
      tailTipX = DIVIDER_X - 2;
      tailDir  = 'right';
    } else {
      bubbleX  = DIVIDER_X + EMOTE_TAIL_LEN;
      tailTipX = DIVIDER_X + 2;
      tailDir  = 'left';
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = '#ffffff';
    ctx.shadowColor    = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur     = 8;
    ctx.shadowOffsetX  = 2;
    ctx.shadowOffsetY  = 2;

    _drawRoundRect(bubbleX, EMOTE_BUBBLE_Y, EMOTE_BUBBLE_W, EMOTE_BUBBLE_H, EMOTE_BUBBLE_R);
    ctx.fill();

    ctx.beginPath();
    if (tailDir === 'right') {
      const baseX = bubbleX + EMOTE_BUBBLE_W;
      ctx.moveTo(baseX, centerY - EMOTE_TAIL_HALF);
      ctx.lineTo(tailTipX, centerY);
      ctx.lineTo(baseX, centerY + EMOTE_TAIL_HALF);
    } else {
      ctx.moveTo(bubbleX, centerY - EMOTE_TAIL_HALF);
      ctx.lineTo(tailTipX, centerY);
      ctx.lineTo(bubbleX, centerY + EMOTE_TAIL_HALF);
    }
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    const emoteImg = emoteImages[state.type];
    if (emoteImg && emoteImg.complete && emoteImg.naturalWidth > 0) {
      const sprX = bubbleX + (EMOTE_BUBBLE_W - EMOTE_SPRITE_SIZE) / 2;
      const sprY = EMOTE_BUBBLE_Y + (EMOTE_BUBBLE_H - EMOTE_SPRITE_SIZE) / 2;
      ctx.drawImage(emoteImg, sprX, sprY, EMOTE_SPRITE_SIZE, EMOTE_SPRITE_SIZE);
    }

    ctx.restore();

    state.frames--;
    if (state.frames <= 0) state.type = null;
  }

  function _drawEmoteBubbles() {
    _drawEmoteBubble('boy',  boyEmote);
    _drawEmoteBubble('girl', girlEmote);
  }

  // ── Half ────────────────────────────────────────────────────────────────────
  function _drawHalf(offsetX, side, animState, player, obstacles, boosts, dying, trail, effects, nowMs, debugSnapshot, gameTick) {
    const facing = side === 'boy' ? 'right' : 'left';
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, 0, HALF_W, CANVAS_H);
    ctx.clip();
    drawSceneBackground(offsetX, side, player.distance);
    _drawTrailObstacles(offsetX, player, facing, trail, nowMs);
    _drawFieldObstacles(offsetX, player, facing, obstacles, nowMs);
    _drawFieldBoosts(offsetX, player, facing, boosts, side);
    _drawDyingGoblins(offsetX, player, facing, dying);
    _drawPlayerSprite(offsetX, player, facing, animState, side, gameTick);
    _drawOutcomeEffects(offsetX, side, effects);
    if (debugSnapshot?.enabled) _drawDebugCollision(offsetX, side, player, obstacles, debugSnapshot, nowMs);
    ctx.restore();
  }

  function _drawDebugCollision(offsetX, side, player, obstacles, snapshot, nowMs) {
    const geometry = getDebugOverlayGeometry(side, player, obstacles, snapshot, nowMs);
    const obstacleFill = snapshot.perfectWindowActive ? 'rgba(120,255,120,0.24)' : 'rgba(255,220,80,0.2)';
    const obstacleStroke = snapshot.perfectWindowActive ? 'rgba(120,255,120,0.98)' : 'rgba(255,220,80,0.95)';
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2;

    for (const box of geometry.obstacleBoxes) {
      ctx.fillStyle   = obstacleFill;
      ctx.strokeStyle = obstacleStroke;
      ctx.fillRect(offsetX + box.left, box.top, box.right - box.left, box.bottom - box.top);
      ctx.strokeRect(offsetX + box.left, box.top, box.right - box.left, box.bottom - box.top);
    }

    if (geometry.shieldBox) {
      ctx.fillStyle = 'rgba(120,255,180,0.18)';
      ctx.strokeStyle = 'rgba(120,255,180,0.95)';
      ctx.fillRect(
        offsetX + geometry.shieldBox.left,
        geometry.shieldBox.top,
        geometry.shieldBox.right - geometry.shieldBox.left,
        geometry.shieldBox.bottom - geometry.shieldBox.top
      );
      ctx.strokeRect(
        offsetX + geometry.shieldBox.left,
        geometry.shieldBox.top,
        geometry.shieldBox.right - geometry.shieldBox.left,
        geometry.shieldBox.bottom - geometry.shieldBox.top
      );
    }

    if (geometry.swordBox) {
      ctx.fillStyle = 'rgba(255,120,220,0.18)';
      ctx.strokeStyle = 'rgba(255,120,220,0.95)';
      ctx.fillRect(
        offsetX + geometry.swordBox.left,
        geometry.swordBox.top,
        geometry.swordBox.right - geometry.swordBox.left,
        geometry.swordBox.bottom - geometry.swordBox.top
      );
      ctx.strokeRect(
        offsetX + geometry.swordBox.left,
        geometry.swordBox.top,
        geometry.swordBox.right - geometry.swordBox.left,
        geometry.swordBox.bottom - geometry.swordBox.top
      );
    }

    if (geometry.obstacleColumns.length) {
      ctx.strokeStyle = obstacleStroke;
      for (const col of geometry.obstacleColumns) {
        ctx.beginPath();
        ctx.moveTo(offsetX + col.x, col.top);
        ctx.lineTo(offsetX + col.x, col.bottom);
        ctx.stroke();
      }
    }

    if (geometry.playerColumns.length) {
      const playerXs = geometry.playerColumns.map(col => col.x);
      const playerTops = geometry.playerColumns.map(col => col.top);
      const playerBottoms = geometry.playerColumns.map(col => col.bottom);
      ctx.fillStyle = 'rgba(80,220,255,0.18)';
      ctx.fillRect(
        offsetX + Math.min(...playerXs),
        Math.min(...playerTops),
        Math.max(...playerXs) - Math.min(...playerXs) + 1,
        Math.max(...playerBottoms) - Math.min(...playerTops)
      );
      ctx.strokeStyle = 'rgba(80,220,255,0.9)';
      for (const col of geometry.playerColumns) {
        ctx.beginPath();
        ctx.moveTo(offsetX + col.x, col.top);
        ctx.lineTo(offsetX + col.x, col.bottom);
        ctx.stroke();
      }
      ctx.strokeRect(
        offsetX + Math.min(...playerXs),
        Math.min(...playerTops),
        Math.max(...playerXs) - Math.min(...playerXs) + 1,
        Math.max(...playerBottoms) - Math.min(...playerTops)
      );
    }

    if (geometry.overlapColumns.length) {
      ctx.strokeStyle = 'rgba(255,70,70,1)';
      ctx.lineWidth = 3;
      for (const col of geometry.overlapColumns) {
        ctx.beginPath();
        ctx.moveTo(offsetX + col.x, col.top);
        ctx.lineTo(offsetX + col.x, col.bottom);
        ctx.stroke();
      }
    }

    if (geometry.collisionBox) {
      ctx.fillStyle = 'rgba(255,70,70,0.28)';
      ctx.strokeStyle = 'rgba(255,70,70,1)';
      ctx.fillRect(
        offsetX + geometry.collisionBox.left,
        geometry.collisionBox.top,
        geometry.collisionBox.right - geometry.collisionBox.left,
        geometry.collisionBox.bottom - geometry.collisionBox.top
      );
      ctx.strokeRect(
        offsetX + geometry.collisionBox.left,
        geometry.collisionBox.top,
        geometry.collisionBox.right - geometry.collisionBox.left,
        geometry.collisionBox.bottom - geometry.collisionBox.top
      );
    }

    if (geometry.shieldCollisionBox) {
      ctx.fillStyle = 'rgba(120,255,180,0.26)';
      ctx.strokeStyle = 'rgba(120,255,180,0.98)';
      ctx.fillRect(
        offsetX + geometry.shieldCollisionBox.left,
        geometry.shieldCollisionBox.top,
        geometry.shieldCollisionBox.right - geometry.shieldCollisionBox.left,
        geometry.shieldCollisionBox.bottom - geometry.shieldCollisionBox.top
      );
      ctx.strokeRect(
        offsetX + geometry.shieldCollisionBox.left,
        geometry.shieldCollisionBox.top,
        geometry.shieldCollisionBox.right - geometry.shieldCollisionBox.left,
        geometry.shieldCollisionBox.bottom - geometry.shieldCollisionBox.top
      );
    }

    if (geometry.swordCollisionBox) {
      ctx.fillStyle = 'rgba(255,120,220,0.26)';
      ctx.strokeStyle = 'rgba(255,120,220,0.98)';
      ctx.fillRect(
        offsetX + geometry.swordCollisionBox.left,
        geometry.swordCollisionBox.top,
        geometry.swordCollisionBox.right - geometry.swordCollisionBox.left,
        geometry.swordCollisionBox.bottom - geometry.swordCollisionBox.top
      );
      ctx.strokeRect(
        offsetX + geometry.swordCollisionBox.left,
        geometry.swordCollisionBox.top,
        geometry.swordCollisionBox.right - geometry.swordCollisionBox.left,
        geometry.swordCollisionBox.bottom - geometry.swordCollisionBox.top
      );
    }

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(offsetX + 8, 8, 226, 110);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(offsetX + 8, 8, 226, 110);
    ctx.fillStyle = '#f3f5ff';
    ctx.font = '12px monospace';
    ctx.fillText(`obs: ${snapshot.obstacleType}`, offsetX + 16, 26);
    ctx.fillText(`action: ${snapshot.action || 'none'}`, offsetX + 16, 42);
    ctx.fillText(`feetY: ${Math.round(snapshot.playerBottomY)}`, offsetX + 16, 58);
    ctx.fillText(`overlap: ${Math.round(snapshot.overlapHeight || 0)}`, offsetX + 16, 74);
    ctx.fillText(`timing: ${snapshot.timingGrade || 'n/a'}`, offsetX + 16, 90);
    ctx.fillText(`touch: ${geometry.collisionBox || geometry.shieldCollisionBox || geometry.swordCollisionBox || geometry.overlapColumns.length ? 'yes' : 'no'}`, offsetX + 16, 106);
    ctx.restore();
  }

  function _drawDebugBanner(debugState) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 15, 20, 0.85)';
    ctx.fillRect(260, 8, 440, 24);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeRect(260, 8, 440, 24);
    ctx.fillStyle = '#f6e96b';
    ctx.font = '12px monospace';
    ctx.fillText(`DEBUG HITBOXES ON  F3 toggle  ${debugState.hint || ''}`.trim(), 270, 24);
    ctx.restore();
  }

  function _drawDyingGoblins(offsetX, player, facing, dying) {
    for (let i = dying.length - 1; i >= 0; i--) {
      const dg = dying[i];
      const localX = projectDyingGoblinX(dg.position, player.distance, facing, dg.tick);
      const { metrics } = getDyingGoblinFrameMetrics(dg.tick);
      const width = metrics.srcWidth * GOBLIN_SCALE;
      const still = isObstacleOnScreen(localX, width)
        ? _drawDyingGoblin(offsetX + localX, facing === 'right', dg.tick)
        : getDyingGoblinFrameMetrics(dg.tick).active;
      dg.tick++;
      if (!still) dying.splice(i, 1);
    }
  }

  function _effectY(obstacleType) {
    switch (obstacleType) {
      case 'spikes':    return GROUND_TOP - 18;
      case 'bird':      return BIRD_BOTTOM - 18;
      case 'arrowwall': return GROUND_TOP - 34;
      case 'goblin':    return GROUND_TOP - 44;
default:          return GROUND_TOP - 28;
    }
  }


  const TEXT_DURATION = 42; // frames the grade label stays visible (~0.7s)

  function _drawOutcomeEffects(offsetX, side, effects) {
    const contactX = side === 'boy' ? BOY_CONTACT_X + 10 : GIRL_CONTACT_X - 10;

    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      const tText = effect.tick / TEXT_DURATION;
      if (tText >= 1) {
        effects.splice(i, 1);
        continue;
      }

      const cx = offsetX + contactX;
      const cy = _effectY(effect.obstacleType);

      ctx.save();

      // Grade text — floats up, fades out
      if (effect.kind === 'perfect' || effect.kind === 'good' || effect.kind === 'hit') {
        const label = effect.kind === 'perfect' ? 'PERFECT' : effect.kind === 'good' ? 'GOOD' : 'MISS';
        const floatY   = cy - 10 - tText * 22;
        ctx.globalAlpha = Math.max(0, 1 - tText * 1.4);
        ctx.font        = `bold 13px monospace`;
        ctx.textAlign   = 'center';
        ctx.fillStyle   = effect.kind === 'perfect' ? '#ffe040' : effect.kind === 'hit' ? '#ff5555' : '#ffffff';
        ctx.shadowColor = effect.kind === 'perfect' ? '#ffaa00' : effect.kind === 'hit' ? '#aa0000' : 'rgba(0,0,0,0.6)';
        ctx.shadowBlur  = 6;
        ctx.fillText(label, cx, floatY);
      }

      ctx.restore();
      effect.tick++;
    }
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

    // Girl runs left — backgrounds must scroll in the opposite direction
    const signedDist = side === 'boy' ? distance : -distance;

    function drawEnvWithStars(ei) {
      _drawEnv(offsetX, pals[ei], scenes[ei], signedDist);
      if (ei === 4) _drawStars(offsetX, stars, signedDist);
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
  function _obsWidth(obs, nowMs) {
    switch (obs.type) {
      case 'spikes':    return 36;
      case 'bird':      return 57;                      // 38px × 1.5
      case 'arrowwall': return Math.round(AR_W * AR_SCALE);  // 72px
      case 'goblin': {
        const frame = Math.floor(nowMs / 120) % GI_FC;
        return getGoblinFrameMetrics(false, frame).srcWidth * GOBLIN_SCALE;
      }
      default:          return 36;
    }
  }

  // Returns the effective PPU for an obstacle (bird swoops in faster).
  function _obsPPU(obs) {
    return obs.type === 'bird' ? PPU * BIRD_SPEED_MULT : PPU;
  }

  function _drawFieldObstacles(offsetX, player, facing, obstacles, nowMs) {
    if (!obstacles || !obstacles.length) return;
    const contactX = facing === 'right' ? BOY_CONTACT_X : GIRL_CONTACT_X;

    for (const obs of obstacles) {
      if (obs.cleared) continue;
      const distDelta = obs.position - player.distance;
      const ppu       = _obsPPU(obs);
      const obsW      = _obsWidth(obs, nowMs);
      const speedMult = ppu / PPU;
      const localObsX = projectIncomingX(contactX, distDelta, facing, obsW, speedMult);

      if (!isObstacleOnScreen(localObsX, obsW)) continue;

      const absX = offsetX + localObsX;
      _drawObstacle(absX, obs, facing, offsetX + contactX, distDelta, nowMs);
      if (obs.isWarmup) _drawWarmupHint(absX + obsW / 2, obs.type, facing);
    }
  }

  // Draw cleared spikes/birds from the trail array, scrolling them off naturally.
  // Prunes entries that have moved off-screen.
  function _drawTrailObstacles(offsetX, player, facing, trail, nowMs) {
    if (!trail || !trail.length) return;
    const contactX = facing === 'right' ? BOY_CONTACT_X : GIRL_CONTACT_X;

    for (let i = trail.length - 1; i >= 0; i--) {
      const obs       = trail[i];
      const distDelta = obs.position - player.distance;
      const ppu       = _obsPPU(obs);
      const obsW      = _obsWidth(obs, nowMs);
      const speedMult = ppu / PPU;
      const localObsX = projectIncomingX(contactX, distDelta, facing, obsW, speedMult);
      if (!isObstacleOnScreen(localObsX, obsW)) { trail.splice(i, 1); continue; }

      _drawObstacle(offsetX + localObsX, obs, facing, offsetX + contactX, distDelta, nowMs);
    }
  }

  function _drawObstacle(x, obs, facing, contactX, distDelta, nowMs) {
    const flip = facing === 'right';
    switch (obs.type) {
      case 'spikes':    _drawSpikes(x);                              break;
      case 'bird':      _drawBird(x, flip);                          break;
      case 'arrowwall': _drawArrowWall(x, flip);                     break;
      case 'goblin':    _drawGoblin(x, obs, facing, contactX, distDelta, nowMs); break;
    }
  }

  const _HINT_KEYS = {
    right: { jump: 'W', crouch: 'S', attack: 'D', block: 'A' },
    left:  { jump: '↑', crouch: '↓', attack: '←', block: '→' },
  };
  const _OBS_ACTION = { spikes: 'jump', bird: 'crouch', arrowwall: 'block', goblin: 'attack' };
  const _HINT_Y = {
    spikes:    GROUND_TOP - 56,
    bird:      BIRD_BOTTOM - 36 - 28,
    arrowwall: GROUND_TOP - 96,
    goblin:    GROUND_TOP - 86,
  };

  function _drawWarmupHint(cx, obsType, facing) {
    const action = _OBS_ACTION[obsType];
    const key    = _HINT_KEYS[facing]?.[action];
    if (!key) return;
    const y = _HINT_Y[obsType] ?? (GROUND_TOP - 70);

    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tw   = ctx.measureText(key).width;
    const pw   = Math.max(tw + 14, 28);
    const ph   = 22;
    const rx   = cx - pw / 2;
    const ry   = y - ph / 2;
    const rad  = 5;

    // pill background
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath();
    ctx.moveTo(rx + rad, ry);
    ctx.lineTo(rx + pw - rad, ry);
    ctx.arcTo(rx + pw, ry, rx + pw, ry + rad, rad);
    ctx.lineTo(rx + pw, ry + ph - rad);
    ctx.arcTo(rx + pw, ry + ph, rx + pw - rad, ry + ph, rad);
    ctx.lineTo(rx + rad, ry + ph);
    ctx.arcTo(rx, ry + ph, rx, ry + ph - rad, rad);
    ctx.lineTo(rx, ry + rad);
    ctx.arcTo(rx, ry, rx + rad, ry, rad);
    ctx.closePath();
    ctx.fill();

    // key label
    ctx.fillStyle = '#ffe066';
    ctx.fillText(key, cx, y);

    ctx.restore();
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

  // Bird: animated sprite (red1/2/3), flies at head height — must crouch to dodge.
  // Sprites face right; flip=true mirrors for boy's side (bird comes from right, faces left).
  function _drawBird(x, flip) {
    const fi  = Math.floor(Date.now() / 120) % 3;
    const fd  = BIRD_FRAME_DATA[fi];
    const img = images.birds && images.birds[fi];
    const dw  = fd.w * BIRD_SCALE;
    const dh  = fd.h * BIRD_SCALE;
    // Bottom anchored at BIRD_BOTTOM (just above crouch-top=436) so crouching clears it
    const by  = BIRD_BOTTOM - dh;

    ctx.save();
    if (flip) {
      ctx.translate(x + dw, 0);
      ctx.scale(-1, 1);
      x = 0;
    }
    if (img && img.complete) {
      ctx.drawImage(img, 0, 0, fd.w, fd.h, x, by, dw, dh);
    } else {
      // Fallback: simple rectangle placeholder
      ctx.fillStyle = '#44aaff';
      ctx.fillRect(x, by + dh * 0.25, dw, dh * 0.5);
    }
    ctx.restore();
  }

  // Arrow wall: arrows.png is a single 48×44 image, rendered at 1.5×.
  // Source art points RIGHT; flip on the boy side so the arrows face the player.
  function _drawArrowWall(x, flip) {
    const img = images.arrows;
    const dw  = Math.round(AR_W * AR_SCALE);   // 72
    const dh  = Math.round(AR_H * AR_SCALE);   // 66
    const ay  = GROUND_TOP - dh;
    ctx.save();
    if (flip) {
      // Mirror horizontally so arrows point LEFT (toward boy)
      ctx.translate(x + dw, 0);
      ctx.scale(-1, 1);
      x = 0;
    }
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, AR_W, AR_H, x, ay, dw, dh);
    } else {
      // Fallback: simple placeholder block
      ctx.fillStyle = '#ccaa44';
      ctx.fillRect(x, ay + dh * 0.2, dw, dh * 0.6);
    }
    ctx.restore();
  }

  // Goblin: sprite-based. Source art faces RIGHT; flip on the boy side.
  // On clearance: caller should play take-hit → death (tracked in dyingGoblins).
  function _drawGoblin(x, obs, facing, contactX, distDelta, nowMs) {
    const flip  = facing === 'right';
    const frame = Math.floor(nowMs / 120) % GI_FC;
    const metrics = getGoblinFrameMetrics(false, frame);
    const dw = metrics.srcWidth * GOBLIN_SCALE;
    const dh = GOBLIN_H * GOBLIN_SCALE;
    const gy = GROUND_TOP - dh;

    ctx.save();
    if (flip) {
      ctx.translate(x + dw, 0);
      ctx.scale(-1, 1);
      x = 0;
    }
    if (images.goblinIdle && images.goblinIdle.complete && images.goblinIdle.naturalWidth > 0) {
      ctx.drawImage(images.goblinIdle, frame * GI_FW + metrics.srcInset, 0, metrics.srcWidth, GOBLIN_H, x, gy, dw, dh);
    } else {
      ctx.fillStyle = '#44aa44';
      ctx.fillRect(x, gy, dw, dh);
    }
    ctx.restore();
  }

  // Draw a dying goblin (take-hit → death animation sequence) at a world-projected x.
  // Returns true if the animation is still running, false when complete.
  function _drawDyingGoblin(screenX, flip, tick) {
    const { metrics, srcH, active } = getDyingGoblinFrameMetrics(tick);
    const img = tick < GH_FC * 6 ? images.goblinTakeHit : images.goblinDeath;
    const fw = tick < GH_FC * 6 ? GH_FW : GD_FW;
    const frame = tick < GH_FC * 6
      ? Math.min(Math.floor(tick / 6), GH_FC - 1)
      : Math.min(Math.floor((tick - GH_FC * 6) / 8), GD_FC - 1);
    const ddw = metrics.srcWidth * GOBLIN_SCALE;
    const ddh = srcH * GOBLIN_SCALE;
    const dgy = GROUND_TOP - ddh;

    ctx.save();
    if (flip) {
      ctx.translate(screenX + ddw, 0);
      ctx.scale(-1, 1);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, frame * fw + metrics.srcInset, 0, metrics.srcWidth, srcH, 0, dgy, ddw, ddh);
      }
    } else {
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, frame * fw + metrics.srcInset, 0, metrics.srcWidth, srcH, screenX, dgy, ddw, ddh);
      }
    }
    ctx.restore();

    return active;
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
  // walkAnim: renderer-internal walk cycle tracker (frame, tick, walkIdx).
  // Visual state is read from player.animState (provided by game.js / demo.html):
  //   { state: 'running'|'jumping'|'crouch'|'attack'|'block'|'hit', actionTick: number }
  function _drawPlayerSprite(offsetX, player, facing, walkAnim, side, gameTick) {
    const img    = side === 'boy' ? images.boy : images.girl;
    const localX = side === 'boy' ? BOY_LOCAL_X : GIRL_LOCAL_X;
    const flipX  = facing === 'left';
    const isFinished = player.state === 'finished';

    if (gameTick != null) {
      walkAnim.frame = WALK_FRAMES[Math.floor(gameTick / WALK_SPEED) % WALK_FRAMES.length];
    } else {
      _tickAnim(walkAnim);
    }

    // Visual state from caller — fall back to 'running' if not provided.
    const vs     = isFinished ? { state: 'running', actionTick: 0 } : (player.animState || { state: 'running', actionTick: 0 });
    const vState = isFinished ? 'running' : (player.state === 'crouching' ? 'crouch' : vs.state);

    const screenX = offsetX + localX;
    let   screenY = isFinished ? PLAYER_Y : (PLAYER_Y - (player.jumpY || 0));   // jumpY is pixels above ground; game.js drives this
    let   scaleY  = 1;

    if (vState === 'crouch') {
      scaleY  = 0.5;
      screenY = PLAYER_Y + SPRITE_H * 0.5;   // keep feet on ground
    }

    const step = _actionStep(vs.actionTick);
    // Sword drawn first so it appears behind the character sprite
    if (vState === 'attack') _drawSword(screenX, screenY, flipX, step);

    // Hit blink — walk cycle continues, only visibility changes
    const hitFlash = vState === 'hit' && (Math.floor(Date.now() / 80) % 2 === 0);
    ctx.save();
    if (hitFlash) ctx.globalAlpha = 0.35;
    _blit(img, walkAnim.frame, FRAME_W, FRAME_H, screenX, screenY, SPRITE_W, SPRITE_H, flipX, scaleY);
    ctx.restore();

    if (vState === 'block') _drawShield(screenX, screenY, flipX, step);
  }

  // Advances the walk cycle. Called once per frame per player.
  // Visual state (attack/block/hit/crouch) is managed by the caller via player.animState.
  function _tickAnim(walkAnim) {
    walkAnim.tick++;
    if (walkAnim.tick >= WALK_SPEED) {
      walkAnim.tick    = 0;
      walkAnim.walkIdx = (walkAnim.walkIdx + 1) % WALK_FRAMES.length;
    }
    walkAnim.frame = WALK_FRAMES[walkAnim.walkIdx];
  }

  function _actionStep(actionTick) {
    return shieldActionStep(actionTick);
  }

  // Sword: sprite has blade pointing RIGHT (65×20). Thrusts outward then retracts.
  // Handle overlaps the character's torso; blade extends forward.
  // Boy draws as-is; girl mirrors horizontally via scale(-1,1).
  function _drawSword(screenX, screenY, flipX, step) {
    if (!images.sword) return;
    const ALPHAS  = [0.6, 1.0, 0.6];
    const alpha   = ALPHAS[step];
    const thrust  = SWORD_THRUSTS[step];
    const hy      = screenY + SPRITE_H * 0.65 - SWORD_H / 2;

    // Handle sits at ~55% across the sprite for boy (his forward arm),
    // and ~45% across for girl (her forward arm after mirroring).
    // Sword extends from handle outward in the facing direction.
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flipX) {
      // Girl: sword extends LEFT. Translate to handle position, mirror, draw.
      // After scale(-1,1): local x=0 → screen handle position; blade goes left.
      const handleX = screenX + SPRITE_W * 0.45 - thrust;
      ctx.translate(handleX, hy + SWORD_H / 2);
      ctx.scale(-1, 1);
      ctx.drawImage(images.sword, 0, 0, SWORD_SRC_W, SWORD_SRC_H, 0, -SWORD_H / 2, SWORD_W, SWORD_H);
    } else {
      // Boy: sword extends RIGHT. Handle left edge at ~55% across the sprite.
      const handleX = screenX + SPRITE_W * 0.55 + thrust;
      ctx.drawImage(images.sword, 0, 0, SWORD_SRC_W, SWORD_SRC_H, handleX, hy, SWORD_W, SWORD_H);
    }
    ctx.restore();
  }

  // Shield: glowing magic rectangle that extends in front of the player.
  function _drawShield(screenX, screenY, flipX, step) {
    const ALPHAS = [0.5, 1.0, 0.5];
    const alpha  = ALPHAS[step];
    const scl    = SHIELD_SCALES[step];
    const sw     = SHIELD_W;
    const sh     = SPRITE_H * scl;
    const sx     = flipX ? screenX - sw - SHIELD_GAP : screenX + SPRITE_W + SHIELD_GAP;
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

  // ── Reunion helpers ───────────────────────────────────────────────────────────
  function _drawCharacterAtAbsX(absX, img, facing, walkAnim, gameTick) {
    if (gameTick != null) {
      walkAnim.frame = WALK_FRAMES[Math.floor(gameTick / WALK_SPEED) % WALK_FRAMES.length];
    } else {
      _tickAnim(walkAnim);
    }
    _blit(img, walkAnim.frame, FRAME_W, FRAME_H, absX, PLAYER_Y, SPRITE_W, SPRITE_H, facing === 'left', 1);
  }

  function _drawHeart(cx, cy, size) {
    const x = cx - size / 2;
    const y = cy - size / 2;
    const w = size, h = size;
    ctx.save();
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h / 4);
    ctx.quadraticCurveTo(x + w / 2, y,       x + w * 3 / 4, y);
    ctx.quadraticCurveTo(x + w,     y,       x + w,         y + h / 4);
    ctx.quadraticCurveTo(x + w,     y + h / 2, x + w / 2,  y + h * 3 / 4);
    ctx.quadraticCurveTo(x,         y + h / 2, x,           y + h / 4);
    ctx.quadraticCurveTo(x,         y,       x + w / 4,     y);
    ctx.quadraticCurveTo(x + w / 2, y,       x + w / 2,     y + h / 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function renderReunion(boyPlayer, girlPlayer, phaseFrames) {
    const WALK_FRAMES  = 300;
    const BOY_START_X  = BOY_LOCAL_X;                        // 120
    const GIRL_START_X = HALF_W + GIRL_LOCAL_X;              // 792
    const BOY_END_X    = HALF_W - SPRITE_W + 8;              // 440 — right edge just past center
    const GIRL_END_X   = HALF_W - 8;                         // 472 — left edge just before center

    const t     = Math.min(phaseFrames / WALK_FRAMES, 1);
    const ease  = 1 - Math.pow(1 - t, 3);                    // ease-out cubic
    const boyX  = BOY_START_X  + (BOY_END_X  - BOY_START_X)  * ease;
    const girlX = GIRL_START_X + (GIRL_END_X - GIRL_START_X) * ease;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawSceneBackground(0,      'boy',  boyPlayer.distance);
    drawSceneBackground(HALF_W, 'girl', girlPlayer.distance);

    // Divider fades out as characters walk together
    const dividerAlpha = 0.3 * (1 - ease);
    if (dividerAlpha > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${dividerAlpha})`;
      ctx.fillRect(DIVIDER_X - 1, 0, 2, CANVAS_H);
    }

    _drawCharacterAtAbsX(boyX,  images.boy,  'right', boyAnim,  phaseFrames);
    _drawCharacterAtAbsX(girlX, images.girl, 'left',  girlAnim, phaseFrames);

    // Heart: pops in once they've met, then pulses
    if (phaseFrames >= WALK_FRAMES) {
      const heartAge  = phaseFrames - WALK_FRAMES;
      const appear    = Math.min(heartAge / 20, 1);           // grows in over ~0.3s
      const pulse     = 1 + 0.12 * Math.sin(Date.now() / 280);
      const heartSize = 48 * appear * pulse;
      const heartCX   = (BOY_END_X + SPRITE_W / 2 + GIRL_END_X + SPRITE_W / 2) / 2;
      const heartCY   = PLAYER_Y - 36;
      _drawHeart(heartCX, heartCY, heartSize);
    }

    _drawEmoteBubbles();
  }

  function _formatRunTime(elapsedFrames = 0) {
    const totalMs = Math.round((elapsedFrames * 1000) / 60);
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;
    return `${mins}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
  }

  function _drawResultSummary(title, boyPlayer, girlPlayer, runSummary, footer) {
    const boyScore  = runSummary ? (runSummary.boyFinished  ? runSummary.boyScore  : boyPlayer.score)  : boyPlayer.score;
    const girlScore = runSummary ? (runSummary.girlFinished ? runSummary.girlScore : girlPlayer.score) : girlPlayer.score;
    const boyTrophy  = boyScore  >= girlScore ? ' 🏆' : '';
    const girlTrophy = girlScore >= boyScore  ? ' 🏆' : '';
    const boyName = _formatIdentityLabel('boy', runSummary?.boyIdentity);
    const girlName = _formatIdentityLabel('girl', runSummary?.girlIdentity);
    const boyLine = runSummary
      ? `${boyTrophy}${boyName}: ${runSummary.boyFinished ? runSummary.boyScore : `${boyPlayer.score} (forfeit)`}`
      : `${boyTrophy}${boyName} score: ${boyPlayer.score}`;
    const girlLine = runSummary
      ? `${girlTrophy}${girlName}: ${runSummary.girlFinished ? runSummary.girlScore : `${girlPlayer.score} (forfeit)`}`
      : `${girlTrophy}${girlName} score: ${girlPlayer.score}`;
    const total = runSummary ? runSummary.totalScore : boyPlayer.score + girlPlayer.score;
    _drawOverlayPanel(title, [
      runSummary ? `Time: ${_formatRunTime(runSummary.elapsedFrames)}` : null,
      runSummary?.disconnectNote ? 'Your partner disconnected.' : null,
      boyLine,
      girlLine,
      `Combined: ${total}`,
    ].filter(Boolean), footer);
  }

  function _drawOverlayPanel(title, lines, footer) {
    const rowH   = 30;
    const panelW = 580;
    const panelH = 72 + lines.length * rowH + (footer ? 48 : 24);
    const panelX = (CANVAS_W - panelW) / 2;
    const panelY = (CANVAS_H - panelH) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(5,14,28,0.88)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(100,140,220,0.32)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.textAlign = 'center';
    ctx.font = 'bold 40px "Cinzel Decorative", serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(160,190,255,0.50)';
    ctx.shadowBlur = 20;
    ctx.fillText(title, CANVAS_W / 2, panelY + 54);
    ctx.shadowBlur = 0;

    ctx.font = '16px monospace';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = lines[i] === 'Your partner disconnected.'
        ? 'rgba(255,176,176,0.96)'
        : 'rgba(210,215,255,0.90)';
      ctx.fillText(lines[i], CANVAS_W / 2, panelY + 88 + i * rowH);
    }

    if (footer) {
      ctx.font = '13px monospace';
      ctx.fillStyle = 'rgba(160,170,220,0.50)';
      ctx.fillText(footer, CANVAS_W / 2, panelY + panelH - 16);
    }
    ctx.restore();
  }

  function tickMenuAnims() { menuTick++; }

  // ─── Public API ───────────────────────────────────────────────────────────────
  return {
    renderPlay,
    tickMenuAnims,
    renderMenu,
    renderOnlineSideSelect,
    renderOnlineNameEntry,
    renderOnlineLobby,
    renderOnlineCountdown,
    renderMenuHelp,
    renderGameOver,
    renderScore,
    renderReunion,
    addDyingGoblin,
    addTrailObstacle,
    addOutcomeEffect,
    clearSideObstacleVisuals,
    addEmote,
  };
}

export { createRenderer, CANVAS_W, CANVAS_H, buildHudModel, projectIncomingX, projectDyingGoblinX, getGoblinFrameMetrics, isObstacleOnScreen, getDebugOverlayGeometry };
