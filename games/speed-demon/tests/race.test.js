import { suite, test, assert, assertEqual, assertClose, assertThrows, finish } from "./harness.js";

import { DEFAULT_CAR, RACE_DISTANCES, TICK_SECONDS } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { PERFECT, GOOD, POOR, MISSED } from "../scripts/sim/grading.js";
import { LAUNCH_HOLESHOT, LAUNCH_LATE, LAUNCH_FOUL } from "../scripts/sim/launch.js";
import {
  STAGING,
  COUNTDOWN,
  RUNNING,
  FINISHED,
  createRace,
  startRace,
  stepRace,
  pressShift,
  gateInput,
  isClutchEngaged,
  isTimeAttack,
  raceProgress,
  topGear,
} from "../scripts/sim/race.js";

suite("race — state machine and shift integration");

const car = DEFAULT_CAR;
const gate = createGate(GATE_6_SPEED);
const FLOOR = { throttle: 1 };
const LIFT = { throttle: 0 };

function newRace(overrides = {}) {
  return createRace({ car, gate, distanceMetres: RACE_DISTANCES.quarter.metres, ...overrides });
}

function run(race, ticks, controls = FLOOR) {
  let next = race;
  for (let i = 0; i < ticks; i += 1) {
    next = stepRace(next, controls, TICK_SECONDS);
  }
  return next;
}

/**
 * Lifts off, declutches, and drives the knob cleanly into the next gear —
 * stopping there, with the clutch still out and the grade still open.
 */
function workGate(race) {
  let next = pressShift(race, LIFT);
  const from = next.vehicle.gear;
  const directions = from % 2 === 1 ? ["down", "down"] : ["up", "right", "up"];
  for (const direction of directions) {
    next = gateInput(next, direction);
  }
  return next;
}

/**
 * Coasts to the moment the clutch bites and picks the gas back up on it, which
 * is what closes the grade. `offsetTicks` shifts the catch either side of the
 * bite; the default lands inside the clean window.
 */
function catchGas(race, offsetTicks = 0) {
  let next = race;
  const target = (race.pendingShift?.clutchAt ?? race.elapsed) + offsetTicks * TICK_SECONDS;
  // `next.throttleHeld` keeps the loop going until the gas is genuinely off:
  // the catch is a press, so a run that never lifted has nothing to press with.
  while (next.pendingShift && (next.elapsed < target || next.throttleHeld)) {
    next = stepRace(next, LIFT, TICK_SECONDS);
  }
  return next.pendingShift ? stepRace(next, FLOOR, TICK_SECONDS) : next;
}

/** The whole manoeuvre: lift, work the gate, catch the gas as the clutch bites. */
function shiftUp(race) {
  return catchGas(workGate(race));
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

test("a new race is staged and stationary", () => {
  const race = newRace();
  assertEqual(race.phase, STAGING);
  assertEqual(race.elapsed, 0);
  assertEqual(race.vehicle.speed, 0);
  assertEqual(race.vehicle.gear, 1);
  assertEqual(race.finishTime, null);
});

test("a staged car does not move no matter how hard the throttle is held", () => {
  const race = run(newRace(), 120);
  assertEqual(race.vehicle.speed, 0);
  assertEqual(race.vehicle.distance, 0);
  assertEqual(race.elapsed, 0);
});

test("starting the race opens the countdown", () => {
  const race = startRace(newRace());
  assertEqual(race.phase, COUNTDOWN);
  assert(race.countdown > 0);
});

test("the car cannot creep during the countdown", () => {
  const race = run(startRace(newRace({ countdownSeconds: 3 })), 60);
  assertEqual(race.phase, COUNTDOWN);
  assertEqual(race.vehicle.speed, 0);
  assertEqual(race.elapsed, 0, "the clock only starts on green");
});

test("the countdown expires into a running race", () => {
  const race = run(startRace(newRace({ countdownSeconds: 1 })), 61);
  assertEqual(race.phase, RUNNING);
});

test("a running race accumulates time, speed, and distance", () => {
  const race = run(startRace(newRace({ countdownSeconds: 0 })), 60);
  assertEqual(race.phase, RUNNING);
  assertClose(race.elapsed, 1, 0.02);
  assert(race.vehicle.speed > 0);
  assert(race.vehicle.distance > 0);
});

// ---------------------------------------------------------------------------
// Shifting inside a live race
// ---------------------------------------------------------------------------

test("the shift button does nothing before the green", () => {
  const race = pressShift(newRace());
  assertEqual(race.shift, null);
  assertEqual(race.phase, STAGING);
});

test("pressing shift opens the gate and pulls the clutch", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 60);
  assert(isClutchEngaged(race), "clutch should be in while simply driving");
  race = pressShift(race);
  assert(race.shift !== null, "the gate should be open");
  assertEqual(race.shift.fromGear, 1);
  assertEqual(race.shift.toGear, 2);
  assert(!isClutchEngaged(race), "opening the gate must declutch");
});

test("the rpm the shift is graded against is captured at the button press", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  const rpmAtPress = race.vehicle.rpm;
  race = pressShift(race);
  assertEqual(race.rpmAtEngage, rpmAtPress);
  race = run(race, 20, LIFT);
  assertEqual(race.rpmAtEngage, rpmAtPress, "later rev decay must not rewrite the grade");
});

test("time in the gate costs speed because the car is coasting", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  const entrySpeed = race.vehicle.speed;
  race = pressShift(race);
  race = run(race, 45);
  assert(race.vehicle.speed < entrySpeed, "a car with the clutch in cannot accelerate");
});

test("gate input outside a shift is ignored", () => {
  const race = gateInput(run(startRace(newRace({ countdownSeconds: 0 })), 60), "down");
  assertEqual(race.shift, null);
});

test("completing the gate engages the new gear and records a grade", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = shiftUp(race);
  assertEqual(race.shift, null, "the gate closes once the shift resolves");
  assertEqual(race.vehicle.gear, 2);
  assert(race.lastShift !== null);
  assertEqual(race.shifts.length, 1);
});

test("a perfectly timed shift is graded perfect", () => {
  let race = startRace(newRace({ countdownSeconds: 0 }));
  // Hold first gear until the needle reaches the shift point.
  while (race.vehicle.rpm < car.optimalShiftRpm && race.phase === RUNNING) {
    race = stepRace(race, FLOOR, TICK_SECONDS);
  }
  race = shiftUp(race);
  assertEqual(race.lastShift.grade, PERFECT);
});

test("a missed shift really does leave the car in the wrong gear", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = shiftUp(race); // into 2nd
  race = run(race, 60);
  race = pressShift(race, LIFT); // 2 -> 3
  for (const d of ["up", "right", "right", "up"]) {
    race = gateInput(race, d);
  }
  race = catchGas(race);
  assertEqual(race.lastShift.grade, MISSED);
  assertEqual(race.vehicle.gear, 5, "the money shift is real, not cosmetic");
});

test("the clutch stays out for the dead time after a shift resolves", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = workGate(race);
  assert(!isClutchEngaged(race), "drive should not return the instant the gear engages");
  race = run(race, 60, LIFT);
  assert(isClutchEngaged(race), "the clutch must come back after the dead time");
});

test("a shift boost expires instead of lasting forever", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = shiftUp(race);
  race = run(race, 30);
  const boosted = race.boostTimer;
  assert(boosted > 0, "a fresh shift should be boosting");
  race = run(race, 180);
  assertEqual(race.boostTimer, 0);
});

test("the shifter cannot be opened while a shift is already in progress", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = pressShift(race);
  const opened = race.shift;
  race = pressShift(race);
  assertEqual(race.shift, opened, "the second press must be ignored");
});

test("there is no gear above top gear to shift into", () => {
  assertEqual(topGear(car), 6);
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 60);
  race = { ...race, vehicle: { ...race.vehicle, gear: 6 } };
  race = pressShift(race);
  assertEqual(race.shift, null, "top gear has nowhere to go");
});

// ---------------------------------------------------------------------------
// The throttle's half of a shift: lift to declutch, catch it coming back out
// ---------------------------------------------------------------------------

test("the clutch cannot go in while the gas is still down", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = pressShift(race, FLOOR);
  assertEqual(race.shift, null, "the gate must not open under power");
  assert(race.shiftArmed, "the clutch is armed rather than refused");
});

test("an armed clutch goes in by itself the moment the gas comes off", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = pressShift(race, FLOOR);
  race = stepRace(race, FLOOR, TICK_SECONDS);
  assertEqual(race.shift, null, "still on the gas, so still nothing");
  race = stepRace(race, LIFT, TICK_SECONDS);
  assert(race.shift !== null, "lifting is what puts the clutch in");
  assert(!race.shiftArmed, "and the arming is spent");
});

test("the rpm that grades the shift is sampled at the lift, not at the key", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 60);
  race = pressShift(race, FLOOR);
  const atPress = race.vehicle.rpm;
  race = run(race, 20, FLOOR); // still winding out, still armed
  race = stepRace(race, LIFT, TICK_SECONDS);
  assert(race.rpmAtEngage > atPress, "the needle kept climbing while armed");
  assertClose(race.rpmAtEngage, race.vehicle.rpm, 400);
});

test("holding the gas with the clutch down flares the engine instead of driving", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = workGate(race);
  const speed = race.vehicle.speed;
  const revved = run(race, 10, FLOOR);
  assert(revved.vehicle.rpm > race.vehicle.rpm, "free revs climb on the gas");
  assert(revved.vehicle.speed < speed, "and none of it reaches the road");
});

test("a shift is not graded until the gas comes back", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = workGate(race);
  assertEqual(race.lastShift, null, "the grade is still open");
  assertEqual(race.shifts.length, 0);
  assert(race.pendingShift !== null, "but the shift is on the books");
  assertEqual(race.vehicle.gear, 2, "the gear engaged all the same");
});

test("catching the gas on the clutch keeps the grade the gate earned", () => {
  let race = startRace(newRace({ countdownSeconds: 0 }));
  while (race.vehicle.rpm < car.optimalShiftRpm && race.phase === RUNNING) {
    race = stepRace(race, FLOOR, TICK_SECONDS);
  }
  race = catchGas(workGate(race));
  assertEqual(race.lastShift.grade, PERFECT);
  assertEqual(race.lastShift.catch.grade, "clean");
});

test("a loose catch costs one grade and a fumbled one costs two", () => {
  const atShiftPoint = () => {
    let race = startRace(newRace({ countdownSeconds: 0 }));
    while (race.vehicle.rpm < car.optimalShiftRpm && race.phase === RUNNING) {
      race = stepRace(race, FLOOR, TICK_SECONDS);
    }
    return workGate(race);
  };

  // 12 ticks past the bite is 0.2s — outside the clean window, inside the loose.
  const loose = catchGas(atShiftPoint(), 12);
  assertEqual(loose.lastShift.catch.grade, "loose");
  assertEqual(loose.lastShift.grade, GOOD, "perfect timing, sloppy feet");

  // 24 ticks is 0.4s, past the window entirely.
  const fumbled = catchGas(atShiftPoint(), 24);
  assertEqual(fumbled.lastShift.catch.grade, "fumbled");
  assertEqual(fumbled.lastShift.grade, POOR);
});

test("never getting back on the gas settles the shift rather than hanging it", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = workGate(race);
  race = run(race, 120, LIFT);
  assertEqual(race.pendingShift, null, "the grade cannot stay open forever");
  assertEqual(race.shifts.length, 1);
  assertEqual(race.lastShift.catch.reason, "never");
});

test("a fumble forfeits the reward but never turns a penalty into one", () => {
  const shiftAt = (offsetTicks) => {
    let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
    return catchGas(workGate(race), offsetTicks).lastShift;
  };
  const clean = shiftAt(0);
  const fumbled = shiftAt(24);
  assert(clean.effects.forceMultiplier > fumbled.effects.forceMultiplier, "the bonus is lost");
  assert(fumbled.effects.forceMultiplier <= 1, "and never becomes a bonus of its own");
});

test("declutching again with the gas never picked up settles the shift as fumbled", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = workGate(race); // into 2nd, gas still off
  race = pressShift(race, LIFT); // straight back in for 3rd
  assertEqual(race.pendingShift, null);
  assertEqual(race.shifts.length, 1, "the abandoned shift still counts");
  assertEqual(race.lastShift.catch.grade, "fumbled");
});

test("a shift still waiting on its catch at the line is counted, not dropped", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  // Put the line a tenth of a second in front of the car so it arrives while
  // the gas is still off and the grade is still open.
  race = { ...race, distanceMetres: race.vehicle.distance + race.vehicle.speed * 0.1 };
  race = workGate(race);
  assert(race.pendingShift !== null, "the shift must still be open at the line");
  race = run(race, 30, LIFT);
  assertEqual(race.phase, FINISHED);
  assertEqual(race.shifts.length, 1, "the run's shift count must not miss it");
  assertEqual(race.lastShift.catch.reason, "never");
});

test("driving it properly beats holding the gas through the shift", () => {
  const quarter = { distanceMetres: RACE_DISTANCES.quarter.metres, countdownSeconds: 0 };
  const drive = (proper) => {
    let race = startRace(newRace(quarter));
    let ticks = 0;
    while (race.phase !== FINISHED && ticks < 60 * 120) {
      if (race.shift === null && !race.shiftArmed && race.vehicle.rpm >= car.optimalShiftRpm && race.vehicle.gear < 6) {
        race = proper ? shiftUp(race) : workGate({ ...race, throttleHeld: true });
      }
      race = stepRace(race, FLOOR, TICK_SECONDS);
      ticks += 1;
    }
    return race;
  };

  const proper = drive(true);
  const lazy = drive(false);
  assert(proper.finishTime < lazy.finishTime, "the skill has to be worth something");
  assert(
    lazy.shifts.every((shift) => shift.catch.grade === "fumbled"),
    "a foot that never lifts never catches anything",
  );
});

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

test("crossing the line finishes the race and stops the clock", () => {
  let race = startRace(newRace({ countdownSeconds: 0, distanceMetres: 100 }));
  for (let i = 0; i < 60 * 60 && race.phase !== FINISHED; i += 1) {
    race = stepRace(race, FLOOR, TICK_SECONDS);
  }
  assertEqual(race.phase, FINISHED);
  assert(race.finishTime > 0, "a finished race must have a time");
  assert(race.vehicle.distance >= 100);
});

test("the finish time is interpolated, not rounded to the tick", () => {
  let race = startRace(newRace({ countdownSeconds: 0, distanceMetres: 100 }));
  while (race.phase !== FINISHED) {
    race = stepRace(race, FLOOR, TICK_SECONDS);
  }
  const ticks = race.finishTime / TICK_SECONDS;
  assert(Math.abs(ticks - Math.round(ticks)) > 1e-9, "hundredths must not be quantised to 60hz");
  assert(race.finishTime <= race.elapsed);
});

test("a finished race ignores further stepping and input", () => {
  let race = startRace(newRace({ countdownSeconds: 0, distanceMetres: 50 }));
  while (race.phase !== FINISHED) {
    race = stepRace(race, FLOOR, TICK_SECONDS);
  }
  const settled = race;
  const later = pressShift(run(race, 120));
  assertEqual(later.finishTime, settled.finishTime);
  assertEqual(later.elapsed, settled.elapsed);
  assertEqual(later.shift, null);
});

// ---------------------------------------------------------------------------
// Objectives — a distance to cross, or a clock to run out
// ---------------------------------------------------------------------------

/** A time attack has no distance at all, so it cannot go through newRace. */
function timeAttack(overrides = {}) {
  return createRace({ car, gate, timeLimitSeconds: 10, countdownSeconds: 0, ...overrides });
}

test("a race must name exactly one objective", () => {
  assertThrows(() => createRace({ car, gate }), "neither");
  assertThrows(() => createRace({ car, gate, distanceMetres: 100, timeLimitSeconds: 10 }), "both");
  assertThrows(() => createRace({ car, gate, timeLimitSeconds: 0 }), "an empty clock");
  assertThrows(() => createRace({ car, gate, distanceMetres: -1 }), "a negative distance");
});

test("a distance race is not a time attack, and vice versa", () => {
  assertEqual(isTimeAttack(newRace()), false);
  assertEqual(isTimeAttack(timeAttack()), true);
  assertEqual(newRace().timeLimitSeconds, null);
  assertEqual(timeAttack().distanceMetres, null);
});

test("a time attack runs until the clock does, however far the car gets", () => {
  let race = startRace(timeAttack({ timeLimitSeconds: 5 }));
  race = run(race, 60 * 10);
  assertEqual(race.phase, FINISHED);
  assertClose(race.elapsed, 5, 1e-9, "the clock stops exactly on the limit");
  assertEqual(race.finishTime, 5);
  assert(race.vehicle.distance > 0, "the score is the ground covered");
});

test("a time attack does not finish just because the car went a long way", () => {
  // The same distance that ends a quarter mile must not end a time attack.
  let race = startRace(timeAttack({ timeLimitSeconds: 60 }));
  race = run(race, 60 * 30);
  assertEqual(race.phase, RUNNING);
  assert(race.vehicle.distance > RACE_DISTANCES.quarter.metres, "the road has to be endless");
});

test("the distance a time attack scores is interpolated, not rounded to the tick", () => {
  // 5.008s is deliberately off the 60hz grid, so the last tick straddles the
  // buzzer and the distance at the buzzer sits between two integrated values.
  let race = startRace(timeAttack({ timeLimitSeconds: 5.008 }));
  let previous = race;
  while (race.phase !== FINISHED) {
    previous = race;
    race = stepRace(race, FLOOR, TICK_SECONDS);
  }
  // The same tick against a clock that is not about to expire: the distance the
  // car would reach at the next tick boundary, which the buzzer falls short of.
  const wholeTick = stepRace({ ...previous, timeLimitSeconds: 99 }, FLOOR, TICK_SECONDS);
  assert(race.vehicle.distance > previous.vehicle.distance, "the last part-tick still counts");
  assert(
    race.vehicle.distance < wholeTick.vehicle.distance,
    "and the car must not be credited past the buzzer",
  );
});

test("a finished time attack ignores further stepping", () => {
  let race = startRace(timeAttack({ timeLimitSeconds: 2 }));
  race = run(race, 60 * 5);
  const settled = race;
  const later = run(race, 120);
  assertEqual(later.elapsed, settled.elapsed);
  assertEqual(later.vehicle.distance, settled.vehicle.distance);
});

test("progress reads against whichever objective the race has", () => {
  assertEqual(raceProgress(newRace()), 0);
  const halfway = startRace(timeAttack({ timeLimitSeconds: 10 }));
  assertClose(raceProgress(run(halfway, 300)), 0.5, 0.02);

  let distance = startRace(newRace({ countdownSeconds: 0, distanceMetres: 100 }));
  while (distance.phase !== FINISHED) {
    distance = stepRace(distance, FLOOR, TICK_SECONDS);
  }
  assertEqual(raceProgress(distance), 1, "progress is clamped at the line");
});

test("the run records the fastest the car went, not the speed it ended on", () => {
  let race = startRace(timeAttack({ timeLimitSeconds: 8 }));
  race = run(race, 300, FLOOR);
  const peak = race.topSpeed;
  assert(peak > 0);
  race = run(race, 120, LIFT); // coast down to the buzzer
  assert(race.vehicle.speed < peak, "the car should have slowed");
  assertEqual(race.topSpeed, peak, "the peak must not decay with the car");
});

// ---------------------------------------------------------------------------
// Determinism — the property online play will depend on
// ---------------------------------------------------------------------------

test("stepRace does not mutate the race it is given", () => {
  const race = startRace(newRace({ countdownSeconds: 0 }));
  const next = stepRace(race, FLOOR, TICK_SECONDS);
  assertEqual(race.elapsed, 0, "input race must be untouched");
  assert(next !== race);
});

test("an identical sequence of inputs produces an identical race", () => {
  const replay = () => {
    let race = startRace(newRace({ countdownSeconds: 0, distanceMetres: 200 }));
    let tick = 0;
    while (race.phase !== FINISHED && tick < 60 * 60) {
      if (tick === 90 || tick === 200) {
        race = shiftUp(race);
      }
      race = stepRace(race, FLOOR, TICK_SECONDS);
      tick += 1;
    }
    return race;
  };
  const a = replay();
  const b = replay();
  assertEqual(a.finishTime, b.finishTime);
  assertEqual(a.vehicle.distance, b.vehicle.distance);
  assertEqual(a.vehicle.gear, b.vehicle.gear);
  assertEqual(a.shifts.length, b.shifts.length);
});

// ---------------------------------------------------------------------------
// Launch — the christmas tree, reaction window, and red light
// ---------------------------------------------------------------------------

test("a fresh race has not launched and has not fouled", () => {
  const race = newRace();
  assertEqual(race.falseStart, false);
  assertEqual(race.launched, false);
  assertEqual(race.reactionTime, null);
  assertEqual(race.launchGrade, null);
});

test("touching the throttle during the countdown latches a false start", () => {
  let race = startRace(newRace({ countdownSeconds: 3 }));
  race = run(race, 30, FLOOR);
  assertEqual(race.falseStart, true);
});

test("a false start does not shorten or skip the countdown", () => {
  let race = startRace(newRace({ countdownSeconds: 3 }));
  race = run(race, 30, FLOOR);
  assertEqual(race.phase, COUNTDOWN, "the tree must still run down");
  assertEqual(race.vehicle.speed, 0, "and the car must not move early");
});

test("a false start records how early the light was jumped", () => {
  let race = startRace(newRace({ countdownSeconds: 3 }));
  race = run(race, 60, LIFT); // one second of the tree gone
  race = stepRace(race, FLOOR, TICK_SECONDS);
  assertClose(race.falseStartAt, 2, 0.02, "two seconds still on the tree");
});

test("the recorded jump time is the first one, not the last", () => {
  let race = startRace(newRace({ countdownSeconds: 3 }));
  race = stepRace(race, FLOOR, TICK_SECONDS); // jumps immediately
  const first = race.falseStartAt;
  race = run(race, 60, FLOOR);
  assertEqual(race.falseStartAt, first, "a foul is timed once");
});

test("a clean countdown records no jump time", () => {
  const race = run(startRace(newRace({ countdownSeconds: 1 })), 61, LIFT);
  assertEqual(race.falseStartAt, null);
});

test("lifting off does not clear a false start once committed", () => {
  let race = startRace(newRace({ countdownSeconds: 3 }));
  race = run(race, 10, FLOOR);
  race = run(race, 60, LIFT);
  assertEqual(race.falseStart, true, "you cannot take a red light back");
});

test("a clean countdown produces no false start", () => {
  const race = run(startRace(newRace({ countdownSeconds: 1 })), 61, LIFT);
  assertEqual(race.phase, RUNNING);
  assertEqual(race.falseStart, false);
});

test("reaction time is measured from the green bulb", () => {
  let race = startRace(newRace({ countdownSeconds: 0 }));
  race = run(race, 30, LIFT); // dithering on the line
  race = stepRace(race, FLOOR, TICK_SECONDS);
  assertEqual(race.launched, true);
  assertClose(race.reactionTime, 0.5, 0.02);
});

test("going the instant the light turns green is a holeshot", () => {
  let race = startRace(newRace({ countdownSeconds: 0 }));
  race = stepRace(race, FLOOR, TICK_SECONDS);
  assertEqual(race.reactionTime, 0);
  assertEqual(race.launchGrade, LAUNCH_HOLESHOT);
  assert(race.boostTimer > 0, "a holeshot must actually grant a boost");
  assert(race.boostMultiplier > 1);
});

test("a holeshot genuinely accelerates harder off the line", () => {
  const holeshot = run(startRace(newRace({ countdownSeconds: 0 })), 40, FLOOR);

  let late = startRace(newRace({ countdownSeconds: 0 }));
  late = run(late, 60, LIFT); // miss the window entirely
  late = run(late, 40, FLOOR);

  assertEqual(late.launchGrade, LAUNCH_LATE);
  assert(
    holeshot.vehicle.speed > late.vehicle.speed,
    `holeshot ${holeshot.vehicle.speed} should beat late ${late.vehicle.speed}`,
  );
});

test("a late launch gets no boost at all", () => {
  let race = startRace(newRace({ countdownSeconds: 0 }));
  race = run(race, 60, LIFT);
  race = stepRace(race, FLOOR, TICK_SECONDS);
  assertEqual(race.launchGrade, LAUNCH_LATE);
  assertEqual(race.boostTimer, 0);
});

test("a red light bogs the car instead of disqualifying it", () => {
  let fouled = startRace(newRace({ countdownSeconds: 1 }));
  fouled = run(fouled, 61, FLOOR); // jumped, and the tree ran out
  assertEqual(fouled.falseStart, true);
  assertEqual(fouled.launchGrade, LAUNCH_FOUL);
  assert(fouled.boostMultiplier < 1, "a foul must cost acceleration");

  let clean = startRace(newRace({ countdownSeconds: 1 }));
  clean = run(clean, 60, LIFT);
  clean = run(clean, 40, FLOOR);
  fouled = run(fouled, 40, FLOOR);
  assert(clean.vehicle.speed > fouled.vehicle.speed, "the red light has to hurt");
  assertEqual(fouled.phase, RUNNING, "but the run still happens");
});

test("the launch is graded once and never re-graded", () => {
  let race = startRace(newRace({ countdownSeconds: 0 }));
  race = stepRace(race, FLOOR, TICK_SECONDS);
  const first = race.reactionTime;
  race = run(race, 30, LIFT);
  race = run(race, 30, FLOOR);
  assertEqual(race.reactionTime, first, "lifting and reapplying must not re-time the launch");
  assertEqual(race.launchGrade, LAUNCH_HOLESHOT);
});

test("a car that never gets throttle never launches", () => {
  const race = run(startRace(newRace({ countdownSeconds: 0 })), 120, LIFT);
  assertEqual(race.launched, false);
  assertEqual(race.launchGrade, null);
});

// ---------------------------------------------------------------------------
// Shift duration feeds grading
// ---------------------------------------------------------------------------

test("the time spent in the gate is measured and graded", () => {
  let race = run(startRace(newRace({ countdownSeconds: 0 })), 90);
  race = pressShift(race, LIFT);
  race = run(race, 60, LIFT); // dawdle for a second
  race = gateInput(race, "down");
  race = gateInput(race, "down");
  race = catchGas(race);
  assertClose(race.lastShift.durationSeconds, 1, 0.05);
});

test("a snapped gate beats a dawdled one at the same rpm", () => {
  const atShiftPoint = (r) => {
    let race = r;
    while (race.vehicle.rpm < car.optimalShiftRpm && race.phase === RUNNING) {
      race = stepRace(race, FLOOR, TICK_SECONDS);
    }
    return race;
  };

  const snapped = shiftUp(atShiftPoint(startRace(newRace({ countdownSeconds: 0 }))));

  let slow = atShiftPoint(startRace(newRace({ countdownSeconds: 0 })));
  slow = pressShift(slow, LIFT);
  slow = run(slow, 60, LIFT);
  slow = gateInput(slow, "down");
  slow = gateInput(slow, "down");
  slow = catchGas(slow);

  assertEqual(snapped.lastShift.grade, PERFECT);
  assertEqual(slow.lastShift.grade, GOOD, "an identical rpm but slow hands loses a grade");
});

test("a well-shifted quarter mile beats a lazy one-gear run", () => {
  const drive = (withShifts) => {
    let race = startRace(newRace({ countdownSeconds: 0 }));
    let tick = 0;
    while (race.phase !== FINISHED && tick < 60 * 120) {
      if (withShifts && race.shift === null && race.vehicle.rpm >= car.optimalShiftRpm && race.vehicle.gear < 6) {
        race = shiftUp(race);
      }
      race = stepRace(race, FLOOR, TICK_SECONDS);
      tick += 1;
    }
    return race;
  };
  const skilled = drive(true);
  const lazy = drive(false);
  assertEqual(skilled.phase, FINISHED, "a shifted run must complete the quarter mile");
  assert(
    skilled.finishTime < lazy.finishTime || lazy.phase !== FINISHED,
    `shifting must be faster: shifted ${skilled.finishTime}, stuck in first ${lazy.finishTime}`,
  );
});

finish();
