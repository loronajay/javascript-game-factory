import test from "node:test";
import assert from "node:assert/strict";

import { CPU_KNOBS, cpuControls } from "../scripts/sim/cpu.js";
import { createMatch, stepMatch } from "../scripts/sim/match.js";
import { createSession, stepSession } from "../scripts/sim/session.js";
import { CPU_LEVEL_IDS } from "../../pet-games/shared/sim/levels.js";

const corgi = (id) => ({ instanceId: id, name: id, speciesId: "pet.corgi", paletteId: "standard", stats: { speed: 60, strength: 60, size: 1 } });

test("every shared CPU level has hands in this event", () => {
  assert.deepEqual(Object.keys(CPU_KNOBS).sort(), [...CPU_LEVEL_IDS].sort());
});

test("CPU pets recover toward safety near the rim", () => {
  const actor = { id: "cpu", x: 235, y: 0, vx: 0, vy: 0, facingX: 1, facingY: 0, bumpCooldown: 0 };
  const target = { id: "hero", x: 210, y: 0, eliminated: false };
  const other = { id: "other", x: 0, y: 0, eliminated: false };
  for (const level of CPU_LEVEL_IDS) {
    const controls = cpuControls(actor, [actor, target, other], 4, { level, seed: 1, memory: {} });
    assert.ok(controls.x <= 0, level);
    assert.equal(controls.bump, false, level);
  }
});

test("a CPU with pace behind it bumps a lined-up pet in reach", () => {
  const actor = { id: "cpu", x: 0, y: 0, vx: 160, vy: 0, facingX: 1, facingY: 0, bumpCooldown: 0 };
  const target = { id: "hero", x: 60, y: 0, vx: 0, vy: 0, eliminated: false };
  const controls = cpuControls(actor, [actor, target], 10, { level: "champion", seed: 1, memory: {}, roundSeconds: 30 });
  assert.ok(controls.x > 0.9);
  assert.equal(controls.bump, true);
});

test("a disciplined CPU stuck against a pet with no pace backs off for a run-up instead of shoving", () => {
  const actor = { id: "cpu", x: 0, y: 0, vx: 0, vy: 0, facingX: 1, facingY: 0, bumpCooldown: 0 };
  const target = { id: "hero", x: 45, y: 0, vx: 0, vy: 0, eliminated: false };
  const memory = {};
  const controls = cpuControls(actor, [actor, target], 10, { level: "champion", seed: 1, memory, roundSeconds: 1 });
  assert.equal(controls.bump, false);
  assert.ok(controls.x < 0, "it moves away from the pet it is stuck on");
  assert.ok(memory.retreatUntil > 10, "and remembers to keep backing off for a while");
});

test("a lone CPU pushes a pet that never moves off the island at every level", () => {
  for (const level of CPU_LEVEL_IDS) {
    const session = createSession({ entrants: [{ id: "statue", pet: corgi("statue") }, { id: "cpu", pet: corgi("cpu"), cpu: level }], seed: 3 });
    while (session.phase !== "round-over" && session.phase !== "match-over" && session.tick < 60 * 60) stepSession(session);
    assert.equal(session.match.roundWinnerId, "cpu", level);
    assert.ok(session.match.roundTicks / 60 < 15, `${level} took ${session.match.roundTicks / 60}s`);
  }
});

test("a fully CPU-driven round resolves instead of circling forever", () => {
  const match = createMatch([0, 1, 2, 3].map((index) => corgi(`cpu-${index}`)));
  for (let index = 0; index < 60 * 45 && match.phase === "playing"; index += 1) {
    const controls = Object.fromEntries(match.players.map((player) => [player.id, cpuControls(player, match.players, match.tick, { islandRadius: match.islandRadius, roundSeconds: match.roundTicks / 60 })]));
    stepMatch(match, controls, 1 / 60);
  }
  assert.notEqual(match.phase, "playing");
});

function soloWins(level, rivals, seeds) {
  let wins = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const entrants = [{ id: "solo", pet: corgi("solo"), cpu: level }, ...[1, 2, 3].map((index) => ({ id: `rival-${index}`, pet: corgi(`rival-${index}`), cpu: rivals }))];
    const session = createSession({ entrants, seed });
    while (session.phase !== "complete" && session.tick < 60 * 600) stepSession(session);
    assert.equal(session.phase, "complete", "every match finishes");
    if (session.match.matchWinnerId === "solo") wins += 1;
  }
  return wins;
}

test("a better CPU beats a field of weaker ones more often than chance", () => {
  // Chance, alone against three, is one match in four.
  assert.ok(soloWins("champion", "rookie", 4) >= 3);
  assert.ok(soloWins("pro", "rookie", 4) >= 3);
  assert.ok(soloWins("champion", "pro", 4) >= 2);
});
