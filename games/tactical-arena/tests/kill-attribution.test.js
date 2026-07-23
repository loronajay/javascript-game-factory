import test from "node:test";
import assert from "node:assert/strict";

import { CAUSE, creditDeaths, snapshotAlive } from "../src/core/killAttribution.js";

// These lock the attribution SEMANTICS in isolation. The integration cases (a real
// fire tick, a real self-sacrifice) live in kill-attribution-integration.test.js.

function unit(id, player, hp, extra = {}) {
  return { id, player, team: extra.team ?? player, hp, kills: 0, killedBy: null, deathCause: null, ...extra };
}

function stateOf(...units) {
  return { units };
}

test("a death during the scope is credited to the scope's killer", () => {
  const state = stateOf(unit("a", 1, 10), unit("b", 2, 5));
  const before = snapshotAlive(state);

  state.units[1].hp = 0;
  const events = [];
  creditDeaths(state, before, events, { killerId: "a", cause: CAUSE.UNIT });

  assert.equal(state.units[1].killedBy, "a");
  assert.equal(state.units[1].deathCause, CAUSE.UNIT);
  assert.equal(state.units[0].kills, 1);
  assert.deepEqual(events, [{ type: "UNIT_DEFEATED", unitId: "b", killerId: "a", cause: CAUSE.UNIT }]);
});

test("the innermost scope wins and an outer scope never overwrites it", () => {
  const state = stateOf(unit("a", 1, 10), unit("b", 2, 5));
  const outerBefore = snapshotAlive(state);

  // Inner scope: a fire tick claims the kill for the unit that lit it.
  const innerBefore = snapshotAlive(state);
  state.units[1].hp = 0;
  const events = [];
  creditDeaths(state, innerBefore, events, { killerId: "a", cause: CAUSE.FIRE });

  // Outer scope: the broad per-command sweep must leave the claim alone.
  creditDeaths(state, outerBefore, events, { killerId: "b", cause: CAUSE.UNIT });

  assert.equal(state.units[1].killedBy, "a");
  assert.equal(state.units[1].deathCause, CAUSE.FIRE);
  assert.equal(events.length, 1, "a death is announced exactly once");
  assert.equal(state.units[0].kills, 1);
});

test("self-damage credits nobody even when a killer is in scope", () => {
  const state = stateOf(unit("a", 1, 3));
  const before = snapshotAlive(state);

  state.units[0].hp = 0;
  const events = [];
  creditDeaths(state, before, events, { killerId: "a", cause: CAUSE.SELF });

  assert.equal(state.units[0].killedBy, null);
  assert.equal(state.units[0].deathCause, CAUSE.SELF);
  assert.equal(state.units[0].kills, 0);
  assert.equal(events[0].killerId, null);
});

test("environmental deaths credit nobody but are still recorded", () => {
  const state = stateOf(unit("a", 1, 10), unit("b", 2, 1));
  const before = snapshotAlive(state);

  state.units[1].hp = 0;
  const events = [];
  creditDeaths(state, before, events, { killerId: "a", cause: CAUSE.ENVIRONMENT });

  assert.equal(state.units[1].killedBy, null);
  assert.equal(state.units[1].deathCause, CAUSE.ENVIRONMENT);
  assert.equal(state.units[0].kills, 0, "Black Death is nobody's kill");
  assert.equal(events.length, 1, "the death is still announced");
});

test("killing your own teammate records the death but does not count as a kill", () => {
  const state = stateOf(unit("a", 1, 10), unit("b", 1, 5));
  const before = snapshotAlive(state);

  state.units[1].hp = 0;
  const events = [];
  creditDeaths(state, before, events, { killerId: "a", cause: CAUSE.UNIT });

  assert.equal(state.units[1].killedBy, "a", "the UI can still explain the death");
  assert.equal(state.units[0].kills, 0, "friendly fire does not pad your record");
});

test("2v2 teammates on different player numbers still do not credit each other", () => {
  const state = stateOf(unit("a", 1, 10, { team: 1 }), unit("b", 3, 5, { team: 1 }));
  const before = snapshotAlive(state);

  state.units[1].hp = 0;
  creditDeaths(state, before, [], { killerId: "a", cause: CAUSE.UNIT });

  assert.equal(state.units[0].kills, 0);
});

test("a unit already dead before the scope opened is not re-attributed", () => {
  const state = stateOf(unit("a", 1, 10), unit("b", 2, 0, { deathCause: CAUSE.FIRE }));
  const before = snapshotAlive(state);

  const events = [];
  creditDeaths(state, before, events, { killerId: "a", cause: CAUSE.UNIT });

  assert.equal(events.length, 0);
  assert.equal(state.units[0].kills, 0);
});

test("a killer that died in the same exchange still gets the credit", () => {
  const state = stateOf(unit("a", 1, 2), unit("b", 2, 5));
  const before = snapshotAlive(state);

  state.units[0].hp = 0;  // traded
  state.units[1].hp = 0;
  const events = [];
  creditDeaths(state, before, events, { killerId: "a", cause: CAUSE.UNIT });

  assert.equal(state.units[1].killedBy, "a");
  assert.equal(state.units[0].kills, 1);
  // The killer's own death is swept by the same scope and credits nobody (it is not
  // its own killer), so it is recorded with a null killer rather than skipped.
  assert.equal(state.units[0].killedBy, null);
  assert.equal(events.length, 2);
});
