// The opponent, and the promise it makes: difficulty is hands, never physics.
//
// The stroke generator takes an injectable random source, so every case here is
// deterministic — a CPU test that relied on `Math.random` would be a test that
// fails one run in twenty and gets deleted.

import { assert, assertClose, assertEqual, finish, suite, test } from "./harness.js";
import { DEFAULT_DIFFICULTY, DIFFICULTIES, difficultyById, legalTargets, planShot, strokeFor } from "../scripts/sim/cpu.js";
import { createBall } from "../scripts/sim/balls.js";

suite("cpu — planning and difficulty");

/** A random source that returns the same value every call. 0.5 is "no error". */
const fixed = (value) => () => value;

// --- difficulty ------------------------------------------------------------

test("difficulty rungs get progressively steadier hands", () => {
  const [casual, club, sharp] = DIFFICULTIES;
  assert(casual.aimError > club.aimError, "casual should be shakier than club");
  assert(club.aimError > sharp.aimError, "club should be shakier than sharp");
  assert(casual.powerError > sharp.powerError);
});

test("difficulty never changes the physics, only the hands", () => {
  // The guard on the repo rule. If a rung ever grows a field that is not about
  // execution, this test is where it must be argued for.
  const allowed = new Set(["id", "label", "aimError", "powerError", "cutFloor", "thinkMs"]);
  for (const rung of DIFFICULTIES) {
    for (const key of Object.keys(rung)) {
      assert(allowed.has(key), `"${key}" on ${rung.id} is not an execution knob — is the CPU being given a better table?`);
    }
  }
});

test("an unknown difficulty falls back rather than throwing", () => {
  assertEqual(difficultyById("impossible").id, DEFAULT_DIFFICULTY);
  assertEqual(difficultyById(undefined).id, DEFAULT_DIFFICULTY);
});

// --- targets ---------------------------------------------------------------

test("an open table lets the CPU shoot at anything but the 8", () => {
  const balls = [createBall(0, -1, 0), createBall(3, 0, 0), createBall(11, 0.2, 0), createBall(8, 0.4, 0)];
  const targets = legalTargets(balls, null).map((ball) => ball.n).sort((a, b) => a - b);
  assertEqual(targets.join(","), "3,11");
});

test("with a group the CPU only shoots at its own", () => {
  const balls = [createBall(0, -1, 0), createBall(3, 0, 0), createBall(11, 0.2, 0), createBall(8, 0.4, 0)];
  assertEqual(legalTargets(balls, "solid").map((ball) => ball.n).join(","), "3");
  assertEqual(legalTargets(balls, "stripe").map((ball) => ball.n).join(","), "11");
});

test("a cleared group makes the 8 the only target", () => {
  const balls = [createBall(0, -1, 0), createBall(11, 0.2, 0), createBall(8, 0.4, 0)];
  const targets = legalTargets(balls, "solid");
  assertEqual(targets.length, 1);
  assertEqual(targets[0].n, 8, "with solids gone, the 8 is the shot — and the rules agree");
});

test("pocketed balls are never targets", () => {
  const balls = [createBall(0, -1, 0), createBall(3, 0, 0)];
  balls[1].pocketed = true;
  assertEqual(legalTargets(balls, "solid").length, 0);
});

// --- planning --------------------------------------------------------------

test("with no legal target the CPU still finds a stroke rather than stalling", () => {
  // Open table cleared to the 8: legal targets is empty, but a plan of null
  // means the CPU never shoots and the turn hangs forever.
  const balls = [createBall(0, -1, 0), createBall(8, 0.4, 0)];
  const plan = planShot(balls, null);
  assert(plan !== null, "expected a fallback plan");
  assertEqual(plan.target.n, 8);
});

test("a hanger straight into a corner is found", () => {
  // The 1 sitting on the line between the cue ball and the foot-left corner.
  const balls = [createBall(0, -1, -0.5), createBall(1, 0.9, -0.58)];
  const plan = planShot(balls, "solid");
  assert(plan, "expected a plan");
  assertEqual(plan.target.n, 1);
  assert(plan.pocket, "a clear hanger should be planned into a pocket, not rolled at");
});

test("a blocked line is not planned through", () => {
  // The 1 is potable, but the 2 sits squarely between it and every route.
  const balls = [createBall(0, -1, 0), createBall(1, 0, 0), createBall(2, -0.5, 0)];
  const plan = planShot(balls, "solid");
  assert(plan, "there is always a plan; the question is whether it claims a pocket");
  if (plan.pocket) {
    // If it did find a route, it must not be one that runs through the 2.
    assert(plan.target.n !== 1 || Math.abs(plan.angle) > 0.05, "the CPU planned straight through a blocker");
  }
});

test("with nothing on, the CPU rolls at the nearest legal ball rather than passing", () => {
  const balls = [createBall(0, 0, 0), createBall(1, 0.15, 0.62), createBall(2, 1.2, 0)];
  const plan = planShot(balls, "solid");
  assert(plan, "failing to hit a ball at all is a foul; a weak contact is not");
  assert(plan.target, "a fallback plan still names a target");
});

test("an empty table plans nothing rather than crashing", () => {
  assertEqual(planShot([createBall(0, 0, 0)], "solid"), null);
});

test("a pocketed cue ball plans nothing", () => {
  const balls = [createBall(0, 0, 0), createBall(1, 0.5, 0)];
  balls[0].pocketed = true;
  assertEqual(planShot(balls, "solid"), null);
});

// --- execution -------------------------------------------------------------

test("a steady hand plays the plan exactly", () => {
  const plan = { angle: 0.4, power: 0.6 };
  const stroke = strokeFor(plan, difficultyById("club"), fixed(0.5));
  assertClose(stroke.angle, 0.4, 1e-9, "no error means the planned angle");
  assertClose(stroke.power, 0.6, 1e-9);
});

test("a shaky hand misses the plan, and casual misses it by more than sharp", () => {
  const plan = { angle: 0.4, power: 0.6 };
  const off = (id) => Math.abs(strokeFor(plan, difficultyById(id), fixed(1)).angle - 0.4);
  assert(off("casual") > off("club"), "casual should stray further than club");
  assert(off("club") > off("sharp"), "club should stray further than sharp");
});

test("power is clamped to a playable range whatever the error does", () => {
  const wild = { angle: 0, power: 1 };
  for (const value of [0, 1]) {
    const stroke = strokeFor(wild, difficultyById("casual"), fixed(value));
    assert(stroke.power > 0 && stroke.power <= 1, `power escaped the range at ${stroke.power}`);
  }
});

test("no plan means no stroke", () => {
  assertEqual(strokeFor(null, difficultyById("club")), null);
});

finish();
