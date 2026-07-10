import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import {
  UNIT_TYPE_KEYS,
  DEFAULT_SQUAD,
  STARTER_UNIT_TYPES,
  UNIT_CLASS_GROUPS,
  availableTypesForSlot,
  groupedUnitTypes,
  isUnitUnlocked,
  normalizeSquadLoadout
} from "../src/ui/squadModel.js";
// Importing through squadPicker.js also loads rosterPicker.js — this guards that
// the picker modules don't touch the DOM at import time (Node has no `document`).
import { availableTypesForSlot as availableViaPicker, normalizeSquad } from "../src/ui/squadPicker.js";

test("default squad is four distinct draftable units", () => {
  assert.equal(DEFAULT_SQUAD.length, 4);
  assert.equal(new Set(DEFAULT_SQUAD).size, 4);
  for (const type of DEFAULT_SQUAD) assert.ok(UNIT_TYPE_KEYS.includes(type));
});

test("the Ghoul (summon) is never offered in the picker pool", () => {
  assert.ok(!UNIT_TYPE_KEYS.includes("ghoul"));
});

test("every draftable unit declares a picker class", () => {
  const classIds = UNIT_CLASS_GROUPS.map((group) => group.id);
  for (const type of UNIT_TYPE_KEYS) {
    assert.ok(classIds.includes(UNIT_TYPES[type].classType), `${type} is missing a valid classType`);
  }
});

test("unit picker groups draftable units by class in roster order", () => {
  assert.deepEqual(groupedUnitTypes(), [
    { id: "melee", label: "Melees", types: ["swordsman", "paladin", "monk", "fat-knight"] },
    { id: "ranger", label: "Rangers", types: ["archer", "sniper", "angel", "fat-bowman", "miner"] },
    { id: "support", label: "Supports", types: ["mystic", "witch-doctor", "father-time", "king", "fat-cleric"] },
    { id: "mage", label: "Mages", types: ["magician", "necromancer", "nemesis", "virus", "fat-wizard"] },
    { id: "tank", label: "Tanks", types: ["juggernaut", "gargoyle", "clod"] }
  ]);
  assert.deepEqual(groupedUnitTypes(["ghoul"]), [
    { id: "summon", label: "Summons", types: ["ghoul"] }
  ]);
});

test("duplicates allowed: every unlocked (starter) type stays selectable for any slot", () => {
  const squad = ["swordsman", "swordsman", "archer", "mystic"];
  assert.deepEqual(availableTypesForSlot(squad, 1, true), [...STARTER_UNIT_TYPES]);
});

test("duplicates blocked: types used in other slots drop out, the slot's own stays", () => {
  const squad = ["swordsman", "archer", "mystic", "magician"];
  const available = availableTypesForSlot(squad, 0, false);
  // Slot 0 currently holds swordsman, so swordsman is still allowed for slot 0...
  assert.ok(available.includes("swordsman"));
  // ...but units sitting in the other three slots are not.
  assert.ok(!available.includes("archer"));
  assert.ok(!available.includes("mystic"));
  assert.ok(!available.includes("magician"));
});

test("campaign lock: only the four starter units are selectable, the rest of the roster is locked", () => {
  for (const type of STARTER_UNIT_TYPES) assert.equal(isUnitUnlocked(type), true, `${type} should be unlocked`);
  const lockedSample = UNIT_TYPE_KEYS.filter((type) => !STARTER_UNIT_TYPES.includes(type));
  assert.ok(lockedSample.length > 0);
  for (const type of lockedSample) assert.equal(isUnitUnlocked(type), false, `${type} should be locked`);

  const squad = ["swordsman", "archer", "mystic", "magician"];
  const available = availableTypesForSlot(squad, 0, true);
  assert.ok(!available.includes("paladin"));
  assert.ok(!available.includes("sniper"));
});

test("squadPicker re-exports the model without DOM access at import time", () => {
  assert.equal(typeof availableViaPicker, "function");
  assert.deepEqual(normalizeSquad(["archer"]), ["archer", "archer", "mystic", "magician"]);
});

test("squad loadouts preserve legacy composition arrays and normalize slot skins", () => {
  assert.deepEqual(normalizeSquadLoadout(["archer"]), {
    composition: ["archer", "archer", "mystic", "magician"],
    skins: [null, null, null, null]
  });
  assert.deepEqual(normalizeSquadLoadout({
    composition: ["swordsman", "archer", "mystic", "magician"],
    skins: ["summer-vibes", "missing", null, "summer-vibes"]
  }), {
    composition: ["swordsman", "archer", "mystic", "magician"],
    skins: [null, null, null, null]
  });
});
