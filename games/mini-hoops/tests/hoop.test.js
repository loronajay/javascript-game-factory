import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  BACKBOARD_HEIGHT,
  BACKBOARD_RISE,
  BACKBOARD_WIDTH,
  BOARD_Z,
  HOOP_BASE_RIM_Y,
  HOOP_BASE_X,
  RIM_CENTER_Z,
} from "../scripts/sim/constants.js";
import { depthScaleAt } from "../scripts/sim/projection.js";
import {
  DEFAULT_HOOP_MODE,
  HOOP_MODES,
  HOOP_TRAVEL_BOUNDS,
  boardWorldBounds,
  hoopAt,
  hoopModeById,
  hoopModeIds,
  hoopWorldState,
} from "../scripts/sim/hoop.js";

/** Walk a mode over a long stretch and report the box its rim centre stayed in. */
function travelOf(id, seconds = 240, step = 0.01) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (let t = 0; t < seconds; t += step) {
    const hoop = hoopAt(id, t);
    box.minX = Math.min(box.minX, hoop.cx);
    box.maxX = Math.max(box.maxX, hoop.cx);
    box.minY = Math.min(box.minY, hoop.rimY);
    box.maxY = Math.max(box.maxY, hoop.rimY);
  }
  return box;
}

suite("hoop — geometry and the motion modes the player picks between");

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

test("every mode is uniquely identified and carries the copy the menu needs", () => {
  const ids = HOOP_MODES.map((mode) => mode.id);
  assertEqual(new Set(ids).size, ids.length, "an id is what a saved board key stores");
  for (const mode of HOOP_MODES) {
    assert(mode.label, `${mode.id} has no label`);
    assert(mode.hudLabel, `${mode.id} has no HUD label`);
    assert(mode.blurb, `${mode.id} has no blurb`);
  }
});

test("the default mode exists in the catalog", () => {
  assert(hoopModeById(DEFAULT_HOOP_MODE), "default mode must resolve");
  assert(hoopModeIds().includes(DEFAULT_HOOP_MODE));
});

test("an unknown mode id falls back to the default instead of throwing", () => {
  assertEqual(hoopModeById("nonsense").id, DEFAULT_HOOP_MODE);
  assertEqual(hoopModeById(undefined).id, DEFAULT_HOOP_MODE);
});

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

test("the still hoop never moves and never carries velocity", () => {
  for (const seconds of [0, 1.3, 7.9, 120]) {
    const hoop = hoopAt("still", seconds);
    assertClose(hoop.cx, HOOP_BASE_X, 1e-9);
    assertClose(hoop.rimY, HOOP_BASE_RIM_Y, 1e-9);
    assertClose(hoop.vxScreen, 0, 1e-9);
    assertClose(hoop.vyScreen, 0, 1e-9);
  }
});

test("every mode starts at the base position, so a run always opens from rest", () => {
  for (const id of hoopModeIds()) {
    const hoop = hoopAt(id, 0);
    assertClose(hoop.cx, HOOP_BASE_X, 1e-9, `${id} x at t=0`);
    assertClose(hoop.rimY, HOOP_BASE_RIM_Y, 1e-9, `${id} y at t=0`);
  }
});

test("each moving mode oscillates on the axes it advertises", () => {
  const sampled = (id, axis) => {
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 12; t += 0.02) {
      const value = axis === "x" ? hoopAt(id, t).cx : hoopAt(id, t).rimY;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return max - min;
  };

  assert(sampled("horizontal", "x") > 100, "left/right must travel horizontally");
  assertClose(sampled("horizontal", "y"), 0, 1e-9, "left/right must not drift vertically");

  assertClose(sampled("vertical", "x"), 0, 1e-9, "up/down must not drift horizontally");
  assert(sampled("vertical", "y") > 40, "up/down must travel vertically");

  assert(sampled("circle", "x") > 100, "circle must travel horizontally");
  assert(sampled("circle", "y") > 40, "circle must travel vertically");
});

test("each named pattern actually traces the shape its label promises", () => {
  // Pendulum: highest at both ends of the swing, lowest through the middle.
  const swingEnd = hoopAt("pendulum", 3.4 / 4);
  assert(Math.abs(swingEnd.cx - HOOP_BASE_X) > 90, "the swing reaches its extreme");
  assert(swingEnd.rimY < HOOP_BASE_RIM_Y - 40, "and rides up there");
  assertClose(hoopAt("pendulum", 3.4 / 2).rimY, HOOP_BASE_RIM_Y, 1e-9, "back down through centre");

  // Figure 8: y cycles twice per x cycle, so the path returns to the base point
  // halfway through the period — travelling the other way. That self-crossing is
  // the waist of the 8, and an ellipse cannot produce it.
  const halfPeriod = 5 / 2;
  for (const t of [0.4, 1.3, 2.2]) {
    assertClose(hoopAt("figure8", t).rimY, hoopAt("figure8", t + halfPeriod).rimY, 1e-9, "y repeats each half");
    assert(Math.abs(hoopAt("figure8", t).cx - hoopAt("figure8", t + halfPeriod).cx) > 50, "x does not");
  }
  const waist = hoopAt("figure8", halfPeriod);
  assertClose(waist.cx, HOOP_BASE_X, 1e-9, "the path crosses itself at the base point");
  assertClose(waist.rimY, HOOP_BASE_RIM_Y, 1e-9);
  assert(waist.vxScreen * hoopAt("figure8", 0).vxScreen < 0, "and crosses going the other way");

  // Cross: there is a moment it is travelling almost purely vertically, and a
  // moment it is travelling almost purely horizontally. That swap is the shape.
  let mostVertical = 0;
  let mostHorizontal = 0;
  for (let t = 0; t < 12; t += 0.01) {
    const hoop = hoopAt("cross", t);
    const speed = Math.hypot(hoop.vxScreen, hoop.vyScreen);
    if (speed < 1) continue;
    mostVertical = Math.max(mostVertical, Math.abs(hoop.vyScreen) / speed);
    mostHorizontal = Math.max(mostHorizontal, Math.abs(hoop.vxScreen) / speed);
  }
  assert(mostVertical > 0.95, "the cross must have a vertical stroke");
  assert(mostHorizontal > 0.95, "and a horizontal one");

  // Wander: two incommensurate rhythms, so it must not repeat on any short loop.
  for (const loop of [3, 5, 5.6, 7, 11]) {
    const drift = Math.abs(hoopAt("wander", 2.1).cx - hoopAt("wander", 2.1 + loop).cx);
    assert(drift > 1, `wander repeated itself after ${loop}s, which defeats the point`);
  }
});

test("no mode travels outside the box the mobile portrait crop can show", () => {
  // A rim that leaves this box is invisible on a phone and perfectly fine on the
  // desktop browser it would be authored in — which is exactly why it is a test.
  for (const id of hoopModeIds()) {
    const box = travelOf(id);
    assert(box.minX >= HOOP_TRAVEL_BOUNDS.minX, `${id} travels off the left (${box.minX})`);
    assert(box.maxX <= HOOP_TRAVEL_BOUNDS.maxX, `${id} travels off the right (${box.maxX})`);
    assert(box.minY >= HOOP_TRAVEL_BOUNDS.minY, `${id} travels above the crop (${box.minY})`);
    assert(box.maxY <= HOOP_TRAVEL_BOUNDS.maxY, `${id} travels below the crop (${box.maxY})`);
  }
});

test("reported velocity matches the actual motion of the rim", () => {
  // Velocity is what collisions resolve against. If it disagrees with the path,
  // a ball bounces off a rim that is not where the maths thinks it is.
  const h = 1e-5;
  for (const id of hoopModeIds()) {
    for (const t of [0.31, 1.77, 3.05]) {
      const before = hoopAt(id, t - h);
      const after = hoopAt(id, t + h);
      const now = hoopAt(id, t);
      assertClose(now.vxScreen, (after.cx - before.cx) / (2 * h), 1e-3, `${id} vx at ${t}`);
      assertClose(now.vyScreen, (after.rimY - before.rimY) / (2 * h), 1e-3, `${id} vy at ${t}`);
    }
  }
});

test("motion is a pure function of elapsed time, so a replay lands identically", () => {
  for (const id of hoopModeIds()) {
    const a = hoopAt(id, 2.5);
    const b = hoopAt(id, 2.5);
    assertClose(a.cx, b.cx, 0);
    assertClose(a.rimY, b.rimY, 0);
  }
});

// ---------------------------------------------------------------------------
// Derived geometry
// ---------------------------------------------------------------------------

test("rim and backboard stay centred on the hoop wherever it travels", () => {
  const hoop = hoopAt("circle", 1.9);
  assertClose((hoop.left + hoop.right) / 2, hoop.cx, 1e-9, "rim straddles the centre");
  assertClose(hoop.boardX + BACKBOARD_WIDTH / 2, hoop.boardCx, 1e-9, "board straddles its own centre");
  assertEqual(hoop.boardW, BACKBOARD_WIDTH);
  assertEqual(hoop.boardH, BACKBOARD_HEIGHT);
  assert(hoop.boardY < hoop.rimY, "the backboard hangs above the rim");
});

test("at rest the board is exactly behind the rim, however the mode is authored", () => {
  for (const id of hoopModeIds()) {
    const hoop = hoopAt(id, 0);
    assertClose(hoop.boardCx, hoop.cx, 1e-9, `${id} opens with the board behind the rim`);
    assertClose(hoop.boardY, hoop.rimY - BACKBOARD_RISE, 1e-9, `${id} opens at the calibrated rise`);
  }
});

test("the deeper backboard parallaxes: it lags the rim, in the same direction, by one fixed ratio", () => {
  // The board is bolted to the rim. One rigid object moving through the room
  // covers the same WORLD distance at both depths, which is fewer SCREEN pixels
  // at the deeper one — so the board must trail the rim rather than track it
  // pixel for pixel, and must never overtake it or lead it.
  const expected = depthScaleAt(BOARD_Z) / depthScaleAt(RIM_CENTER_Z);
  assert(expected > 0 && expected < 1, "the board's plane must shrink motion, not amplify it");

  let sawTravel = false;
  for (const id of hoopModeIds()) {
    for (let t = 0; t < 6; t += 0.31) {
      const hoop = hoopAt(id, t);
      const rimTravel = hoop.cx - HOOP_BASE_X;
      const boardTravel = hoop.boardCx - HOOP_BASE_X;
      const rimRise = hoop.rimY - HOOP_BASE_RIM_Y;
      const boardRise = hoop.boardY - (HOOP_BASE_RIM_Y - BACKBOARD_RISE);
      assertClose(boardTravel, rimTravel * expected, 1e-9, `${id} board x at ${t}`);
      assertClose(boardRise, rimRise * expected, 1e-9, `${id} board y at ${t}`);
      if (Math.abs(rimTravel) > 20) {
        sawTravel = true;
        assert(Math.abs(boardTravel) < Math.abs(rimTravel), "the board must lag");
        assert(boardTravel * rimTravel > 0, "and lag on the same side, never the other");
      }
    }
  }
  assert(sawTravel, "sampled a mode actually travelling");
});

test("the board and the rim are one rigid body, so they share one world velocity", () => {
  // They used to be handed different world velocities — the same screen speed
  // read at two depths — which is a backboard travelling through the room faster
  // than the rim welded to it, and a bank shot kicked by the difference.
  for (const id of hoopModeIds()) {
    for (let t = 0; t < 5; t += 0.37) {
      const world = hoopWorldState(hoopAt(id, t));
      assertClose(world.boardVx, world.rimVx, 1e-12, `${id} shares vx at ${t}`);
      assertClose(world.boardVy, world.rimVy, 1e-12, `${id} shares vy at ${t}`);
    }
  }
});

test("the world-space rim sits on the rim plane and moves with the screen hoop", () => {
  const still = hoopWorldState(hoopAt("still", 0));
  assertEqual(still.rimZ, RIM_CENTER_Z);
  assertClose(still.rimVx, 0, 1e-9);
  assertClose(still.rimVy, 0, 1e-9);

  // A rim travelling right on screen must travel in +x in world space, and a rim
  // travelling *down* on screen must travel in -y — screen y is inverted.
  const moving = hoopAt("horizontal", 0);
  const world = hoopWorldState(moving);
  assert(moving.vxScreen > 0, "sampled at a moment the hoop is moving right");
  assert(world.rimVx > 0, "world x must agree with screen x");
  const falling = hoopAt("vertical", 0);
  assert(falling.vyScreen > 0, "sampled at a moment the hoop is moving down-screen");
  assert(hoopWorldState(falling).rimVy < 0, "down-screen is -y in world space");
});

test("the backboard's world bounds are ordered and enclose the rim horizontally", () => {
  const hoop = hoopAt("still", 0);
  const bounds = boardWorldBounds(hoop);
  assert(bounds.minX < bounds.maxX, "x bounds ordered");
  assert(bounds.minY < bounds.maxY, "y bounds ordered");
  const rim = hoopWorldState(hoop);
  assert(bounds.minX < rim.rimX && rim.rimX < bounds.maxX, "the rim hangs under the board");
  assert(bounds.minY > rim.rimY, "the board sits above the rim in world space");
});

finish();
