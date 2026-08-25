import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import {
  CONTACT_DEBOUNCE_SECONDS,
  ON_FIRE_STREAK,
  SHOT_MAX_SECONDS,
  SHOT_SETTLE_SECONDS,
  TICK_SECONDS,
} from "../scripts/sim/constants.js";
import { hoopAt, hoopWorldState } from "../scripts/sim/hoop.js";
import {
  SHOT_FINISHED,
  SHOT_FLIGHT,
  SHOT_IDLE,
  advanceShot,
  beginShot,
  createShot,
  madeAnnouncement,
} from "../scripts/sim/shot.js";

suite("shot — what a contact means, and when the ball comes back");

const hoop = hoopAt("still", 0);
const hoopWorld = hoopWorldState(hoop);

/** A ball high, central and still descending — i.e. mid-flight and undecided. */
const flyingBall = () => ({ x: 0, y: 1.4, z: 0.4, vx: 0, vy: -1, vz: 0.6, rollPhase: 0 });

function step(shot, { ball = flyingBall(), contacts = [], settled = false, dt = TICK_SECONDS } = {}) {
  return advanceShot(shot, { ball, hoop, hoopWorld, contacts, scored: shot.scored, settled }, dt);
}

function liveShot() {
  const shot = createShot();
  beginShot(shot);
  return shot;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

test("a shot that has not been taken is idle and ignores the world", () => {
  const shot = createShot();
  assertEqual(shot.state, SHOT_IDLE);
  const result = step(shot, { contacts: ["rim"] });
  assertDeepEqual(result.announcements, []);
  assert(!result.finished);
});

test("beginning a shot clears everything the last one left behind", () => {
  const shot = liveShot();
  step(shot, { contacts: ["rim"] });
  beginShot(shot);
  assertEqual(shot.state, SHOT_FLIGHT);
  assertEqual(shot.elapsed, 0);
  assertEqual(shot.lastContact, "");
  assertEqual(shot.resolvedAt, -1);
  assert(!shot.scored);
});

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

test("rim, backboard and ceiling are called by name", () => {
  for (const [contact, label] of [["rim", "RIM"], ["backboard", "BACKBOARD"], ["ceiling", "CEILING"]]) {
    assertDeepEqual(step(liveShot(), { contacts: [contact] }).announcements, [label], contact);
  }
});

test("clipping the ceiling does not end the shot", () => {
  // The ceiling is a LIVE surface, like the rim and the board and unlike the
  // bare wall: an over-powered shot that clips it and comes down onto the rim
  // is a real make, and around a fifth of all makes now touch it on the way in.
  // Resolving here would call those dead a beat before they dropped.
  const shot = liveShot();
  const result = step(shot, { contacts: ["ceiling"] });
  assertDeepEqual(result.announcements, ["CEILING"]);
  assert(!result.finished, "a shot off the ceiling is still in the air");
  assertEqual(shot.resolvedAt, -1, "and its outcome is not decided yet");
});

test("a ball that clipped the ceiling and came back down is called a ceiling miss", () => {
  const shot = liveShot();
  step(shot, { contacts: ["ceiling"] });
  const returning = { x: 0, y: hoopWorld.rimY - 0.5, z: hoopWorld.rimZ - 0.6, vx: 0, vy: -1, vz: -0.5, rollPhase: 0 };
  assertDeepEqual(step(shot, { ball: returning }).announcements, ["CEILING"]);
  assert(shot.resolvedAt >= 0, "and the outcome is settled");
});

test("one collision reported twice in quick succession is only said once", () => {
  // Contact resolvers can fire on consecutive substeps for a single graze.
  // Without the debounce the same word stutters on screen.
  const shot = liveShot();
  assertDeepEqual(step(shot, { contacts: ["rim"] }).announcements, ["RIM"]);
  assertDeepEqual(step(shot, { contacts: ["rim"], dt: CONTACT_DEBOUNCE_SECONDS / 2 }).announcements, []);
});

test("a genuinely separate second contact is announced again", () => {
  const shot = liveShot();
  step(shot, { contacts: ["rim"] });
  const later = step(shot, { contacts: ["rim"], dt: CONTACT_DEBOUNCE_SECONDS * 3 });
  assertDeepEqual(later.announcements, ["RIM"]);
});

test("a made basket announces itself, and shouts louder on a streak", () => {
  assertEqual(madeAnnouncement(1), "BUCKET!");
  assertEqual(madeAnnouncement(ON_FIRE_STREAK), "ON FIRE!");
  assertEqual(madeAnnouncement(ON_FIRE_STREAK + 4), "ON FIRE!");
});

test("a miss into bare wall is called by the direction it went", () => {
  const left = liveShot();
  const leftBall = { ...flyingBall(), x: -1.2 };
  assertDeepEqual(step(left, { ball: leftBall, contacts: ["wall"] }).announcements, ["LEFT"]);

  const right = liveShot();
  const rightBall = { ...flyingBall(), x: 1.2 };
  assertDeepEqual(step(right, { ball: rightBall, contacts: ["wall"] }).announcements, ["RIGHT"]);

  const long = liveShot();
  assertDeepEqual(step(long, { contacts: ["wall"] }).announcements, ["LONG"]);
});

test("a ball that reaches the floor untouched is called short or missed by depth", () => {
  const short = liveShot();
  const shortBall = { ...flyingBall(), y: 0.078, z: 0.2 };
  assertDeepEqual(step(short, { ball: shortBall, contacts: ["floor"] }).announcements, ["SHORT"]);

  const missed = liveShot();
  const deepBall = { ...flyingBall(), y: 0.078, z: 0.8 };
  assertDeepEqual(step(missed, { ball: deepBall, contacts: ["floor"] }).announcements, ["MISS"]);
});

test("a ball that touched the rim first is blamed on the rim, not on being short", () => {
  const shot = liveShot();
  step(shot, { contacts: ["rim"] });
  const grounded = { ...flyingBall(), y: 0.078, z: 0.2 };
  const result = step(shot, { ball: grounded, contacts: ["floor"], dt: 0.5 });
  assertDeepEqual(result.announcements, ["RIM"], "the rim is the useful thing to say");
});

test("a scored shot never also announces a miss", () => {
  const shot = liveShot();
  step(shot, { contacts: ["score"] });
  assert(shot.scored);
  const grounded = { ...flyingBall(), y: 0.078 };
  assertDeepEqual(step(shot, { ball: grounded, contacts: ["floor"] }).announcements, []);
});

test("an outcome is announced once, however many things happen afterward", () => {
  const shot = liveShot();
  step(shot, { contacts: ["wall"] });
  const grounded = { ...flyingBall(), y: 0.078 };
  assertDeepEqual(step(shot, { ball: grounded, contacts: ["floor"] }).announcements, []);
});

// ---------------------------------------------------------------------------
// When the ball comes back
// ---------------------------------------------------------------------------

test("a resolved shot is given a beat before the ball is handed back", () => {
  const shot = liveShot();
  assert(!step(shot, { contacts: ["wall"] }).finished, "not instantly");
  assert(!step(shot, { dt: SHOT_SETTLE_SECONDS * 0.5 }).finished, "still hanging");
  assert(step(shot, { dt: SHOT_SETTLE_SECONDS }).finished, "then handed back");
  assertEqual(shot.state, SHOT_FINISHED);
});

test("an unresolved shot is abandoned once it has gone on too long", () => {
  const shot = liveShot();
  assert(step(shot, { dt: SHOT_MAX_SECONDS + 0.1 }).finished, "a timed run cannot wait forever");
});

test("a settled ball ends the shot immediately", () => {
  const shot = liveShot();
  assert(step(shot, { settled: true }).finished);
});

test("a ball that leaves the playable depth ends the shot", () => {
  const shot = liveShot();
  const escaped = { ...flyingBall(), z: -5 };
  assert(step(shot, { ball: escaped }).finished);
});

test("a contacted ball falling back into the room is called before it lands", () => {
  // The rule that stops a player watching a dead ball bounce around the bedroom
  // while their clock runs.
  const shot = liveShot();
  step(shot, { contacts: ["backboard"] });
  const returning = { x: 0, y: hoopWorld.rimY - 0.5, z: hoopWorld.rimZ - 0.6, vx: 0, vy: -1, vz: -0.5, rollPhase: 0 };
  assertDeepEqual(step(shot, { ball: returning }).announcements, ["BACKBOARD"]);
  assert(shot.resolvedAt >= 0, "and the outcome is settled");
});

test("an untouched ball still in play is not abandoned early", () => {
  const shot = liveShot();
  const rising = { x: 0, y: 1.6, z: 0.5, vx: 0, vy: 2, vz: 0.6, rollPhase: 0 };
  const result = step(shot, { ball: rising });
  assertDeepEqual(result.announcements, []);
  assert(!result.finished, "a live shot must be left alone");
});

finish();
