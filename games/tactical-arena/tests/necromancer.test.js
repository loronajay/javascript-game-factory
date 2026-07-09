import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_TYPES, getArt, getAuraSources, getEffectiveStats, getUnitType, isRaging, takesTurns } from "../src/core/unitCatalog.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { createBattleState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";
import { getSelfBlastRadius, getSummonPlacementTiles } from "../src/rules/arts.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const EFFECT_HIT = { effectRoll: 0.1 };
const EFFECT_MISS = { effectRoll: 0.99 };

function findId(state, id) {
  return state.units.find((u) => u.id === id);
}

function activate(state, unitId) {
  const player = state.units.find((u) => u.id === unitId).player;
  const r = applyCommand(state, beginActivation(player, unitId));
  assert.ok(r.accepted, `beginActivation ${unitId} failed: ${r.errorCode}`);
  return r.nextState;
}

// A summoned Ghoul the engine would normally build itself. Used to set up
// already-on-field scenarios (aura carry, summon cap, lone-ghoul defeat).
function ghoulUnit(id, player, x, y, summonerId = null) {
  return {
    id, player, type: "ghoul", position: { x, y }, hp: 10, mp: 0,
    statModifiers: {}, statuses: [], defending: false, spent: true,
    mageChargeCount: 0, summonerId
  };
}

// --- Catalog / registration ---

test("Necromancer is registered with the recovered legacy stat block", () => {
  const necro = UNIT_TYPES.necromancer;
  assert.ok(necro, "necromancer missing from UNIT_TYPES");
  assert.equal(necro.stats.maxHp, 23);
  assert.equal(necro.stats.moveRange, 3);
  assert.equal(necro.stats.attackRange, 5);
  assert.equal(necro.stats.strength, 6);
  assert.equal(necro.stats.defense, 3);
  assert.equal(necro.stats.maxMp, 36);
});

test("Necromancer has Deathly Aura, Dead Zone, and the three active arts", () => {
  const necro = UNIT_TYPES.necromancer;
  assert.equal(necro.passive.id, "deathly-aura");
  assert.equal(necro.passive.effect.type, "enemyAura");
  assert.equal(necro.passive.effect.radius, 3);
  const actives = necro.arts.filter((a) => a.kind === "active").map((a) => a.id);
  assert.deepEqual(actives, ["wither", "dark-bomb", "summon-ghoul"]);
  const deadZone = necro.arts.find((a) => a.id === "dead-zone");
  assert.equal(deadZone.kind, "passive");
  assert.equal(deadZone.effect.type, "teamDamageReduction");
  assert.equal(deadZone.effect.amount, 1);
});

test("Ghoul is a summon: registered, takesTurns false, 10 HP, carries the aura", () => {
  const ghoul = UNIT_TYPES.ghoul;
  assert.ok(ghoul);
  assert.equal(ghoul.summon, true);
  assert.equal(ghoul.stats.maxHp, 10);
  assert.equal(ghoul.passive.effect.type, "enemyAura");
  assert.equal(ghoul.passive.effect.radius, 3);
  assert.equal(takesTurns({ type: "ghoul" }), false);
  assert.equal(takesTurns({ type: "necromancer" }), true);
});

// --- Deathly Aura (enemyAura) ---

test("Deathly Aura lowers an enemy's DEF by 1 within 3 tiles", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-near", player: 2, type: "swordsman", x: 2, y: 0 }, // chebyshev 2 — in aura
      { id: "p2-far", player: 2, type: "swordsman", x: 3, y: 0 }   // chebyshev 3 — out
    ]
  });
  assert.equal(getEffectiveStats(findId(state, "p2-near"), state).defense, 5 - 1);
  assert.equal(getEffectiveStats(findId(state, "p2-far"), state).defense, 5 - 1);
});

test("Deathly Aura does not reach enemies beyond 3 tiles unless raging", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-outside", player: 2, type: "swordsman", x: 4, y: 0 }
    ]
  });
  assert.equal(getEffectiveStats(findId(state, "p2-outside"), state).defense, 5);
});

test("duplicate Deathly Aura passives do not stack on the same enemy", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro-a", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p1-necro-b", player: 1, type: "necromancer", x: 1, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });

  assert.equal(getEffectiveStats(findId(state, "p2-sword"), state).defense, 5 - 1);
});

test("Deathly Aura never debuffs the Necromancer's own allies", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p1-ally", player: 1, type: "swordsman", x: 1, y: 0 }
    ]
  });
  assert.equal(getEffectiveStats(findId(state, "p1-ally"), state).defense, 5);
});

test("A summoned Ghoul carries the aura, debuffing enemies near it but far from the Necromancer", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 8, y: 7 } // far from necro, next to ghoul
    ]
  });
  state.units.push(ghoulUnit("p1-necro-ghoul-0", 1, 8, 8, "p1-necro"));
  assert.equal(getEffectiveStats(findId(state, "p2-sword"), state).defense, 5 - 1);
});

// --- Dead Zone (teamDamageReduction) ---

test("Dead Zone trims 1 off magic damage taken by the Necromancer's team", () => {
  const state = createBattleState({
    units: [
      { id: "p1-mag", player: 1, type: "magician", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 2, y: 0 },
      { id: "p2-necro", player: 2, type: "necromancer", x: 9, y: 9 } // alive, far
    ]
  });
  const s1 = activate(state, "p1-mag");
  const r = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  assert.ok(r.accepted);
  // Spark base magic = STR 6; Dead Zone (p2 has a living Necromancer) → 5.
  assert.equal(r.events.find((e) => e.type === "ART_RESOLVED").damage.damage, 5);
});

test("Dead Zone stops protecting once the host Necromancer dies", () => {
  const state = createBattleState({
    units: [
      { id: "p1-mag", player: 1, type: "magician", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 2, y: 0 },
      { id: "p2-necro", player: 2, type: "necromancer", x: 9, y: 9 }
    ]
  });
  findId(state, "p2-necro").hp = 0; // dead host = no reduction
  const s1 = activate(state, "p1-mag");
  const r = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  assert.equal(r.events.find((e) => e.type === "ART_RESOLVED").damage.damage, 6);
});

test("duplicate Dead Zone passives do not stack", () => {
  const state = createBattleState({
    units: [
      { id: "p1-mag", player: 1, type: "magician", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 2, y: 0 },
      { id: "p2-necro-a", player: 2, type: "necromancer", x: 9, y: 9 },
      { id: "p2-necro-b", player: 2, type: "necromancer", x: 8, y: 8 }
    ]
  });
  const s1 = activate(state, "p1-mag");
  const r = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  assert.equal(r.events.find((e) => e.type === "ART_RESOLVED").damage.damage, 5);
});

// --- Wither ---

test("Wither deals magic damage and slows the target on a passed effect check", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 }
    ]
  });
  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, useArt(1, "p1-necro", "wither", { targetId: "p2-sword", ...NORMAL_HIT, ...EFFECT_HIT }));
  assert.ok(r.accepted);
  const event = r.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.damage.type, "magic");
  assert.equal(event.damage.damage, 6); // magic ignores DEF
  const sword = findId(r.nextState, "p2-sword");
  const slow = sword.statuses.find((s) => s.type === "slow");
  assert.ok(slow, "slow not applied");
  assert.equal(getEffectiveStats(sword, r.nextState).moveRange, 3 - 1);
  assert.equal(findId(r.nextState, "p1-necro").mp, 36 - 4);
});

test("Wither lands damage but not slow on a failed effect check", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 }
    ]
  });
  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, useArt(1, "p1-necro", "wither", { targetId: "p2-sword", ...NORMAL_HIT, ...EFFECT_MISS }));
  assert.ok(r.accepted);
  assert.ok(!findId(r.nextState, "p2-sword").statuses.some((s) => s.type === "slow"));
});

test("Wither respects status immunity: a Paladin is not slowed", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-pal", player: 2, type: "paladin", x: 3, y: 0 }
    ]
  });
  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, useArt(1, "p1-necro", "wither", { targetId: "p2-pal", ...NORMAL_HIT, ...EFFECT_HIT }));
  assert.ok(r.accepted);
  assert.ok(!findId(r.nextState, "p2-pal").statuses.some((s) => s.type === "slow"));
});

// --- Dark Bomb ---

test("Dark Bomb deals 5 magic damage to every enemy within the current aura radius", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 5, y: 5 },
      { id: "p2-in", player: 2, type: "swordsman", x: 5, y: 8 },  // dist 3
      { id: "p2-out", player: 2, type: "swordsman", x: 9, y: 5 }  // dist 4
    ]
  });
  const swordHp = UNIT_TYPES.swordsman.stats.maxHp;
  assert.equal(getSelfBlastRadius(state, findId(state, "p1-necro"), getArt("necromancer", "dark-bomb")), 3);
  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, useArt(1, "p1-necro", "dark-bomb", {}));
  assert.ok(r.accepted);
  const event = r.events.find((e) => e.type === "ART_RESOLVED");
  assert.ok(event.targetIds.includes("p2-in"));
  assert.ok(!event.targetIds.includes("p2-out"));
  assert.equal(findId(r.nextState, "p2-in").hp, swordHp - 5);
  assert.equal(findId(r.nextState, "p1-necro").mp, 36 - getArt("necromancer", "dark-bomb").mpCost);
});

test("Raging Dark Bomb expands with Deathly Aura from radius 3 to 4", () => {
  const state = createBattleState({
    size: 11,
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 5, y: 5 },
      { id: "p2-edge", player: 2, type: "swordsman", x: 5, y: 9 },
      { id: "p2-out", player: 2, type: "swordsman", x: 5, y: 10 }
    ]
  });
  findId(state, "p1-necro").hp = 4;

  const swordHp = UNIT_TYPES.swordsman.stats.maxHp;
  assert.equal(getSelfBlastRadius(state, findId(state, "p1-necro"), getArt("necromancer", "dark-bomb")), 4);
  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, useArt(1, "p1-necro", "dark-bomb", {}));
  assert.ok(r.accepted);
  const event = r.events.find((e) => e.type === "ART_RESOLVED");
  assert.ok(event.targetIds.includes("p2-edge"));
  assert.ok(!event.targetIds.includes("p2-out"));
  assert.equal(findId(r.nextState, "p2-edge").hp, swordHp - 5);
  assert.equal(findId(r.nextState, "p2-out").hp, swordHp);
});

// --- Summon Ghoul ---

test("Summon Ghoul places a 10 HP Ghoul on an empty tile and spends the Necromancer", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, useArt(1, "p1-necro", "summon-ghoul", { targetPosition: { x: 1, y: 1 } }));
  assert.ok(r.accepted);
  const ghoul = r.nextState.units.find((u) => u.type === "ghoul");
  assert.ok(ghoul, "ghoul not created");
  assert.equal(ghoul.hp, 10);
  assert.equal(ghoul.spent, true);
  assert.equal(ghoul.player, 1);
  assert.equal(ghoul.summonerId, "p1-necro");
  assert.deepEqual(ghoul.position, { x: 1, y: 1 });
  assert.equal(findId(r.nextState, "p1-necro").mp, 36 - 8);
});

test("Summon Ghoul inherits the Necromancer's skin collection", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", skin: "arcane", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });

  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, useArt(1, "p1-necro", "summon-ghoul", { targetPosition: { x: 1, y: 1 } }));

  assert.ok(r.accepted);
  assert.equal(r.nextState.units.find((u) => u.type === "ghoul").skin, "arcane");
});

test("Summon Ghoul rejects occupied and out-of-range tiles", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p1-ally", player: 1, type: "swordsman", x: 1, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const tiles = getSummonPlacementTiles(state, findId(state, "p1-necro"), UNIT_TYPES.necromancer.arts.find((a) => a.id === "summon-ghoul"));
  assert.ok(!tiles.has("1,0"), "occupied tile should not be placeable");
  assert.ok(!tiles.has("3,0"), "tile beyond radius 2 should not be placeable");

  const s1 = activate(state, "p1-necro");
  assert.ok(!applyCommand(s1, useArt(1, "p1-necro", "summon-ghoul", { targetPosition: { x: 1, y: 0 } })).accepted);
  assert.ok(!applyCommand(s1, useArt(1, "p1-necro", "summon-ghoul", { targetPosition: { x: 3, y: 0 } })).accepted);
});

test("A Necromancer may keep up to two living Ghouls, but not three", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  state.units.push(ghoulUnit("p1-necro-ghoul-0", 1, 5, 5, "p1-necro"));
  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, useArt(1, "p1-necro", "summon-ghoul", { targetPosition: { x: 1, y: 1 } }));
  assert.ok(r.accepted);
  assert.equal(r.nextState.units.filter((u) => u.hp > 0 && u.summonerId === "p1-necro").length, 2);

  const capped = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  capped.units.push(ghoulUnit("p1-necro-ghoul-0", 1, 5, 5, "p1-necro"));
  capped.units.push(ghoulUnit("p1-necro-ghoul-1", 1, 6, 6, "p1-necro"));
  const s2 = activate(capped, "p1-necro");
  const rejected = applyCommand(s2, useArt(1, "p1-necro", "summon-ghoul", { targetPosition: { x: 1, y: 1 } }));
  assert.ok(!rejected.accepted);
  assert.equal(rejected.errorCode, "SUMMON_LIMIT");
});

test("A Ghoul never takes a turn: it stays spent across the round and cannot activate", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  // P1 summons (its only commander acts → turn passes to P2).
  const s1 = activate(state, "p1-necro");
  const r1 = applyCommand(s1, useArt(1, "p1-necro", "summon-ghoul", { targetPosition: { x: 1, y: 0 } }));
  assert.ok(r1.accepted);
  assert.equal(r1.nextState.currentPlayer, 2);

  // P2 takes and finishes its activation → turn returns to P1.
  const s2 = activate(r1.nextState, "p2-sword");
  const r2 = applyCommand(s2, defend(2, "p2-sword"));
  const r3 = applyCommand(r2.nextState, finishActivation(2, "p2-sword"));
  assert.ok(r3.accepted);
  assert.equal(r3.nextState.currentPlayer, 1);

  const ghoul = r3.nextState.units.find((u) => u.type === "ghoul");
  assert.equal(ghoul.spent, true, "ghoul should not be refreshed at turn start");
  assert.equal(findId(r3.nextState, "p1-necro").spent, false, "commander should refresh");
  assert.ok(!applyCommand(r3.nextState, beginActivation(1, ghoul.id)).accepted, "ghoul must not activate");
});

test("Ghoul carries a Ghoul Bite passive: autoStrike, 1 true damage, range 1", () => {
  const ghoul = UNIT_TYPES.ghoul;
  const bite = ghoul.arts.find((a) => a.id === "ghoul-bite");
  assert.ok(bite, "ghoul is missing the ghoul-bite passive");
  assert.equal(bite.kind, "passive");
  assert.equal(bite.effect.type, "autoStrike");
  assert.equal(bite.effect.damage, 1);
  assert.equal(bite.effect.damageType, "true");
  assert.equal(bite.effect.range, 1);
});

test("Ghoul Bite mauls one random adjacent enemy for 1 true damage at the turn rollover", () => {
  const state = createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-necro", type: "necromancer", player: 1, x: 0, y: 0 },
      { id: "p2-near", type: "swordsman", player: 2, x: 8, y: 9 }, // adjacent to the ghoul
      { id: "p2-far", type: "archer", player: 2, x: 1, y: 1 } // out of the ghoul's range
    ]
  });
  state.units.push(ghoulUnit("p1-ghoul", 1, 8, 8, "p1-necro"));

  // P1's only commander is the necromancer; finishing its activation rolls the turn
  // over to P2 and fires the rollover ticks, including Ghoul Bite.
  const s1 = activate(state, "p1-necro");
  const r = applyCommand(s1, defend(1, "p1-necro"));
  assert.ok(r.accepted);
  const r2 = applyCommand(r.nextState, finishActivation(1, "p1-necro"));
  assert.ok(r2.accepted);
  assert.equal(r2.nextState.currentPlayer, 2);

  assert.equal(findId(r2.nextState, "p2-near").hp, getUnitType("swordsman").stats.maxHp - 1);
  assert.equal(findId(r2.nextState, "p2-far").hp, getUnitType("archer").stats.maxHp);

  const bites = r2.events.filter((e) => e.type === "AUTO_STRIKE");
  assert.equal(bites.length, 1);
  assert.equal(bites[0].sourceId, "p1-ghoul");
  assert.equal(bites[0].targetId, "p2-near");
  assert.equal(bites[0].damage, 1);
});

test("A player whose only survivor is a Ghoul is defeated", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 1, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 0, y: 0 }
    ]
  });
  findId(state, "p1-necro").hp = 1; // about to die
  state.units.push(ghoulUnit("p1-necro-ghoul-0", 1, 5, 5, "p1-necro"));
  state.currentPlayer = 2;

  const s1 = activate(state, "p2-sword");
  const r = applyCommand(s1, attack(2, "p2-sword", "p1-necro", NORMAL_HIT));
  assert.ok(r.accepted);
  assert.equal(findId(r.nextState, "p1-necro").hp, 0);
  assert.equal(r.nextState.winner, 2);
  assert.equal(r.nextState.phase, "complete");
});

// --- RAGE ---

test("Necromancer RAGE triggers at 5 HP or lower", () => {
  assert.ok(isRaging({ type: "necromancer", hp: 5 }));
  assert.ok(!isRaging({ type: "necromancer", hp: 6 }));
});

test("Raging Necromancer gains +1 MOVE and amplifies its aura to -2 DEF / -1 STR / -1 MOVE", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 2, y: 0 } // in aura
    ]
  });
  findId(state, "p1-necro").hp = 4; // raging

  assert.equal(getEffectiveStats(findId(state, "p1-necro"), state).moveRange, 3 + 1);
  const enemy = getEffectiveStats(findId(state, "p2-sword"), state);
  assert.equal(enemy.defense, 5 - 2);
  assert.equal(enemy.strength, 10 - 1);
  assert.equal(enemy.moveRange, 3 - 1);
});

test("Raging applies the amplified aura throughout the base radius 3", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-edge", player: 2, type: "swordsman", x: 3, y: 0 } // chebyshev 3 — out at base, in while raging
    ]
  });
  assert.equal(getEffectiveStats(findId(state, "p2-edge"), state).defense, 5 - 1);

  findId(state, "p1-necro").hp = 4;
  const enemy = getEffectiveStats(findId(state, "p2-edge"), state);
  assert.equal(enemy.defense, 5 - 2); // base -1 + rage -1, now in range
  assert.equal(enemy.strength, 10 - 1);
});

test("Raging extends the Deathly Aura's reach by 1 (radius 3 -> 4)", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-edge", player: 2, type: "swordsman", x: 4, y: 0 }
    ]
  });

  assert.equal(getEffectiveStats(findId(state, "p2-edge"), state).defense, 5);

  findId(state, "p1-necro").hp = 4;
  const enemy = getEffectiveStats(findId(state, "p2-edge"), state);
  assert.equal(enemy.defense, 5 - 2);
  assert.equal(enemy.strength, 10 - 1);
});

test("A Ghoul carries the widened base aura at radius 3", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 8, y: 5 } // far from necro, dist 3 from ghoul
    ]
  });
  state.units.push(ghoulUnit("p1-necro-ghoul-0", 1, 8, 8, "p1-necro"));
  assert.equal(getEffectiveStats(findId(state, "p2-sword"), state).defense, 5 - 1);

  findId(state, "p1-necro").hp = 4;
  // The Ghoul carries only the base -1 DEF (no STR/MOVE sap), just at wider reach.
  assert.equal(getEffectiveStats(findId(state, "p2-sword"), state).defense, 5 - 1);
});

test("A raging Necromancer also widens its Ghoul's aura reach to 4", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 8, y: 4 }
    ]
  });
  state.units.push(ghoulUnit("p1-necro-ghoul-0", 1, 8, 8, "p1-necro"));
  assert.equal(getEffectiveStats(findId(state, "p2-sword"), state).defense, 5);

  findId(state, "p1-necro").hp = 4;
  assert.equal(getEffectiveStats(findId(state, "p2-sword"), state).defense, 5 - 1);
});

test("getAuraSources reports each living aura source's current reach", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  state.units.push(ghoulUnit("p1-necro-ghoul-0", 1, 5, 5, "p1-necro"));

  const healthy = getAuraSources(state);
  const necroSrc = healthy.find((s) => s.position.x === 0 && s.position.y === 0);
  const ghoulSrc = healthy.find((s) => s.position.x === 5 && s.position.y === 5);
  assert.equal(necroSrc.radius, 3);
  assert.equal(necroSrc.player, 1);
  assert.equal(ghoulSrc.radius, 3);

  findId(state, "p1-necro").hp = 4; // raging widens both the necro and its ghoul
  const raging = getAuraSources(state);
  assert.equal(raging.find((s) => s.position.x === 0 && s.position.y === 0).radius, 4);
  assert.equal(raging.find((s) => s.position.x === 5 && s.position.y === 5).radius, 4);

  // A non-aura unit (the lone swordsman) contributes no source.
  assert.ok(!raging.some((s) => s.position.x === 9 && s.position.y === 9));
});

test("A healthy Necromancer projects only the base aura (no STR/MOVE sap)", () => {
  const state = createBattleState({
    units: [
      { id: "p1-necro", player: 1, type: "necromancer", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });
  const enemy = getEffectiveStats(findId(state, "p2-sword"), state);
  assert.equal(enemy.defense, 5 - 1);
  assert.equal(enemy.strength, 10);
  assert.equal(enemy.moveRange, 3);
});

// --- VFX coverage ---

test("Wither, Dark Bomb, and Summon Ghoul all declare VFX recipes", () => {
  assert.equal(getAbilityVfx("wither")?.type, "statusStrike");
  assert.equal(getAbilityVfx("dark-bomb")?.type, "magicBurst");
  // Summon Ghoul owns the grave-rising signature (animation batch 4).
  assert.equal(getAbilityVfx("summon-ghoul")?.type, "summonRise");
});
