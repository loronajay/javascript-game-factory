import { suite, test, assert, assertClose, finish } from "./harness.js";

import {
  BALL_MIN_SCREEN_RADIUS,
  BALL_SCREEN_RADIUS,
  BOARD_Z,
  WALL_TOP_SCREEN_Y,
  FLOOR_SCREEN_Y,
  HORIZON_SCREEN_Y,
  PROJECTION_ORIGIN_X,
  RIM_CENTER_Z,
  RIM_RADIUS_WORLD,
  WALL_BASE_SCREEN_Y,
} from "../scripts/sim/constants.js";
import {
  ballScreenRadius,
  ceilingScreenY,
  depthScaleAt,
  floorScreenY,
  projectPoint,
  ringEllipseAt,
  screenToWorldAtZ,
  screenToWorldOnFloor,
  worldToScreenLength,
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

test("the ceiling closes the room, converging on the same horizon from above", () => {
  // Two horizontal planes, one camera, one vanishing line. If the ceiling ever
  // stopped mirroring the floor about the horizon it would mean the room had
  // acquired a second camera, which is the failure the whole file exists to
  // make impossible.
  for (const z of [0, 0.5, 1, 1.22]) {
    assert(ceilingScreenY(z) < HORIZON_SCREEN_Y, `the ceiling dropped below the horizon at z=${z}`);
    assert(ceilingScreenY(z) < floorScreenY(z), `the ceiling is under the floor at z=${z}`);
    assertClose(
      (HORIZON_SCREEN_Y - ceilingScreenY(z)) / (HORIZON_SCREEN_Y - ceilingScreenY(0)),
      depthScaleAt(z),
      1e-9,
      `the ceiling line disagrees with the depth scale at z=${z}`,
    );
  }
});

test("the ceiling meets the back wall on the scanline it was measured from", () => {
  // `CEILING_Y` is derived from `WALL_TOP_SCREEN_Y` through the camera, so this
  // is the round trip: the world height the physics stops the ball at draws back
  // onto the row of paint it came from.
  assertClose(ceilingScreenY(BOARD_Z), WALL_TOP_SCREEN_Y, 1e-9);
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

test("screenToWorldOnFloor makes a projected floor handle directly draggable in depth", () => {
  for (const point of [
    { x: -0.7, z: 0.08 },
    { x: 0.25, z: 0.48 },
    { x: 0.75, z: 0.94 },
  ]) {
    const screen = projectPoint({ ...point, y: 0 });
    const back = screenToWorldOnFloor(screen.x, screen.y);
    assertClose(back.x, point.x, 1e-9, `floor x round trip at z=${point.z}`);
    assertClose(back.z, point.z, 1e-9, `floor depth round trip at z=${point.z}`);
    assertClose(back.y, 0, 1e-9);
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

// ---------------------------------------------------------------------------
// Projected rings — the rim, the net's hem, and everything between
// ---------------------------------------------------------------------------

const rimAt = (screenY) => ringEllipseAt(PROJECTION_ORIGIN_X, screenY, RIM_RADIUS_WORLD);

test("a ring's width is its world radius through the camera, and does not move with height", () => {
  const wide = worldToScreenLength(RIM_RADIUS_WORLD, RIM_CENTER_Z);
  // Height changes how OPEN a ring looks, never how WIDE — the ring has not
  // moved in depth, so its horizontal extent cannot change.
  for (const screenY of [174, 222, 272, 340]) {
    assertClose(rimAt(screenY).radiusX, wide, 1e-9, `width at y=${screenY}`);
  }
});

test("a ring flattens toward eye level and opens away from it", () => {
  const high = rimAt(HORIZON_SCREEN_Y - 124);
  const rest = rimAt(HORIZON_SCREEN_Y - 76);
  const low = rimAt(HORIZON_SCREEN_Y - 26);
  assert(high.radiusY > rest.radiusY, "further above the eye is more open");
  assert(rest.radiusY > low.radiusY, "closer to the eye is flatter");
  // The swing over the rim's real travel is the whole point: drawn as a
  // constant this was wrong by better than three to one at the extremes.
  assert(high.radiusY / low.radiusY > 3, "the travel genuinely changes the shape");
});

test("a ring level with the eye is edge-on", () => {
  assertClose(rimAt(HORIZON_SCREEN_Y).radiusY, 0, 0.02, "a ring at eye level is a line");
});

test("which arc is the far one flips across eye level", () => {
  // Above the eye we see the ring's underside and its NEAR edge draws HIGHER;
  // below the eye that inverts. `render/hoop.js` reads this to decide which half
  // of the rim and net the ball passes behind, so getting it backwards puts the
  // ball on the wrong side of the cords.
  assert(rimAt(HORIZON_SCREEN_Y - 80).fromBelow, "the rim rides above eye level");
  assert(!rimAt(HORIZON_SCREEN_Y + 80).fromBelow, "a ring below eye level is seen from above");
});

test("a ring's drawn centre carries the near half's bulge", () => {
  // The near half is nearer the camera and projects larger, so the ellipse's
  // centre is not the ring's centre. Small, but it is the difference between a
  // projected circle and a drawn one.
  const ring = rimAt(222);
  assert(ring.cy !== 222, "the centre is derived, not assumed");
  assertClose(ring.cy, 222, 3, "and only by a couple of pixels");
});

test("the rim's own ring is the one the collider uses", () => {
  // The drawn rim and the rim the ball hits must be the same object. The width
  // is RIM_RADIUS_WORLD through the camera and nothing else, which is what makes
  // a ball that looks like it caught the near edge one that actually did.
  const ring = rimAt(222);
  const edge = projectPoint({ x: RIM_RADIUS_WORLD, y: 1.6, z: RIM_CENTER_Z });
  assertClose(ring.cx + ring.radiusX, edge.x, 1e-9);
});

finish();
