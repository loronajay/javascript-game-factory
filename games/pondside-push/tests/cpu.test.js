import test from "node:test";
import assert from "node:assert/strict";

import { cpuControls } from "../scripts/cpu.js";
import { createMatch, stepMatch } from "../scripts/match.js";

test("CPU pets recover toward safety near the rim", () => {
  const actor = { id: "cpu", x: 235, y: 0, facingX: 1, facingY: 0, bumpCooldown: 0 };
  const target = { id: "hero", x: 210, y: 0, eliminated: false };
  const other = { id: "other", x: 0, y: 0, eliminated: false };
  const controls = cpuControls(actor, [actor, target, other], 4);
  assert.ok(controls.x < 0);
  assert.equal(controls.bump, false);
});

test("CPU pets chase and bump aligned nearby opponents away from the rim", () => {
  const actor = { id: "cpu", x: 0, y: 0, facingX: 1, facingY: 0, bumpCooldown: 0 };
  const target = { id: "hero", x: 50, y: 0, eliminated: false };
  const controls = cpuControls(actor, [actor, target], 10);
  assert.ok(controls.x > 0.9);
  assert.equal(controls.bump, true);
});

test("a fully CPU-driven round resolves instead of circling forever", () => {
  const pets = Array.from({ length: 4 }, (_, index) => ({
    instanceId: `cpu-${index}`,
    name: `CPU ${index}`,
    speciesId: "pet.corgi",
    paletteId: "standard",
    stats: { speed: 50, strength: 50, size: 1 },
  }));
  const match = createMatch(pets);
  for (let index = 0; index < 60 * 45 && match.phase === "playing"; index += 1) {
    const controls = Object.fromEntries(match.players.map((player) => [player.id, cpuControls(player, match.players, match.tick)]));
    stepMatch(match, controls, 1 / 60);
  }
  assert.notEqual(match.phase, "playing");
});
