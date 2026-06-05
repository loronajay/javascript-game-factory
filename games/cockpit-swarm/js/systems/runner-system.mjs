import { TUNING } from "../core/constants.mjs";
import { rand } from "../core/math.mjs";
import { project } from "./projection.mjs";
import { spawnExplosion } from "../entities/particles.mjs";
import { makeRunner, EXIT_X } from "../entities/runner.mjs";
import { sfxPowerup, sfxEnemyShot, sfxRunnerStart, sfxRunnerStop } from "./audio.mjs";

const SPAWN_MIN  = 25000;
const SPAWN_MAX  = 45000;
const FIRE_MIN   = 1800;
const FIRE_MAX   = 3200;

export function resetRunners(game) {
  sfxRunnerStop();
  game.runner.active = null;
  game.runner.spawnCooldownMs = 30000;
  game.runner.killMessageTimer = 0;
  game.runner.killMessage = "";
}

export function clearActiveRunner(game) {
  if (!game.runner.active) return;
  sfxRunnerStop();
  game.runner.active = null;
}

export function updateRunners(game, dt) {
  const r = game.runner;

  if (r.killMessageTimer > 0) r.killMessageTimer -= dt;

  if (!r.active) {
    r.spawnCooldownMs -= dt;
    if (r.spawnCooldownMs <= 0) {
      const type = Math.random() < 0.55 ? "jackpot" : "mender";
      r.active = makeRunner(type);
      sfxRunnerStart();
      r.spawnCooldownMs = rand(SPAWN_MIN, SPAWN_MAX);
    }
    return;
  }

  const runner = r.active;

  runner.x += runner.vx * (dt / 16.666);
  runner.pulse += dt;
  runner.hitFlash = Math.max(0, runner.hitFlash - dt);
  runner.fireTimer -= dt;

  if (runner.fireTimer <= 0) {
    runner.fireTimer = rand(FIRE_MIN, FIRE_MAX);
    if (game.enemyBullets.length < TUNING.maxEnemyBullets) {
      sfxEnemyShot();
      game.enemyBullets.push({
        x: runner.x,
        laneIndex: -1,
        sourceRowIndex: -1,
        behaviorId: "runner",
        startY: runner.y,
        z: runner.z,
        startZ: runner.z,
        speedZ: TUNING.enemyBulletSpeedZ * rand(0.88, 1.05),
        wobble: rand(0, Math.PI * 2),
        alive: true,
        age: 0,
        resolved: false,
        isRunnerBullet: true
      });
    }
  }

  if (runner.x > EXIT_X || runner.x < -EXIT_X) {
    r.active = null;
    sfxRunnerStop();
  }
}

export function tryHitRunner(game) {
  const runner = game.runner.active;
  if (!runner) return false;

  if (Math.abs(runner.x - game.player.x) > TUNING.enemyBulletLaneHitWindow) return false;

  runner.hp--;
  runner.hitFlash = 120;
  game.shotsHit++;
  game.combo++;
  game.score += 100 + game.combo * 15;

  const p = project(runner.x, runner.y, runner.z, game.player.x);
  spawnExplosion(game, p.x, p.y, 0.65, "enemyHit");

  if (runner.hp <= 0) {
    game.runner.active = null;
    sfxRunnerStop();
    sfxPowerup();
    game.score += runner.scoreValue + game.combo * 25;
    spawnExplosion(game, p.x, p.y, 1.4, "powerup");
    applyRunnerKill(game, runner);
  }

  return true;
}

function applyRunnerKill(game, runner) {
  if (runner.type === "jackpot") {
    const fx = game.powerups.effects;
    fx.holdToShootMs     = Math.max(fx.holdToShootMs, 15000);
    fx.speedBoostMs      = Math.max(fx.speedBoostMs,  15000);
    fx.splashShotCharges += 20;
    game.runner.killMessage = "JACKPOT!";
  } else {
    const wasAlreadyFull = game.player.health >= game.player.maxHealth;
    game.player.health = game.player.maxHealth;
    if (wasAlreadyFull) game.score += 1500;
    game.runner.killMessage = "REPAIRED!";
  }
  game.runner.killMessageTimer = 2200;
}
