import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_TYPES, getEffectiveStats, isRaging } from "../src/core/unitCatalog.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, finishActivation, useArt } from "../src/core/commands.js";
import { getLegalFleeTiles } from "../src/rules/arts.js";
import { getBasicAttackDamageType, resolveBaseStrike } from "../src/rules/combat.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const MISS = { attackRoll: 0.01 };
const EFFECT_HIT = { effectRoll: 0.1 };
const EFFECT_MISS = { effectRoll: 0.99 };

function makeState(overrides = {}) {
  return createBattleState({
    units: [
      { id: "p1-mag", player: 1, type: "magician", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 3, y: 0 },
      ...(overrides.extra ?? [])
    ]
  });
}

function activate(state, unitId) {
  const player = state.units.find((u) => u.id === unitId).player;
  const r = applyCommand(state, beginActivation(player, unitId));
  assert.ok(r.accepted, `beginActivation ${unitId} failed`);
  return r.nextState;
}

// --- Catalog ---

test("Magician is registered in UNIT_TYPES with correct stats", () => {
  const mag = UNIT_TYPES.magician;
  assert.ok(mag, "magician missing from UNIT_TYPES");
  assert.equal(mag.stats.maxHp, 23);
  assert.equal(mag.stats.moveRange, 2);
  assert.equal(mag.stats.attackRange, 5);
  assert.equal(mag.stats.strength, 6);
  assert.equal(mag.stats.defense, 3);
  assert.equal(mag.stats.maxMp, 40);
});

test("Magician has Magic Pipe passive with mpRegen effect", () => {
  const mag = UNIT_TYPES.magician;
  assert.equal(mag.passive.id, "magic-pipe");
  assert.equal(mag.passive.effect.type, "mpRegen");
  assert.equal(mag.passive.effect.interval, 3);
  assert.equal(mag.passive.effect.amount, 10);
  assert.equal(mag.passive.implemented, true);
});

test("Magician has Spark, Flee, Banish, and Nuke arts", () => {
  const mag = UNIT_TYPES.magician;
  const ids = mag.arts.map((a) => a.id);
  assert.deepEqual(ids, ["spark", "flee", "banish", "nuke"]);
});

test("Spark is a magic-damage active art", () => {
  const spark = UNIT_TYPES.magician.arts.find((a) => a.id === "spark");
  assert.equal(spark.kind, "active");
  assert.equal(spark.mpCost, 4);
  assert.equal(spark.damageType, "magic");
  assert.equal(spark.effect, undefined);
  assert.equal(spark.implemented, true);
});

test("Flee is an active art with flee resolution", () => {
  const flee = UNIT_TYPES.magician.arts.find((a) => a.id === "flee");
  assert.equal(flee.kind, "active");
  assert.equal(flee.mpCost, 5);
  assert.equal(flee.resolution, "flee");
  assert.equal(flee.implemented, true);
});

test("Banish is a magic-damage active art with silence effect", () => {
  const banish = UNIT_TYPES.magician.arts.find((a) => a.id === "banish");
  assert.equal(banish.kind, "active");
  assert.equal(banish.mpCost, 8);
  assert.equal(banish.damageType, "magic");
  assert.equal(banish.effect.type, "status");
  assert.equal(banish.effect.status, "silence");
  assert.equal(banish.effect.chance, 0.75);
  assert.equal(banish.implemented, true);
});

test("Nuke is a rageLocked selfCast active art with AoE magic damage", () => {
  const nuke = UNIT_TYPES.magician.arts.find((a) => a.id === "nuke");
  assert.ok(nuke, "nuke art missing");
  assert.equal(nuke.kind, "active");
  assert.equal(nuke.mpCost, 16);
  assert.equal(nuke.rageLocked, true);
  assert.equal(nuke.selfCast, true);
  assert.equal(nuke.damage.type, "magic");
  assert.equal(nuke.damage.amount, 12);
  assert.equal(nuke.targeting.shape, "nukeAura");
  assert.equal(nuke.targeting.radius, 3);
  assert.equal(nuke.implemented, true);
});

// --- Magic Pipe passive (mpRegen) ---

test("mageChargeCount starts at 0 on all units", () => {
  const state = makeState();
  for (const unit of state.units) {
    assert.equal(unit.mageChargeCount, 0);
  }
});

test("mageChargeCount increments after a non-spell activation", () => {
  const state = makeState();
  let s = activate(state, "p1-mag");
  const r1 = applyCommand(s, attack(1, "p1-mag", "p2-sword", NORMAL_HIT));
  assert.ok(r1.accepted);
  // spendAndAdvance fires in finishActivation, not in attack()
  const r2 = applyCommand(r1.nextState, finishActivation(1, "p1-mag"));
  assert.ok(r2.accepted);
  const mag = r2.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(mag.mageChargeCount, 1);
});

test("mageChargeCount resets to 0 after using Spark", () => {
  // Give magician 2 prior charges
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").mageChargeCount = 2;
  let s = activate(state, "p1-mag");
  const r = applyCommand(s, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  assert.ok(r.accepted);
  const mag = r.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(mag.mageChargeCount, 0);
});

test("mageChargeCount resets to 0 after using Banish", () => {
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").mageChargeCount = 2;
  let s = activate(state, "p1-mag");
  const r = applyCommand(s, useArt(1, "p1-mag", "banish", { targetId: "p2-sword", ...NORMAL_HIT, ...EFFECT_MISS }));
  assert.ok(r.accepted);
  const mag = r.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(mag.mageChargeCount, 0);
});

test("Magic Pipe restores 10 MP on the 3rd consecutive non-spell activation", () => {
  const state = makeState();
  const magUnit = state.units.find((u) => u.id === "p1-mag");
  magUnit.mp = 10; // low MP to make the regen visible
  magUnit.mageChargeCount = 2; // already 2 activations without spells

  // This non-spell activation is the 3rd → triggers regen on finishActivation
  let s = activate(state, "p1-mag");
  const r1 = applyCommand(s, attack(1, "p1-mag", "p2-sword", NORMAL_HIT));
  assert.ok(r1.accepted);
  const r2 = applyCommand(r1.nextState, finishActivation(1, "p1-mag"));
  assert.ok(r2.accepted);
  const magAfter = r2.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(magAfter.mp, 20); // 10 + 10 regen
  assert.equal(magAfter.mageChargeCount, 0); // reset after trigger
  assert.deepEqual(r2.events.find((event) => event.type === "PASSIVE_RESTORE"), {
    type: "PASSIVE_RESTORE",
    unitId: "p1-mag",
    sourceId: "p1-mag",
    passiveId: "magic-pipe",
    passiveName: "Magic Pipe",
    mpRestored: 10,
    hpRestored: 0
  });
});

test("Magic Pipe regen does not push MP above maxMp", () => {
  const state = makeState();
  const magUnit = state.units.find((u) => u.id === "p1-mag");
  magUnit.mp = 38; // 2 below max
  magUnit.mageChargeCount = 2;

  let s = activate(state, "p1-mag");
  const r1 = applyCommand(s, attack(1, "p1-mag", "p2-sword", NORMAL_HIT));
  assert.ok(r1.accepted);
  const r2 = applyCommand(r1.nextState, finishActivation(1, "p1-mag"));
  assert.ok(r2.accepted);
  const magAfter = r2.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(magAfter.mp, 40); // capped at maxMp
});

// --- RAGE ---

test("Magician RAGE triggers at 5 HP or lower", () => {
  const lowMag = { type: "magician", hp: 5, position: { x: 0, y: 0 } };
  assert.ok(isRaging(lowMag));
  const healthyMag = { type: "magician", hp: 6, position: { x: 0, y: 0 } };
  assert.ok(!isRaging(healthyMag));
});

test("Nuke is unavailable when not raging", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  // Magician at full HP — not raging
  const result = applyCommand(s1, useArt(1, "p1-mag", "nuke", {}));
  assert.ok(!result.accepted);
});

test("Nuke is available when raging", () => {
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").hp = 4; // raging
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "nuke", {}));
  assert.ok(result.accepted);
});

// --- Nuke ---

test("Nuke deals fixed magic damage to all enemies within 3 tiles", () => {
  // Place two enemies within range and one just outside
  const state = createBattleState({
    units: [
      { id: "p1-mag", player: 1, type: "magician", x: 5, y: 5 },
      { id: "p2-a", player: 2, type: "swordsman", x: 5, y: 6 }, // distance 1
      { id: "p2-b", player: 2, type: "swordsman", x: 6, y: 8 }, // distance 3
      { id: "p2-c", player: 2, type: "swordsman", x: 5, y: 9 }  // distance 4 — outside
    ]
  });
  state.units.find((u) => u.id === "p1-mag").hp = 4; // raging

  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "nuke", {}));
  assert.ok(result.accepted);

  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.artId, "nuke");
  assert.ok(event.targetIds.includes("p2-a"));
  assert.ok(event.targetIds.includes("p2-b"));
  assert.ok(!event.targetIds.includes("p2-c")); // out of range

  // swordsman DEF = 3, but magic ignores DEF → damage = 12
  const swordHpBase = createBattleState({ units: [{ id: "x", player: 2, type: "swordsman", x: 0, y: 0 }] }).units[0].hp;
  const aAfter = result.nextState.units.find((u) => u.id === "p2-a");
  assert.equal(aAfter.hp, swordHpBase - 12);
});

test("Nuke respects Defend (magic is halved by Defend)", () => {
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").hp = 4;
  // Manually set the target as defending
  state.units.find((u) => u.id === "p2-sword").defending = true;
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "nuke", {}));
  assert.ok(result.accepted);
  // ceil(12 / 2) = 6
  assert.equal(result.events[0].damageByTarget["p2-sword"], 6);
});

test("Nuke spends 16 MP and resets mageChargeCount", () => {
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").hp = 4;
  state.units.find((u) => u.id === "p1-mag").mageChargeCount = 2;
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "nuke", {}));
  assert.ok(result.accepted);
  const mag = result.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(mag.mp, 40 - 16);
  assert.equal(mag.mageChargeCount, 0);
});

// --- Spark ---

test("Spark deals magic damage ignoring DEF", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.ok(event.hit);
  assert.equal(event.damage.type, "magic");
  assert.equal(event.damage.damage, 6); // STR 6, no DEF
});

test("Spark spends 4 MP", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  assert.ok(result.accepted);
  const magAfter = result.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(magAfter.mp, 40 - 4);
});

test("Spark ignores blind (still rolls to-hit off art accuracy)", () => {
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").statuses = [{ type: "blind", duration: 1 }];
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.hit, true);
  assert.equal(event.missed, undefined);
  assert.equal(event.damage.type, "magic");
  assert.equal(event.damage.damage, 6);
  const magAfter = result.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(magAfter.mp, 36);
  assert.equal(magAfter.spent, true);
});

test("Spark can still miss on a bad roll despite blind being ignored", () => {
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").statuses = [{ type: "blind", duration: 1 }];
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...MISS }));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.hit, false);
  assert.equal(event.missed, true);
});

test("Spark forecast matches reducer (magic damage)", () => {
  const state = makeState();
  const mag = state.units.find((u) => u.id === "p1-mag");
  const sword = state.units.find((u) => u.id === "p2-sword");
  const predicted = resolveBaseStrike(mag, sword, { damageType: "magic" }).damage;

  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  const actualDamage = sword.hp - result.nextState.units.find((u) => u.id === "p2-sword").hp;
  assert.equal(predicted, actualDamage);
});

test("Spark requires a target enemy in range", () => {
  const state = createBattleState({
    units: [
      { id: "p1-mag", player: 1, type: "magician", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", x: 8, y: 0 }
    ]
  });
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "spark", { targetId: "p2-sword", ...NORMAL_HIT }));
  assert.ok(!result.accepted); // out of range
});

// --- Flee ---

test("getLegalFleeTiles returns empty tiles within moveRange+2 (chebyshev 4)", () => {
  const state = makeState();
  const mag = state.units.find((u) => u.id === "p1-mag");
  const tiles = getLegalFleeTiles(state, mag);
  assert.ok(tiles.has("4,0")); // 4 tiles right, on 10x10 board
  assert.ok(!tiles.has("0,0")); // current position excluded
  assert.ok(!tiles.has("3,0")); // p2-sword is there — occupied
});

test("Blizzard extends Flee by one movement-art tile", () => {
  const state = makeState();
  state.weather = { id: "blizzard", sourceId: null };
  const mag = findUnit(state, "p1-mag");
  const tiles = getLegalFleeTiles(state, mag);

  assert.ok(tiles.has("0,5"), "Move 2 + Flee 2 + Blizzard 1 reaches distance 5");
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "flee", { targetPosition: { x: 0, y: 5 } }));
  assert.ok(result.accepted);
});

test("Flee teleports unit to target empty tile and spends unit", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "flee", { targetPosition: { x: 4, y: 0 } }));
  assert.ok(result.accepted);
  const magAfter = result.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(magAfter.position.x, 4);
  assert.equal(magAfter.position.y, 0);
  assert.equal(magAfter.spent, true);
  assert.equal(magAfter.mp, 40 - 5);
});

test("Flee rejects occupied target tile", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "flee", { targetPosition: { x: 3, y: 0 } }));
  assert.ok(!result.accepted);
});

test("Flee rejects target tile out of flee range", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  // (0,5) is 5 tiles away (chebyshev) — beyond range of 4
  const result = applyCommand(s1, useArt(1, "p1-mag", "flee", { targetPosition: { x: 0, y: 5 } }));
  assert.ok(!result.accepted);
});

test("Flee emits ART_RESOLVED event with path", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "flee", { targetPosition: { x: 2, y: 2 } }));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.artId, "flee");
  assert.ok(Array.isArray(event.path));
  assert.equal(event.path[1].x, 2);
  assert.equal(event.path[1].y, 2);
});

// --- Banish ---

test("Banish deals magic damage and can silence on 75% check", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "banish", { targetId: "p2-sword", ...NORMAL_HIT, ...EFFECT_HIT }));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.ok(event.hit);
  assert.equal(event.damage.type, "magic");
  assert.equal(event.damage.damage, 6);
  assert.ok(event.effect.applied);
  const sword = result.nextState.units.find((u) => u.id === "p2-sword");
  assert.ok(sword.statuses.some((s) => s.type === "silence"));
});

test("Banish silence can fail on a bad roll", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "banish", { targetId: "p2-sword", ...NORMAL_HIT, ...EFFECT_MISS }));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.ok(!event.effect.applied);
  const sword = result.nextState.units.find((u) => u.id === "p2-sword");
  assert.ok(!sword.statuses.some((s) => s.type === "silence"));
});

test("Banish ignores blind and still rolls its own to-hit plus a separate silence check", () => {
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").statuses = [{ type: "blind", duration: 1 }];
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "banish", { targetId: "p2-sword", ...NORMAL_HIT, ...EFFECT_HIT }));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.hit, true);
  assert.equal(event.missed, undefined);
  assert.equal(event.damage.type, "magic");
  assert.equal(event.damage.damage, 6);
  assert.ok(event.effect.applied);
  const sword = result.nextState.units.find((u) => u.id === "p2-sword");
  assert.ok(sword.statuses.some((s) => s.type === "silence"));
});

test("Banish can still miss on a bad roll despite blind being ignored", () => {
  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").statuses = [{ type: "blind", duration: 1 }];
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "banish", { targetId: "p2-sword", ...MISS, ...EFFECT_HIT }));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.hit, false);
  assert.equal(event.missed, true);
});

test("Banish spends 8 MP", () => {
  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, useArt(1, "p1-mag", "banish", { targetId: "p2-sword", ...NORMAL_HIT, ...EFFECT_MISS }));
  assert.ok(result.accepted);
  const magAfter = result.nextState.units.find((u) => u.id === "p1-mag");
  assert.equal(magAfter.mp, 40 - 8);
});

// --- Magician basic attack ---

test("Magician basic attack is physical damage while healthy", () => {
  assert.equal(getBasicAttackDamageType({ type: "magician", hp: 6 }), "physical");

  const state = makeState();
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, attack(1, "p1-mag", "p2-sword", NORMAL_HIT));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ATTACK_RESOLVED");
  assert.ok(event.hit);
  // physical = max(1, STR - DEF) = max(1, 6 - 5) = 1; damage spread flat on ATTACK_RESOLVED
  assert.equal(event.damage, 1);
});

test("raging Magician basic attacks deal magic damage", () => {
  assert.equal(getBasicAttackDamageType({ type: "magician", hp: 5 }), "magic");

  const state = makeState();
  state.units.find((u) => u.id === "p1-mag").hp = 5;
  const s1 = activate(state, "p1-mag");
  const result = applyCommand(s1, attack(1, "p1-mag", "p2-sword", NORMAL_HIT));
  assert.ok(result.accepted);
  const event = result.events.find((e) => e.type === "ATTACK_RESOLVED");
  assert.ok(event.hit);
  assert.equal(event.damage, 6);
});

// --- VFX catalog ---

test("Spark, Flee, Banish, and Nuke have VFX catalog entries", () => {
  assert.equal(getAbilityVfx("spark")?.type, "projectileFan");
  assert.equal(getAbilityVfx("flee")?.type, "dashTrail");
  assert.equal(getAbilityVfx("banish")?.type, "statusStrike");
  // Banish silences, so it draws the real silenceRune motif (the old "banish"
  // motif string had no statusStrike branch and rendered nothing).
  assert.equal(getAbilityVfx("banish")?.motif, "silenceRune");
  assert.equal(getAbilityVfx("nuke")?.type, "magicBurst");
});
