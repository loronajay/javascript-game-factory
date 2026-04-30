// Pure geometry helpers — no canvas, no side effects.
// Consumed by renderer.js (re-exported) and injected into renderer-debug.js.

const CANVAS_W = 960;
const HALF_W   = 480;
const PPU      = 4;

const FRAME_W  = 16;
const FRAME_H  = 16;
const SCALE    = 3;
const SPRITE_W = FRAME_W * SCALE;   // 48
const SPRITE_H = FRAME_H * SCALE;   // 48

const SWORD_W  = 65;
const SWORD_H  = 20;
const SWORD_THRUSTS = [4, 12, 4];

const BIRD_SCALE      = 1.5;
const BIRD_BOTTOM     = 434;
const BIRD_FRAME_DATA = [
  { w: 38, h: 20 },
  { w: 38, h: 24 },
  { w: 38, h: 18 },
];
const BIRD_SPEED_MULT = 2;

const GOBLIN_SCALE = 2;
const GOBLIN_H     = 28;
const GI_FW = 99;  const GI_FC = 4;
const GA_FW = 84;  const GA_FC = 6;
const GD_FW = 75;  const GD_FC = 5;
const GH_FW = 87;  const GH_FC = 4;
const GH_H  = 27;

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
  { srcInset: 0,  srcWidth: 1  },
  { srcInset: 0,  srcWidth: 28 },
  { srcInset: 37, srcWidth: 38 },
];

const AR_W          = 48;
const AR_H          = 44;
const AR_SCALE      = 1.5;
const ARROW_ROW_BANDS = [
  { top: 0,  bottom: 8  },
  { top: 18, bottom: 26 },
  { top: 35, bottom: 43 },
];

const GROUND_TOP        = 460;
const BOY_LOCAL_X       = 120;
const GIRL_LOCAL_X      = HALF_W - SPRITE_W - 120;   // 312
const PLAYER_Y          = GROUND_TOP - SPRITE_H;      // 412
const PLAYER_CONTACT_PAD = 6;
const BOY_CONTACT_X     = BOY_LOCAL_X  + SPRITE_W - PLAYER_CONTACT_PAD;
const GIRL_CONTACT_X    = GIRL_LOCAL_X + PLAYER_CONTACT_PAD;

const SHIELD_W      = 10;
const SHIELD_GAP    = 6;
const SHIELD_SCALES = [0.5, 1.0, 0.5];

const ACTION_STEP_COUNT  = 3;
const ACTION_STEP_FRAMES = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const DEATH_DUR    = GD_FC * 8;

  if (tick < TAKE_HIT_DUR) {
    const frame = Math.min(Math.floor(tick / 6), GH_FC - 1);
    return { metrics: GOBLIN_TAKE_HIT_BOXES[frame], srcH: GH_H, active: true };
  }

  if (tick < TAKE_HIT_DUR + DEATH_DUR) {
    const localTick = tick - TAKE_HIT_DUR;
    const frame     = Math.min(Math.floor(localTick / 8), GD_FC - 1);
    return { metrics: GOBLIN_DEATH_BOXES[frame], srcH: GOBLIN_H, active: true };
  }

  return { metrics: GOBLIN_DEATH_BOXES[GD_FC - 1], srcH: GOBLIN_H, active: false };
}

function isObstacleOnScreen(localX, width) {
  return localX + width > 0 && localX < HALF_W;
}

function projectDyingGoblinX(position, playerDistance, facing, tick) {
  const contactX  = facing === 'right' ? BOY_CONTACT_X : GIRL_CONTACT_X;
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
    const left   = Math.max(target.left,   box.left);
    const top    = Math.max(target.top,    box.top);
    const right  = Math.min(target.right,  box.right);
    const bottom = Math.min(target.bottom, box.bottom);
    if (right >= left && bottom >= top) return { left, top, right, bottom, label: box.label };
  }
  return null;
}

function shieldBoxForSnapshot(side, player, snapshot) {
  if (snapshot?.action !== 'block') return null;
  const step   = shieldActionStep(snapshot.actionTick || 0);
  const scale  = SHIELD_SCALES[step];
  const height = SPRITE_H * scale;
  const left   = side === 'girl'
    ? GIRL_LOCAL_X - SHIELD_W - SHIELD_GAP
    : BOY_LOCAL_X + SPRITE_W + SHIELD_GAP;
  const top    = PLAYER_Y - (player.jumpY || 0) + (SPRITE_H - height) / 2;
  return { left, top, right: left + SHIELD_W, bottom: top + height };
}

function swordBoxForSnapshot(side, player, snapshot) {
  if (snapshot?.action !== 'attack') return null;
  const step   = shieldActionStep(snapshot.actionTick || 0);
  const thrust = SWORD_THRUSTS[step];
  const top    = PLAYER_Y - (player.jumpY || 0) + SPRITE_H * 0.65 - SWORD_H / 2;

  if (side === 'girl') {
    const handleX = GIRL_LOCAL_X + SPRITE_W * 0.45 - thrust;
    return { left: handleX - SWORD_W, top, right: handleX, bottom: top + SWORD_H };
  }

  const handleX = BOY_LOCAL_X + SPRITE_W * 0.55 + thrust;
  return { left: handleX, top, right: handleX + SWORD_W, bottom: top + SWORD_H };
}

function getDebugOverlayGeometry(side, player, obstacles, snapshot, nowMs = 0) {
  const baseX    = side === 'boy' ? BOY_LOCAL_X    : GIRL_LOCAL_X;
  const facing   = side === 'boy' ? 'right'        : 'left';
  const contactX = side === 'boy' ? BOY_CONTACT_X  : GIRL_CONTACT_X;
  const geometry = {
    playerColumns: [],
    playerBounds:  null,
    obstacleColumns: [],
    obstacleBoxes:   [],
    overlapColumns:  [],
    swordBox:           null,
    swordCollisionBox:  null,
    shieldBox:          null,
    shieldCollisionBox: null,
    collisionBox:       null,
  };

  if (snapshot?.playerColumns?.length) {
    geometry.playerColumns = snapshot.playerColumns.map(col => ({
      x:      baseX + col.x,
      top:    col.top,
      bottom: col.bottom,
    }));
    const xs      = geometry.playerColumns.map(c => c.x);
    const tops    = geometry.playerColumns.map(c => c.top);
    const bottoms = geometry.playerColumns.map(c => c.bottom);
    geometry.playerBounds = {
      left:   Math.min(...xs),
      top:    Math.min(...tops),
      right:  Math.max(...xs),
      bottom: Math.max(...bottoms),
    };
  }

  if (snapshot?.spikeColumns?.length) {
    geometry.obstacleColumns = snapshot.spikeColumns.map(col => ({
      x:      baseX + col.x,
      top:    col.top,
      bottom: col.bottom,
    }));
    const xs      = geometry.obstacleColumns.map(c => c.x);
    const tops    = geometry.obstacleColumns.map(c => c.top);
    const bottoms = geometry.obstacleColumns.map(c => c.bottom);
    geometry.obstacleBoxes.push({
      label:  'spikes',
      left:   Math.min(...xs),
      top:    Math.min(...tops),
      right:  Math.max(...xs),
      bottom: Math.max(...bottoms),
    });
  }

  const frontObstacle = obstacles && obstacles[0];
  if (frontObstacle && frontObstacle.type !== 'spikes') {
    const distDelta = frontObstacle.position - player.distance;

    if (frontObstacle.type === 'bird') {
      const frameIndex = Math.floor(nowMs / 120) % 3;
      const frameData  = BIRD_FRAME_DATA[frameIndex];
      const width      = frameData.w * BIRD_SCALE;
      const height     = frameData.h * BIRD_SCALE;
      const left       = projectIncomingX(contactX, distDelta, facing, width, BIRD_SPEED_MULT);
      geometry.obstacleBoxes.push({
        label: 'bird',
        left,
        top:    BIRD_BOTTOM - height,
        right:  left + width,
        bottom: BIRD_BOTTOM,
      });
    } else if (frontObstacle.type === 'arrowwall') {
      const width  = Math.round(AR_W * AR_SCALE);
      const height = Math.round(AR_H * AR_SCALE);
      const left   = projectIncomingX(contactX, distDelta, facing, width);
      const top    = GROUND_TOP - height;
      for (const band of ARROW_ROW_BANDS) {
        geometry.obstacleBoxes.push({
          label:  'arrowwall',
          left,
          top:    top + band.top * AR_SCALE,
          right:  left + width,
          bottom: top + (band.bottom + 1) * AR_SCALE,
        });
      }
    } else if (frontObstacle.type === 'goblin') {
      const frame   = Math.floor(nowMs / 120) % GI_FC;
      const metrics = getGoblinFrameMetrics(false, frame);
      const width   = metrics.srcWidth * GOBLIN_SCALE;
      const height  = GOBLIN_H * GOBLIN_SCALE;
      const left    = projectIncomingX(contactX, distDelta, facing, width);
      geometry.obstacleBoxes.push({
        label:  'goblin',
        left,
        top:    GROUND_TOP - height,
        right:  left + width,
        bottom: GROUND_TOP,
      });
    }
  }

  if (geometry.playerColumns.length && geometry.obstacleColumns.length) {
    const playerByX = new Map(geometry.playerColumns.map(col => [Math.round(col.x), col]));
    geometry.overlapColumns = geometry.obstacleColumns.flatMap(col => {
      const playerCol = playerByX.get(Math.round(col.x));
      if (!playerCol) return [];
      const top    = Math.max(playerCol.top,    col.top);
      const bottom = Math.min(playerCol.bottom, col.bottom);
      return bottom >= top ? [{ x: col.x, top, bottom }] : [];
    });
  }

  geometry.swordBox           = swordBoxForSnapshot(side, player, snapshot);
  geometry.swordCollisionBox  = findBoxIntersection(geometry.obstacleBoxes, geometry.swordBox);
  geometry.shieldBox          = shieldBoxForSnapshot(side, player, snapshot);
  geometry.shieldCollisionBox = findBoxIntersection(geometry.obstacleBoxes, geometry.shieldBox);
  geometry.collisionBox       = findBoxIntersection(geometry.obstacleBoxes, geometry.playerBounds);

  return geometry;
}

export {
  // Layout constants (re-exported for renderer.js to use)
  CANVAS_W, HALF_W, PPU,
  FRAME_W, FRAME_H, SCALE, SPRITE_W, SPRITE_H,
  SWORD_W, SWORD_H, SWORD_THRUSTS,
  BIRD_SCALE, BIRD_BOTTOM, BIRD_FRAME_DATA, BIRD_SPEED_MULT,
  GOBLIN_SCALE, GOBLIN_H,
  GI_FW, GI_FC, GA_FW, GA_FC, GD_FW, GD_FC, GH_FW, GH_FC, GH_H,
  AR_W, AR_H, AR_SCALE, ARROW_ROW_BANDS,
  GROUND_TOP, BOY_LOCAL_X, GIRL_LOCAL_X, PLAYER_Y,
  PLAYER_CONTACT_PAD, BOY_CONTACT_X, GIRL_CONTACT_X,
  SHIELD_W, SHIELD_GAP, SHIELD_SCALES,
  ACTION_STEP_COUNT, ACTION_STEP_FRAMES,
  GOBLIN_IDLE_BOXES, GOBLIN_ATTACK_BOXES, GOBLIN_TAKE_HIT_BOXES, GOBLIN_DEATH_BOXES,
  // Pure functions
  projectIncomingX,
  getGoblinFrameMetrics,
  getDyingGoblinFrameMetrics,
  isObstacleOnScreen,
  projectDyingGoblinX,
  shieldActionStep,
  findBoxIntersection,
  shieldBoxForSnapshot,
  swordBoxForSnapshot,
  getDebugOverlayGeometry,
};
