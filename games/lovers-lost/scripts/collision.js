import {
  JUMP_BOTTOM_PROFILE,
  PLAYER_RENDER_Y,
  PLAYER_BOX_TOP_PX, PLAYER_BOX_BOTTOM_PX,
  GIRL_VISIBLE_LEFT_PX, GIRL_VISIBLE_RIGHT_PX,
  PLAYER_VISIBLE_LEFT_PX, PLAYER_VISIBLE_RIGHT_PX,
  CROUCH_Y_OFFSET_PX, CROUCH_SCALE,
  SPIKE_WIDTH_PX, SPIKE_TRI_WIDTH_PX, SPIKE_HEIGHT_PX,
  BOY_CONTACT_REL_PX, GIRL_CONTACT_REL_PX,
} from './game-constants.js';
import { getDebugOverlayGeometry } from './renderer.js';
import { gradeInput } from './obstacles.js';

// ── Player geometry ────────────────────────────────────────────────────────────

function playerBottomAtLocalX(player, localX) {
  if (localX < 0 || localX >= 48) return null;
  const sourceX = Math.floor(localX / 3);
  const profileX = player.side === 'girl' ? 15 - sourceX : sourceX;
  const bottom = JUMP_BOTTOM_PROFILE[profileX];
  if (bottom == null) return null;
  return bottom * 3 + 2;
}

function playerVisibleBoundsX(player) {
  if (player.side === 'girl') {
    return { left: GIRL_VISIBLE_LEFT_PX, right: GIRL_VISIBLE_RIGHT_PX };
  }
  return { left: PLAYER_VISIBLE_LEFT_PX, right: PLAYER_VISIBLE_RIGHT_PX };
}

function playerIsCrouching(player, animState) {
  return !!(player && player.state === 'crouching')
    || !!(animState && animState.state === 'crouch');
}

function playerHurtboxForAnim(player, animState) {
  const { left, right } = playerVisibleBoundsX(player);
  const jumpY = player.jumpY || 0;
  const crouching = playerIsCrouching(player, animState);

  if (crouching) {
    return {
      left, right,
      top:    PLAYER_RENDER_Y - jumpY + CROUCH_Y_OFFSET_PX + Math.round(PLAYER_BOX_TOP_PX  * CROUCH_SCALE),
      bottom: PLAYER_RENDER_Y - jumpY + CROUCH_Y_OFFSET_PX + Math.round(PLAYER_BOX_BOTTOM_PX * CROUCH_SCALE),
    };
  }

  return {
    left, right,
    top:    PLAYER_RENDER_Y - jumpY + PLAYER_BOX_TOP_PX,
    bottom: PLAYER_RENDER_Y - jumpY + PLAYER_BOX_BOTTOM_PX,
  };
}

function buildPlayerDebugColumns(player, animState, obstacleType) {
  if (obstacleType === 'spikes') {
    const columns = [];
    for (let x = 0; x <= 47; x++) {
      const bottom = playerBottomAtLocalX(player, x);
      if (bottom == null) continue;
      columns.push({
        x,
        top:    PLAYER_RENDER_Y - (player.jumpY || 0) + bottom,
        bottom: PLAYER_RENDER_Y - (player.jumpY || 0) + 47,
      });
    }
    return columns;
  }

  const box = playerHurtboxForAnim(player, animState);
  const columns = [];
  for (let x = box.left; x <= box.right; x++) {
    columns.push({ x, top: box.top, bottom: box.bottom });
  }
  return columns;
}

// ── Spike geometry ─────────────────────────────────────────────────────────────

function spikeHeightAtOffset(offsetPx) {
  if (offsetPx < 0 || offsetPx > SPIKE_WIDTH_PX) return 0;
  const local = offsetPx % SPIKE_TRI_WIDTH_PX;
  const distFromTip = Math.abs(local - SPIKE_TRI_WIDTH_PX / 2);
  return Math.max(0, SPIKE_HEIGHT_PX * (1 - distFromTip / (SPIKE_TRI_WIDTH_PX / 2)));
}

function projectSpikeLocalX(player, obstacle) {
  const distDelta = obstacle.position - player.distance;
  if (player.side === 'girl') {
    return GIRL_CONTACT_REL_PX - distDelta * 4 - SPIKE_WIDTH_PX;
  }
  return BOY_CONTACT_REL_PX + distDelta * 4;
}

function spikeOverlapHeight(player, obstacle) {
  const spikeLeft  = projectSpikeLocalX(player, obstacle);
  const spikeRight = spikeLeft + SPIKE_WIDTH_PX;
  const overlapLeft  = Math.max(spikeLeft, 0);
  const overlapRight = Math.min(spikeRight, 47);
  if (overlapLeft >= overlapRight) return 0;

  let maxHeight = 0;
  for (let x = Math.ceil(overlapLeft); x < Math.ceil(overlapRight); x++) {
    const playerTopOffset = playerBottomAtLocalX(player, x);
    if (playerTopOffset == null) continue;
    const playerTop    = PLAYER_RENDER_Y - (player.jumpY || 0) + playerTopOffset;
    const playerBottom = PLAYER_RENDER_Y - (player.jumpY || 0) + 47;
    const spikeHeight  = spikeHeightAtOffset(x - spikeLeft);
    if (spikeHeight <= 0) continue;
    const spikeTop    = 460 - spikeHeight;
    const spikeBottom = 460;
    const overlapPx = Math.min(playerBottom, spikeBottom) - Math.max(playerTop, spikeTop);
    if (overlapPx >= 0) maxHeight = Math.max(maxHeight, overlapPx);
  }
  return maxHeight;
}

function spikeFullyBehindPlayer(player, obstacle) {
  const spikeLeft  = projectSpikeLocalX(player, obstacle);
  const spikeRight = spikeLeft + SPIKE_WIDTH_PX;
  if (player.side === 'girl') return spikeLeft >= PLAYER_VISIBLE_RIGHT_PX;
  return spikeRight <= PLAYER_VISIBLE_LEFT_PX;
}

// ── Debug collision snapshot ───────────────────────────────────────────────────

function contactActionForPlayer(player, animState) {
  if (player.state === 'jumping') return 'jump';
  if (playerIsCrouching(player, animState)) return 'crouch';
  if (!animState) return null;
  if (animState.state === 'attack') return 'attack';
  if (animState.state === 'block')  return 'block';
  return null;
}

function buildDebugCollisionSnapshot(player, obstacles, animState) {
  const frontObstacle = obstacles && obstacles[0];
  const playerHurtbox = playerHurtboxForAnim(player, animState);
  const timingGrade   = frontObstacle ? gradeInput(frontObstacle, player.distance) : null;
  const snapshot = {
    enabled:             true,
    obstacleType:        frontObstacle ? frontObstacle.type : 'none',
    timingGrade,
    perfectWindowActive: timingGrade === 'perfect',
    playerBottomY:       playerHurtbox.bottom,
    playerColumns:       buildPlayerDebugColumns(player, animState, frontObstacle ? frontObstacle.type : null),
    overlapHeight:       0,
    requiredJump:        0,
    action:              contactActionForPlayer(player, animState),
    actionTick:          animState ? animState.actionTick : 0,
  };

  if (!frontObstacle || frontObstacle.type !== 'spikes') return snapshot;

  const spikeLeft = projectSpikeLocalX(player, frontObstacle);
  snapshot.spikeLeft  = spikeLeft;
  snapshot.spikeRight = spikeLeft + SPIKE_WIDTH_PX;
  snapshot.spikeColumns = [];
  for (let x = 0; x <= SPIKE_WIDTH_PX; x++) {
    const h = spikeHeightAtOffset(x);
    if (h <= 0) continue;
    snapshot.spikeColumns.push({ x: spikeLeft + x, top: 460 - h, bottom: 460 });
  }
  snapshot.overlapHeight = spikeOverlapHeight(player, frontObstacle);
  snapshot.requiredJump  = snapshot.overlapHeight;
  snapshot.spikeBehind   = spikeFullyBehindPlayer(player, frontObstacle);
  return snapshot;
}

// ── Contact detection ──────────────────────────────────────────────────────────

function spikeTouchesPlayer(player, obstacle) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], null);
  const geometry = getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
  return geometry.overlapColumns.length > 0;
}

function birdTouchesPlayer(player, obstacle, animState) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], animState);
  const geometry = getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
  return !!geometry.collisionBox;
}

function birdFullyBehindPlayer(player, obstacle, animState) {
  const snapshot  = buildDebugCollisionSnapshot(player, [obstacle], animState);
  const geometry  = getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
  const birdBox   = geometry.obstacleBoxes[0];
  const playerBounds = geometry.playerBounds;
  if (!birdBox || !playerBounds) return false;
  if (player.side === 'girl') return birdBox.left >= playerBounds.right;
  return birdBox.right <= playerBounds.left;
}

function boxIntersects(a, b) {
  if (!a || !b) return false;
  return a.right >= b.left && b.right >= a.left && a.bottom >= b.top && b.bottom >= a.top;
}

function labeledObstacleIntersects(geometry, targetBox, label) {
  if (!targetBox) return false;
  return geometry.obstacleBoxes.some(box => box.label === label && boxIntersects(box, targetBox));
}

function arrowWallCollisionGeometry(player, obstacle, animState) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], animState);
  return getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
}

function shieldBlocksArrowWall(player, obstacle, animState) {
  return !!arrowWallCollisionGeometry(player, obstacle, animState).shieldCollisionBox;
}

function arrowWallTouchesPlayer(player, obstacle, animState) {
  return !!arrowWallCollisionGeometry(player, obstacle, animState).collisionBox;
}

function goblinCollisionGeometry(player, obstacle, animState) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], animState);
  return getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
}

function swordHitsGoblin(player, obstacle, animState) {
  return !!goblinCollisionGeometry(player, obstacle, animState).swordCollisionBox;
}

function goblinTouchesPlayer(player, obstacle, animState) {
  return !!goblinCollisionGeometry(player, obstacle, animState).collisionBox;
}

export {
  playerBottomAtLocalX,
  playerVisibleBoundsX,
  playerIsCrouching,
  playerHurtboxForAnim,
  buildPlayerDebugColumns,
  spikeHeightAtOffset,
  projectSpikeLocalX,
  spikeOverlapHeight,
  spikeFullyBehindPlayer,
  contactActionForPlayer,
  buildDebugCollisionSnapshot,
  spikeTouchesPlayer,
  birdTouchesPlayer,
  birdFullyBehindPlayer,
  boxIntersects,
  labeledObstacleIntersects,
  arrowWallCollisionGeometry,
  shieldBlocksArrowWall,
  arrowWallTouchesPlayer,
  goblinCollisionGeometry,
  swordHitsGoblin,
  goblinTouchesPlayer,
};
