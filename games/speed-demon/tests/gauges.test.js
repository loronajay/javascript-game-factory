import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { DEFAULT_CAR, PERFECT_RPM_WINDOW } from "../scripts/sim/constants.js";
import {
  TACH_SWEEP,
  needleAngle,
  gaugeTicks,
  smoothToward,
  shiftLightState,
  SHIFT_LIGHT_OFF,
  SHIFT_LIGHT_ARMED,
  SHIFT_LIGHT_OVER,
} from "../scripts/ui/gauges.js";

suite("gauges — needle mapping and shift light");

const sweep = { min: 0, max: 8000, startAngle: TACH_SWEEP.startAngle, endAngle: TACH_SWEEP.endAngle };

// ---------------------------------------------------------------------------
// Needle mapping
// ---------------------------------------------------------------------------

test("the needle rests at the start of the sweep for a minimum value", () => {
  assertClose(needleAngle(0, sweep), sweep.startAngle, 1e-9);
});

test("the needle reaches the end of the sweep at maximum", () => {
  assertClose(needleAngle(8000, sweep), sweep.endAngle, 1e-9);
});

test("half scale is half sweep", () => {
  assertClose(needleAngle(4000, sweep), (sweep.startAngle + sweep.endAngle) / 2, 1e-9);
});

test("the needle never leaves the dial", () => {
  assertClose(needleAngle(-5000, sweep), sweep.startAngle, 1e-9);
  assertClose(needleAngle(999999, sweep), sweep.endAngle, 1e-9);
});

test("a degenerate scale parks the needle instead of producing NaN", () => {
  const angle = needleAngle(50, { ...sweep, min: 100, max: 100 });
  assert(Number.isFinite(angle), "a zero-width scale must not divide by zero");
  assertClose(angle, sweep.startAngle, 1e-9);
});

test("the sweep travels clockwise across the bottom of the dial", () => {
  assert(sweep.endAngle > sweep.startAngle, "angle must increase across the sweep");
  assert(sweep.endAngle - sweep.startAngle < 2 * Math.PI, "a gauge should not wrap on itself");
});

// ---------------------------------------------------------------------------
// Tick marks
// ---------------------------------------------------------------------------

test("major ticks land on every step from min to max inclusive", () => {
  const ticks = gaugeTicks({ ...sweep, majorStep: 1000 }).filter((tick) => tick.major);
  assertEqual(ticks.length, 9);
  assertEqual(ticks[0].value, 0);
  assertEqual(ticks[8].value, 8000);
});

test("minor ticks fill in between the majors without duplicating them", () => {
  const ticks = gaugeTicks({ ...sweep, majorStep: 1000, minorStep: 500 });
  const values = ticks.map((tick) => tick.value);
  assertEqual(new Set(values).size, values.length, "no value should appear twice");
  assertEqual(ticks.filter((tick) => tick.major).length, 9);
  assertEqual(ticks.filter((tick) => !tick.major).length, 8);
});

test("ticks come back in ascending order with matching angles", () => {
  const ticks = gaugeTicks({ ...sweep, majorStep: 1000, minorStep: 500 });
  for (let i = 1; i < ticks.length; i += 1) {
    assert(ticks[i].value > ticks[i - 1].value, "values must ascend");
    assert(ticks[i].angle > ticks[i - 1].angle, "angles must ascend with them");
  }
  assertClose(ticks[0].angle, sweep.startAngle, 1e-9);
});

test("omitting a minor step yields majors only", () => {
  const ticks = gaugeTicks({ ...sweep, majorStep: 2000 });
  assertEqual(ticks.length, 5);
  assert(ticks.every((tick) => tick.major));
});

// ---------------------------------------------------------------------------
// Needle smoothing — the sweep that makes a gauge feel analog
// ---------------------------------------------------------------------------

test("a needle moves toward its target", () => {
  const next = smoothToward(1000, 5000, 8, 1 / 60);
  assert(next > 1000 && next < 5000, `expected partial travel, got ${next}`);
});

test("a needle never overshoots, however large the step", () => {
  assertClose(smoothToward(1000, 5000, 8, 100), 5000, 1);
  assert(smoothToward(5000, 1000, 8, 100) >= 1000);
});

test("a needle settles on its target rather than creeping forever", () => {
  let value = 0;
  for (let i = 0; i < 600; i += 1) {
    value = smoothToward(value, 6000, 12, 1 / 60);
  }
  assertClose(value, 6000, 1);
});

test("a zero timestep leaves the needle alone", () => {
  assertEqual(smoothToward(2500, 7000, 8, 0), 2500);
});

test("smoothing is symmetric on the way down", () => {
  const next = smoothToward(7000, 2000, 8, 1 / 60);
  assert(next < 7000 && next > 2000);
});

// ---------------------------------------------------------------------------
// Shift light — the only HUD element that gives timing away, so it must agree
// with the grading windows exactly
// ---------------------------------------------------------------------------

const car = DEFAULT_CAR;

test("the shift light is dark well below the shift point", () => {
  assertEqual(shiftLightState(car, 3000), SHIFT_LIGHT_OFF);
});

test("the shift light arms across the perfect window", () => {
  assertEqual(shiftLightState(car, car.optimalShiftRpm), SHIFT_LIGHT_ARMED);
});

test("the shift light warns once the perfect window has passed", () => {
  assertEqual(shiftLightState(car, car.limiterRpm), SHIFT_LIGHT_OVER);
});

test("the light arms exactly where a perfect grade begins, not a moment early", () => {
  const armsAt = car.optimalShiftRpm - PERFECT_RPM_WINDOW;
  assertEqual(shiftLightState(car, armsAt - 1), SHIFT_LIGHT_OFF);
  assertEqual(shiftLightState(car, armsAt), SHIFT_LIGHT_ARMED);
});

test("the light stops promising a perfect shift once the window closes", () => {
  const closesAt = car.optimalShiftRpm + PERFECT_RPM_WINDOW;
  assertEqual(shiftLightState(car, closesAt), SHIFT_LIGHT_ARMED);
  assertEqual(shiftLightState(car, closesAt + 1), SHIFT_LIGHT_OVER);
});

finish();
