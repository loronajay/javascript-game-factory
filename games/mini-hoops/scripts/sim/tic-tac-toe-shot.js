// Direct floor Tic-Tac-Toe aiming. There is deliberately no selected-cell
// state: pull angle chooses the horizontal lane, pull strength chooses depth,
// and bin physics decides which real mouth (if any) the ball enters.

import { REFERENCE_POWER } from "./constants.js";
import { BIN_MOUTH_Y } from "./bin-physics.js";
import { binEntryVelocity, solveLaunch } from "./launch.js";
import { projectPoint } from "./projection.js";

const FRONT_ROW_POWER = 0.5;
const DEPTH_PER_POWER = 1.35;
const FRONT_ROW_Z = 0.33;
const MIN_AIM_Z = 0.18;
const MAX_AIM_Z = 0.95;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function ticTacToeAimDepth(power) {
  return clamp(FRONT_ROW_Z + (clamp(power, 0, 1) - FRONT_ROW_POWER) * DEPTH_PER_POWER, MIN_AIM_Z, MAX_AIM_Z);
}

export function ticTacToePowerForDepth(z) {
  return clamp(FRONT_ROW_POWER + (z - FRONT_ROW_Z) / DEPTH_PER_POWER, 0, 1);
}

export function createTicTacToeShot(pull, origin, { weight = 1 } = {}) {
  const targetZ = ticTacToeAimDepth(pull.power);
  const aim = {
    x: pull.aimX,
    y: projectPoint({ x: 0, y: BIN_MOUTH_Y, z: targetZ }).y,
  };
  const launch = solveLaunch({
    origin,
    aim,
    targetZ,
    // Strength already selected the continuous target depth. Solving at the
    // calibrated reference preserves the normal arc without making the near
    // row demand the normal hoop's 80% pull.
    power: REFERENCE_POWER,
    loft: pull.loft,
    entryVelocity: binEntryVelocity(weight),
    weight,
  });
  launch.inputPower = clamp(pull.power, 0, 1);
  return { launch, aim, targetZ };
}

export function nearestOpenCellForShot({ aimX, targetZ }, bins, board) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const bin of bins) {
    if (board[bin.index]) continue;
    const screen = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
    const distance = Math.hypot((aimX - screen.x) / 120, (targetZ - bin.z) / 0.27);
    if (distance < nearestDistance) {
      nearest = bin.index;
      nearestDistance = distance;
    }
  }
  return nearest;
}
