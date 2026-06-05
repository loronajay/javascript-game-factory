import { rand } from "../core/math.mjs";

const EXIT_X       = 750;
const RUNNER_Z     = 0.92;
const RUNNER_Y     = -62;
const RUNNER_SPEED = 8;
const FIRE_MIN     = 1800;
const FIRE_MAX     = 3200;

export const RUNNER_DEFS = {
  jackpot: { hp: 10, color: "#ff2244", label: "JACKPOT", scoreValue: 5000 },
  mender:  { hp: 10, color: "#44ff88", label: "MENDER",  scoreValue: 3500 }
};

export { EXIT_X };

export function makeRunner(type) {
  const def = RUNNER_DEFS[type] ?? RUNNER_DEFS.jackpot;
  const goRight = Math.random() < 0.5;
  return {
    type,
    x: goRight ? -EXIT_X : EXIT_X,
    y: RUNNER_Y,
    z: RUNNER_Z,
    vx: goRight ? RUNNER_SPEED : -RUNNER_SPEED,
    hp: def.hp,
    maxHp: def.hp,
    color: def.color,
    label: def.label,
    scoreValue: def.scoreValue,
    hitFlash: 0,
    pulse: 0,
    fireTimer: rand(FIRE_MIN, FIRE_MAX)
  };
}
