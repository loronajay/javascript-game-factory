import {
  MEDIC_HEAL_RANGE,
  UNIT_TYPES
} from "../config.js";
import {
  chebyshevDistance,
  tileKey,
  traceGridLine
} from "../geometry/isometric.js";
import {
  livingUnits,
  sameTeam,
  unitAt
} from "../state/gameState.js";

export function getBaseDamage(attacker, target) {
  switch (attacker.type) {
    case "warrior":
      return target.type === "tank" ? 2 : 3;
    case "tank":
      return 2;
    case "ranger":
      return target.type === "ranger" ? 3 : 2;
    case "medic":
      return 1;
    default:
      throw new Error(`Unknown unit type: ${attacker.type}`);
  }
}

export function isRangerShotBlocked(state, attacker, target) {
  const cells = traceGridLine(attacker.x, attacker.y, target.x, target.y);

  return cells
    .slice(1, -1)
    .some((cell) => Boolean(unitAt(state, cell.x, cell.y)));
}

export function getLegalAttackTargets(state, attacker) {
  const legal = new Set();
  const range = UNIT_TYPES[attacker.type].attackRange;

  for (const target of livingUnits(state)) {
    if (sameTeam(state, attacker, target)) {
      continue;
    }

    if (chebyshevDistance(attacker, target) > range) {
      continue;
    }

    if (
      attacker.type === "ranger" &&
      isRangerShotBlocked(state, attacker, target)
    ) {
      continue;
    }

    legal.add(tileKey(target.x, target.y));
  }

  return legal;
}

export function getLegalHealTargets(state, medic) {
  const legal = new Set();

  if (medic.type !== "medic") {
    return legal;
  }

  // Heals reach any teammate (including allies owned by a different player slot
  // in team play) and the medic itself, never an enemy.
  for (const target of livingUnits(state)) {
    if (!sameTeam(state, medic, target)) {
      continue;
    }
    if (target.hp >= target.maxHp) {
      continue;
    }

    if (chebyshevDistance(medic, target) <= MEDIC_HEAL_RANGE) {
      legal.add(tileKey(target.x, target.y));
    }
  }

  return legal;
}

export function rollD6(random = Math.random) {
  return 1 + Math.floor(random() * 6);
}

export function resolveAttackRoll(attacker, target, roll) {
  if (roll === 1) {
    return {
      hit: false,
      critical: false,
      damage: 0
    };
  }

  const critical = roll === 6;
  const rawDamage = getBaseDamage(attacker, target) + (critical ? 1 : 0);
  const damage = Math.max(0, rawDamage - (target.defending ? 1 : 0));

  return {
    hit: true,
    critical,
    damage
  };
}

export function resolveHealRoll(target, roll) {
  if (roll === 1) {
    return {
      hit: false,
      critical: false,
      healing: 0
    };
  }

  const critical = roll === 6;
  const requestedHealing = critical ? 4 : 3;
  const healing = Math.min(requestedHealing, target.maxHp - target.hp);

  return {
    hit: true,
    critical,
    healing
  };
}
