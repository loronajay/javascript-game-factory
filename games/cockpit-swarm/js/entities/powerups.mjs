import { TUNING } from "../core/constants.mjs";

export const POWERUP_TYPES = {
  holdToShoot: {
    id: "holdToShoot",
    label: "RAPID",
    durationMs: 6500,
    color: "#ffd84d",
    shape: "ammo"
  },

  splashShot: {
    id: "splashShot",
    label: "SPLASH",
    charges: 3,
    color: "#4db7ff",
    shape: "triple"
  },

  speedBoost: {
    id: "speedBoost",
    label: "BOOST",
    durationMs: 5500,
    color: "#78ff9d",
    shape: "chevron"
  },

  healthPack: {
    id: "healthPack",
    label: "HULL",
    heal: 1,
    color: "#eafff1",
    shape: "cross"
  }
};

export function makePowerup({ type, laneIndex, x, y = -46, z = 1.08 }) {
  const def = POWERUP_TYPES[type] ?? POWERUP_TYPES.holdToShoot;

  return {
    id: `${type}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type,
    label: def.label,
    shape: def.shape,
    color: def.color,

    laneIndex,
    x,
    y,
    z,

    active: true,
    ageMs: 0,
    lifetimeMs: 7000,
    pulse: 0
  };
}

export function getPowerupDefinition(type) {
  return POWERUP_TYPES[type] ?? POWERUP_TYPES.holdToShoot;
}

export function isPowerupInShotLane(powerup, player) {
  return powerup.active && Math.abs(powerup.x - player.x) <= TUNING.enemyBulletLaneHitWindow;
}
