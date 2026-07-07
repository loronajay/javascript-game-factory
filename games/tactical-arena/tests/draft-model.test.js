import test from "node:test";
import assert from "node:assert/strict";

import {
  DRAFT_PICK_ORDER,
  applyDraftPick,
  canDraftType,
  createDraftState,
  currentDraftSeat,
  draftedTypes,
  isDraftComplete,
} from "../src/ui/draftModel.js";

test("draft uses a snake pick order for two four-unit squads", () => {
  assert.deepEqual(DRAFT_PICK_ORDER, [1, 2, 2, 1, 1, 2, 2, 1]);
});

test("draft rejects duplicates across both teams", () => {
  let draft = createDraftState();

  let result = applyDraftPick(draft, { seat: 1, type: "swordsman" });
  assert.equal(result.accepted, true);
  draft = result.nextState;

  assert.equal(canDraftType(draft, 2, "swordsman"), false);
  result = applyDraftPick(draft, { seat: 2, type: "swordsman" });
  assert.equal(result.accepted, false);
  assert.equal(currentDraftSeat(draft), 2);
});

test("draft completes with four unique units per seat", () => {
  let draft = createDraftState();
  for (const [seat, type] of [
    [1, "swordsman"],
    [2, "archer"],
    [2, "mystic"],
    [1, "magician"],
    [1, "paladin"],
    [2, "sniper"],
    [2, "angel"],
    [1, "witch-doctor"],
  ]) {
    const result = applyDraftPick(draft, { seat, type });
    assert.equal(result.accepted, true, `${seat} should draft ${type}`);
    draft = result.nextState;
  }

  assert.equal(isDraftComplete(draft), true);
  assert.deepEqual(draft.picks[1], ["swordsman", "magician", "paladin", "witch-doctor"]);
  assert.deepEqual(draft.picks[2], ["archer", "mystic", "sniper", "angel"]);
  assert.equal(draftedTypes(draft).size, 8);
});
