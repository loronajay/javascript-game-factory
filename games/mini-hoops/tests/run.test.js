import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { POINTS_PER_BASKET, TICK_SECONDS } from "../scripts/sim/constants.js";
import {
  RUN_EXPIRED,
  RUN_READY,
  RUN_RUNNING,
  accuracy,
  createRun,
  formatClock,
  isRunComplete,
  motionSeconds,
  recordMade,
  recordMiss,
  recordShot,
  runSummary,
  startClock,
  tickClock,
} from "../scripts/sim/run.js";

suite("run — the clock, the score, and when the round is actually over");

const newRun = (duration = 30) =>
  createRun({ duration, modeId: "still", locationId: "bedroom", ballId: "basketball" });

/** Run the clock forward by whole ticks, reporting whether it expired. */
function advance(run, seconds) {
  let expired = false;
  const ticks = Math.round(seconds / TICK_SECONDS);
  for (let i = 0; i < ticks; i++) {
    if (tickClock(run, TICK_SECONDS).expired) expired = true;
  }
  return expired;
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

test("a fresh round is waiting, with its full time on the clock", () => {
  const run = newRun();
  assertEqual(run.status, RUN_READY);
  assertEqual(run.remaining, 30);
});

test("the countdown does not move until the first pull starts it", () => {
  const run = newRun();
  advance(run, 5);
  assertEqual(run.remaining, 30, "no time may be lost before the player acts");
  assertEqual(run.played, 0);
});

test("but the hoop keeps moving while the player lines up", () => {
  // The countdown and the hoop run on separate clocks on purpose: you can watch
  // a moving rim for as long as you like before committing to the first shot.
  const run = newRun();
  advance(run, 5);
  assertClose(motionSeconds(run), 5, 0.02, "the rim must be alive before the clock starts");
  assertEqual(run.remaining, 30, "and that costs nothing");
});

test("the hoop also keeps moving after the buzzer, while the last ball is in the air", () => {
  const run = newRun(1);
  startClock(run);
  advance(run, 2);
  const atBuzzer = motionSeconds(run);
  advance(run, 1);
  assert(motionSeconds(run) > atBuzzer, "the rim does not freeze under the final shot");
});

test("starting the clock is idempotent, so a second pull cannot restart it", () => {
  const run = newRun();
  assert(startClock(run), "the first start takes");
  advance(run, 3);
  assert(!startClock(run), "the second is refused");
  assertClose(run.remaining, 27, 0.02);
});

test("time runs down and the round expires exactly once", () => {
  const run = newRun(1);
  startClock(run);
  let expiryCount = 0;
  for (let i = 0; i < 200; i++) {
    if (tickClock(run, TICK_SECONDS).expired) expiryCount++;
  }
  assertEqual(expiryCount, 1, "the buzzer must fire once, not every tick after zero");
  assertEqual(run.status, RUN_EXPIRED);
  assertEqual(run.remaining, 0);
});

test("the clock never goes negative", () => {
  const run = newRun(1);
  startClock(run);
  advance(run, 5);
  assertEqual(run.remaining, 0);
});

test("pausing is simply not ticking — no time is lost and none is refunded", () => {
  const run = newRun();
  startClock(run);
  advance(run, 4);
  const atPause = run.remaining;
  // ... a pause happens here; the loop simply stops calling tickClock ...
  assertEqual(run.remaining, atPause);
  advance(run, 2);
  assertClose(run.remaining, atPause - 2, 0.02);
});

test("the clock is displayed in minutes and padded seconds", () => {
  const run = newRun(60);
  assertEqual(formatClock(run), "1:00");
  startClock(run);
  advance(run, 30);
  assertEqual(formatClock(run), "0:30");
  advance(run, 29);
  assertEqual(formatClock(run), "0:01");
  advance(run, 5);
  assertEqual(formatClock(run), "0:00");
});

test("the hoop's motion clock keeps its own time, independent of the countdown", () => {
  const run = newRun();
  startClock(run);
  advance(run, 3);
  assertClose(motionSeconds(run), 3, 0.02, "the hoop moves on elapsed play time");
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

test("a made basket scores, extends the streak, and counts as a make", () => {
  const run = newRun();
  recordShot(run);
  assertEqual(recordMade(run), 1);
  assertEqual(run.score, POINTS_PER_BASKET);
  assertEqual(run.made, 1);
  assertEqual(run.shots, 1);
});

test("a miss breaks the streak but leaves the best streak standing", () => {
  const run = newRun();
  for (let i = 0; i < 4; i++) {
    recordShot(run);
    recordMade(run);
  }
  assertEqual(run.bestStreak, 4);
  recordShot(run);
  recordMiss(run);
  assertEqual(run.streak, 0, "the live streak is broken");
  assertEqual(run.bestStreak, 4, "the best of the round is kept");
});

test("accuracy is a whole percentage, and zero shots is 0% rather than NaN", () => {
  const run = newRun();
  assertEqual(accuracy(run), 0);
  for (let i = 0; i < 4; i++) recordShot(run);
  recordMade(run);
  assertEqual(accuracy(run), 25);
});

test("made count is tracked directly, not reverse-engineered from the score", () => {
  // Deriving makes from score/2 quietly breaks the moment scoring changes.
  const run = newRun();
  recordShot(run);
  recordMade(run);
  assertEqual(run.made, 1);
  assertEqual(run.made, run.score / POINTS_PER_BASKET, "and the two agree today");
});

// ---------------------------------------------------------------------------
// Ending
// ---------------------------------------------------------------------------

test("a shot still in the air at the buzzer is played out", () => {
  const run = newRun(1);
  startClock(run);
  advance(run, 2);
  assertEqual(run.status, RUN_EXPIRED);
  assert(!isRunComplete(run, { shotInFlight: true }), "the round waits for the ball");
  assert(isRunComplete(run, { shotInFlight: false }), "and ends once it lands");
});

test("a round that has not expired is never complete, ball or no ball", () => {
  const run = newRun();
  startClock(run);
  advance(run, 5);
  assert(!isRunComplete(run, { shotInFlight: false }));
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

test("the summary carries everything a result screen and a board entry need", () => {
  const run = newRun(60);
  for (let i = 0; i < 5; i++) recordShot(run);
  recordMade(run);
  recordMade(run);
  const summary = runSummary(run);
  assertEqual(summary.score, POINTS_PER_BASKET * 2);
  assertEqual(summary.shots, 5);
  assertEqual(summary.made, 2);
  assertEqual(summary.accuracy, 40);
  assertEqual(summary.bestStreak, 2);
  assertEqual(summary.duration, 60);
  assertEqual(summary.modeId, "still");
  assertEqual(summary.locationId, "bedroom");
  assertEqual(summary.ballId, "basketball");
});

finish();
