import { suite, test, assert, assertEqual, assertThrows, finish } from "./harness.js";

import { LAUNCH_PERFECT_WINDOW, LAUNCH_GOOD_WINDOW } from "../scripts/sim/constants.js";
import {
  LAUNCH_HOLESHOT,
  LAUNCH_GOOD,
  LAUNCH_LATE,
  LAUNCH_FOUL,
  gradeLaunch,
  launchEffectsFor,
} from "../scripts/sim/launch.js";

suite("launch — reaction time and the red light");

// ---------------------------------------------------------------------------
// Reaction windows
// ---------------------------------------------------------------------------

test("leaving the instant the bulb goes green is a holeshot", () => {
  assertEqual(gradeLaunch(0), LAUNCH_HOLESHOT);
});

test("the holeshot window has real width", () => {
  assertEqual(gradeLaunch(LAUNCH_PERFECT_WINDOW), LAUNCH_HOLESHOT);
  assertEqual(gradeLaunch(LAUNCH_PERFECT_WINDOW / 2), LAUNCH_HOLESHOT);
});

test("a hair past the holeshot window is merely a good launch", () => {
  assertEqual(gradeLaunch(LAUNCH_PERFECT_WINDOW + 0.001), LAUNCH_GOOD);
});

test("the good window closes where it says it does", () => {
  assertEqual(gradeLaunch(LAUNCH_GOOD_WINDOW), LAUNCH_GOOD);
  assertEqual(gradeLaunch(LAUNCH_GOOD_WINDOW + 0.001), LAUNCH_LATE);
});

test("sleeping on the light is a late launch, not a foul", () => {
  assertEqual(gradeLaunch(2.5), LAUNCH_LATE);
});

// ---------------------------------------------------------------------------
// Fouls
// ---------------------------------------------------------------------------

test("jumping the light is a foul however good the reaction looks", () => {
  assertEqual(gradeLaunch(0, { falseStart: true }), LAUNCH_FOUL);
  assertEqual(gradeLaunch(2.5, { falseStart: true }), LAUNCH_FOUL);
});

test("a negative reaction time is a foul by definition", () => {
  // Throttle before the green cannot produce an honest reaction time.
  assertEqual(gradeLaunch(-0.05), LAUNCH_FOUL);
});

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

test("a holeshot pulls harder off the line than a good launch", () => {
  assert(launchEffectsFor(LAUNCH_HOLESHOT).forceMultiplier > launchEffectsFor(LAUNCH_GOOD).forceMultiplier);
  assert(launchEffectsFor(LAUNCH_GOOD).forceMultiplier > 1, "a good launch should still be a reward");
});

test("a late launch is neutral — the lost time is the punishment", () => {
  assertEqual(launchEffectsFor(LAUNCH_LATE).forceMultiplier, 1);
  assertEqual(launchEffectsFor(LAUNCH_LATE).boostSeconds, 0);
});

test("a foul actively bogs the car", () => {
  const foul = launchEffectsFor(LAUNCH_FOUL);
  assert(foul.forceMultiplier < 1, "a red light must cost real acceleration");
  assert(foul.boostSeconds > 0, "the bog needs a duration to bite");
});

test("the reward windows are ordered holeshot then good then late", () => {
  const order = [LAUNCH_HOLESHOT, LAUNCH_GOOD, LAUNCH_LATE];
  for (let i = 1; i < order.length; i += 1) {
    assert(
      launchEffectsFor(order[i - 1]).forceMultiplier >= launchEffectsFor(order[i]).forceMultiplier,
      "launch rewards must not increase as reaction time worsens",
    );
  }
});

test("an unknown launch grade is rejected", () => {
  assertThrows(() => launchEffectsFor("rocket"));
});

finish();
