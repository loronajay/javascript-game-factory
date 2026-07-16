import test from "node:test";
import assert from "node:assert/strict";

import { playerSeatListLabel, teamForSeat, teamGroupsForSetup } from "../src/ui/teamDisplay.js";

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
});
