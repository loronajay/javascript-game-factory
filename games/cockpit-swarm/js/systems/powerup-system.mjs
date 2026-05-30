import { TUNING } from "../core/constants.mjs";
import { makePowerup, getPowerupDefinition, isPowerupInShotLane } from "../entities/powerups.mjs";
import { spawnExplosion } from "../entities/particles.mjs";
import { sfxPowerup } from "./audio.mjs";

const DEFAULT_RULES = {
  enabled: true,
  maxActivePickups: 1,
  spawnOnKillChance: 0.12,
  allowedTypes: ["holdToShoot", "splashShot", "speedBoost", "healthPack"],
  weights: {
    holdToShoot: 25,
    splashShot: 25,
    speedBoost: 25,
    healthPack: 25
  }
};

export function resetPowerups(game) {
  game.powerups.activePickups = [];
  game.powerups.effects.holdToShootMs = 0;
  game.powerups.effects.speedBoostMs = 0;
  game.powerups.effects.splashShotCharges = 0;
  game.powerups.lastPickupId = null;
}

export function updatePowerups(game, dt) {
  const effects = game.powerups.effects;

  effects.holdToShootMs = Math.max(0, effects.holdToShootMs - dt);
  effects.speedBoostMs = Math.max(0, effects.speedBoostMs - dt);

  for (const pickup of game.powerups.activePickups) {
    if (!pickup.active) continue;

    pickup.ageMs += dt;
    pickup.pulse += dt;

    if (pickup.ageMs >= pickup.lifetimeMs) {
      pickup.active = false;
    }
  }

  game.powerups.activePickups = game.powerups.activePickups.filter(p => p.active);
}

export function maybeSpawnPowerupFromEnemyKill(game, enemy, stage) {
  const rules = getPowerupRules(stage);
  if (!rules.enabled) return;
  if (game.powerups.activePickups.length >= rules.maxActivePickups) return;
  if (Math.random() > rules.spawnOnKillChance) return;

  const type = choosePowerupType(game, rules);
  if (!type) return;

  const pickup = makePowerup({
    type,
    laneIndex: enemy.laneIndex,
    x: enemy.originX,
    y: enemy.y,
    z: enemy.z
  });

  game.powerups.activePickups.push(pickup);
}

export function tryActivatePowerupInShotLane(game) {
  // Power-ups are deliberately lower priority than active enemies.
  // Call this only after the shot has failed to hit an enemy.
  const pickup = game.powerups.activePickups.find(p => isPowerupInShotLane(p, game.player));
  if (!pickup) return false;

  pickup.active = false;
  sfxPowerup();
  applyPowerup(game, pickup.type);
  game.powerups.lastPickupId = pickup.type;

  const screenX = 640;
  const screenY = 360;
  spawnExplosion(game, screenX, screenY, 0.65, "powerup");

  game.score += 150;
  return true;
}

export function applySplashShotDamage(game, targetEnemy, damageEnemyFn) {
  const effects = game.powerups.effects;
  if (effects.splashShotCharges <= 0) return false;

  effects.splashShotCharges--;

  const affectedLaneIndexes = new Set([
    targetEnemy.laneIndex - 1,
    targetEnemy.laneIndex,
    targetEnemy.laneIndex + 1
  ]);

  for (const enemy of game.enemies) {
    if (!enemy.alive || !enemy.active) continue;
    if (!affectedLaneIndexes.has(enemy.laneIndex)) continue;
    if (enemy === targetEnemy) continue;

    damageEnemyFn(enemy, {
      scoreMultiplier: 0.65,
      isSplash: true
    });
  }

  return true;
}

export function getSpeedMultiplier(game) {
  return game.powerups.effects.speedBoostMs > 0 ? 1.45 : 1;
}

export function canHoldToShoot(game) {
  return game.powerups.effects.holdToShootMs > 0;
}

function applyPowerup(game, type) {
  const def = getPowerupDefinition(type);

  if (type === "holdToShoot") {
    game.powerups.effects.holdToShootMs = Math.max(
      game.powerups.effects.holdToShootMs,
      def.durationMs
    );
    return;
  }

  if (type === "speedBoost") {
    game.powerups.effects.speedBoostMs = Math.max(
      game.powerups.effects.speedBoostMs,
      def.durationMs
    );
    return;
  }

  if (type === "splashShot") {
    game.powerups.effects.splashShotCharges += def.charges;
    return;
  }

  if (type === "healthPack") {
    if (game.player.health < game.player.maxHealth) {
      game.player.health = Math.min(game.player.maxHealth, game.player.health + def.heal);
    } else {
      game.score += 500;
    }
  }
}

function getPowerupRules(stage) {
  return {
    ...DEFAULT_RULES,
    ...(stage?.powerupRules ?? {}),
    weights: {
      ...DEFAULT_RULES.weights,
      ...(stage?.powerupRules?.weights ?? {})
    }
  };
}

function choosePowerupType(game, rules) {
  const allowed = rules.allowedTypes ?? DEFAULT_RULES.allowedTypes;
  const weighted = [];

  for (const type of allowed) {
    if (type === "healthPack" && game.player.health >= game.player.maxHealth) {
      continue;
    }

    const weight = rules.weights?.[type] ?? 1;
    if (weight > 0) weighted.push({ type, weight });
  }

  if (weighted.length === 0) return null;

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.type;
  }

  return weighted[weighted.length - 1].type;
}
