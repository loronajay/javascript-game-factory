// The match state machine, driven with a fake clock.
//
// The timers are injected precisely so this file exists: the CPU's think delay
// and the turn card's hold are real product behaviour, and a test that had to
// wait 1.24 real seconds for a turn card would be a test nobody runs.

import { assert, assertClose, assertEqual, finish, suite, test } from "./harness.js";
import {
  MODE_CPU,
  MODE_HOTSEAT,
  PHASE_AIMING,
  PHASE_PLACING,
  PHASE_SHOOTING,
  PHASE_TURN_CARD,
  createMatch,
} from "../scripts/match/match.js";
import { ZONE_KITCHEN, ZONE_NONE } from "../scripts/sim/placement.js";
import { HEAD_STRING_X } from "../scripts/sim/constants.js";

suite("match — turns, phases and the CPU");

/** A clock the test drives by hand. `flush` fires everything currently due. */
function fakeClock() {
  let next = 1;
  const pending = new Map();
  return {
    setTimer(fn) {
      const id = next++;
      pending.set(id, fn);
      return id;
    },
    clearTimer(id) {
      pending.delete(id);
    },
    /** Fire every scheduled callback once, in order. Returns how many ran. */
    flush() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, fn] of due) fn();
      return due.length;
    },
    get size() {
      return pending.size;
    },
  };
}

function hotseat(clock) {
  return createMatch({ mode: MODE_HOTSEAT, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
}

/** Step the match until the shot in flight settles. */
function settle(match, maxFrames = 3000) {
  for (let i = 0; i < maxFrames; i++) {
    match.tick(1 / 60);
    if (!match.snapshot().moving) return true;
  }
  return false;
}

// --- lifecycle -------------------------------------------------------------

test("a match does not accept input before it starts", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  assert(!match.humanCanAct(), "the table is not live on the menu");
  assertEqual(match.shoot(0.5), null, "a shot before the match starts must be refused");
});

test("starting a match puts the turn card up first", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  match.start();
  assertEqual(match.snapshot().phase, PHASE_TURN_CARD);
  assert(!match.humanCanAct(), "nothing is clickable while the card is up");

  clock.flush();
  assertEqual(match.snapshot().phase, PHASE_AIMING);
  assert(match.humanCanAct(), "the player takes over once the card clears");
});

test("pausing freezes the world; resuming lets it move again", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  match.start();
  clock.flush();
  match.shoot(1);

  const before = match.world.cue().x;
  match.pause();
  for (let i = 0; i < 30; i++) match.tick(1 / 60);
  assertEqual(match.world.cue().x, before, "a paused table does not roll");

  match.resume();
  match.tick(1 / 60);
  assert(match.world.cue().x !== before, "resuming lets the shot continue");
});

// --- taking a shot ---------------------------------------------------------

test("a shot moves the match into the shooting phase", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  match.start();
  clock.flush();

  assert(match.shoot(0.8), "the shot should be accepted");
  assertEqual(match.snapshot().phase, PHASE_SHOOTING);
  assert(!match.humanCanAct(), "no input while the balls are rolling");
});

test("a break that makes nothing passes the turn and shows a card", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  match.start();
  clock.flush();

  // Straight down the table away from the rack: no contact at all, so a foul.
  match.setAngle(Math.PI);
  match.shoot(0.3);
  assert(settle(match), "the shot never settled");

  const snapshot = match.snapshot();
  assertEqual(snapshot.shooter, 1, "the turn passed");
  assertEqual(snapshot.phase, PHASE_TURN_CARD);
  assert(snapshot.ballInHand !== ZONE_NONE, "a foul hands over the cue ball");
});

test("a foul leaves the incoming player placing, not aiming", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  match.start();
  clock.flush();
  match.setAngle(Math.PI);
  match.shoot(0.3);
  settle(match);
  clock.flush();

  assertEqual(match.snapshot().phase, PHASE_PLACING);
});

// --- ball in hand ----------------------------------------------------------

test("placement is two steps: a legal drag, then a release that confirms", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  match.start();
  clock.flush();
  match.setAngle(Math.PI);
  match.shoot(0.3);
  settle(match);
  clock.flush();

  assert(match.tryPlaceCue(-0.9, 0.2), "a legal spot should take");
  assertEqual(match.world.cue().x, -0.9);
  assert(match.snapshot().ballInHand !== ZONE_NONE, "dragging alone does not end placement");

  match.confirmPlacement();
  assertEqual(match.snapshot().ballInHand, ZONE_NONE);
  assertEqual(match.snapshot().phase, PHASE_AIMING);
});

test("a scratch confines placement to behind the head string", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  match.start();
  clock.flush();

  // Drop the cue ball into a corner pocket by hand, then settle the shot: the
  // rules see a scratch whatever route the ball took to get there.
  match.shoot(0.05);
  const cue = match.world.cue();
  cue.x = -1.27;
  cue.z = -0.635;
  settle(match);
  clock.flush();

  assertEqual(match.snapshot().ballInHand, ZONE_KITCHEN);

  // The drag is never refused — it is clamped. Asking for a spot past the head
  // string slides the ball along the string instead of freezing it there, which
  // is what makes placement feel like moving a ball. See `clampCuePosition`.
  assert(match.tryPlaceCue(0.5, 0), "a drag is always accepted while there is ball in hand");
  assert(match.world.cue().x <= HEAD_STRING_X, "but it cannot end up past the head string");

  assert(match.tryPlaceCue(HEAD_STRING_X - 0.2, 0.1), "behind the head string is legal");
  assertClose(match.world.cue().x, HEAD_STRING_X - 0.2, 1e-9, "and a legal spot is taken exactly");
  assertClose(match.world.cue().z, 0.1, 1e-9);
});

// --- the CPU ---------------------------------------------------------------

test("the CPU takes its own turn without any help", () => {
  const clock = fakeClock();
  const match = createMatch({ mode: MODE_CPU, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  match.start();
  clock.flush();

  // Player 1 fouls, handing the table to the CPU.
  match.setAngle(Math.PI);
  match.shoot(0.3);
  settle(match);
  assertEqual(match.snapshot().shooter, 1);

  clock.flush(); // turn card clears, CPU starts thinking
  clock.flush(); // CPU picks a shot
  clock.flush(); // CPU strikes

  assertEqual(match.snapshot().phase, PHASE_SHOOTING, "the CPU should have played by now");
});

test("a human cannot act during the CPU's turn", () => {
  const clock = fakeClock();
  const match = createMatch({ mode: MODE_CPU, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  match.start();
  clock.flush();
  match.setAngle(Math.PI);
  match.shoot(0.3);
  settle(match);
  clock.flush();

  assert(!match.humanCanAct(), "the deck must be dead while the CPU is at the table");
});

test("quitting cancels the CPU's pending shot", () => {
  const clock = fakeClock();
  const match = createMatch({ mode: MODE_CPU, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  match.start();
  clock.flush();
  match.setAngle(Math.PI);
  match.shoot(0.3);
  settle(match);
  clock.flush();

  assert(clock.size > 0, "the CPU should have a timer pending");
  match.quit();
  assertEqual(clock.size, 0, "a quit that leaves a shot scheduled fires it into the next match");
});

// --- snapshots -------------------------------------------------------------

test("the snapshot names both seats correctly per mode", () => {
  const clock = fakeClock();
  const cpu = createMatch({ mode: MODE_CPU, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  assertEqual(cpu.snapshot().seats[1].name, "CPU");
  assertEqual(cpu.snapshot().seats[1].isCpu, true);

  const local = hotseat(clock);
  assertEqual(local.snapshot().seats[1].name, "Player 2");
  assertEqual(local.snapshot().seats[1].isCpu, false);
});

test("a snapshot is a copy: writing to it cannot corrupt the match", () => {
  const clock = fakeClock();
  const match = hotseat(clock);
  match.start();
  clock.flush();

  const snapshot = match.snapshot();
  snapshot.shooter = 1;
  snapshot.groups[0] = "solid";
  assertEqual(match.snapshot().shooter, 0, "the match kept its own shooter");
});

finish();
