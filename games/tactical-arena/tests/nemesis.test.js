import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, defend, finishActivation, moveUnit, useArt } from "../src/core/commands.js";
import { UNIT_TYPES, getArt, getArtMpCost, getUnitType } from "../src/core/unitCatalog.js";
import { getDarkPulseRays, getDarkPulseTargets } from "../src/rules/arts.js";
import { resolveBaseStrike } from "../src/rules/combat.js";
import { applyStatus, statusImmunities } from "../src/rules/statuses.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

function scenario(units) {
  return createBattleState({ size: 13, seed: 5, units });
}

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

test("Nemesis is registered with mage stats and authored abilities", () => {
  const def = getUnitType("nemesis");
  assert.equal(def.name, "Nemesis");
  assert.equal(def.classType, "mage");
  assert.deepEqual(def.stats, {
    moveRange: 3,
    attackRange: 5,
    strength: 7,
    defense: 2,
    maxHp: 25,
    maxMp: 45
  });
  assert.equal(def.passive.id, "realm-of-magic");
  assert.deepEqual(def.arts.map((art) => art.id), ["dark-pulse", "realm-traversal", "nullify"]);
  assert.equal(getArt("nemesis", "realm-traversal").selfCast, true);
  assert.equal(def.ragePassive.id, "regenerate");
});

test("Realm of Magic boosts allied magic damage and floors allied MP costs at 1", () => {
  const state = scenario([
    { id: "nem", type: "nemesis", player: 1, x: 0, y: 0 },
    { id: "mag", type: "magician", player: 1, x: 1, y: 0 },
    { id: "foe", type: "swordsman", player: 2, x: 4, y: 0 }
  ]);
  const mag = findUnit(state, "mag");
  const foe = findUnit(state, "foe");
  assert.equal(resolveBaseStrike(mag, foe, { damageType: "magic", state }).damage, 7);
  assert.equal(getArtMpCost(mag, getArt("magician", "spark"), state), 3);
  assert.equal(getArtMpCost(mag, { id: "cheap", mpCost: 1 }, state), 1);
});

test("Nullify grants silence immunity, but Nemesis is no longer immune to magic damage", () => {
  const state = scenario([
    { id: "nem", type: "nemesis", player: 1, x: 0, y: 0 },
    { id: "mag", type: "magician", player: 2, x: 3, y: 0 }
  ]);
  const nem = findUnit(state, "nem");
  assert.ok(statusImmunities(nem).has("silence"));
  assert.equal(applyStatus(nem, { type: "silence", duration: 1 }).applied, false);
  // Magic immunity was removed (reserved for a future dedicated magic-immune unit); an
  // enemy Magician's STR-6 magic bolt now lands in full, ignoring Nemesis's DEF.
  assert.equal(resolveBaseStrike(findUnit(state, "mag"), nem, { damageType: "magic", state }).damage, 6);
});

test("Dark Pulse hits the first unit on each ray, damaging enemies and healing allies", () => {
  const state = scenario([
    { id: "nem", type: "nemesis", player: 1, x: 6, y: 6 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 8, hp: 10 },
    { id: "behind", type: "swordsman", player: 2, x: 6, y: 10 },
    { id: "enemy", type: "swordsman", player: 2, x: 8, y: 6 },
    { id: "diag", type: "swordsman", player: 2, x: 8, y: 8 },
    { id: "off", type: "swordsman", player: 2, x: 8, y: 9 }
  ]);
  const targets = getDarkPulseTargets(state, findUnit(state, "nem"));
  assert.deepEqual(targets.map((entry) => entry.unit.id).sort(), ["ally", "diag", "enemy"]);

  let s = run(state, beginActivation(1, "nem")).nextState;
  const result = run(s, useArt(1, "nem", "dark-pulse", {}));
  s = result.nextState;
  const event = result.events.find((e) => e.artId === "dark-pulse");
  assert.deepEqual(event.targetIds.sort(), ["ally", "diag", "enemy"]);
  assert.equal(findUnit(s, "ally").hp, 11);
  assert.equal(findUnit(s, "enemy").hp, UNIT_TYPES.swordsman.stats.maxHp - 6);
  assert.equal(findUnit(s, "diag").hp, UNIT_TYPES.swordsman.stats.maxHp - 6);
  assert.equal(findUnit(s, "behind").hp, UNIT_TYPES.swordsman.stats.maxHp, "ally contact stops that ray");
});

test("Dark Pulse ray data includes unit, wall, and arena-border stops for animation", () => {
  const state = createBattleState({
    size: 5,
    seed: 5,
    units: [
      { id: "nem", type: "nemesis", player: 1, x: 2, y: 2 },
      { id: "enemy", type: "swordsman", player: 2, x: 4, y: 2 }
    ],
    tileObjects: [{ kind: "wall", x: 1, y: 2, hp: 1 }]
  });
  const rays = getDarkPulseRays(state, findUnit(state, "nem"));
  assert.equal(rays.length, 8);
  assert.deepEqual(rays.find((ray) => ray.dir.x === 1 && ray.dir.y === 0), {
    dir: { x: 1, y: 0 },
    distance: 2,
    stopKind: "unit",
    position: { x: 4, y: 2 },
    targetId: "enemy",
    unit: findUnit(state, "enemy")
  });
  assert.deepEqual(rays.find((ray) => ray.dir.x === -1 && ray.dir.y === 0), {
    dir: { x: -1, y: 0 },
    distance: 1,
    stopKind: "wall",
    position: { x: 1, y: 2 }
  });
  assert.deepEqual(rays.find((ray) => ray.dir.x === 0 && ray.dir.y === -1), {
    dir: { x: 0, y: -1 },
    distance: 2,
    stopKind: "border",
    position: { x: 2, y: 0 }
  });

  let s = run(state, beginActivation(1, "nem")).nextState;
  const result = run(s, useArt(1, "nem", "dark-pulse", {}));
  const event = result.events.find((e) => e.artId === "dark-pulse");
  assert.equal(event.pulseRays.length, 8);
  assert.deepEqual(event.pulseRays.find((ray) => ray.stopKind === "wall").position, { x: 1, y: 2 });
  assert.ok(event.pulseRays.some((ray) => ray.stopKind === "border"));

  const corner = createBattleState({
    size: 5,
    seed: 5,
    units: [{ id: "nem", type: "nemesis", player: 1, x: 0, y: 0 }]
  });
  assert.equal(getDarkPulseRays(corner, findUnit(corner, "nem")).length, 8);
});

test("Dark Pulse refunds its effective MP cost when it hits four targets", () => {
  const state = scenario([
    { id: "nem", type: "nemesis", player: 1, x: 6, y: 6, mp: 20 },
    { id: "n", type: "swordsman", player: 2, x: 6, y: 3 },
    { id: "s", type: "swordsman", player: 2, x: 6, y: 8 },
    { id: "e", type: "swordsman", player: 2, x: 8, y: 6 },
    { id: "w", type: "swordsman", player: 2, x: 3, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "nem")).nextState;
  s = run(s, useArt(1, "nem", "dark-pulse", {})).nextState;
  assert.equal(findUnit(s, "nem").mp, 20, "cost is refunded after four contacts");
});

test("Dark Pulse auto-casts for free when Nemesis crosses missing-HP thresholds", () => {
  const state = scenario([
    { id: "arc", type: "archer", player: 1, x: 6, y: 9 },
    { id: "nem", type: "nemesis", player: 2, x: 6, y: 6, hp: 21, mp: 45 },
    { id: "ally", type: "swordsman", player: 2, x: 9, y: 6, hp: 8 }
  ]);
  let s = run(state, beginActivation(1, "arc")).nextState;
  const result = run(s, useArt(1, "arc", "volley-shot", { targetPosition: { x: 6, y: 8 } }));
  s = result.nextState;
  const pulse = result.events.find((event) => event.type === "DARK_PULSE_AUTO");
  assert.ok(pulse, "crossing below 20 HP should trigger an automatic pulse");
  assert.equal(pulse.actorId, "nem");
  assert.equal(findUnit(s, "ally").hp, 9);
  assert.equal(findUnit(s, "nem").mp, 45, "automatic pulses are free");
});

test("a Dark Pulse reaction that kills the moving unit closes the dead activation", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 6, y: 8, hp: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 0, y: 0 },
    { id: "nem", type: "nemesis", player: 2, x: 6, y: 7, hp: 21 }
  ]);
  let s = run(state, beginActivation(1, "fk")).nextState;
  const moved = run(s, moveUnit(1, "fk", 6, 5, [
    { x: 6, y: 7 },
    { x: 6, y: 6 },
    { x: 6, y: 5 }
  ]));

  assert.ok(moved.events.some((event) => event.type === "DARK_PULSE_AUTO"));
  s = moved.nextState;
  assert.equal(findUnit(s, "fk").hp, 0, "the threshold pulse killed the mover");
  assert.equal(s.activation, null, "the dead mover no longer holds the activation open");
  assert.equal(s.currentPlayer, 1, "the owning player can continue with another unit");

  const nextUnit = applyCommand(s, beginActivation(1, "ally"));
  assert.equal(nextUnit.accepted, true, nextUnit.errorCode);
  assert.equal(nextUnit.nextState.activation.unitId, "ally");
});

test("Realm Traversal lets Nemesis move then cast Dark Pulse on the next turn and then unlocks", () => {
  const state = scenario([
    { id: "nem", type: "nemesis", player: 1, x: 0, y: 0 },
    { id: "foe", type: "swordsman", player: 2, x: 4, y: 0 }
  ]);
  let s = run(state, beginActivation(1, "nem")).nextState;
  s = run(s, useArt(1, "nem", "realm-traversal", {})).nextState;
  assert.equal(findUnit(s, "nem").realmTraversalLocked, true);

  s = run(s, beginActivation(2, "foe")).nextState;
  s = run(s, defend(2, "foe")).nextState;
  s = run(s, finishActivation(2, "foe")).nextState;

  s = run(s, beginActivation(1, "nem")).nextState;
  s = run(s, moveUnit(1, "nem", 1, 0)).nextState;
  const cast = run(s, useArt(1, "nem", "dark-pulse", {}));
  s = cast.nextState;
  assert.ok(cast.events.some((event) => event.artId === "dark-pulse"));
  assert.equal(findUnit(s, "nem").realmTraversalLocked, false);
});

test("Regenerate restores HP and MP when Nemesis reaches rage", () => {
  const state = scenario([
    { id: "sw", type: "swordsman", player: 1, x: 0, y: 1 },
    { id: "nem", type: "nemesis", player: 2, x: 0, y: 0, hp: 13, mp: 20 }
  ]);
  let s = run(state, beginActivation(1, "sw")).nextState;
  s = run(s, useArt(1, "sw", "mage-killer", { targetId: "nem", attackRoll: 0.5, critRoll: 0.99, effectRoll: 0.99 })).nextState;
  assert.equal(findUnit(s, "nem").hp, 10);
  assert.equal(findUnit(s, "nem").mp, 35);
});

test("Nemesis VFX entries exist", () => {
  const pulse = getAbilityVfx("dark-pulse");
  assert.equal(pulse?.type, "darkPulseScatter");
  assert.equal(pulse.projectile.shape, "orb");
  assert.equal(getAbilityVfx("realm-traversal")?.type, "dashTrail");
});
