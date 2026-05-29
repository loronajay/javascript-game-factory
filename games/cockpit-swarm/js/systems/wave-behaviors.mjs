import { TUNING } from "../core/constants.mjs";
import { rand } from "../core/math.mjs";
import {
  getActiveEnemies,
  getImmediateNextRowEnemies,
  spawnEnemyBullet
} from "../entities/enemy.mjs";
import { getStage } from "./stages.mjs";

const BEHAVIORS = {
  randomActiveFire: {
    id: "randomActiveFire",
    minShooters: 1,
    telegraphMs: 120,
    cooldownMs: [720, 1250],
    rowSource: "active",
    pattern: "randomSingle"
  },

  threeLaneSync: {
    id: "threeLaneSync",
    minShooters: 3,
    telegraphMs: 520,
    cooldownMs: [1450, 2250],
    rowSource: "active",
    pattern: "randomNLanes",
    laneCount: 3
  },

  allButOneLane: {
    id: "allButOneLane",
    minShooters: 4,
    telegraphMs: 720,
    cooldownMs: [2100, 3200],
    rowSource: "active",
    pattern: "allButOne"
  },

  nextRowSupportFire: {
    id: "nextRowSupportFire",
    minShooters: 1,
    telegraphMs: 580,
    cooldownMs: [1650, 2600],
    rowSource: "next",
    pattern: "randomSingle"
  }
};

export function updateWaveBehavior(game, dt) {
  resolvePendingShots(game, dt);

  if (game.enemyBullets.length >= TUNING.maxEnemyBullets) return;

  game.wave.behaviorCooldown -= dt;
  if (game.wave.behaviorCooldown > 0) return;

  const stage = getStage(game.wave.stageIndex);
  const behavior = chooseValidBehavior(game, stage);

  if (!behavior) {
    game.wave.behaviorCooldown = rand(TUNING.waveThinkMinMs, TUNING.waveThinkMaxMs);
    return;
  }

  const shooters = chooseShootersForBehavior(game, stage, behavior);

  if (shooters.length < behavior.minShooters) {
    game.wave.behaviorCooldown = rand(TUNING.waveThinkMinMs, TUNING.waveThinkMaxMs);
    return;
  }

  queueTelegraphedShots(game, shooters, behavior);
  game.wave.lastBehaviorId = behavior.id;
  game.wave.behaviorCooldown = rand(behavior.cooldownMs[0], behavior.cooldownMs[1]);
}

function queueTelegraphedShots(game, shooters, behavior) {
  const validShooters = shooters.filter(enemy => enemy.alive && enemy.canFire);

  if (validShooters.length < behavior.minShooters) return;

  for (const enemy of validShooters) {
    enemy.telegraphFlash = Math.max(enemy.telegraphFlash, behavior.telegraphMs);
  }

  game.wave.pendingShots.push({
    behaviorId: behavior.id,
    timer: behavior.telegraphMs,
    shooters: validShooters,
    resolved: false
  });
}

function resolvePendingShots(game, dt) {
  for (const pending of game.wave.pendingShots) {
    pending.timer -= dt;

    for (const enemy of pending.shooters) {
      if (!enemy.alive) continue;
      enemy.telegraphFlash = Math.max(enemy.telegraphFlash, pending.timer);
    }

    if (pending.timer <= 0 && !pending.resolved) {
      pending.resolved = true;

      for (const enemy of pending.shooters) {
        if (!enemy.alive || !enemy.canFire) continue;
        if (game.enemyBullets.length >= TUNING.maxEnemyBullets) break;

        game.enemyBullets.push(spawnEnemyBullet(enemy, {
          behaviorId: pending.behaviorId
        }));
      }
    }
  }

  game.wave.pendingShots = game.wave.pendingShots.filter(p => !p.resolved);
}

function chooseValidBehavior(game, stage) {
  if (!stage) return null;

  const candidates = [];

  for (const behaviorId of stage.allowedBehaviors) {
    const behavior = BEHAVIORS[behaviorId];
    if (!behavior) continue;

    const shooters = getEligibleShooters(game, stage, behavior);
    if (shooters.length < behavior.minShooters) continue;

    const weight = stage.behaviorWeights?.[behaviorId] ?? 1;
    if (weight <= 0) continue;

    candidates.push({ behavior, weight });
  }

  if (candidates.length === 0) return null;

  const total = candidates.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of candidates) {
    roll -= item.weight;
    if (roll <= 0) return item.behavior;
  }

  return candidates[candidates.length - 1].behavior;
}

function getEligibleShooters(game, stage, behavior) {
  if (behavior.rowSource === "next") {
    if (!stage.allowNextRowSupport) return [];

    const activeCount = getActiveEnemies(game.enemies).length;
    const threshold = stage.nextRowSupportStartsWhenActiveCountAtOrBelow ?? 2;

    if (activeCount > threshold) return [];

    return getImmediateNextRowEnemies(game.enemies).filter(enemy => enemy.canFire);
  }

  return getActiveEnemies(game.enemies).filter(enemy => enemy.canFire);
}

function chooseShootersForBehavior(game, stage, behavior) {
  const eligible = getEligibleShooters(game, stage, behavior)
    .slice()
    .sort((a, b) => a.laneIndex - b.laneIndex);

  if (eligible.length < behavior.minShooters) return [];

  if (behavior.pattern === "randomSingle") {
    return [eligible[Math.floor(Math.random() * eligible.length)]];
  }

  if (behavior.pattern === "randomNLanes") {
    return pickRandom(eligible, Math.min(behavior.laneCount, eligible.length));
  }

  if (behavior.pattern === "allButOne") {
    return chooseAllButOneLane(eligible, behavior.minShooters);
  }

  return [];
}

function chooseAllButOneLane(eligible, minShooters) {
  const livingLaneIndexes = eligible.map(enemy => enemy.laneIndex);

  if (livingLaneIndexes.length < minShooters) return [];

  const safeLaneIndex = livingLaneIndexes[Math.floor(Math.random() * livingLaneIndexes.length)];
  const shooters = eligible.filter(enemy => enemy.laneIndex !== safeLaneIndex);

  if (shooters.length < minShooters) {
    return pickRandom(eligible, minShooters);
  }

  return shooters;
}

function pickRandom(items, count) {
  const copy = items.slice();

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy.slice(0, count);
}
