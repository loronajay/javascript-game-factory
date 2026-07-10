import test from "node:test";
import assert from "node:assert/strict";

import { attack, attackTile, beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { getArt, getAvailableArts, getEffectiveStats, getUnitType, isRaging } from "../src/core/unitCatalog.js";
import { getCritChance } from "../src/rules/combat.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const MISS = { attackRoll: 0.01, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.equal(result.accepted, true, `${command.type} rejected (${result.errorCode})`);
  return result;
}

function scenario(extraUnits = [], miner = {}) {
  return createBattleState({
    size: 9,
    seed: 17,
    units: [
      { id: "miner", player: 1, type: "miner", x: 1, y: 1, ...miner },
      ...extraUnits
    ]
  });
}

test("Miner is registered as a ranger with an ore resource that starts empty", () => {
  const def = getUnitType("miner");
  assert.equal(def.name, "Miner");
  assert.equal(def.classType, "ranger");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 5, strength: 8, defense: 4, maxHp: 25, maxMp: 25 });
  assert.deepEqual(def.resource, { id: "ore", label: "Ore", shortLabel: "ORE", startsAt: 0 });

  const state = scenario();
  const miner = findUnit(state, "miner");
  assert.equal(miner.mp, 0);
  assert.equal(getEffectiveStats(miner, state).attackRange, 1, "empty ore clamps range to melee");
});

test("full ore grants +1 STR/+1 DEF and harvested ore increases crit chance", () => {
  const state = scenario([], { mp: 25 });
  const miner = findUnit(state, "miner");
  const stats = getEffectiveStats(miner, state);
  assert.equal(stats.strength, 9);
  assert.equal(stats.defense, 5);
  assert.equal(getCritChance(miner), 0.20, "base 15% + 5% from five ore bands");

  const raging = findUnit(scenario([], { hp: 5, mp: 25 }), "miner");
  assert.equal(getCritChance(raging), 0.25, "rage doubles the ore-band bonus to +10%");
});

test("basic ranged attacks cost 1 ore, while adjacent pickaxe strikes do +2 damage for free", () => {
  const state = scenario([{ id: "far", player: 2, type: "swordsman", x: 4, y: 1 }], { mp: 2 });

  let s = run(state, beginActivation(1, "miner")).nextState;
  s = run(s, attack(1, "miner", "far", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "miner").mp, 1, "ranged shot consumes ore");
  assert.equal(findUnit(s, "far").hp, 22, "8 STR - 5 DEF");

  const adjacentState = scenario([{ id: "near", player: 2, type: "swordsman", x: 1, y: 2 }], { mp: 1 });
  s = run(adjacentState, beginActivation(1, "miner")).nextState;
  s = run(s, attack(1, "miner", "near", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "miner").mp, 1, "adjacent basic attack does not spend ore");
  assert.equal(findUnit(s, "near").hp, 20, "adjacent pickaxe strike adds +2 damage");
});

test("adjacent basic attacks that destroy walls grant Miner 2 ore", () => {
  const state = scenario([{ id: "foe", player: 2, type: "swordsman", x: 6, y: 6 }], { mp: 1 });
  state.tileObjects["1,2"] = { kind: "wall", hp: 1 };

  let s = run(state, beginActivation(1, "miner")).nextState;
  const result = run(s, attackTile(1, "miner", 1, 2));
  s = result.nextState;

  assert.equal(s.tileObjects["1,2"], undefined);
  assert.equal(findUnit(s, "miner").mp, 3);
  assert.equal(result.events[0].oreGained, 2);
  assert.equal(result.events[0].oreAfter, 3);
});

test("ranged wall basic attacks spend ore and do not grant Miner wall-kill ore", () => {
  const state = scenario([{ id: "foe", player: 2, type: "swordsman", x: 6, y: 6 }], { mp: 3 });
  state.tileObjects["4,1"] = { kind: "wall", hp: 1 };

  let s = run(state, beginActivation(1, "miner")).nextState;
  const result = run(s, attackTile(1, "miner", 4, 1));
  s = result.nextState;

  assert.equal(s.tileObjects["4,1"], undefined);
  assert.equal(findUnit(s, "miner").mp, 2, "ranged wall attack costs ore and gives no adjacent reward");
  assert.equal(result.events[0].oreGained, undefined);
});

test("Ore Harvest gathers weighted ore, caps at 25, and grants +1 move next turn", () => {
  const state = scenario([{ id: "foe", player: 2, type: "swordsman", x: 6, y: 6 }], { mp: 24 });
  let s = run(state, beginActivation(1, "miner")).nextState;
  const result = run(s, useArt(1, "miner", "ore-harvest", { effectRoll: 0.95 }));
  s = result.nextState;

  assert.equal(findUnit(s, "miner").mp, 25, "ore is capped at max");
  assert.equal(result.events[0].oreGained, 1, "event reports actual capped gain");
  assert.equal(findUnit(s, "miner").statuses.some((status) => status.type === "empowered" && status.statModifiers.moveRange === 1), true);

  s = run(s, beginActivation(2, "foe")).nextState;
  s = run(s, defend(2, "foe")).nextState;
  s = run(s, finishActivation(2, "foe")).nextState;
  s = run(s, beginActivation(1, "miner")).nextState;
  assert.equal(getEffectiveStats(findUnit(s, "miner"), s).moveRange, 3);
});

test("Headlamp is a range-1 guaranteed blind with no damage", () => {
  const state = scenario([{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }]);
  let s = run(state, beginActivation(1, "miner")).nextState;
  s = run(s, useArt(1, "miner", "headlamp", { targetId: "foe" })).nextState;

  const foe = findUnit(s, "foe");
  assert.equal(foe.hp, 25);
  assert.equal(foe.statuses.some((status) => status.type === "blind" && status.duration === 1), true);
});

test("Shaft Prop raises a wall within 3 and spends ore", () => {
  const state = scenario([{ id: "foe", player: 2, type: "swordsman", x: 6, y: 6 }], { mp: 3 });
  let s = run(state, beginActivation(1, "miner")).nextState;
  s = run(s, useArt(1, "miner", "shaft-prop", { targetPosition: { x: 3, y: 1 } })).nextState;

  assert.deepEqual(s.tileObjects["3,1"], { kind: "wall", hp: 1 });
  assert.equal(findUnit(s, "miner").mp, 0);
});

test("Blasting Cap deals true damage, shoves neighbors, blocks for damage, and stuns on crit", () => {
  const state = scenario([
    { id: "ally", player: 1, type: "swordsman", x: 0, y: 1 },
    { id: "target", player: 2, type: "swordsman", x: 3, y: 3 },
    { id: "pushed", player: 2, type: "archer", x: 3, y: 4 },
    { id: "blocked", player: 2, type: "archer", x: 2, y: 3 }
  ], { mp: 2 });
  state.tileObjects["1,3"] = { kind: "wall", hp: 1 };

  let s = run(state, beginActivation(1, "miner")).nextState;
  const result = run(s, useArt(1, "miner", "blasting-cap", { targetId: "target", ...CRIT }));
  s = result.nextState;

  assert.equal(findUnit(s, "target").hp, 22);
  assert.equal(findUnit(s, "target").statuses.some((status) => status.type === "stun" && status.duration === 1), true);
  assert.deepEqual(findUnit(s, "pushed").position, { x: 3, y: 5 });
  assert.equal(findUnit(s, "blocked").hp, 22, "blocked splash target takes 2 true damage");
  assert.equal(findUnit(s, "miner").mp, 0);
});

test("Blasting Cap miss spends ore but does nothing else", () => {
  const state = scenario([
    { id: "target", player: 2, type: "swordsman", x: 3, y: 3 },
    { id: "nearby", player: 2, type: "archer", x: 3, y: 4 }
  ], { mp: 2 });
  let s = run(state, beginActivation(1, "miner")).nextState;
  s = run(s, useArt(1, "miner", "blasting-cap", { targetId: "target", ...MISS })).nextState;

  assert.equal(findUnit(s, "target").hp, 25);
  assert.equal(findUnit(s, "nearby").hp, 24);
  assert.deepEqual(findUnit(s, "nearby").position, { x: 3, y: 4 });
  assert.equal(findUnit(s, "miner").mp, 0);
});

test("Blasting Cap can target a wall without a roll, destroy it for no ore, and splash only units", () => {
  const state = scenario([
    { id: "pushed", player: 2, type: "archer", x: 3, y: 4 },
    { id: "blocked", player: 2, type: "archer", x: 2, y: 3 },
    { id: "far", player: 2, type: "archer", x: 5, y: 5 }
  ], { mp: 5 });
  state.tileObjects["3,3"] = { kind: "wall", hp: 1 };
  state.tileObjects["1,3"] = { kind: "wall", hp: 1 };
  state.tileObjects["3,2"] = { kind: "wall", hp: 1 };

  let s = run(state, beginActivation(1, "miner")).nextState;
  const result = run(s, useArt(1, "miner", "blasting-cap", {
    targetPosition: { x: 3, y: 3 },
    attackRoll: 0.01,
    critRoll: 0.01
  }));
  s = result.nextState;

  assert.equal(s.tileObjects["3,3"], undefined, "targeted wall is destroyed");
  assert.deepEqual(s.tileObjects["3,2"], { kind: "wall", hp: 1 }, "other nearby walls are not splashed");
  assert.equal(findUnit(s, "miner").mp, 3, "Blasting Cap costs ore but grants no wall-kill ore");
  assert.deepEqual(findUnit(s, "pushed").position, { x: 3, y: 5 });
  assert.equal(findUnit(s, "blocked").hp, 22, "blocked splash unit takes 2 true damage");
  assert.equal(findUnit(s, "far").hp, 24);
  assert.equal(result.events[0].hit, true);
  assert.equal(result.events[0].rolled, false);
  assert.equal(result.events[0].destroyedWall, true);
  assert.deepEqual(result.events[0].position, { x: 3, y: 3 });
});

test("Diamond Harvester fills ore on rage entry and Ore Abundance replaces Ore Harvest", () => {
  const state = scenario([{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }], { hp: 8, mp: 1 });
  state.currentPlayer = 2;
  let s = run(state, beginActivation(2, "foe")).nextState;
  const result = run(s, attack(2, "foe", "miner", NORMAL_HIT));
  s = result.nextState;

  assert.equal(isRaging(findUnit(s, "miner")), true);
  assert.equal(findUnit(s, "miner").mp, 25);
  assert.ok(result.events.some((event) => event.type === "RAGE_REGENERATE" && event.unitId === "miner" && event.mpRestored === 24));

  const arts = getAvailableArts(findUnit(s, "miner")).filter((art) => art.kind === "active").map((art) => art.id);
  assert.ok(!arts.includes("ore-harvest"));
  assert.ok(arts.includes("ore-abundance"));
});

test("Ore Abundance always fills ore to max", () => {
  const state = scenario([{ id: "foe", player: 2, type: "swordsman", x: 6, y: 6 }], { hp: 5, mp: 3 });
  let s = run(state, beginActivation(1, "miner")).nextState;
  s = run(s, useArt(1, "miner", "ore-abundance")).nextState;
  assert.equal(findUnit(s, "miner").mp, 25);
});

test("Miner active arts register VFX recipes", () => {
  for (const artId of ["ore-harvest", "headlamp", "shaft-prop", "blasting-cap", "ore-abundance"]) {
    assert.ok(getAbilityVfx(artId), `${artId} has VFX`);
  }
});
