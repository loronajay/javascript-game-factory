import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import {
  DRAFT_BATTLE_REQUIRED_UNITS,
  RANKED_BATTLE_REQUIRED_UNITS,
  isDraftBattleAvailable,
  isRankedBattleAvailable,
  unlockedDraftUnitCount,
} from "../src/progression/draftAvailability.js";
import { writeUnlockProgress } from "../src/progression/unlocks.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const DRAFTABLE_TYPES = Object.freeze(Object.keys(UNIT_TYPES).filter((type) => !UNIT_TYPES[type].summon));

test("draft availability counts every campaign and shop unlocked draftable unit", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    unlockedUnits: DRAFTABLE_TYPES,
  });

  assert.equal(unlockedDraftUnitCount(storage), DRAFTABLE_TYPES.length);
  assert.equal(isDraftBattleAvailable(storage), true);
});

test("draft availability ignores summon-only units when checking the threshold", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    unlockedUnits: [...DRAFTABLE_TYPES.slice(0, DRAFT_BATTLE_REQUIRED_UNITS - 1), "ghoul"],
  });

  assert.equal(unlockedDraftUnitCount(storage), DRAFT_BATTLE_REQUIRED_UNITS - 1);
  assert.equal(isDraftBattleAvailable(storage), false);
});

test("ranked requires a bigger pool than plain draft to survive the ban phase", () => {
  assert.ok(RANKED_BATTLE_REQUIRED_UNITS > DRAFT_BATTLE_REQUIRED_UNITS);

  // Exactly enough for draft, but short of the ranked (draft + bans) threshold.
  const draftOnly = storageAdapter();
  writeUnlockProgress(draftOnly, {
    unlockedUnits: DRAFTABLE_TYPES.slice(0, DRAFT_BATTLE_REQUIRED_UNITS),
  });
  assert.equal(isDraftBattleAvailable(draftOnly), true);
  assert.equal(isRankedBattleAvailable(draftOnly), false);

  // Meeting the ranked threshold unlocks both.
  const rankedReady = storageAdapter();
  writeUnlockProgress(rankedReady, {
    unlockedUnits: DRAFTABLE_TYPES.slice(0, RANKED_BATTLE_REQUIRED_UNITS),
  });
  assert.equal(isRankedBattleAvailable(rankedReady), true);
});
