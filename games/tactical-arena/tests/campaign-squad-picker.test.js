import test from "node:test";
import assert from "node:assert/strict";

import { campaignUnitChoiceGroups } from "../src/ui/menuFlow.js";

test("campaign squad choices are grouped by class and exclude units picked in other slots", () => {
  const groups = campaignUnitChoiceGroups(
    ["swordsman", "archer", "mystic", "magician", "clod"],
    ["swordsman", null],
    1,
  );

  assert.deepEqual(groups.map((group) => group.label), ["Rangers", "Supports", "Mages", "Tanks"]);
  assert.deepEqual(groups.flatMap((group) => group.choices.map((choice) => choice.value)), [
    "archer",
    "mystic",
    "magician",
    "clod",
  ]);
});

test("campaign squad choices keep the current slot's unit available for reselecting", () => {
  const groups = campaignUnitChoiceGroups(
    ["swordsman", "archer", "mystic"],
    ["swordsman", "archer"],
    0,
  );

  assert.deepEqual(groups.flatMap((group) => group.choices.map((choice) => choice.value)), [
    "swordsman",
    "mystic",
  ]);
});
