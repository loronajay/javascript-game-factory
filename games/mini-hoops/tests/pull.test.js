import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  AIM_MAX_X,
  AIM_MIN_X,
  AIM_RIM_Y_OFFSET,
  HOOP_BASE_RIM_Y,
  HOOP_BASE_X,
  PULL_MAX,
  PULL_MIN,
  PULL_VISUAL_GAIN,
} from "../scripts/sim/constants.js";
import { HOOP_TRAVEL_BOUNDS } from "../scripts/sim/hoop.js";
import { isShootablePull, neutralPull, resolvePull } from "../scripts/sim/pull.js";

suite("pull — turning one drag gesture into power, aim and arc");

const anchor = { x: 480, y: 675 };
const pullTo = (dx, dy) => resolvePull(anchor, { x: anchor.x + dx, y: anchor.y + dy });

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

test("a resting pull carries no power and no aim deflection", () => {
  const pull = neutralPull(anchor);
  assertClose(pull.power, 0, 1e-9);
  assertClose(pull.aimX, HOOP_BASE_X, 1e-9);
  assert(!isShootablePull(pull), "a pull that never moved is not a shot");
});

test("power scales with pull length and saturates at the maximum", () => {
  assertClose(pullTo(0, PULL_MAX / 2).power, 0.5, 1e-9);
  assertClose(pullTo(0, PULL_MAX).power, 1, 1e-9);
  assertClose(pullTo(0, PULL_MAX * 3).power, 1, 1e-9, "over-pulling cannot exceed full power");
});

test("a pull longer than the maximum is clamped in length, not just in power", () => {
  const pull = pullTo(0, PULL_MAX * 3);
  assertClose(pull.distance, PULL_MAX, 1e-9, "the drawn pull must stop at the cap too");
});

test("a tap below the minimum is not a shot", () => {
  assert(!isShootablePull(pullTo(0, PULL_MIN - 1)), "under the threshold");
  assert(isShootablePull(pullTo(0, PULL_MIN + 1)), "over the threshold");
});

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

test("the pull must go backward — dragging forward registers as no pull", () => {
  const pull = pullTo(0, -80);
  assertClose(pull.dy, 0, 1e-9, "forward travel is discarded, not inverted");
  assert(!isShootablePull(pull));
});

test("sideways travel is allowed but stays bounded by backward travel", () => {
  const pull = pullTo(200, 40);
  assert(pull.dx <= 40 * 0.9 + 1e-9, "side travel is capped against the backward component");
  assert(pull.dx > 0, "but it is not thrown away");
});

// ---------------------------------------------------------------------------
// Aim
// ---------------------------------------------------------------------------

test("aim mirrors the pull — pulling right sends the ball left", () => {
  assert(pullTo(30, 80).aimX < HOOP_BASE_X, "pull right, aim left");
  assert(pullTo(-30, 80).aimX > HOOP_BASE_X, "pull left, aim right");
});

test("a straight backward pull aims dead centre", () => {
  assertClose(pullTo(0, 90).aimX, HOOP_BASE_X, 1e-9);
});

test("aim never leaves the playable band however hard the pull is angled", () => {
  for (const dx of [-400, -120, 0, 120, 400]) {
    for (const dy of [5, 40, 105, 300]) {
      const { aimX } = pullTo(dx, dy);
      assert(aimX >= AIM_MIN_X - 1e-9 && aimX <= AIM_MAX_X + 1e-9, `aim ${aimX} out of band`);
    }
  }
});

test("the reticle reaches every position the rim can occupy", () => {
  // Not decoration: the moving modes exist to make the player LEAD the rim, and
  // a reticle that stops short of the end of the sweep can only ever meet it
  // coming back toward the middle. The band used to fall 63px short on the left.
  // Driven through the real gesture rather than read off the constants, so a
  // clamp or a ratio limit that quietly narrows the reach also fails here.
  const hardLeft = pullTo(400, 300).aimX;
  const hardRight = pullTo(-400, 300).aimX;
  assert(hardLeft <= HOOP_TRAVEL_BOUNDS.minX + 1e-9,
    `a fully angled pull reaches only ${hardLeft}, short of the rim's ${HOOP_TRAVEL_BOUNDS.minX}`);
  assert(hardRight >= HOOP_TRAVEL_BOUNDS.maxX - 1e-9,
    `a fully angled pull reaches only ${hardRight}, short of the rim's ${HOOP_TRAVEL_BOUNDS.maxX}`);
});

test("aim is anchored to the hoop's rest position, not to the moving rim", () => {
  // The reticle must not be dragged around by the target: leading a moving hoop
  // is the skill the moving modes are asking for.
  assertClose(pullTo(0, 90).aimY, HOOP_BASE_RIM_Y + AIM_RIM_Y_OFFSET, 1e-9);
});

// ---------------------------------------------------------------------------
// Loft
// ---------------------------------------------------------------------------

test("a straight backward pull is full loft, a flat pull is none", () => {
  assertClose(pullTo(0, 90).loft, 1, 1e-9, "straight back = steepest arc");
  const flat = pullTo(90, 20);
  assert(flat.loft < 1, "an angled pull flattens the arc");
  assert(flat.loft >= 0, "loft never goes negative");
});

test("loft falls monotonically as the pull is angled further sideways", () => {
  let previous = Infinity;
  for (const dx of [0, 10, 20, 30, 40, 50]) {
    const { loft } = pullTo(dx, 60);
    assert(loft <= previous + 1e-9, `loft rose at dx=${dx}`);
    previous = loft;
  }
});

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

test("the drawn ball trails the finger, leaving a visible elastic stretch", () => {
  const pull = pullTo(0, 100);
  assertClose(pull.visualY - anchor.y, 100 * PULL_VISUAL_GAIN, 1e-9);
  assert(pull.visualY < pull.y, "the finger is always further out than the ball");
});

test("resolvePull is pure — it never mutates the anchor it is handed", () => {
  const original = { x: 480, y: 675 };
  resolvePull(original, { x: 600, y: 760 });
  assertEqual(JSON.stringify(original), JSON.stringify({ x: 480, y: 675 }), "anchor was mutated");
});

finish();
