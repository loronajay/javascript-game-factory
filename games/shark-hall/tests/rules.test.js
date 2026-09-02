// The rules, which are the part of a pool game that is actually hard.
//
// Every case here is a shot that a player would argue about at a real table.
// They run against `resolveShot` directly, with a hand-built table, so a rule can
// be checked without simulating the shot that would produce it.

import { assert, assertEqual, finish, suite, test } from "./harness.js";
import { createBall } from "../scripts/sim/balls.js";
import { describeBall, resolveShot } from "../scripts/sim/rules.js";
import { ZONE_ANYWHERE, ZONE_KITCHEN, ZONE_NONE } from "../scripts/sim/placement.js";

suite("rules — house 8-ball");

/** A table with the listed numbers still up. The cue ball is always on it. */
function tableWith(numbers) {
  const balls = [createBall(0, -0.7, 0)];
  for (const n of numbers) balls.push(createBall(n, 0.2 + n * 0.01, 0));
  return balls;
}

const shot = (over) => ({ pocketed: [], firstHit: null, cushionAfterContact: true, ...over });

// --- fouls -----------------------------------------------------------------

test("hitting nothing is a foul and passes the turn", () => {
  const outcome = resolveShot(tableWith([1, 9]), { shooter: 0, groups: [null, null], isBreak: false }, shot());
  assert(outcome.foul, "expected a foul");
  assertEqual(outcome.foulReason, "No ball struck");
  assertEqual(outcome.nextShooter, 1);
  assertEqual(outcome.ballInHand, ZONE_ANYWHERE);
});

test("a scratch is ball in hand behind the head string, not anywhere", () => {
  const outcome = resolveShot(
    tableWith([1, 9]),
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [0], firstHit: 1 }),
  );
  assert(outcome.scratch, "expected a scratch");
  assertEqual(outcome.ballInHand, ZONE_KITCHEN, "a scratch is kitchen; every other foul is anywhere");
});

test("striking the wrong group first is a foul even when a ball drops", () => {
  const outcome = resolveShot(
    tableWith([1, 9]),
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [1], firstHit: 9 }),
  );
  assert(outcome.foul, "hitting a stripe first while on solids is a foul");
  assertEqual(outcome.nextShooter, 1);
});

test("no pot and no rail after contact is a table scratch", () => {
  const outcome = resolveShot(
    tableWith([1, 9]),
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ firstHit: 1, cushionAfterContact: false }),
  );
  assert(outcome.foul, "expected a table scratch");
  assertEqual(outcome.foulReason, "No rail after contact");
});

test("a legal safety — contact plus a rail, nothing down — passes the turn without a foul", () => {
  const outcome = resolveShot(
    tableWith([1, 9]),
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ firstHit: 1, cushionAfterContact: true }),
  );
  assert(!outcome.foul, "a safety is not a foul");
  assertEqual(outcome.turnChanged, true);
  assertEqual(outcome.ballInHand, ZONE_NONE, "a clean safety does not hand over the cue ball");
});

test("striking the 8 first on an open table is a foul", () => {
  const outcome = resolveShot(
    tableWith([1, 9, 8]),
    { shooter: 0, groups: [null, null], isBreak: false },
    shot({ firstHit: 8 }),
  );
  assert(outcome.foul, "the 8 is not a legal first contact on an open table");
});

// --- groups ----------------------------------------------------------------

test("the break never assigns groups, even when balls drop", () => {
  const outcome = resolveShot(
    tableWith([9, 10]),
    { shooter: 0, groups: [null, null], isBreak: true },
    shot({ pocketed: [1, 2], firstHit: 1 }),
  );
  assert(!outcome.groups[0], "the table stays open after the break");
  assert(!outcome.groups[1], "the table stays open after the break");
  assertEqual(outcome.turnChanged, false, "a pot on the break still keeps the shooter at the table");
});

test("the first legal pot after the break assigns both groups", () => {
  const outcome = resolveShot(
    tableWith([9, 10]),
    { shooter: 0, groups: [null, null], isBreak: false },
    shot({ pocketed: [3], firstHit: 3 }),
  );
  assertEqual(outcome.groups[0], "solid");
  assertEqual(outcome.groups[1], "stripe");
  assertEqual(outcome.turnChanged, false, "claiming a group is a legal pot, so the shooter continues");
});

test("a shot that drops one of each is called by whichever fell first", () => {
  const outcome = resolveShot(
    tableWith([2, 10]),
    { shooter: 0, groups: [null, null], isBreak: false },
    shot({ pocketed: [11, 4], firstHit: 11 }),
  );
  assertEqual(outcome.groups[0], "stripe", "the 11 dropped first, so the shooter takes stripes");
});

test("a foul never assigns a group", () => {
  const outcome = resolveShot(
    tableWith([2, 10]),
    { shooter: 0, groups: [null, null], isBreak: false },
    shot({ pocketed: [0, 3], firstHit: 3 }),
  );
  assertEqual(outcome.groups[0], null, "a scratch cannot claim solids");
  assertEqual(outcome.groups[1], null);
});

// --- the 8 -----------------------------------------------------------------

test("the 8 on the break is a rerack, not a loss", () => {
  const outcome = resolveShot(
    tableWith([1, 9]),
    { shooter: 0, groups: [null, null], isBreak: true },
    shot({ pocketed: [8], firstHit: 1 }),
  );
  assert(outcome.rerack, "expected a rerack");
  assertEqual(outcome.winner, null);
});

test("the 8 with a cleared group and a clean hit wins", () => {
  // Nothing of the shooter's group is left on the table.
  const balls = [createBall(0, -0.7, 0), createBall(9, 0.3, 0)];
  const outcome = resolveShot(
    balls,
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [8], firstHit: 8 }),
  );
  assertEqual(outcome.winner, 0);
  assert(!outcome.foul, "a clean 8 is not a foul");
});

test("the 8 with balls still up loses the rack", () => {
  const outcome = resolveShot(
    tableWith([1, 9]),
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [8], firstHit: 1 }),
  );
  assertEqual(outcome.winner, 1, "the opponent wins");
});

test("scratching on the winning 8 loses it", () => {
  const balls = [createBall(0, -0.7, 0), createBall(9, 0.3, 0)];
  const outcome = resolveShot(
    balls,
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [8, 0], firstHit: 8 }),
  );
  assertEqual(outcome.winner, 1, "a scratch on the 8 is a loss even with the group cleared");
});

test("on the 8, striking anything else first is a foul", () => {
  const balls = [createBall(0, -0.7, 0), createBall(9, 0.3, 0), createBall(8, 0.6, 0)];
  const outcome = resolveShot(
    balls,
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ firstHit: 9 }),
  );
  assert(outcome.foul, "with solids cleared, the 8 is the only legal first contact");
  assertEqual(outcome.foulReason, "Wrong ball first");
});

// --- continuing ------------------------------------------------------------

test("potting your own ball keeps you at the table", () => {
  const outcome = resolveShot(
    tableWith([2, 9]),
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [1], firstHit: 1 }),
  );
  assertEqual(outcome.turnChanged, false);
  assertEqual(outcome.nextShooter, 0);
});

test("potting only the opponent's ball passes the turn without a foul", () => {
  const outcome = resolveShot(
    tableWith([2, 10]),
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [9], firstHit: 1 }),
  );
  assert(!outcome.foul, "hitting your own ball first is legal even if theirs drops");
  assertEqual(outcome.turnChanged, true);
  assertEqual(outcome.ballInHand, ZONE_NONE);
});

// --- clearing the group ----------------------------------------------------
//
// "Are you on the 8?" is a question about the table BEFORE the shot. Asking it
// of the settled table says yes the moment the last group ball drops, which
// turned every rack-clearing pot into a "Wrong ball first" foul.

test("potting your last group ball is a legal pot, not a wrong-ball foul", () => {
  // Solids are gone because the shooter just made the 7. Table after the shot.
  const balls = [createBall(0, -0.7, 0), createBall(8, 0.6, 0), createBall(9, 0.3, 0)];
  const outcome = resolveShot(
    balls,
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [7], firstHit: 7 }),
  );
  assert(!outcome.foul, `clearing your group is not a foul (got ${outcome.foulReason})`);
  assertEqual(outcome.turnChanged, false, "the shooter stays at the table, now on the 8");
  assertEqual(outcome.ballInHand, ZONE_NONE);
});

test("clearing the last two of your group in one shot is still legal", () => {
  const balls = [createBall(0, -0.7, 0), createBall(8, 0.6, 0), createBall(9, 0.3, 0)];
  const outcome = resolveShot(
    balls,
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [6, 7], firstHit: 6 }),
  );
  assert(!outcome.foul, "two of your own down is two legal pots, not a foul");
  assertEqual(outcome.nextShooter, 0);
});

test("scratching as you clear your group is a scratch, not a wrong-ball foul", () => {
  const balls = [createBall(0, -0.7, 0), createBall(8, 0.6, 0), createBall(9, 0.3, 0)];
  const outcome = resolveShot(
    balls,
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [7, 0], firstHit: 7 }),
  );
  assertEqual(outcome.foulReason, "Scratch", "the foul is the scratch, and it names itself");
  assertEqual(outcome.ballInHand, ZONE_KITCHEN);
});

test("your last group ball and the 8 in the same shot still loses the rack", () => {
  const balls = [createBall(0, -0.7, 0), createBall(9, 0.3, 0)];
  const outcome = resolveShot(
    balls,
    { shooter: 0, groups: ["solid", "stripe"], isBreak: false },
    shot({ pocketed: [7, 8], firstHit: 7 }),
  );
  assertEqual(outcome.winner, 1, "the group was not clear when the shot was struck");
});

test("resolveShot does not mutate the groups it was handed", () => {
  const groups = [null, null];
  resolveShot(tableWith([2, 10]), { shooter: 0, groups, isBreak: false }, shot({ pocketed: [3], firstHit: 3 }));
  assertEqual(groups[0], null, "the caller's array is untouched");
});

// --- naming a ball ---------------------------------------------------------
//
// What the hover readout prints. A stripe seen edge-on from the cue view reads
// as a solid, so the answer is given in words instead.

test("a numbered ball names its group", () => {
  assertEqual(describeBall(3).name, "3 · Solid");
  assertEqual(describeBall(11).name, "11 · Stripe");
  assertEqual(describeBall(3).kind, "solid");
});

test("the cue ball and the 8 belong to no group", () => {
  assertEqual(describeBall(0).name, "Cue ball");
  assertEqual(describeBall(8).name, "8 ball");
  assertEqual(describeBall(0).mine, null);
  assertEqual(describeBall(8).mine, null, "the 8 is nobody's until the group is cleared");
});

test("ownership is answered only once the table has groups", () => {
  assertEqual(describeBall(3, null).mine, null, "an open table owes nobody an answer");
  assertEqual(describeBall(3, "solid").mine, true);
  assertEqual(describeBall(3, "stripe").mine, false);
});

finish();
