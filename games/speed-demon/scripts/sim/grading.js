// Shift grading — pure.
//
// Two axes feed one grade:
//
//   1. Timing    — the rpm at the moment SHIFT was pressed sets the ceiling.
//   2. Execution — how fast the gate was worked, and how cleanly, can only
//                  lower that ceiling.
//
// Stated as one rule: the grade is the rpm tier, dropped one step for a slow
// gate and one more for each wall bump. So bad timing plus a slow shift is a
// poor shift, perfect timing plus a slow shift is merely good, and a lightning
// gate can never rescue a badly timed one — timing is primary, exactly as the
// design intends.
//
// A snapped gate is rewarded with extra drive force rather than a better grade,
// which keeps the grade honest about timing while still paying for sharp hands.
// Landing in the wrong gear short-circuits everything and is simply `missed`.

import {
  PERFECT_RPM_WINDOW,
  GOOD_RPM_WINDOW,
  GRADE_EFFECTS,
  SHIFT_SNAP_SECONDS,
  SHIFT_SLOW_SECONDS,
  SNAP_FORCE_BONUS,
} from "./constants.js";
import { SHIFT_COMPLETED, SHIFT_MISSED } from "./gate.js";

export const PERFECT = "perfect";
export const GOOD = "good";
export const POOR = "poor";
export const MISSED = "missed";

// Ordered best to worst. Downgrades walk this list but stop before `missed`,
// which is reserved for actually putting the car in the wrong gear.
const DOWNGRADE_LADDER = [PERFECT, GOOD, POOR];

/** Base grade from the rpm at the moment the clutch went in. */
export function gradeForRpm(car, rpm) {
  const delta = Math.abs(rpm - car.optimalShiftRpm);
  if (delta <= PERFECT_RPM_WINDOW) {
    return PERFECT;
  }
  if (delta <= GOOD_RPM_WINDOW) {
    return GOOD;
  }
  return POOR;
}

/** Steps a grade down the ladder, flooring at `poor`. `missed` is immovable. */
export function downgrade(grade, steps) {
  if (grade === MISSED) {
    return MISSED;
  }
  const index = DOWNGRADE_LADDER.indexOf(grade);
  if (index === -1) {
    throw new Error(`Unknown grade "${grade}"`);
  }
  const next = Math.min(DOWNGRADE_LADDER.length - 1, index + Math.max(0, steps));
  return DOWNGRADE_LADDER[next];
}

/** The car-behaviour payload for a grade. Throws on an unknown grade. */
export function effectsFor(grade) {
  const effects = GRADE_EFFECTS[grade];
  if (!effects) {
    throw new Error(`No grade effects defined for "${grade}"`);
  }
  return effects;
}

/** True when the gate was worked fast enough to earn the force bonus. */
export function isSnapShift(durationSeconds) {
  return durationSeconds <= SHIFT_SNAP_SECONDS;
}

/** Grade steps lost to a gate that dragged on. Slow hands cost exactly one. */
export function executionPenaltySteps(durationSeconds) {
  return durationSeconds > SHIFT_SLOW_SECONDS ? 1 : 0;
}

/**
 * Whether the timing was early or late, for feedback only. Deliberately not a
 * grade: `early` and `late` describe the same `poor` outcome from either side,
 * and promoting them to grades would imply they cost different amounts.
 */
export function timingReason(car, rpm) {
  if (Math.abs(rpm - car.optimalShiftRpm) <= PERFECT_RPM_WINDOW) {
    return null;
  }
  return rpm < car.optimalShiftRpm ? "early" : "late";
}

/**
 * Combines timing and execution into the final grade, the gear the car actually
 * ends up in, and the effects the race loop should apply.
 *
 * `attempt` must already be resolved — grading a shift still in progress is a
 * caller bug, not a recoverable state.
 */
export function resolveShift({ car, rpmAtEngage, attempt, durationSeconds = 0 }) {
  if (attempt.status !== SHIFT_COMPLETED && attempt.status !== SHIFT_MISSED) {
    throw new Error("Cannot grade a shift that has not resolved");
  }

  const missed = attempt.status === SHIFT_MISSED;
  const penalty = executionPenaltySteps(durationSeconds) + attempt.gateErrors;
  const grade = missed ? MISSED : downgrade(gradeForRpm(car, rpmAtEngage), penalty);
  const snap = !missed && isSnapShift(durationSeconds);

  const base = effectsFor(grade);
  const effects = snap
    ? { ...base, forceMultiplier: base.forceMultiplier + SNAP_FORCE_BONUS }
    : base;

  return {
    grade,
    reason: missed ? null : timingReason(car, rpmAtEngage),
    snap,
    gear: attempt.landedGear,
    gateErrors: attempt.gateErrors,
    rpmAtEngage,
    durationSeconds,
    effects,
  };
}
