import test from "node:test";
import assert from "node:assert/strict";

import {
  DRAFT_PICK_ORDER,
  applyDraftPick,
  arrangeDraftLoadout,
  canDraftType,
  createDraftState,
  currentDraftSeat,
  draftedTypes,
  isDraftComplete,
} from "../src/ui/draftModel.js";

test("draft uses a snake pick order for two four-unit squads", () => {
  assert.deepEqual(DRAFT_PICK_ORDER, [1, 2, 2, 1, 1, 2, 2, 1]);
});

test("draft formation order reorders composition and skins without changing picks", () => {
  let draft = createDraftState();
  for (const [seat, type, skin] of [
    [1, "swordsman", "summer-vibes"],
    [2, "archer", null],
    [2, "mystic", "summer-vibes"],
    [1, "magician", "summer-vibes"],
    [1, "paladin", "summer-vibes"],
    [2, "sniper", null],
    [2, "angel", "summer-vibes"],
    [1, "witch-doctor", "summer-vibes"],
  ]) {
    const result = applyDraftPick(draft, { seat, type, skin, isUnlocked: () => true });
    assert.equal(result.accepted, true);
    draft = result.nextState;
  }

  const loadout = arrangeDraftLoadout(draft, 1, [2, 0, 3, 1]);
  assert.deepEqual(loadout.composition, ["paladin", "swordsman", "witch-doctor", "magician"]);
  // Skins are all locked right now, so every slug normalizes to classic (null)
  // regardless of what was picked during the draft.
  assert.deepEqual(loadout.skins, [null, null, null, null]);
  assert.deepEqual(draft.picks[1], ["swordsman", "magician", "paladin", "witch-doctor"]);
});

test("draft formation falls back to pick order unless order is a full permutation", () => {
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
    const result = applyDraftPick(draft, { seat, type, isUnlocked: () => true });
    assert.equal(result.accepted, true);
    draft = result.nextState;
  }

  assert.deepEqual(arrangeDraftLoadout(draft, 1, [0, 0, 1, 2]).composition, draft.picks[1]);
  assert.deepEqual(arrangeDraftLoadout(draft, 1, null).composition, draft.picks[1]);
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
    const result = applyDraftPick(draft, { seat, type, isUnlocked: () => true });
    assert.equal(result.accepted, true, `${seat} should draft ${type}`);
    draft = result.nextState;
  }

  assert.equal(isDraftComplete(draft), true);
  assert.deepEqual(draft.picks[1], ["swordsman", "magician", "paladin", "witch-doctor"]);
  assert.deepEqual(draft.picks[2], ["archer", "mystic", "sniper", "angel"]);
  assert.equal(draftedTypes(draft).size, 8);
});

test("draft blocks non-starter units by default (campaign lock, no unlock system yet)", () => {
  let draft = createDraftState();
  assert.equal(canDraftType(draft, 1, "paladin"), false);

  let result = applyDraftPick(draft, { seat: 1, type: "paladin" });
  assert.equal(result.accepted, false);

  assert.equal(canDraftType(draft, 1, "swordsman"), true);
  result = applyDraftPick(draft, { seat: 1, type: "swordsman" });
  assert.equal(result.accepted, true);
  draft = result.nextState;
  assert.deepEqual(draft.picks[1], ["swordsman"]);
});

test("draft stores normalized skin selections alongside each seat's picks", () => {
  let draft = createDraftState();

  let result = applyDraftPick(draft, { seat: 1, type: "swordsman", skin: "summer-vibes" });
  assert.equal(result.accepted, true);
  draft = result.nextState;

  result = applyDraftPick(draft, { seat: 2, type: "archer", skin: "not-real" });
  assert.equal(result.accepted, true);
  draft = result.nextState;

  assert.deepEqual(draft.picks[1], ["swordsman"]);
  // Skins are all locked right now, so a picked slug normalizes to classic (null).
  assert.deepEqual(draft.skins[1], [null]);
  assert.deepEqual(draft.picks[2], ["archer"]);
  assert.deepEqual(draft.skins[2], [null]);
});
