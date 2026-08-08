import { suite, test, assert, assertEqual, assertThrows, finish } from "./harness.js";

import { DEFAULT_CAR, PERFECT_RPM_WINDOW, GOOD_RPM_WINDOW } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate, beginShift, applyShiftInput } from "../scripts/sim/gate.js";
import {
  PERFECT,
  GOOD,
  POOR,
  MISSED,
  CATCH_CLEAN,
  CATCH_LOOSE,
  CATCH_FUMBLED,
  gradeForRpm,
  downgrade,
  effectsFor,
  resolveShift,
  gradeCatch,
  catchPenaltySteps,
  catchReason,
  finaliseShift,
} from "../scripts/sim/grading.js";
import { CATCH_CLEAN_SECONDS, CATCH_LOOSE_SECONDS } from "../scripts/sim/constants.js";

suite("grading — timing windows and gate penalties");

const car = DEFAULT_CAR;
const gate = createGate(GATE_6_SPEED);
const optimal = car.optimalShiftRpm;

function cleanAttempt(from, to) {
  let attempt = beginShift(gate, from, to);
  for (const direction of from === 1 ? ["down", "down"] : ["up", "right", "up"]) {
    attempt = applyShiftInput(gate, attempt, direction);
  }
  return attempt;
}

// ---------------------------------------------------------------------------
// RPM windows — the timing half of the skill
// ---------------------------------------------------------------------------

test("shifting exactly on the optimal rpm is perfect", () => {
  assertEqual(gradeForRpm(car, optimal), PERFECT);
});

test("the perfect window has real width on both sides", () => {
  assertEqual(gradeForRpm(car, optimal - PERFECT_RPM_WINDOW), PERFECT);
  assertEqual(gradeForRpm(car, optimal + PERFECT_RPM_WINDOW), PERFECT);
});

test("just outside the perfect window is good, not perfect", () => {
  assertEqual(gradeForRpm(car, optimal - PERFECT_RPM_WINDOW - 1), GOOD);
  assertEqual(gradeForRpm(car, optimal + PERFECT_RPM_WINDOW + 1), GOOD);
});

test("the good window has real width on both sides", () => {
  assertEqual(gradeForRpm(car, optimal - GOOD_RPM_WINDOW), GOOD);
  assertEqual(gradeForRpm(car, optimal + GOOD_RPM_WINDOW), GOOD);
});

test("shifting while bogged down low is poor", () => {
  assertEqual(gradeForRpm(car, 3000), POOR);
});

test("hanging on well past the shift point is poor", () => {
  assertEqual(gradeForRpm(car, car.limiterRpm), POOR);
});

test("rpm alone never produces a missed grade", () => {
  for (let rpm = car.idleRpm; rpm <= car.limiterRpm; rpm += 50) {
    assert(gradeForRpm(car, rpm) !== MISSED, `rpm ${rpm} should not read as missed`);
  }
});

// ---------------------------------------------------------------------------
// Downgrades — the execution half of the skill
// ---------------------------------------------------------------------------

test("a downgrade steps perfect toward good toward poor", () => {
  assertEqual(downgrade(PERFECT, 1), GOOD);
  assertEqual(downgrade(GOOD, 1), POOR);
  assertEqual(downgrade(PERFECT, 2), POOR);
});

test("downgrades bottom out at poor and never reach missed", () => {
  assertEqual(downgrade(PERFECT, 9), POOR);
  assertEqual(downgrade(POOR, 4), POOR);
});

test("a downgrade of zero steps changes nothing", () => {
  assertEqual(downgrade(PERFECT, 0), PERFECT);
});

test("missed cannot be downgraded further", () => {
  assertEqual(downgrade(MISSED, 3), MISSED);
});

// ---------------------------------------------------------------------------
// Resolution — timing and execution combined
// ---------------------------------------------------------------------------

test("a perfectly timed, cleanly executed shift grades perfect", () => {
  const result = resolveShift({ car, rpmAtEngage: optimal, attempt: cleanAttempt(1, 2) });
  assertEqual(result.grade, PERFECT);
  assertEqual(result.gear, 2);
  assertEqual(result.gateErrors, 0);
});

test("sloppy gate work spoils perfect timing", () => {
  let attempt = beginShift(gate, 1, 2);
  attempt = applyShiftInput(gate, attempt, "up"); // wall
  attempt = applyShiftInput(gate, attempt, "down");
  attempt = applyShiftInput(gate, attempt, "down");
  const result = resolveShift({ car, rpmAtEngage: optimal, attempt });
  assertEqual(result.grade, GOOD, "one wall bump costs a grade");
});

test("a badly fumbled gate drops even perfect timing to poor", () => {
  let attempt = beginShift(gate, 1, 2);
  attempt = applyShiftInput(gate, attempt, "up");
  attempt = applyShiftInput(gate, attempt, "left");
  attempt = applyShiftInput(gate, attempt, "down");
  attempt = applyShiftInput(gate, attempt, "down");
  assertEqual(resolveShift({ car, rpmAtEngage: optimal, attempt }).grade, POOR);
});

test("landing in the wrong gear is missed regardless of perfect timing", () => {
  let attempt = beginShift(gate, 2, 3);
  for (const d of ["up", "right", "right", "up"]) {
    attempt = applyShiftInput(gate, attempt, d);
  }
  const result = resolveShift({ car, rpmAtEngage: optimal, attempt });
  assertEqual(result.grade, MISSED);
  assertEqual(result.gear, 5, "the car really is in the gear the knob landed in");
});

test("an unresolved attempt cannot be graded", () => {
  const attempt = beginShift(gate, 1, 2);
  assertThrows(() => resolveShift({ car, rpmAtEngage: optimal, attempt }));
});

// ---------------------------------------------------------------------------
// Effects — grades must actually matter
// ---------------------------------------------------------------------------

test("better grades pull harder out of the shift", () => {
  assert(effectsFor(PERFECT).forceMultiplier > effectsFor(GOOD).forceMultiplier);
  assert(effectsFor(GOOD).forceMultiplier > effectsFor(POOR).forceMultiplier);
  assert(effectsFor(POOR).forceMultiplier > effectsFor(MISSED).forceMultiplier);
});

test("only a poor or missed shift actively punishes the player", () => {
  assert(effectsFor(PERFECT).forceMultiplier > 1);
  assert(effectsFor(GOOD).forceMultiplier > 1);
  assert(effectsFor(POOR).forceMultiplier < 1);
  assert(effectsFor(MISSED).forceMultiplier < 1);
});

test("better grades get the clutch back in sooner", () => {
  assert(effectsFor(PERFECT).clutchSeconds < effectsFor(GOOD).clutchSeconds);
  assert(effectsFor(GOOD).clutchSeconds < effectsFor(POOR).clutchSeconds);
  assert(effectsFor(POOR).clutchSeconds < effectsFor(MISSED).clutchSeconds);
});

test("resolveShift hands back the effects the race loop needs", () => {
  const result = resolveShift({
    car,
    rpmAtEngage: optimal,
    attempt: cleanAttempt(1, 2),
    durationSeconds: 0.5, // between snap and slow: no bonus, no penalty
  });
  assertEqual(result.effects.forceMultiplier, effectsFor(PERFECT).forceMultiplier);
  assert(result.effects.clutchSeconds > 0);
  assert(result.effects.boostSeconds > 0);
});

test("an unknown grade has no effects entry and is rejected", () => {
  assertThrows(() => effectsFor("legendary"));
});

// ---------------------------------------------------------------------------
// Execution speed — the second axis. Timing sets the ceiling; how fast the gate
// is worked decides whether the player reaches it.
// ---------------------------------------------------------------------------

const SNAP = 0.2; // inside SHIFT_SNAP_SECONDS
const NEUTRAL = 0.5; // between snap and slow
const SLOW = 1.1; // past SHIFT_SLOW_SECONDS

function resolveClean(rpm, durationSeconds) {
  return resolveShift({ car, rpmAtEngage: rpm, attempt: cleanAttempt(1, 2), durationSeconds });
}

test("a slow gate costs a full grade even with flawless timing", () => {
  assertEqual(resolveClean(optimal, SLOW).grade, GOOD);
});

test("bad rpm timing plus a slow shift is a poor shift", () => {
  assertEqual(resolveClean(3000, SLOW).grade, POOR);
});

test("good rpm timing plus a slow shift drops to poor", () => {
  assertEqual(resolveClean(optimal - GOOD_RPM_WINDOW, SLOW).grade, POOR);
});

test("a snapped gate cannot rescue bad timing", () => {
  // Timing is primary: execution speed can only lose grades, never win them.
  assertEqual(resolveClean(3000, SNAP).grade, POOR);
});

test("the neutral band between snap and slow neither helps nor hurts", () => {
  assertEqual(resolveClean(optimal, NEUTRAL).grade, PERFECT);
  assertEqual(resolveClean(optimal, SNAP).grade, PERFECT);
});

test("a snapped gate pays a force bonus on top of the grade", () => {
  const snapped = resolveClean(optimal, SNAP);
  const neutral = resolveClean(optimal, NEUTRAL);
  assertEqual(snapped.grade, neutral.grade, "the bonus is force, not a grade");
  assert(snapped.snap === true);
  assert(neutral.snap === false);
  assert(snapped.effects.forceMultiplier > neutral.effects.forceMultiplier);
});

test("a slow gate and a wall bump stack into a double downgrade", () => {
  let attempt = beginShift(gate, 1, 2);
  attempt = applyShiftInput(gate, attempt, "up"); // wall
  attempt = applyShiftInput(gate, attempt, "down");
  attempt = applyShiftInput(gate, attempt, "down");
  const result = resolveShift({ car, rpmAtEngage: optimal, attempt, durationSeconds: SLOW });
  assertEqual(result.grade, POOR, "one grade for the bump, one for the delay");
});

test("a misshift stays missed no matter how quickly it was fumbled", () => {
  let attempt = beginShift(gate, 2, 3);
  for (const d of ["up", "right", "right", "up"]) {
    attempt = applyShiftInput(gate, attempt, d);
  }
  assertEqual(resolveShift({ car, rpmAtEngage: optimal, attempt, durationSeconds: SNAP }).grade, MISSED);
});

test("the duration that produced the grade is reported back", () => {
  assertEqual(resolveClean(optimal, NEUTRAL).durationSeconds, NEUTRAL);
});

// ---------------------------------------------------------------------------
// Early vs late — feedback only, not a separate grade
// ---------------------------------------------------------------------------

test("a shift below the window is reported as early", () => {
  assertEqual(resolveClean(4000, SNAP).reason, "early");
});

test("a shift above the window is reported as late", () => {
  assertEqual(resolveClean(car.limiterRpm, SNAP).reason, "late");
});

test("a shift inside the perfect window has nothing to report", () => {
  assertEqual(resolveClean(optimal, SNAP).reason, null);
});

test("the reason describes the timing, not the grade it ended up with", () => {
  // Perfect timing spoiled by a slow gate is still not an early or late shift.
  assertEqual(resolveClean(optimal, SLOW).grade, GOOD);
  assertEqual(resolveClean(optimal, SLOW).reason, null);
});

// ---------------------------------------------------------------------------
// The catch — picking the gas back up as the clutch bites
// ---------------------------------------------------------------------------

const settle = (rpm, deltaSeconds, durationSeconds = SNAP) =>
  finaliseShift(resolveClean(rpm, durationSeconds), deltaSeconds);

test("landing on the clutch either side is a clean catch", () => {
  assertEqual(gradeCatch(0), CATCH_CLEAN);
  assertEqual(gradeCatch(CATCH_CLEAN_SECONDS), CATCH_CLEAN);
  assertEqual(gradeCatch(-CATCH_CLEAN_SECONDS), CATCH_CLEAN);
});

test("the clean window has an edge, and past it is loose", () => {
  assertEqual(gradeCatch(CATCH_CLEAN_SECONDS + 0.001), CATCH_LOOSE);
  assertEqual(gradeCatch(CATCH_LOOSE_SECONDS), CATCH_LOOSE);
  assertEqual(gradeCatch(CATCH_LOOSE_SECONDS + 0.001), CATCH_FUMBLED);
});

test("never getting back on the gas is a fumble, not an infinitely late catch", () => {
  assertEqual(gradeCatch(null), CATCH_FUMBLED);
  assertEqual(catchReason(null), "never");
});

test("early and late cost the same, and are told apart only for feedback", () => {
  assertEqual(catchPenaltySteps(gradeCatch(0.2)), catchPenaltySteps(gradeCatch(-0.2)));
  assertEqual(catchReason(0.2), "late");
  assertEqual(catchReason(-0.2), "early");
  assertEqual(catchReason(0), null);
});

test("a clean catch leaves the grade the gate earned exactly where it was", () => {
  assertEqual(settle(optimal, 0).grade, PERFECT);
  assertEqual(settle(optimal, 0).catch.grade, CATCH_CLEAN);
});

test("a loose catch costs one grade and a fumble costs two", () => {
  assertEqual(settle(optimal, 0.2).grade, GOOD);
  assertEqual(settle(optimal, 0.5).grade, POOR);
  assertEqual(settle(optimal, null).grade, POOR);
});

test("the catch cannot rescue a badly timed shift", () => {
  assertEqual(settle(3000, 0).grade, POOR, "a clean catch is not a reward, only the absence of a cost");
});

test("a missed shift stays missed however the gas comes back", () => {
  const missed = finaliseShift(
    resolveShift({ car, rpmAtEngage: optimal, attempt: cleanAttempt(1, 3), durationSeconds: SNAP }),
    null,
  );
  assertEqual(missed.grade, MISSED);
});

test("a fumble forfeits the snap bonus", () => {
  const clean = settle(optimal, 0);
  const fumbled = settle(optimal, null);
  assert(clean.snap, "the gate was worked fast enough to earn one");
  assert(clean.effects.forceMultiplier > effectsFor(PERFECT).forceMultiplier, "so it is paid");
  assertEqual(fumbled.effects.forceMultiplier, Math.min(1, effectsFor(POOR).forceMultiplier));
});

test("a fumble never turns a punishing multiplier into a rewarding one", () => {
  // `poor` and `missed` use the same field to punish, so forfeiting the reward
  // has to clamp rather than reset — otherwise fumbling would beat catching.
  const fumbled = settle(3000, null, SLOW);
  assert(fumbled.effects.forceMultiplier < 1, "a bad shift still bogs the car");
});

test("the clutch dead time is the gate's, and the catch cannot rewrite it", () => {
  const provisional = resolveClean(optimal, SNAP);
  const finished = finaliseShift(provisional, null);
  assertEqual(finished.effects.clutchSeconds, provisional.effects.clutchSeconds);
});

test("a shift carries no catch until it has one, and cannot be settled twice", () => {
  const provisional = resolveClean(optimal, SNAP);
  assertEqual(provisional.catch, null);
  assertThrows(() => finaliseShift(finaliseShift(provisional, 0), 0));
});

finish();
