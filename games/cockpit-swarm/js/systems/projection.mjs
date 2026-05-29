import { CX, HORIZON_Y, RETICLE_Y, TUNING } from "../core/constants.mjs";
import { clamp, lerp } from "../core/math.mjs";

export function project(worldX, worldY, z, playerX) {
  const safeZ = Math.max(0.12, z);
  const depthScale = 1 / safeZ;

  return {
    x: CX + (worldX - playerX) * depthScale,
    y: HORIZON_Y + worldY * depthScale,
    s: depthScale
  };
}

export function getPlayerShotWorldX(player) {
  return player.x;
}

export function getLaneDistanceToPlayer(worldX, player) {
  return Math.abs(worldX - player.x);
}

export function projectEnemyBullet(b, player) {
  const approach = clamp(
    (b.startZ - b.z) / Math.max(0.001, b.startZ - TUNING.enemyBulletHitDepth),
    0,
    1
  );

  const laneDistance = getLaneDistanceToPlayer(b.x, player);
  const laneAlignment = clamp(1 - laneDistance / TUNING.enemyBulletLaneHitWindow, 0, 1);

  const converge = approach * approach * TUNING.enemyBulletVisualConverge * laneAlignment;
  const laneOffsetScreen = (b.x - player.x) / Math.max(0.12, b.z);
  const visualX = lerp(CX + laneOffsetScreen, CX, converge);

  const enemyScreenY = HORIZON_Y + b.startY / Math.max(0.12, b.z);
  const visualY = lerp(enemyScreenY, RETICLE_Y, approach * approach);
  const visualScale = 1 / Math.max(0.12, b.z);

  return {
    x: visualX,
    y: visualY,
    s: visualScale,
    approach,
    laneDistance,
    laneAlignment
  };
}
