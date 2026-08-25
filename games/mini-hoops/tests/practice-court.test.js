import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { createPracticeCourt } from "../scripts/practice-court.js";
import { PULL_MAX } from "../scripts/sim/constants.js";
import { restingBallPosition } from "../scripts/render/frame.js";

// The How-to-Play demo runs the real sim on a real canvas, which means the one
// thing that cannot be checked in a browser is the thing most worth checking:
// a shot has to RESOLVE and hand the ball back, or the demo silently accepts
// exactly one shot and then goes dead. That is a background-tab-shaped bug — the
// loop stops, nothing throws — so it is pinned here instead.
//
// The canvas is stubbed. `tick()` never renders, so the only thing the stub owes
// is a context object that `prepareContext` can write two properties to, and the
// listener plumbing the pull uses.

suite("practice court — the demo shoots, resolves, and comes back");

function stubCanvas() {
  const listeners = new Map();
  return {
    width: 0,
    height: 0,
    getContext: () => ({}),
    addEventListener: (type, handler) => listeners.set(type, handler),
    setPointerCapture: () => {},
    // The demo reads the canvas rect through ui/pointer.js, so the stub reports
    // a 1:1 rect and pointer coordinates are canvas coordinates.
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 760 }),
    fire(type, point) {
      listeners.get(type)?.({
        pointerId: 1,
        clientX: point.x,
        clientY: point.y,
        preventDefault: () => {},
      });
    },
  };
}

function harness() {
  const canvas = stubCanvas();
  const said = [];
  let power = 0;
  let tally = { made: 0, taken: 0 };

  const court = createPracticeCourt(canvas, {
    assets: { backdrop: () => null, ballFrames: () => [] },
    onPower: (value) => {
      power = value;
    },
    onSay: (text) => said.push(text),
    onTally: (next) => {
      tally = next;
    },
  });

  return { canvas, court, said, tally: () => tally, power: () => power };
}

/** Drag straight back from the resting ball by `distance` canvas pixels. */
function shoot(harnessed, distance) {
  const rest = restingBallPosition();
  harnessed.canvas.fire("pointerdown", rest);
  harnessed.canvas.fire("pointermove", { x: rest.x, y: rest.y + distance });
  harnessed.canvas.fire("pointerup", { x: rest.x, y: rest.y + distance });
}

/** Run the demo forward until it is ready for another shot, or give up. */
function settle(court, maxTicks = 900) {
  for (let i = 0; i < maxTicks; i++) {
    court.tick();
    if (!court.isBusy()) return i;
  }
  return -1;
}

test("a pull reports power, and only power", () => {
  const h = harness();
  h.court.setActive(true);
  const rest = restingBallPosition();
  h.canvas.fire("pointerdown", rest);
  assertEqual(h.power(), 0, "grabbing the ball is not power");
  h.canvas.fire("pointermove", { x: rest.x, y: rest.y + PULL_MAX / 2 });
  assert(Math.abs(h.power() - 0.5) < 0.02, `half a pull should read ~50%, got ${h.power()}`);
});

test("a released shot resolves and the ball is handed back", () => {
  const h = harness();
  h.court.setActive(true);
  shoot(h, PULL_MAX * 0.8);
  assertEqual(h.tally().taken, 1, "the attempt is counted at release");
  assert(h.court.isBusy(), "the shot should be in the air");

  const ticks = settle(h.court);
  assert(ticks >= 0, "the shot never resolved — the demo would accept one shot and go dead");
  assertEqual(h.power(), 0, "the meter is cleared when the ball comes back");
});

test("the reference pull drops it, the same as it does in a run", () => {
  const h = harness();
  h.court.setActive(true);
  shoot(h, PULL_MAX * 0.8);
  settle(h.court);
  assertEqual(h.tally().made, 1, "the demo runs the same sim as the game, so this has to swish");
});

test("shot after shot — the demo never latches", () => {
  const h = harness();
  h.court.setActive(true);
  for (let i = 0; i < 3; i++) {
    shoot(h, PULL_MAX * 0.8);
    assert(settle(h.court) >= 0, `shot ${i + 1} never resolved`);
  }
  assertEqual(h.tally().taken, 3);
});

test("an inactive demo ignores the ball entirely", () => {
  const h = harness();
  shoot(h, PULL_MAX * 0.8);
  assertEqual(h.tally().taken, 0, "a screen that is not showing must not take shots");
});

test("reset clears the tally and any half-made pull", () => {
  const h = harness();
  h.court.setActive(true);
  shoot(h, PULL_MAX * 0.8);
  settle(h.court);
  h.court.reset();
  assertEqual(h.tally().taken, 0);
  assertEqual(h.tally().made, 0);
  assert(!h.court.isBusy(), "reset leaves a clean court");
});

test("the demo keeps no run — nothing here can reach a board", () => {
  // The guard is structural: if this file ever imports sim/run.js, a practice
  // shot could be scored and submitted, and the board key would be a lie.
  const imports = readSource()
    .split(/\r?\n/)
    .filter((line) => line.startsWith("import "))
    .join("|");
  assert(!imports.includes("sim/run.js"), "the demo must not own a run");
  assert(!imports.includes("store/"), "the demo must not touch a store");
});

function readSource() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, "..", "scripts", "practice-court.js"), "utf8");
}

finish();
