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

// Every on-board tile the attacker could strike, independent of whether a target
// stands there — this is the "attack radius" overlay. It is presentation only:
// the reducer still re-validates the actual chosen target. Ranger tiles behind an
// intervening piece are dropped so the shown radius reflects real line of sight.
export function getAttackRangeTiles(state, attacker) {
  const tiles = new Set();
  const range = UNIT_TYPES[attacker.type].attackRange;
  const max = state.size - 1;

  for (let dx = -range; dx <= range; dx += 1) {
    for (let dy = -range; dy <= range; dy += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const x = attacker.x + dx;
      const y = attacker.y + dy;
      if (x < 0 || y < 0 || x > max || y > max) {
        continue;
      }

      if (
        attacker.type === "ranger" &&
        isRangerShotBlocked(state, attacker, { x, y })
      ) {
        continue;
      }

      tiles.add(tileKey(x, y));
    }
  }

  return tiles;
}

// Every on-board tile within the medic's heal range — the "heal radius" overlay.
// Presentation only, like getAttackRangeTiles. Heals are never blocked by pieces,
// so this is a straight square of tiles around the medic, clipped to the board.
export function getHealRangeTiles(state, medic) {
  const tiles = new Set();

  if (medic.type !== "medic") {
    return tiles;
  }

  const max = state.size - 1;

  for (let dx = -MEDIC_HEAL_RANGE; dx <= MEDIC_HEAL_RANGE; dx += 1) {
    for (let dy = -MEDIC_HEAL_RANGE; dy <= MEDIC_HEAL_RANGE; dy += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const x = medic.x + dx;
      const y = medic.y + dy;
      if (x < 0 || y < 0 || x > max || y > max) {
        continue;
      }

      tiles.add(tileKey(x, y));
    }
  }

  return tiles;
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

// Every tile any living enemy of `forPlayer` could strike from where it stands
// right now — the union of their attack radii (ranger line-of-sight honored).
// This is the "danger" overlay: presentation only, it shows the player which
// tiles are already under threat so positioning reads at a glance. It is the
// immediate threat (current positions), not a move-plus-reach projection, to
// keep the overlay legible rather than blanketing the board.
export function getThreatTiles(state, forPlayer) {
  const threatened = new Set();

  for (const enemy of livingUnits(state)) {
    if (sameTeam(state, enemy.player, forPlayer)) {
      continue;
    }
    for (const key of getAttackRangeTiles(state, enemy)) {
      threatened.add(key);
    }
  }

  return threatened;
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
