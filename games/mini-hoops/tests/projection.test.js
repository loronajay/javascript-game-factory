import { suite, test, assert, assertClose, finish } from "./harness.js";

import {
  BALL_MIN_SCREEN_RADIUS,
  BALL_SCREEN_RADIUS,
  BOARD_Z,
  FLOOR_SCREEN_Y,
  HORIZON_SCREEN_Y,
  PROJECTION_ORIGIN_X,
  RIM_CENTER_Z,
  WALL_BASE_SCREEN_Y,
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

test("the floor line and the size falloff are one camera, not two numbers", () => {
  // The bug this pins: the floor used to rise linearly with depth while sizes
  // shrank hyperbolically. Nothing was individually wrong and the room read
  // half as deep as it was painted, because no camera can do both. In a real
  // pinhole a ground point's distance below the horizon IS its depth scale, so
  // the ratio of the two has to hold at every depth.
  for (const z of [0, 0.25, 0.5, RIM_CENTER_Z, 1, 1.2]) {
    assertClose(
      (floorScreenY(z) - HORIZON_SCREEN_Y) / (FLOOR_SCREEN_Y - HORIZON_SCREEN_Y),
      depthScaleAt(z),
      1e-9,
      `floor line disagrees with the depth scale at z=${z}`,
    );
  }
});

test("the floor line stays below the horizon at every depth, clamp included", () => {
  // A ground point approaches the horizon and never reaches it — that is what a
  // horizon is, and it is why nothing standing on the floor may ever draw above
  // one. The depth clamp means the far end is `MAX_Z` rather than infinity, so
  // this is asserted across the band and at the clamp rather than in the limit.
  for (const z of [0, 0.5, 1, 1.22, 50, 1e6]) {
    assert(floorScreenY(z) > HORIZON_SCREEN_Y, `the floor line crossed the horizon at z=${z}`);
  }
  assert(floorScreenY(1e6) <= floorScreenY(1), "past the wall the floor line must not come back down");
});

test("the back wall meets the floor on the scanline the rooms are aligned to", () => {
  // BOARD_Z is the wall the physics stops the ball at, and WALL_BASE_SCREEN_Y is
  // the line every painted room is slid onto. If these two ever came apart, a
  // ball against the wall would draw somewhere out on the floor — which is
  // exactly what the old camera did, by about ninety pixels.
  assertClose(floorScreenY(BOARD_Z), WALL_BASE_SCREEN_Y, 1e-9);
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
