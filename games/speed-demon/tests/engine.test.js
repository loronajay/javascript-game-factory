import { suite, test, assert, assertEqual, assertClose, assertThrows, finish } from "./harness.js";

import { DEFAULT_CAR, TICK_SECONDS } from "../scripts/sim/constants.js";
import {
  createCarState,
  rpmForSpeed,
  speedForRpm,
  torqueAt,
  driveForceAt,
  resistanceAt,
  stepCar,
} from "../scripts/sim/engine.js";

suite("engine — drivetrain and integration");

const car = DEFAULT_CAR;

// ---------------------------------------------------------------------------
// RPM is derived from speed and gear, never integrated on its own. This is what
// makes the post-shift RPM drop fall out of the model instead of being faked.
// ---------------------------------------------------------------------------

test("rpm rises with road speed in a fixed gear", () => {
  const slow = rpmForSpeed(car, 1, 8);
  const fast = rpmForSpeed(car, 1, 16);
  assert(fast > slow, "more speed must mean more rpm");
  assertClose(fast / slow, 2, 0.001, "rpm should be linear in speed");
});

test("rpm drops when the same road speed is carried in a taller gear", () => {
  const inSecond = rpmForSpeed(car, 2, 20);
  const inThird = rpmForSpeed(car, 3, 20);
  assert(inThird < inSecond, "a taller gear must drop the revs");
});

test("rpm never falls below idle", () => {
  assertEqual(rpmForSpeed(car, 1, 0), car.idleRpm);
  assert(rpmForSpeed(car, 6, 0.5) >= car.idleRpm);
});

test("rpm matches the drivetrain maths rather than a fudge factor", () => {
  // wheel rad/s -> engine rad/s -> rpm
  const speed = 20;
  const expected = (speed / car.wheelRadius) * car.gearRatios[3] * car.finalDrive * (60 / (2 * Math.PI));
  assertClose(rpmForSpeed(car, 3, speed), expected, 0.001);
});

test("speedForRpm is the inverse of rpmForSpeed", () => {
  const speed = speedForRpm(car, 4, 5200);
  assertClose(rpmForSpeed(car, 4, speed), 5200, 0.001);
});

test("an unknown gear is rejected rather than silently producing NaN", () => {
  assertThrows(() => rpmForSpeed(car, 9, 20));
});

// ---------------------------------------------------------------------------
// Torque curve
// ---------------------------------------------------------------------------

test("torque peaks at the car's peak-torque rpm", () => {
  const peak = torqueAt(car, car.peakTorqueRpm);
  assertClose(peak, car.peakTorqueNm, 0.001);
  assert(torqueAt(car, car.peakTorqueRpm - 1500) < peak, "torque should be lower below the peak");
  assert(torqueAt(car, car.peakTorqueRpm + 1500) < peak, "torque should be lower above the peak");
});

test("holding a gear to the redline genuinely costs torque", () => {
  assert(torqueAt(car, car.redlineRpm) < torqueAt(car, car.optimalShiftRpm) * 1.05);
  assert(torqueAt(car, car.redlineRpm) < torqueAt(car, car.peakTorqueRpm));
});

test("torque never collapses to zero inside the usable range", () => {
  const floor = car.peakTorqueNm * car.minTorqueFactor;
  assert(torqueAt(car, car.idleRpm) >= floor);
  assert(torqueAt(car, car.redlineRpm) >= floor);
});

test("the rev limiter cuts drive force entirely", () => {
  assert(driveForceAt(car, 1, car.limiterRpm + 1) === 0, "past the limiter the engine must stop pulling");
  assert(driveForceAt(car, 1, car.limiterRpm - 200) > 0);
});

// ---------------------------------------------------------------------------
// Forces
// ---------------------------------------------------------------------------

test("a shorter gear multiplies drive force", () => {
  assert(driveForceAt(car, 1, 4800) > driveForceAt(car, 6, 4800), "first gear must out-pull sixth");
});

test("drive force is capped by available traction", () => {
  assertEqual(driveForceAt(car, 1, car.peakTorqueRpm), car.maxTractionForce);
});

test("drag grows with the square of speed", () => {
  const at10 = resistanceAt(car, 10);
  const at20 = resistanceAt(car, 20);
  assert(at20 > at10 * 2, "quadratic drag must outgrow linear rolling resistance");
});

test("a stationary car has no resistance", () => {
  assertEqual(resistanceAt(car, 0), 0);
});

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

const drive = { throttle: 1, clutchEngaged: true, forceMultiplier: 1 };
const coast = { throttle: 0, clutchEngaged: false, forceMultiplier: 1 };

test("a new car state sits still in first gear at idle", () => {
  const state = createCarState(car);
  assertEqual(state.gear, 1);
  assertEqual(state.speed, 0);
  assertEqual(state.distance, 0);
  assertEqual(state.rpm, car.idleRpm);
});

test("full throttle accelerates the car and covers ground", () => {
  let state = createCarState(car);
  for (let i = 0; i < 60; i += 1) {
    state = stepCar(car, state, drive, TICK_SECONDS);
  }
  assert(state.speed > 5, `expected real acceleration after one second, got ${state.speed} m/s`);
  assert(state.distance > 0, "distance must accumulate");
  assert(state.rpm > car.idleRpm, "revs must climb with speed");
});

test("declutching kills drive force so the car bleeds speed", () => {
  let state = createCarState(car);
  for (let i = 0; i < 60; i += 1) {
    state = stepCar(car, state, drive, TICK_SECONDS);
  }
  const entrySpeed = state.speed;
  for (let i = 0; i < 30; i += 1) {
    state = stepCar(car, state, coast, TICK_SECONDS);
  }
  assert(state.speed < entrySpeed, "time spent in the gate must cost speed");
  assert(state.distance > 0, "a coasting car still travels");
});

test("a coasting car never reverses", () => {
  let state = createCarState(car, { speed: 0.4 });
  for (let i = 0; i < 600; i += 1) {
    state = stepCar(car, state, coast, TICK_SECONDS);
  }
  assert(state.speed >= 0, `speed must not go negative, got ${state.speed}`);
});

test("the force multiplier from a shift grade changes acceleration", () => {
  const base = createCarState(car, { speed: 20, gear: 3 });
  const plain = stepCar(car, base, drive, TICK_SECONDS);
  const boosted = stepCar(car, base, { ...drive, forceMultiplier: 1.15 }, TICK_SECONDS);
  assert(boosted.speed > plain.speed, "a better grade must accelerate harder");
});

test("speed converges on a terminal velocity instead of climbing forever", () => {
  let state = createCarState(car, { gear: 6, speed: 40 });
  for (let i = 0; i < 60 * 60; i += 1) {
    state = stepCar(car, state, drive, TICK_SECONDS);
  }
  const settled = state.speed;
  for (let i = 0; i < 60; i += 1) {
    state = stepCar(car, state, drive, TICK_SECONDS);
  }
  assertClose(state.speed, settled, 0.05, "drag should balance drive at top speed");
});

test("the car cannot exceed its limiter in any gear", () => {
  let state = createCarState(car, { gear: 1 });
  for (let i = 0; i < 60 * 30; i += 1) {
    state = stepCar(car, state, drive, TICK_SECONDS);
  }
  assert(state.rpm <= car.limiterRpm + 1, `rpm ran away to ${state.rpm}`);
});

test("stepCar is pure — it neither mutates nor aliases its input", () => {
  const state = createCarState(car, { speed: 12, gear: 2 });
  const before = { ...state };
  const next = stepCar(car, state, drive, TICK_SECONDS);
  assertEqual(state.speed, before.speed, "input state must be untouched");
  assertEqual(state.distance, before.distance);
  assert(next !== state, "a new state object should be returned");
});

test("stepping is deterministic for identical inputs", () => {
  const run = () => {
    let state = createCarState(car);
    for (let i = 0; i < 300; i += 1) {
      state = stepCar(car, state, drive, TICK_SECONDS);
    }
    return state;
  };
  const a = run();
  const b = run();
  assertEqual(a.speed, b.speed, "identical input must give identical output");
  assertEqual(a.distance, b.distance);
  assertEqual(a.rpm, b.rpm);
});

test("a gear change drops the revs at unchanged road speed", () => {
  const inSecond = createCarState(car, { gear: 2, speed: 24 });
  const inThird = createCarState(car, { gear: 3, speed: 24 });
  assert(inThird.rpm < inSecond.rpm, "shifting up must drop the needle");
});

finish();
