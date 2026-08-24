import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  GRAVITY,
  HOOP_BASE_RIM_Y,
  HOOP_BASE_X,
  MAX_EXIT_VY,
  MIN_EXIT_VY,
  REFERENCE_POWER,
  RIM_CENTER_Z,
} from "../scripts/sim/constants.js";
import { screenToWorldAtZ } from "../scripts/sim/projection.js";
import { entryVelocityForLoft, launchSpin, solveLaunch, trajectoryPoints } from "../scripts/sim/launch.js";

suite("launch — the backward solve that makes the power meter honest");

const origin = { x: 0, y: 0.1, z: 0 };
const centreAim = { x: HOOP_BASE_X, y: HOOP_BASE_RIM_Y + 2 };
const shoot = (power, loft = 1, aim = centreAim) => solveLaunch({ origin, aim, power, loft });

/** Integrate the launch analytically to where it crosses the rim plane. */
function stateAtRimPlane(launch) {
  const t = (RIM_CENTER_Z - origin.z) / launch.vz;
  return {
    t,
    x: origin.x + launch.vx * t,
    y: origin.y + launch.vy * t - 0.5 * GRAVITY * t * t,
    vy: launch.vy - GRAVITY * t,
  };
}

// ---------------------------------------------------------------------------
// The reference shot
// ---------------------------------------------------------------------------

test("a pull at the reference power lands exactly on the reticle", () => {
  const launch = shoot(REFERENCE_POWER);
  const target = screenToWorldAtZ(centreAim.x, centreAim.y, RIM_CENTER_Z);
  const arrival = stateAtRimPlane(launch);
  assertClose(arrival.x, target.x, 1e-9, "horizontal");
  assertClose(arrival.y, target.y, 1e-9, "vertical");
});

test("the reference shot arrives with exactly the descent its loft asked for", () => {
  for (const loft of [0, 0.35, 1]) {
    const launch = shoot(REFERENCE_POWER, loft);
    assertClose(stateAtRimPlane(launch).vy, entryVelocityForLoft(loft), 1e-9, `loft ${loft}`);
  }
});

test("power scale is exactly the ratio to the reference, with no hidden curve", () => {
  assertClose(shoot(REFERENCE_POWER).powerScale, 1, 1e-9);
  assertClose(shoot(1).powerScale, 1 / REFERENCE_POWER, 1e-9, "full power is 25% over the reference");
  assertClose(shoot(REFERENCE_POWER / 2).powerScale, 0.5, 1e-9, "half the reference is half the velocity");
});

test("velocity scales linearly with power on every axis", () => {
  const half = shoot(0.4);
  const full = shoot(0.8);
  assertClose(full.vx / 2, half.vx, 1e-9);
  assertClose(full.vy / 2, half.vy, 1e-9);
  assertClose(full.vz / 2, half.vz, 1e-9);
});

test("under-pulling falls short and over-pulling sails long", () => {
  const target = screenToWorldAtZ(centreAim.x, centreAim.y, RIM_CENTER_Z);
  // Compare where each shot is when it reaches the rim's DEPTH — a weak shot
  // gets there later and lower, a strong one sooner and higher.
  assert(stateAtRimPlane(shoot(0.6)).y < target.y, "a soft shot is below the rim by then");
  assert(stateAtRimPlane(shoot(1)).y > target.y, "a hard shot is above it");
});

// ---------------------------------------------------------------------------
// Loft
// ---------------------------------------------------------------------------

test("loft spans exactly the authored entry-velocity window", () => {
  assertClose(entryVelocityForLoft(0), MIN_EXIT_VY, 1e-9);
  assertClose(entryVelocityForLoft(1), MAX_EXIT_VY, 1e-9);
  assertClose(entryVelocityForLoft(0.5), (MIN_EXIT_VY + MAX_EXIT_VY) / 2, 1e-9);
});

test("loft outside 0..1 is clamped rather than extrapolated into nonsense", () => {
  assertClose(entryVelocityForLoft(-5), MIN_EXIT_VY, 1e-9);
  assertClose(entryVelocityForLoft(9), MAX_EXIT_VY, 1e-9);
});

test("more loft is a steeper, slower-crossing arc", () => {
  const flat = shoot(REFERENCE_POWER, 0);
  const steep = shoot(REFERENCE_POWER, 1);
  assert(steep.flightTime > flat.flightTime, "a lofted ball hangs longer");
  assert(steep.vy > flat.vy, "and leaves the hand faster upward");
  assert(steep.vz < flat.vz, "while travelling toward the wall more slowly");
});

// ---------------------------------------------------------------------------
// Aim
// ---------------------------------------------------------------------------

test("the shot goes where the reticle is, with no correction toward the hoop", () => {
  const target = screenToWorldAtZ(centreAim.x + 90, centreAim.y, RIM_CENTER_Z);
  const launch = solveLaunch({ origin, aim: { x: centreAim.x + 90, y: centreAim.y }, power: REFERENCE_POWER, loft: 1 });
  assertClose(stateAtRimPlane(launch).x, target.x, 1e-9, "no aim assist");
  assert(launch.vx > 0, "aiming right sends the ball right");
});

// ---------------------------------------------------------------------------
// Degenerate input
// ---------------------------------------------------------------------------

test("a zero-power pull produces a dead ball, not a NaN", () => {
  const launch = shoot(0);
  for (const axis of ["vx", "vy", "vz"]) {
    assert(Number.isFinite(launch[axis]), `${axis} is not finite`);
    assertClose(launch[axis], 0, 1e-12);
  }
});

test("a reticle level with or below the ball still yields a real solution", () => {
  // The screen y here is far below the rim, i.e. a target at or under the ball.
  const launch = solveLaunch({ origin, aim: { x: HOOP_BASE_X, y: 900 }, power: 0.8, loft: 1 });
  for (const axis of ["vx", "vy", "vz"]) {
    assert(Number.isFinite(launch[axis]), `${axis} is not finite`);
  }
  assert(launch.flightTime > 0, "flight time stays positive");
});

test("power outside 0..1 is clamped rather than trusted", () => {
  assertEqual(shoot(5).power, 1);
  assertEqual(shoot(-3).power, 0);
});

// ---------------------------------------------------------------------------
// Spin
// ---------------------------------------------------------------------------

test("a thrown ball carries forward roll, and more of it at higher loft", () => {
  assert(launchSpin(shoot(0.8, 1)) > 0, "a shot toward the wall rolls forward");
  const flat = shoot(REFERENCE_POWER, 0);
  const steep = shoot(REFERENCE_POWER, 1);
  // Normalise out the differing depth speed to isolate the loft term itself.
  assert(launchSpin(steep) / steep.vz > launchSpin(flat) / flat.vz, "loft adds spin per unit of travel");
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

test("the preview traces the real ballistic path from the real origin", () => {
  const launch = shoot(REFERENCE_POWER);
  const points = trajectoryPoints(origin, launch, { step: 0.05 });
  assert(points.length > 3, "a preview worth drawing");
  const t = 0.05;
  assertClose(points[0].x, origin.x + launch.vx * t, 1e-9);
  assertClose(points[0].y, origin.y + launch.vy * t - 0.5 * GRAVITY * t * t, 1e-9);
  assertClose(points[0].z, origin.z + launch.vz * t, 1e-9);
});

test("the preview stops around the rim plane instead of drawing the whole arc", () => {
  const launch = shoot(REFERENCE_POWER);
  const points = trajectoryPoints(origin, launch);
  const last = points[points.length - 1];
  assert(last.z <= RIM_CENTER_Z * 1.15, "the preview does not run on past the hoop");
});

test("a dead-stopped shot still returns a drawable, finite preview", () => {
  const points = trajectoryPoints(origin, shoot(0));
  for (const point of points) {
    assert(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));
  }
});

finish();
