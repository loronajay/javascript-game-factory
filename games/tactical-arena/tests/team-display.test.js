import test from "node:test";
import assert from "node:assert/strict";

import {
  playerSeatListLabel,
  shouldSyncHotSeatSetupForSegment,
  teamForSeat,
  teamGroupsForSetup,
  teamPairingSummary
} from "../src/ui/teamDisplay.js";

test("2v2 setup groups odd and even player seats into readable teams", () => {
  assert.deepEqual(teamGroupsForSetup(4, "teams"), [
    { team: 1, seats: [1, 3] },
    { team: 2, seats: [2, 4] },
  ]);
  assert.equal(teamForSeat(1, "teams"), 1);
  assert.equal(teamForSeat(3, "teams"), 1);
  assert.equal(teamForSeat(2, "teams"), 2);
  assert.equal(teamForSeat(4, "teams"), 2);
});

test("team setup labels name the paired players explicitly", () => {
  assert.equal(playerSeatListLabel([1, 3]), "Player 1 + Player 3");
  assert.equal(playerSeatListLabel([2, 4]), "Player 2 + Player 4");
  assert.equal(teamPairingSummary(4, "teams"), "Teams: Player 1 + Player 3 vs Player 2 + Player 4.");
});

test("hot-seat setup refreshes when either player count or format changes", () => {
  const playerCountSegment = {
    closest: (selector) => selector === '[data-screen="hsSetup"]' || selector === '[data-field="playerCount"]' ? {} : null
  };
  const formatSegment = {
    closest: (selector) => selector === '[data-screen="hsSetup"]' || selector === '[data-field="format"]' ? {} : null
  };
  const boardSizeSegment = {
    closest: (selector) => selector === '[data-screen="hsSetup"]' || selector === '[data-field="boardSize"]' ? {} : null
  };

  assert.equal(shouldSyncHotSeatSetupForSegment(playerCountSegment), true);
  assert.equal(shouldSyncHotSeatSetupForSegment(formatSegment), true);
  assert.equal(shouldSyncHotSeatSetupForSegment(boardSizeSegment), false);
});
