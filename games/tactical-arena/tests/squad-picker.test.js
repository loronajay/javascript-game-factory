import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import {
  UNIT_TYPE_KEYS,
  DEFAULT_SQUAD,
  UNIT_CLASS_GROUPS,
  availableTypesForSlot,
  groupedUnitTypes
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
    { id: "melee", label: "Melees", types: ["swordsman", "paladin", "monk"] },
    { id: "ranger", label: "Rangers", types: ["archer", "sniper", "angel"] },
    { id: "support", label: "Supports", types: ["mystic", "witch-doctor", "father-time", "king"] },
    { id: "mage", label: "Mages", types: ["magician", "necromancer", "nemesis"] },
    { id: "tank", label: "Tanks", types: ["juggernaut", "gargoyle"] }
  ]);
  assert.deepEqual(groupedUnitTypes(["ghoul"]), [
    { id: "summon", label: "Summons", types: ["ghoul"] }
  ]);
});

test("duplicates allowed: every roster type stays selectable for any slot", () => {
  const squad = ["swordsman", "swordsman", "archer", "mystic"];
  assert.deepEqual(availableTypesForSlot(squad, 1, true), [...UNIT_TYPE_KEYS]);
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

test("squadPicker re-exports the model without DOM access at import time", () => {
  assert.equal(typeof availableViaPicker, "function");
  assert.deepEqual(normalizeSquad(["archer"]), ["archer", "archer", "mystic", "magician"]);
});
