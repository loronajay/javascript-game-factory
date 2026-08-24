import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  BACKBOARD_HEIGHT,
  BACKBOARD_WIDTH,
  HOOP_BASE_RIM_Y,
  HOOP_BASE_X,
  RIM_CENTER_Z,
} from "../scripts/sim/constants.js";
import {
  DEFAULT_HOOP_MODE,
  HOOP_MODES,
  boardWorldBounds,
  hoopAt,
  hoopModeById,
  hoopModeIds,
  hoopWorldState,
} from "../scripts/sim/hoop.js";

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
  assertClose(hoop.boardX + BACKBOARD_WIDTH / 2, hoop.cx, 1e-9, "board straddles the centre");
  assertEqual(hoop.boardW, BACKBOARD_WIDTH);
  assertEqual(hoop.boardH, BACKBOARD_HEIGHT);
  assert(hoop.boardY < hoop.rimY, "the backboard hangs above the rim");
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
