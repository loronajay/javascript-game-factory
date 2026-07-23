import test from "node:test";
import assert from "node:assert/strict";

import { attack, beginActivation, useArt } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState, findUnit, getTileObject } from "../src/core/state.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { getArt, getEffectiveStats, getUnitType } from "../src/core/unitCatalog.js";
import { getCritChance } from "../src/rules/combat.js";
import { getConeCells } from "../src/rules/arts.js";

const HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.equal(result.accepted, true, `${command.type} rejected (${result.errorCode})`);
  return result;
}

function scenario(extraUnits = [], little = {}) {
  return createBattleState({
    size: 10,
    seed: 21,
    units: [
      { id: "lb", player: 1, type: "little-brother", x: 1, y: 1, ...little },
      ...extraUnits
    ]
  });
}

test("Little Brother is registered as a ranger with his authored stat line", () => {
  const def = getUnitType("little-brother");
  assert.equal(def.name, "Little Brother");
  assert.equal(def.classType, "ranger");
  assert.deepEqual(def.stats, {
    moveRange: 2,
    attackRange: 4,
    strength: 8,
    defense: 6,
    maxHp: 25,
    maxMp: 10
  });
  assert.deepEqual(def.arts.map((art) => art.id), ["cannon-fire", "rechargeable-battery", "pissing-contest", "flamethrower"]);
  assert.equal(getArt("little-brother", "cannon-fire").targeting.range, 5);
  assert.equal(getArt("little-brother", "flamethrower").targeting.range, 3);
});

test("Pissing Contest grants +1 range while Big Brother is in play on either team", () => {
  const noBrother = scenario([{ id: "foe", player: 2, type: "swordsman", x: 6, y: 6 }]);
  assert.equal(getEffectiveStats(findUnit(noBrother, "lb"), noBrother).attackRange, 4);

  const withBrother = scenario([
    { id: "bb", player: 2, type: "big-brother", x: 6, y: 6 }
  ]);
  assert.equal(getEffectiveStats(findUnit(withBrother, "lb"), withBrother).attackRange, 5);
});

test("Splash Fire deals true damage around the original basic-attack target on crit", () => {
  const state = scenario([
    { id: "target", player: 2, type: "swordsman", x: 3, y: 1 },
    { id: "nearby", player: 2, type: "archer", x: 3, y: 2 },
    { id: "ally-nearby", player: 1, type: "archer", x: 4, y: 1 },
    { id: "outside", player: 2, type: "archer", x: 5, y: 3 }
  ]);

  let s = run(state, beginActivation(1, "lb")).nextState;
  const result = run(s, attack(1, "lb", "target", CRIT));
  s = result.nextState;

  assert.equal(findUnit(s, "nearby").hp, 22);
  assert.equal(findUnit(s, "ally-nearby").hp, 24);
  assert.equal(findUnit(s, "outside").hp, 24);
  assert.ok(result.events.some((event) =>
    event.type === "SPLASH_FIRE" &&
    event.actorId === "lb" &&
    event.sourceTargetId === "target" &&
    event.damageByTarget.nearby === 2
  ));
});

test("Cannon Fire is a fixed-power physical shot that stuns and splashes on crit", () => {
  const state = scenario([
    { id: "target", player: 2, type: "swordsman", x: 5, y: 1 },
    { id: "nearby", player: 2, type: "archer", x: 5, y: 2 }
  ]);

  let s = run(state, beginActivation(1, "lb")).nextState;
  const result = run(s, useArt(1, "lb", "cannon-fire", { targetId: "target", ...CRIT }));
  s = result.nextState;

  assert.equal(findUnit(s, "lb").mp, 5);
  assert.equal(findUnit(s, "target").hp, 17);
  assert.equal(findUnit(s, "target").spent, true);
  assert.equal(findUnit(s, "nearby").hp, 22);
  assert.equal(result.events[0].critical, true);
  assert.equal(result.events[0].stunned, true);
  assert.ok(result.events.some((event) => event.type === "UNIT_STUNNED" && event.unitId === "target"));
});

test("Rechargeable Battery restores MP whenever Little Brother takes magic damage", () => {
  const state = createBattleState({
    size: 10,
    seed: 21,
    units: [
      { id: "lb", player: 1, type: "little-brother", x: 1, y: 1, mp: 1 },
      { id: "angel", player: 2, type: "angel", x: 1, y: 4 }
    ]
  });
  state.currentPlayer = 2;

  let s = run(state, beginActivation(2, "angel")).nextState;
  const result = run(s, attack(2, "angel", "lb", HIT));
  s = result.nextState;

  assert.equal(findUnit(s, "lb").hp, 22);
  assert.equal(findUnit(s, "lb").mp, 6);
  assert.ok(result.events.some((event) => event.type === "BATTERY_MP" && event.unitId === "lb" && event.mpGained === 5));
});

test("Flamethrower leaves permanent fire under enemies it damages", () => {
  const state = scenario([
    { id: "target", player: 2, type: "swordsman", x: 3, y: 1 },
    { id: "behind", player: 2, type: "archer", x: 4, y: 1 },
    { id: "ally", player: 1, type: "archer", x: 4, y: 2 },
    { id: "gargoyle", player: 2, type: "gargoyle", x: 5, y: 1 }
  ]);

  let s = run(state, beginActivation(1, "lb")).nextState;
  const result = run(s, useArt(1, "lb", "flamethrower", { targetPosition: { x: 3, y: 1 } }));
  s = result.nextState;

  assert.deepEqual(getTileObject(s, { x: 3, y: 1 }), { kind: "fire", permanent: true, ownerId: "lb" });
  assert.deepEqual(getTileObject(s, { x: 4, y: 1 }), { kind: "fire", permanent: true, ownerId: "lb" });
  assert.equal(getTileObject(s, { x: 4, y: 2 }), null, "allies in the cone are not hit");
  assert.equal(getTileObject(s, { x: 5, y: 1 }), null, "fire-immune enemies are not hit");
  assert.ok(result.events[0].createdFire.some((position) => position.x === 3 && position.y === 1));
  assert.ok(result.events[0].createdFire.some((position) => position.x === 4 && position.y === 1));
});

test("Flamespitter gives rage stats and free orthogonal Flamethrower on basic attack", () => {
  const state = scenario([
    { id: "target", player: 2, type: "swordsman", x: 3, y: 1 },
    { id: "behind", player: 2, type: "archer", x: 4, y: 1 },
    { id: "wide", player: 2, type: "archer", x: 4, y: 2 },
    { id: "diagonal", player: 2, type: "archer", x: 2, y: 2 }
  ], { hp: 5 });

  const little = findUnit(state, "lb");
  assert.equal(getEffectiveStats(little, state).strength, 10);
  assert.equal(getCritChance(little), 0.20);
  assert.equal(getConeCells(state, little, { x: 2, y: 1 }, getArt("little-brother", "flamethrower")).some((cell) => cell.x === 6 && cell.y === 1), true);

  let s = run(state, beginActivation(1, "lb")).nextState;
  const result = run(s, attack(1, "lb", "target", HIT));
  s = result.nextState;

  assert.equal(findUnit(s, "target").hp, 17, "basic hit plus free flame both hit the original target");
  assert.equal(findUnit(s, "behind").hp, 21);
  assert.equal(findUnit(s, "wide").hp, 21);
  assert.equal(findUnit(s, "diagonal").hp, 24);
  assert.deepEqual(getTileObject(s, { x: 3, y: 1 }), { kind: "fire", permanent: true, ownerId: "lb" });
  assert.deepEqual(getTileObject(s, { x: 4, y: 1 }), { kind: "fire", permanent: true, ownerId: "lb" });
  assert.deepEqual(getTileObject(s, { x: 4, y: 2 }), { kind: "fire", permanent: true, ownerId: "lb" });
  assert.equal(getTileObject(s, { x: 2, y: 2 }), null);
  assert.ok(result.events.some((event) => event.type === "FLAMESPITTER" && event.targetIds.includes("behind")));
});

test("Flamespitter does not trigger on diagonal basic attacks", () => {
  const state = scenario([
    { id: "target", player: 2, type: "swordsman", x: 2, y: 2 },
    { id: "behind", player: 2, type: "archer", x: 3, y: 3 }
  ], { hp: 5 });

  let s = run(state, beginActivation(1, "lb")).nextState;
  s = run(s, attack(1, "lb", "target", HIT)).nextState;

  assert.equal(findUnit(s, "behind").hp, 24);
});

test("Flamethrower does not damage a fire-immune enemy (Gargoyle's One With The Flames)", () => {
  const state = scenario([
    { id: "gargoyle", player: 2, type: "gargoyle", x: 3, y: 1 },
    { id: "swordsman", player: 2, type: "swordsman", x: 4, y: 1 }
  ]);

  let s = run(state, beginActivation(1, "lb")).nextState;
  const result = run(s, useArt(1, "lb", "flamethrower", { targetPosition: { x: 3, y: 1 } }));
  s = result.nextState;

  assert.equal(findUnit(s, "gargoyle").hp, getUnitType("gargoyle").stats.maxHp, "Gargoyle ignores Flamethrower's fire damage");
  assert.equal(findUnit(s, "swordsman").hp, getUnitType("swordsman").stats.maxHp - 4, "non-immune enemies in the cone still burn, then take the fire tile tick");
  assert.ok(!result.events[0].targetIds.includes("gargoyle"));
});

test("Flamespitter's free rage cone also spares fire-immune enemies", () => {
  const state = scenario([
    { id: "target", player: 2, type: "swordsman", x: 3, y: 1 },
    { id: "gargoyle", player: 2, type: "gargoyle", x: 4, y: 1 }
  ], { hp: 5 });

  let s = run(state, beginActivation(1, "lb")).nextState;
  const result = run(s, attack(1, "lb", "target", HIT));
  s = result.nextState;

  assert.equal(findUnit(s, "gargoyle").hp, getUnitType("gargoyle").stats.maxHp, "Gargoyle ignores the free Flamethrower's fire damage");
});

test("Little Brother active arts register VFX recipes", () => {
  for (const artId of ["cannon-fire", "flamethrower"]) {
    assert.ok(getAbilityVfx(artId), `${artId} has VFX`);
  }
});
