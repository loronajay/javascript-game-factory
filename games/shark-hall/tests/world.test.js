// The world: the rack, the fixed timestep, and what a shot reports.
//
// These run a real shot to completion under node in a loop, which is the whole
// payoff of keeping `sim/` free of THREE and of the clock.

import { assert, assertEqual, finish, suite, test } from "./harness.js";
import { BALL_RADIUS, HALF_LENGTH, HALF_WIDTH, SETTLE_MS } from "../scripts/sim/constants.js";
import { CUE, groupOf } from "../scripts/sim/balls.js";
import { createWorld } from "../scripts/sim/world.js";
import { POCKETS } from "../scripts/sim/table.js";

suite("world — a shot from strike to settle");

/** Run frames at 60hz until the shot settles, or give up. Returns the events seen. */
function runShot(world, maxFrames = 3000) {
  const seen = [];
  for (let i = 0; i < maxFrames; i++) {
    const { settled, events } = world.step(1 / 60);
    seen.push(...events);
    if (settled) return { settled: true, events: seen, frames: i };
  }
  return { settled: false, events: seen, frames: maxFrames };
}

// --- the rack --------------------------------------------------------------

test("a fresh rack is sixteen balls, none touching", () => {
  const world = createWorld();
  assertEqual(world.balls.length, 16);
  for (let i = 0; i < world.balls.length; i++) {
    for (let j = i + 1; j < world.balls.length; j++) {
      const a = world.balls[i];
      const b = world.balls[j];
      const gap = Math.hypot(a.x - b.x, a.z - b.z);
      assert(gap >= 2 * BALL_RADIUS, `${a.n} and ${b.n} start overlapping (${gap})`);
    }
  }
});

test("every racked ball is on the table and out of a pocket", () => {
  const world = createWorld();
  for (const ball of world.balls) {
    assert(Math.abs(ball.x) < HALF_LENGTH, `${ball.n} starts off the table`);
    assert(Math.abs(ball.z) < HALF_WIDTH, `${ball.n} starts off the table`);
    for (const pocket of POCKETS) {
      assert(Math.hypot(ball.x - pocket.x, ball.z - pocket.z) > pocket.radius, `${ball.n} starts in ${pocket.id}`);
    }
  }
});

test("a rack holds seven solids, seven stripes and the 8", () => {
  const world = createWorld();
  const solids = world.balls.filter((ball) => groupOf(ball.n) === "solid").length;
  const stripes = world.balls.filter((ball) => groupOf(ball.n) === "stripe").length;
  assertEqual(solids, 7);
  assertEqual(stripes, 7);
  assertEqual(world.balls.filter((ball) => ball.n === 8).length, 1);
});

// --- a shot ----------------------------------------------------------------

test("a hard break settles, and everything that survives is still on the table", () => {
  const world = createWorld();
  world.strike({ angle: 0, power: 1, spinX: 0, spinY: 0 });
  const run = runShot(world);

  assert(run.settled, "the break never came to rest");
  for (const ball of world.balls) {
    if (ball.pocketed) continue;
    assert(Math.abs(ball.x) <= HALF_LENGTH + 1e-6, `${ball.n} ended off the table at x=${ball.x}`);
    assert(Math.abs(ball.z) <= HALF_WIDTH + 1e-6, `${ball.n} ended off the table at z=${ball.z}`);
  }
});

test("a break reports contact, and reports the cushions the rules need", () => {
  const world = createWorld();
  world.strike({ angle: 0, power: 1, spinX: 0, spinY: 0 });
  runShot(world);

  assertEqual(world.report.firstHit, 1, "the apex ball is what a straight break strikes first");
  assert(world.report.cushionAfterContact, "a full-power break must reach a rail");
});

test("a shot that touches nothing reports no contact", () => {
  const world = createWorld();
  // Straight back down the table, away from the rack.
  world.strike({ angle: Math.PI, power: 0.3, spinX: 0, spinY: 0 });
  runShot(world);
  assertEqual(world.report.firstHit, null, "nothing was struck, which the rules read as a foul");
});

test("the settle delay is real: the shot is not scored the instant motion stops", () => {
  const world = createWorld();
  world.strike({ angle: Math.PI, power: 0.12, spinX: 0, spinY: 0 });

  let stoppedAt = null;
  let settledAt = null;
  for (let frame = 0; frame < 2000; frame++) {
    const before = world.balls.every((ball) => ball.pocketed || Math.hypot(ball.vx, ball.vz) < 0.006);
    if (before && stoppedAt === null) stoppedAt = frame;
    const { settled } = world.step(1 / 60);
    if (settled) {
      settledAt = frame;
      break;
    }
  }

  assert(settledAt !== null, "the shot never settled");
  const waitedSeconds = (settledAt - stoppedAt) / 60;
  assert(waitedSeconds >= SETTLE_MS / 1000 - 0.05, `settled after only ${waitedSeconds}s of stillness`);
});

test("the world is deterministic: the same break twice gives the same table", () => {
  const play = () => {
    const world = createWorld();
    world.strike({ angle: 0.03, power: 0.9, spinX: 0.2, spinY: -0.4 });
    runShot(world);
    return world.balls.map((ball) => `${ball.n}:${ball.pocketed}:${ball.x.toFixed(6)}:${ball.z.toFixed(6)}`).join("|");
  };
  assertEqual(play(), play(), "nothing in the sim may read a clock or a random source");
});

// --- events ----------------------------------------------------------------

test("a break emits a strike, ball contacts and cushion contacts", () => {
  const world = createWorld();
  world.strike({ angle: 0, power: 1, spinX: 0, spinY: 0 });
  const { events } = runShot(world);

  const kinds = new Set(events.map((event) => event.type));
  assert(kinds.has("strike"), "the strike itself is an event, so the cue can be heard");
  assert(kinds.has("ball"), "expected ball-on-ball contacts");
  assert(kinds.has("cushion"), "expected cushion contacts");
  for (const event of events) assert(Number.isFinite(event.speed), `event ${event.type} has no impact speed`);
});

test("events are drained, never replayed", () => {
  const world = createWorld();
  world.strike({ angle: 0, power: 1, spinX: 0, spinY: 0 });
  const first = world.step(1 / 60).events;
  const second = world.step(1 / 60).events;
  assert(first.length > 0, "the strike frame should carry events");
  assert(first !== second, "each frame gets its own list");
  assert(!second.some((event) => event.type === "strike"), "the strike must not sound twice");
});

// --- placement -------------------------------------------------------------

test("placing the cue ball takes it out of the pocket and stops it dead", () => {
  const world = createWorld();
  const cue = world.cue();
  cue.pocketed = true;
  cue.vx = 3;

  world.placeCue(-0.8, 0.1);
  assertEqual(cue.pocketed, false);
  assertEqual(cue.x, -0.8);
  assertEqual(cue.vx, 0, "a spotted ball is not still carrying the shot that scratched it");
});

test("a rack resets the report, so last shot's foul cannot carry over", () => {
  const world = createWorld();
  world.strike({ angle: 0, power: 1, spinX: 0, spinY: 0 });
  runShot(world);
  assert(world.report.firstHit !== null, "the break struck something");

  world.rack();
  assertEqual(world.report.firstHit, null);
  assertEqual(world.report.pocketed.length, 0);
  assertEqual(world.moving, false);
});

test("the cue ball is ball zero and it is on the table at the start", () => {
  const world = createWorld();
  const cue = world.cue();
  assertEqual(cue.n, CUE);
  assertEqual(cue.pocketed, false);
});

finish();
