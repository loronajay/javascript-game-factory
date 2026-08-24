import { suite, test, assert, assertClose, finish } from "./harness.js";

import {
  BALL_MIN_SCREEN_RADIUS,
  BALL_SCREEN_RADIUS,
  FLOOR_SCREEN_Y,
  PROJECTION_ORIGIN_X,
  RIM_CENTER_Z,
} from "../scripts/sim/constants.js";
import {
  ballScreenRadius,
  depthScaleAt,
  floorScreenY,
  projectPoint,
  screenToWorldAtZ,
} from "../scripts/sim/projection.js";

suite("projection — the single owner of world <-> screen arithmetic");

test("the world origin sits on the floor line at the centre of the canvas", () => {
  const p = projectPoint({ x: 0, y: 0, z: 0 });
  assertClose(p.x, PROJECTION_ORIGIN_X, 1e-9);
  assertClose(p.y, FLOOR_SCREEN_Y, 1e-9);
});

test("depth scale is 1 at the camera plane and shrinks with distance", () => {
  assertClose(depthScaleAt(0), 1, 1e-9);
  assert(depthScaleAt(0.5) < 1, "half depth must shrink");
  assert(depthScaleAt(1) < depthScaleAt(0.5), "further must shrink more");
});

test("the floor line rises toward the horizon as depth grows", () => {
  assert(floorScreenY(1) < floorScreenY(0), "a distant floor point draws higher on screen");
});

test("height moves a point up the screen, and less so with distance", () => {
  const near = FLOOR_SCREEN_Y - projectPoint({ x: 0, y: 1, z: 0 }).y;
  const far = floorScreenY(1) - projectPoint({ x: 0, y: 1, z: 1 }).y;
  assert(far < near, "the same world height covers fewer pixels further away");
});

test("screenToWorldAtZ inverts projectPoint on the plane it is given", () => {
  for (const z of [0, 0.4, RIM_CENTER_Z, 1]) {
    for (const point of [
      { x: 0, y: 0 },
      { x: 0.7, y: 1.4 },
      { x: -0.55, y: 0.3 },
    ]) {
      const screen = projectPoint({ ...point, z });
      const back = screenToWorldAtZ(screen.x, screen.y, z);
      assertClose(back.x, point.x, 1e-9, `x round trip at z=${z}`);
      assertClose(back.y, point.y, 1e-9, `y round trip at z=${z}`);
    }
  }
});

test("the drawn ball shrinks with depth but never below the legibility floor", () => {
  assertClose(ballScreenRadius(0), BALL_SCREEN_RADIUS, 1e-9);
  assert(ballScreenRadius(1) < BALL_SCREEN_RADIUS, "a distant ball draws smaller");
  assert(ballScreenRadius(50) >= BALL_MIN_SCREEN_RADIUS, "never smaller than the floor");
});

test("depth is clamped, so a ball behind the camera cannot invert the projection", () => {
  assert(depthScaleAt(-99) > 0, "scale stays positive below the clamp");
  assert(Number.isFinite(projectPoint({ x: 0, y: 0, z: -99 }).x), "no infinities escape");
});

finish();
