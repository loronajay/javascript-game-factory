import { STATE, BOSS_TUNING, ARBITER_TUNING, ECLIPSIS_TUNING } from "../core/constants.mjs";
import { project } from "./projection.mjs";
import { spawnExplosion } from "../entities/particles.mjs";
import { makeBoss } from "../entities/boss.mjs";
import { sfxBossCharge, sfxEnemyDeath } from "./audio.mjs";
import { updateDreadmaw, tryDamageDreadmaw } from "./boss-dreadmaw.mjs";
import { updateArbiter, tryDamageArbiter } from "./boss-arbiter.mjs";
import { updateEclipsis, tryDamageEclipsis } from "./boss-eclipsis.mjs";

const ARM_WORLD_Y = 55;

// ─── Encounter lifecycle ──────────────────────────────────────────────────────

export function startBossEncounter(game, number = 1) {
  game.boss = makeBoss(number);
  game.state = STATE.BOSS;

  game.enemies = [];
  game.enemyBullets = [];
  game.wave.pendingShots = [];
  game.powerups.activePickups = [];

  game.messageTimer = 0;
  game.shake = 0;
  game.player.hurtFlash = 0;
  game.player.muzzleFlash = 0;
  game.player.tetherTimer = 0;
  game.player.tetherTargetX = 0;

  sfxBossCharge();
}

// ─── Main boss update (dispatcher) ───────────────────────────────────────────

export function updateBoss(game, input, dt, t, damagePlayer, onDefeated) {
  const boss = game.boss;
  if (!boss) return;

  if (boss.number === 3) { updateEclipsis(game, input, dt, t, damagePlayer, onDefeated); return; }
  if (boss.number === 2) { updateArbiter(game, input, dt, t, damagePlayer, onDefeated); return; }
  updateDreadmaw(game, input, dt, t, damagePlayer, onDefeated);
}

// ─── Player shot routing (dispatcher) ────────────────────────────────────────

export function tryDamageBossInShotLane(game) {
  const boss = game.boss;
  if (!boss || boss.sub !== "fighting") return false;

  if (boss.number === 3) return tryDamageEclipsis(game);
  if (boss.number === 2) return tryDamageArbiter(game);
  return tryDamageDreadmaw(game);
}

// ─── Shared defeat helpers (used by all three sub-boss files) ─────────────────

export function finishDefeat(game, input, onDefeated) {
  const bossNumber = game.boss.number;
  game.boss = null;
  game.menu.selectedButton = 0;
  game.messageTimer = 0;
  game.shake = 0;
  game.player.hurtFlash = 0;
  game.player.muzzleFlash = 0;
  game.player.tetherTimer = 0;
  game.player.tetherTargetX = 0;
  sfxEnemyDeath();
  if (input) input.clearMenuPresses();

  if (onDefeated) {
    onDefeated(bossNumber);
  } else {
    game.state = STATE.CLEAR;
  }
}

export function spawnBlast(game) {
  const n = game.boss?.number;
  const layout = n === 3 ? getEclipsisLayout(game) : n === 2 ? getArbiterLayout(game) : getBossLayout(game);
  const ox = (Math.random() * 2 - 1) * layout.halfW;
  const oy = (Math.random() * 2 - 1) * layout.halfH;
  spawnExplosion(game, layout.cx + ox, layout.cy + oy, 1.0 + Math.random() * 0.7, "enemyKill");
}

// ─── Shared geometry (single source for update + render) ──────────────────────

export function getBossLayout(game) {
  const px = game.player.x;
  const bob = game.boss ? game.boss.bob : 0;
  const p = project(0, BOSS_TUNING.bodyY, BOSS_TUNING.bodyZ, px);

  const cx = p.x;
  const cy = p.y + bob;
  const halfW = 300;
  const halfH = 132;

  return {
    cx,
    cy,
    halfW,
    halfH,
    mouthX: cx,
    mouthY: cy + halfH * 0.46,
    mouthW: halfW * 0.5,
    shoulderL: { x: cx - halfW * 0.84, y: cy + halfH * 0.28 },
    shoulderR: { x: cx + halfW * 0.84, y: cy + halfH * 0.28 }
  };
}

export function getHandProjection(arm, playerX) {
  return project(arm.laneX, ARM_WORLD_Y, arm.z, playerX);
}

export function getArbiterLayout(game) {
  const px = game.player.x;
  const bob = game.boss ? game.boss.bob : 0;
  const p = project(0, ARBITER_TUNING.bodyY, ARBITER_TUNING.bodyZ, px);
  const cx = p.x;
  const cy = p.y + bob;
  const hw = 360;
  const hh = 128;
  return {
    cx, cy,
    halfW: hw,
    halfH: hh,
    coreX: cx,
    coreY: cy + hh * 0.08,
    cannonL: { x: cx - hw * 1.08, y: cy + hh * 0.42 },
    cannonR: { x: cx + hw * 1.08, y: cy + hh * 0.42 }
  };
}

export function getEclipsisLayout(game) {
  const px = game.player.x;
  const bob = game.boss ? game.boss.bob : 0;
  const crack = game.boss ? game.boss.shellCrack : 0;
  const sizeScale = 1 + crack * 0.2;
  const p = project(0, ECLIPSIS_TUNING.bodyY, ECLIPSIS_TUNING.bodyZ, px);
  const cx = p.x;
  const cy = p.y + bob;
  const hw = 340 * sizeScale;
  const hh = 155 * sizeScale;
  return {
    cx, cy,
    halfW: hw,
    halfH: hh,
    eyeX: cx + px * -0.04,
    eyeY: cy - hh * 0.1
  };
}
