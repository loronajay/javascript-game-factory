import test from "node:test";
import assert from "node:assert/strict";

import { playablePets, cpuFieldFor } from "../scripts/pets.js";

test("only living farm pets with profiles become selectable racers", () => {
  const pets = playablePets({ pets: [
    { instanceId: "corgi-1", speciesId: "pet.corgi", name: "Biscuit", profile: { stats: { speed: 64, strength: 42 }, size: { current: 0.8 }, paletteId: "sable" } },
    { instanceId: "future-1", speciesId: "pet.future", name: "Mystery", profile: null },
  ] });

  assert.deepEqual(pets, [{
    instanceId: "corgi-1",
    speciesId: "pet.corgi",
    name: "Biscuit",
    paletteId: "sable",
    stats: { speed: 64, strength: 42, size: 0.8 },
  }]);
});

test("a local starter is available when the farm has no eligible pet", () => {
  assert.equal(playablePets({ pets: [] })[0].name, "Borrowed Biscuit");
});

test("CPU fields are stable, varied matchups and cap the full race at eight pets", () => {
  const selected = playablePets({ pets: [] })[0];
  assert.deepEqual(cpuFieldFor(selected, 7), cpuFieldFor(selected, 7));
  const rivals = cpuFieldFor(selected, 99);
  assert.equal(rivals.length, 7);
  assert.ok(new Set(rivals.map((rival) => rival.speciesId)).size > 1);
  assert.ok(rivals.every((rival) => Math.abs((rival.stats.speed + rival.stats.strength) - (selected.stats.speed + selected.stats.strength)) <= 16));
});
