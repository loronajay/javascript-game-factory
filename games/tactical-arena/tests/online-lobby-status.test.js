import test from "node:test";
import assert from "node:assert/strict";

import { deriveLobbyStartView } from "../src/ui/onlineLobbyStatus.js";
import { createDraftState } from "../src/ui/draftModel.js";

const label = (seat) => `P${seat}`;
// Baseline: a full, non-draft, everything-locked owner lobby.
function vm(overrides = {}) {
  return {
    isOwner: true,
    full: true,
    locked: true,
    draftMode: false,
    draftDone: false,
    draftReady: false,
    missingLocks: 0,
    rankedMode: false,
    draft: null,
    count: 2,
    maxPlayers: 2,
    matchLabel: "Classic 1v1",
    localLocked: true,
    localSeat: 1,
    draftPlayerLabel: label,
    ...overrides,
  };
}

test("owner start button hides for non-owners and enables only when full+locked", () => {
  const ready = deriveLobbyStartView(vm());
  assert.equal(ready.startHidden, false);
  assert.equal(ready.startDisabled, false);
  assert.equal(ready.hintHidden, true);
  assert.equal(ready.hintText, "");

  const joiner = deriveLobbyStartView(vm({ isOwner: false }));
  assert.equal(joiner.startHidden, true);
  assert.equal(joiner.startDisabled, true);
  assert.equal(joiner.hintHidden, false);
});

test("owner waiting-for-players hint pluralizes and names the format", () => {
  assert.equal(
    deriveLobbyStartView(vm({ full: false, locked: false, count: 1, maxPlayers: 2 })).hintText,
    "Waiting for 1 more player for Classic 1v1.",
  );
  assert.equal(
    deriveLobbyStartView(vm({ full: false, locked: false, count: 1, maxPlayers: 4, matchLabel: "2v2 Teams" })).hintText,
    "Waiting for 3 more players for 2v2 Teams.",
  );
});

test("owner squad-lock hint reports how many are still missing", () => {
  assert.equal(
    deriveLobbyStartView(vm({ locked: false, missingLocks: 2 })).hintText,
    "Waiting for 2 squad lock-ins.",
  );
});

test("owner ban-phase hint switches on whose ban is up", () => {
  const draft = createDraftState({ seats: [1, 2], banFirstSeat: 1 }); // seat 1 bans first
  const base = { draftMode: true, draftDone: false, rankedMode: true, draft, locked: false };
  assert.equal(deriveLobbyStartView(vm({ ...base, localSeat: 1 })).hintText, "Your ban is up.");
  assert.equal(deriveLobbyStartView(vm({ ...base, localSeat: 2 })).hintText, "Waiting for P1 to ban.");
});

test("owner draft-pick hint switches on whose pick is up", () => {
  const draft = createDraftState({ seats: [1, 2] }); // pick phase, seat 1 first
  const base = { draftMode: true, draftDone: false, draft, locked: false };
  assert.equal(deriveLobbyStartView(vm({ ...base, localSeat: 1 })).hintText, "Your draft pick is up.");
  assert.equal(deriveLobbyStartView(vm({ ...base, localSeat: 2 })).hintText, "Waiting for P1 to draft.");
});

test("owner formation hint depends on whether the local formation is locked", () => {
  const base = { draftMode: true, draftDone: true, draftReady: false, locked: false };
  assert.equal(deriveLobbyStartView(vm({ ...base, localLocked: false })).hintText, "Arrange and lock your formation.");
  assert.equal(deriveLobbyStartView(vm({ ...base, localLocked: true, missingLocks: 1 })).hintText, "Waiting for 1 formation lock-in.");
});

test("joiner hints cover blind-pick and draft flows", () => {
  // blind pick, not locked
  assert.equal(deriveLobbyStartView(vm({ isOwner: false, localLocked: false })).hintText, "Lock in when your squad is ready.");
  // blind pick, locked, everyone ready
  assert.equal(deriveLobbyStartView(vm({ isOwner: false, localLocked: true, locked: true })).hintText, "Locked in. Waiting for the host to start...");
  // blind pick, locked, others still picking
  assert.equal(deriveLobbyStartView(vm({ isOwner: false, localLocked: true, locked: false })).hintText, "Locked in. Waiting for the other squad lock-ins...");
  // draft not done
  assert.equal(deriveLobbyStartView(vm({ isOwner: false, draftMode: true, draftDone: false })).hintText, "Draft your squad, then arrange formation.");
  // draft done, formation locked
  assert.equal(deriveLobbyStartView(vm({ isOwner: false, draftMode: true, draftDone: true, localLocked: true })).hintText, "Formation locked. Waiting for the host to start...");
});
