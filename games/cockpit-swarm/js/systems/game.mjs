import { H, STATE, TUNING } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import {
  advanceActiveRow,
  getActiveEnemies,
  hasLivingEnemies,
  makeFormation,
  shouldAdvanceActiveRow
} from "../entities/enemy.mjs";
import { makeStars } from "../entities/stars.mjs";
import { project, projectEnemyBullet, getPlayerShotWorldX } from "./projection.mjs";
import { spawnExplosion, spawnMissSpark } from "../entities/particles.mjs";
import { getStage, hasNextStage } from "./stages.mjs";
import { updateWaveBehavior } from "./wave-behaviors.mjs";

export function resetGame(game) {
  game.state = STATE.PLAYING;
  game.score = 0;
  game.combo = 0;
  game.shotsFired = 0;
  game.shotsHit = 0;
  game.enemyBullets = [];
  game.explosions = [];
  game.messageTimer = 0;
  game.hitFreeze = 0;
  game.shake = 0;

  game.wave.stageIndex = 0;
  game.wave.behaviorCooldown = 450;
  game.wave.pendingShots = [];
  game.wave.lastBehaviorId = null;
  game.wave.stageClearTimer = 0;

  game.player.x = 0;
  game.player.speed = 0;
  game.player.health = game.player.maxHealth;
  game.player.fireCooldown = 0;
  game.player.muzzleFlash = 0;
  game.player.hurtFlash = 0;

  loadStage(game, 0);
  game.stars = makeStars();
}

function loadStage(game, stageIndex) {
  const stage = getStage(stageIndex);

  game.state = STATE.PLAYING;
  game.messageTimer = 0;
  game.enemyBullets = [];
  game.explosions = [];
  game.wave.stageIndex = stageIndex;
  game.wave.behaviorCooldown = 650;
  game.wave.pendingShots = [];
  game.wave.lastBehaviorId = null;
  game.wave.stageClearTimer = 0;

  game.enemies = makeFormation(stage);
}

export function updateGame(game, input, dt, t) {
  if (input.isRestart() && game.state !== STATE.PLAYING) {
    resetGame(game);
    return;
  }

  if (game.hitFreeze > 0) {
    game.hitFreeze -= dt;
    return;
  }

  updatePlayer(game, input, dt);

  if (game.state === STATE.STAGE_CLEAR) {
    updateStageClear(game, dt);
    updateParticles(game, dt);
    return;
  }

  if (game.state !== STATE.PLAYING) {
    game.messageTimer += dt;
    updateParticles(game, dt);
    return;
  }

  updateEnemies(game, dt, t);
  updateWaveBehavior(game, dt);
  updateEnemyBullets(game, dt);
  updatePlayerFire(game, input);
  updateParticles(game, dt);
  checkRowAndEndState(game);
}

function updateStageClear(game, dt) {
  game.wave.stageClearTimer -= dt;

  if (game.wave.stageClearTimer > 0) return;

  if (hasNextStage(game.wave.stageIndex)) {
    loadStage(game, game.wave.stageIndex + 1);
    return;
  }

  game.state = STATE.CLEAR;
  game.messageTimer = 0;
}

function updatePlayer(game, input, dt) {
  const player = game.player;
  const left = input.isLeft();
  const right = input.isRight();

  if (left && !right) player.speed -= TUNING.playerAccel * (dt / 16.666);
  if (right && !left) player.speed += TUNING.playerAccel * (dt / 16.666);

  if (!left && !right) player.speed *= Math.pow(TUNING.playerFriction, dt / 16.666);
  else player.speed *= Math.pow(0.965, dt / 16.666);

  player.speed = clamp(player.speed, -TUNING.playerMaxSpeed, TUNING.playerMaxSpeed);
  player.x += player.speed * (dt / 16.666);
  player.x = clamp(player.x, -TUNING.playerMaxX, TUNING.playerMaxX);

  if ((player.x <= -TUNING.playerMaxX && player.speed < 0) || (player.x >= TUNING.playerMaxX && player.speed > 0)) {
    player.speed *= -0.16;
  }

  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.muzzleFlash = Math.max(0, player.muzzleFlash - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt);
  game.shake *= Math.pow(TUNING.cockpitShakeDecay, dt / 16.666);
}

function updateEnemies(game, dt, t) {
  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;

    enemy.y += (enemy.targetY - enemy.y) * Math.min(1, 0.085 * (dt / 16.666));
    enemy.z += (enemy.targetZ - enemy.z) * Math.min(1, 0.085 * (dt / 16.666));

    const driftAmount = enemy.active ? TUNING.enemyDriftAmount : TUNING.enemyDriftAmount * 0.28;
    const drift = Math.sin(t * TUNING.enemyDriftSpeed + enemy.driftPhase) * driftAmount;

    enemy.x = enemy.originX + drift;
    enemy.rot = Math.sin(t * 0.002 + enemy.driftPhase) * 0.08;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.telegraphFlash = Math.max(0, enemy.telegraphFlash - dt);
  }
}

function updateEnemyBullets(game, dt) {
  const step = dt / 16.666;

  for (const b of game.enemyBullets) {
    if (!b.alive) continue;

    b.age += dt;
    b.z -= b.speedZ * step;

    const p = projectEnemyBullet(b, game.player);

    if (b.z <= TUNING.enemyBulletHitDepth && !b.resolved) {
      b.resolved = true;

      if (p.laneDistance <= TUNING.enemyBulletLaneHitWindow) {
        damagePlayer(game);
      } else {
        spawnMissSpark(game, p.x, p.y);
      }

      b.alive = false;
    }
  }

  game.enemyBullets = game.enemyBullets.filter(b => b.alive);
}

function damagePlayer(game) {
  const player = game.player;

  player.health -= 1;
  player.hurtFlash = 260;
  game.shake = 10;
  game.hitFreeze = TUNING.hitFreezeMs;
  game.combo = 0;

  spawnExplosion(game, 640 + (Math.random() * 60 - 30), H * 0.72 + (Math.random() * 36 - 18), 1.2, "hit");

  if (player.health <= 0) {
    game.state = STATE.GAME_OVER;
    game.messageTimer = 0;
  }
}

function updatePlayerFire(game, input) {
  const player = game.player;

  // Galaga-style fire:
  // one shot per key/button press. Holding fire does not repeat shots.
  if (!input.consumeFirePress()) return;
  if (player.fireCooldown > 0) return;

  player.fireCooldown = TUNING.fireCooldownMs;
  player.muzzleFlash = 70;
  game.shotsFired++;

  const shotX = getPlayerShotWorldX(player);
  let best = null;
  let bestLaneDistance = Infinity;

  for (const enemy of getActiveEnemies(game.enemies)) {
    const dx = Math.abs(enemy.x - shotX);
    const hitX = TUNING.enemyBulletLaneHitWindow;

    if (dx <= hitX && dx < bestLaneDistance) {
      best = enemy;
      bestLaneDistance = dx;
    }
  }

  if (best) {
    best.hp -= 1;
    best.hitFlash = 120;
    game.shotsHit++;
    game.combo++;
    game.score += 100 + game.combo * 15;

    const p = project(best.x, best.y, best.z, player.x);
    spawnExplosion(game, p.x, p.y, 0.65, "enemyHit");

    if (best.hp <= 0) {
      best.alive = false;
      best.active = false;
      game.score += best.scoreValue + game.combo * 25;
      spawnExplosion(game, p.x, p.y, 1.05, "enemyKill");
    }
  } else {
    game.combo = Math.max(0, game.combo - 1);
  }
}

function updateParticles(game, dt) {
  for (const p of game.explosions) {
    p.life -= dt;
    p.x += p.vx * (dt / 16.666);
    p.y += p.vy * (dt / 16.666);
    p.vx *= Math.pow(0.96, dt / 16.666);
    p.vy *= Math.pow(0.96, dt / 16.666);
  }

  game.explosions = game.explosions.filter(p => p.life > 0);
}

function checkRowAndEndState(game) {
  if (!hasLivingEnemies(game.enemies)) {
    game.state = STATE.STAGE_CLEAR;
    game.messageTimer = 0;
    game.enemyBullets = [];
    game.wave.pendingShots = [];
    game.wave.stageClearTimer = TUNING.stageClearDelayMs;
    return;
  }

  if (shouldAdvanceActiveRow(game.enemies)) {
    game.enemyBullets = [];
    game.wave.pendingShots = [];
    advanceActiveRow(game.enemies);
  }
}
