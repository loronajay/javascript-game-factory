import test from "node:test";
import assert from "node:assert/strict";

import { beginActivation } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState } from "../src/core/state.js";
import { buildRankedUnitReport, readableError, squadForSeat } from "../src/match/matchBuilder.js";

test("first-actor gate message names Mother Nature instead of King", () => {
  const state = createBattleState({
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 1 },
      { id: "ally", type: "swordsman", player: 1, x: 2, y: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });

  const blocked = applyCommand(state, beginActivation(1, "ally"));

  assert.equal(blocked.accepted, false);
  assert.equal(blocked.errorCode, "KING_MUST_ACT_FIRST");
  assert.equal(
    readableError(blocked.errorCode, state, 1),
    "Mother Nature must act before the rest of the squad may act."
  );
});

test("first-actor gate message keeps the King command wording for King", () => {
  const state = createBattleState({
    units: [
      { id: "king", type: "king", player: 1, x: 1, y: 1 },
      { id: "ally", type: "swordsman", player: 1, x: 2, y: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });

  const blocked = applyCommand(state, beginActivation(1, "ally"));

  assert.equal(blocked.accepted, false);
  assert.equal(blocked.errorCode, "KING_MUST_ACT_FIRST");
  assert.equal(
    readableError(blocked.errorCode, state, 1),
    "Your King must issue his command before the rest of the squad may act."
  );
});

test("buildRankedUnitReport captures every real unit's seat + alive state, excluding summons", () => {
  const state = createBattleState({
    units: [
      { id: "p1-0-swordsman", type: "swordsman", player: 1, x: 1, y: 1 },
      { id: "p1-1-mystic", type: "mystic", player: 1, x: 2, y: 1, hp: 0 },
      { id: "p2-0-archer", type: "archer", player: 2, x: 7, y: 7 },
      { id: "p2-ghoul", type: "ghoul", player: 2, x: 6, y: 7 }
    ]
  });

  const report = buildRankedUnitReport(state);
  const ids = report.units.map((u) => u.id).sort();
  assert.deepEqual(ids, ["p1-0-swordsman", "p1-1-mystic", "p2-0-archer"], "summoned ghoul excluded");

  const byId = Object.fromEntries(report.units.map((u) => [u.id, u]));
  assert.deepEqual(byId["p1-0-swordsman"], { id: "p1-0-swordsman", seat: 1, type: "swordsman", alive: true });
  assert.equal(byId["p1-1-mystic"].alive, false, "hp 0 reads as dead");
  assert.equal(byId["p2-0-archer"].seat, 2);
});

test("squadForSeat lists a seat's real unit types (alive or dead), excluding summons", () => {
  const state = createBattleState({
    units: [
      { id: "p1-0-swordsman", type: "swordsman", player: 1, x: 1, y: 1 },
      { id: "p1-1-mystic", type: "mystic", player: 1, x: 2, y: 1, hp: 0 },
      { id: "p2-0-archer", type: "archer", player: 2, x: 7, y: 7 },
      { id: "p2-ghoul", type: "ghoul", player: 2, x: 6, y: 7 }
    ]
  });
  assert.deepEqual(squadForSeat(state, 1), ["swordsman", "mystic"]);
  assert.deepEqual(squadForSeat(state, 2), ["archer"], "ghoul summon excluded from squad");
});
