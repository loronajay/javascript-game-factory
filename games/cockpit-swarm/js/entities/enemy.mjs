import { LANES, TUNING } from "../core/constants.mjs";
import { rand } from "../core/math.mjs";

export const ACTIVE_ROW_Y = -62;
export const ACTIVE_ROW_Z = 1.12;

const WAITING_ROWS = [
  { y: -62,  z: 1.12 },
  { y: -105, z: 1.24 },
  { y: -145, z: 1.36 },
  { y: -182, z: 1.48 },
  { y: -216, z: 1.60 }
];

export const ENEMY_TYPES = {
  scout: {
    hp: 1,
    canFire: true,
    scoreValue: 300,
    color: "#1ef0ff",
    shape: "dart",
    sizeScale: 0.9
  },

  grunt: {
    hp: 2,
    canFire: true,
    scoreValue: 425,
    color: "#1ef0ff",
    shape: "fighter",
    sizeScale: 1.0
  },

  guard: {
    hp: 3,
    canFire: true,
    scoreValue: 650,
    color: "#78ff9d",
    shape: "shield",
    sizeScale: 1.08
  },

  jammer: {
    hp: 2,
    canFire: true,
    scoreValue: 600,
    color: "#b66cff",
    shape: "orb",
    sizeScale: 0.98
  },

  bruiser: {
    hp: 5,
    canFire: true,
    scoreValue: 950,
    color: "#ffb347",
    shape: "wide",
    sizeScale: 1.18
  },

  carrier: {
    hp: 7,
    canFire: true,
    scoreValue: 1350,
    color: "#ff5f7e",
    shape: "carrier",
    sizeScale: 1.28
  },

  // Act II enemy types ──────────────────────────────────────────────────────

  // Armored hull — does not fire; soaks shots while active-row teammates shoot.
  vanguard: {
    hp: 6,
    canFire: false,
    scoreValue: 850,
    color: "#d4b800",
    shape: "wide",
    sizeScale: 1.22
  },

  // Apex threat — maximum health, fires through all behaviors.
  titan: {
    hp: 9,
    canFire: true,
    scoreValue: 2000,
    color: "#ff1133",
    shape: "carrier",
    sizeScale: 1.40
  }
};

export function makeEnemy(x, y, z, phase, rowIndex = 0, laneIndex = 0, type = "grunt") {
  const def = ENEMY_TYPES[type] ?? ENEMY_TYPES.grunt;

  return {
    originX: x,
    targetOriginX: x,

    x,
    y,
    z,
    targetY: y,
    targetZ: z,

    rowIndex,
    laneIndex,
    type,
    shape: def.shape,
    color: def.color,
    sizeScale: def.sizeScale ?? 1,
    canFire: def.canFire,
    scoreValue: def.scoreValue,
    active: rowIndex === 0,

    hp: def.hp,
    maxHp: def.hp,
    alive: true,

    driftPhase: phase,
    fireTimer: rand(TUNING.enemyFireMinMs, TUNING.enemyFireMaxMs),
    hitFlash: 0,
    telegraphFlash: 0,
    rot: 0
  };
}

export function makeFormation(stage) {
  const enemies = [];
  const enemyRows = stage.enemyRows ?? [];

  for (let row = 0; row < WAITING_ROWS.length; row++) {
    const rowConfig = enemyRows[row] ?? {};
    const rowTypes = rowConfig.types ?? ["grunt", "grunt", "grunt", "grunt", "grunt"];

    for (let lane = 0; lane < LANES.length; lane++) {
      const x = LANES[lane];
      const { y, z } = WAITING_ROWS[row];
      const phase = row * 1.35 + lane * 0.9;
      const type = rowTypes[lane] ?? rowConfig.type ?? "grunt";

      enemies.push(makeEnemy(x, y, z, phase, row, lane, type));
    }
  }

  return enemies;
}

export function makeFiveEnemyLineup(stage = {}) {
  return makeFormation(stage);
}

export function getActiveEnemies(enemies) {
  return enemies.filter(enemy => enemy.alive && enemy.active);
}

export function getLivingEnemiesInRow(enemies, rowIndex) {
  return enemies.filter(enemy => enemy.alive && enemy.rowIndex === rowIndex);
}

export function getCurrentActiveRowIndex(enemies) {
  const active = enemies.find(enemy => enemy.alive && enemy.active);
  return active ? active.rowIndex : null;
}

export function getImmediateNextRowEnemies(enemies) {
  const activeRow = getCurrentActiveRowIndex(enemies);
  if (activeRow === null) return [];

  return enemies.filter(enemy =>
    enemy.alive &&
    enemy.rowIndex === activeRow + 1
  );
}

export function hasLivingEnemies(enemies) {
  return enemies.some(enemy => enemy.alive);
}

export function shouldAdvanceActiveRow(enemies) {
  return hasLivingEnemies(enemies) && getActiveEnemies(enemies).length === 0;
}

export function advanceActiveRow(enemies) {
  const livingRows = [...new Set(
    enemies
      .filter(enemy => enemy.alive)
      .map(enemy => enemy.rowIndex)
  )].sort((a, b) => a - b);

  if (livingRows.length === 0) return false;

  const nextActiveRow = livingRows[0];

  for (const enemy of enemies) {
    enemy.active = enemy.alive && enemy.rowIndex === nextActiveRow;

    if (!enemy.alive) continue;

    const displayRow = enemy.rowIndex - nextActiveRow;
    const slot = WAITING_ROWS[Math.max(0, Math.min(WAITING_ROWS.length - 1, displayRow))];

    enemy.targetY = slot.y;
    enemy.targetZ = slot.z;

    if (enemy.active) {
      enemy.targetY = ACTIVE_ROW_Y;
      enemy.targetZ = ACTIVE_ROW_Z;
      enemy.fireTimer = rand(TUNING.enemyFireMinMs * 0.75, TUNING.enemyFireMaxMs * 1.1);
    }
  }

  return true;
}

export function spawnEnemyBullet(enemy, options = {}) {
  return {
    x: enemy.x,
    laneIndex: enemy.laneIndex,
    sourceRowIndex: enemy.rowIndex,
    behaviorId: options.behaviorId ?? "unknown",
    startY: enemy.y,
    z: enemy.z,
    startZ: enemy.z,
    speedZ: (options.speedZ ?? TUNING.enemyBulletSpeedZ) * rand(0.94, 1.08),
    wobble: rand(0, Math.PI * 2),
    alive: true,
    age: 0,
    resolved: false
  };
}
