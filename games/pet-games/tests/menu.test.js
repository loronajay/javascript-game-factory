import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cpuFieldFor, playablePets } from "../shared/pets.js";

const root = resolve(import.meta.dirname, "..");

test("the Pet Games hub offers both playable events and returns to the farm", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  assert.match(html, /Barnyard Dash/);
  assert.match(html, /Pondside Push/);
  assert.match(html, /\.\.\/barnyard-dash\/index\.html/);
  assert.match(html, /\.\.\/pondside-push\/index\.html/);
  assert.match(html, /\.\.\/\.\.\/farm\//);
});

test("the farm routes Pet Games through the hub instead of one event", () => {
  const farm = readFileSync(resolve(root, "..", "..", "farm", "index.html"), "utf8");
  assert.match(farm, /id="openPetGames" href="\.\.\/games\/pet-games\/index\.html"/);
  assert.doesNotMatch(farm, /id="openPetGames" href="\.\.\/games\/barnyard-dash/);
});

test("the shared adapter preserves canonical farm speed, strength, and current size", () => {
  const [pet] = playablePets({
    pets: [{
      instanceId: "pet-1",
      speciesId: "pet.corgi",
      name: "Biscuit",
      profile: {
        paletteId: "standard",
        stats: { speed: 87, strength: 23 },
        size: { current: 0.76, max: 1.08 },
      },
    }],
  });

  assert.deepEqual(pet.stats, { speed: 87, strength: 23, size: 0.76 });
});

test("CPU rivals do not rubber-band their stats to the selected farm pet", () => {
  const selected = {
    instanceId: "pet-1",
    speciesId: "pet.corgi",
    name: "Biscuit",
    paletteId: "standard",
    stats: { speed: 5, strength: 10, size: 0.65 },
  };
  const upgraded = {
    ...selected,
    stats: { speed: 95, strength: 90, size: 1.15 },
  };

  const originalField = cpuFieldFor(selected, 3).map((pet) => pet.stats);
  const upgradedField = cpuFieldFor(upgraded, 3).map((pet) => pet.stats);
  assert.deepEqual(upgradedField, originalField);
});
