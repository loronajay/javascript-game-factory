import test from "node:test";
import assert from "node:assert/strict";

import {
  playerSeatListLabel,
  shouldSyncHotSeatSetupForSegment,
  teamForSeat,
  teamGroupsForSetup,
  teamPairingSummary
} from "../src/ui/teamDisplay.js";

import { readFileSync } from "node:fs";

const SHELL_CSS = readFileSync(new URL("../styles/screens/shell.css", import.meta.url), "utf8");

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

test("squad setup action buttons keep formation text inside narrow team pickers", () => {
  const rules = [...SHELL_CSS.matchAll(/\.squad-edit-btn\s*\{([^}]*)\}/g)].map((match) => match[1]);
  const rule = rules.find((body) => body.includes("white-space")) ?? "";

  assert.match(rule, /min-width\s*:\s*0/);
  assert.match(rule, /white-space\s*:\s*normal/);
  assert.match(rule, /overflow-wrap\s*:\s*anywhere/);
  assert.match(rule, /text-align\s*:\s*center/);
});
