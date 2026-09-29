import test from "node:test";
import assert from "node:assert/strict";

import { ANIMAL_CATALOG } from "../../../js/farm-catalog/animals.mjs";
import { RIVALS, SPECIES_IDS, SPECIES_PALETTES, findRival, noise, pickRivals, rivalAsPet, sanitizePet } from "../shared/sim/rivals.js";
import { CPU_LEVEL_IDS, cpuLevelFromIndex, cpuLevelIndex, normalizeCpuLevel } from "../shared/sim/levels.js";

test("the rival pool's species and coats are exactly the farm's Pet Games animals (never the horse)", () => {
  const farm = Object.fromEntries(ANIMAL_CATALOG.filter((animal) => animal.petGames).map((animal) => [animal.id, animal.palettes.map((palette) => palette.id)]));
  assert.deepEqual([...SPECIES_IDS].sort(), Object.keys(farm).sort());
  for (const species of SPECIES_IDS) assert.deepEqual([...SPECIES_PALETTES[species]].sort(), [...farm[species]].sort(), species);
});

test("the pool is big, unique, and every rival is a real pet in the farm's stat range", () => {
  assert.ok(RIVALS.length >= 40);
  assert.equal(new Set(RIVALS.map((rival) => rival.id)).size, RIVALS.length);
  assert.equal(new Set(RIVALS.map((rival) => rival.name)).size, RIVALS.length);
  for (const rival of RIVALS) {
    assert.ok(SPECIES_PALETTES[rival.speciesId]?.includes(rival.paletteId), rival.id);
    assert.ok([1, 2, 3].includes(rival.tier), rival.id);
    assert.deepEqual(sanitizePet(rivalAsPet(rival)).stats, rival.stats, `${rival.id} is outside the farm's ranges`);
    assert.equal(findRival(rival.id), rival);
  }
  for (const species of SPECIES_IDS) assert.ok(RIVALS.some((rival) => rival.speciesId === species), `no rival is a ${species}`);
});

test("a draw is deterministic, distinct, respects exclusions, and a level shapes the grid", () => {
  const draw = pickRivals({ seed: "field", count: 7, level: "pro" });
  assert.deepEqual(pickRivals({ seed: "field", count: 7, level: "pro" }), draw);
  assert.equal(new Set(draw.map((rival) => rival.id)).size, 7);
  const excluded = pickRivals({ seed: "field", count: 7, level: "pro", exclude: draw.map((rival) => rival.id) });
  assert.ok(excluded.every((rival) => !draw.includes(rival)));

  const averageTier = (level) => {
    let total = 0;
    let count = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      for (const rival of pickRivals({ seed: `s${seed}`, count: 7, level })) { total += rival.tier; count += 1; }
    }
    return total / count;
  };
  assert.ok(averageTier("rookie") < averageTier("pro"));
  assert.ok(averageTier("pro") < averageTier("champion"));
});

test("noise is a deterministic 0..1 sample", () => {
  assert.equal(noise(1, "a", 2), noise(1, "a", 2));
  assert.notEqual(noise(1, "a", 2), noise(1, "a", 3));
  for (let index = 0; index < 500; index += 1) {
    const value = noise("x", index);
    assert.ok(value >= 0 && value < 1);
  }
});

test("a pet crossing a trust boundary is held to the farm's shape", () => {
  const cleaned = sanitizePet({ speciesId: "pet.dragon", name: "   A  very   long  name that goes on and on ", paletteId: "gold", stats: { speed: 900, strength: -4, size: 9 } });
  assert.equal(cleaned.speciesId, "pet.corgi");
  assert.equal(cleaned.paletteId, "standard");
  assert.ok(cleaned.name.length <= 20);
  assert.deepEqual(cleaned.stats, { speed: 100, strength: 0, size: 1.12 });
  assert.equal(sanitizePet({ speciesId: "pet.shark", paletteId: "voidfin" }).paletteId, "voidfin");
  assert.equal(sanitizePet(null).name, "Farm Pet");
});

test("CPU levels round-trip through the lobby's small integer", () => {
  for (const level of CPU_LEVEL_IDS) assert.equal(cpuLevelFromIndex(cpuLevelIndex(level)), level);
  assert.equal(normalizeCpuLevel("impossible"), "pro");
  assert.equal(cpuLevelFromIndex(99), "champion");
  assert.equal(cpuLevelFromIndex("x"), "pro");
});
