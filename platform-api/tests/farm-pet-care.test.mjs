import test from "node:test";
import assert from "node:assert/strict";

import { normalizeFarmGarage } from "../src/services/farm-loadout-catalog.mjs";

test("the farm trust boundary preserves bounded pet profiles and supply stacks", () => {
  const garage = normalizeFarmGarage({
    version: 3,
    pets: [{
      instanceId: "corgi-1",
      speciesId: "pet.corgi",
      name: "Biscuit",
      profile: {
        gender: "female",
        ageDays: 12.25,
        affection: 50,
        hunger: 80,
        starvingMinutes: 90,
        happiness: 90,
        size: { current: 0.75, max: 1.05, growthPerDay: 0.004 },
        stats: { speed: 48, strength: 37 },
        traits: ["held.loves", "movement.fast"],
        milestones: ["dwelling:decor.prop.doghouse", "bad", "dwelling:decor.prop.doghouse"],
        paletteId: "midnight",
      },
    }],
    agriculture: {
      inventory: { supplies: { "food.dog-food": 20, "bad item!": 2 } },
      crops: [],
    },
  });

  assert.deepEqual(garage.agriculture.inventory.supplies, { "food.dog-food": 20 });
  assert.deepEqual(garage.pets[0].profile, {
    gender: "female",
    ageDays: 12.25,
    affection: 50,
    hunger: 80,
    starvingMinutes: 90,
    happiness: 90,
    size: { current: 0.75, max: 1.05, growthPerDay: 0.004 },
    stats: { speed: 48, strength: 37 },
    traits: ["held.loves", "movement.fast"],
    milestones: ["dwelling:decor.prop.doghouse"],
    paletteId: "midnight",
  });
});

test("the trust boundary preserves the longer provisional lifespans used by non-dog species", () => {
  const garage = normalizeFarmGarage({
    version: 3,
    pets: [{
      instanceId: "shark-1",
      speciesId: "pet.shark",
      name: "Finn",
      profile: { ageDays: 140 },
    }],
    agriculture: { inventory: { supplies: { "food.shark-feed": 4 } }, crops: [] },
  });
  assert.equal(garage.pets[0].profile.ageDays, 140);
  assert.equal(garage.agriculture.inventory.supplies["food.shark-feed"], 4);
});
