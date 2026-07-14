import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, useArt, finishActivation, defend } from "../src/core/commands.js";
import { getArtMpCost, getEffectiveStats, getUnitType, isRaging } from "../src/core/unitCatalog.js";
import { getLineReachTiles } from "../src/rules/arts.js";
import { resolveBaseStrike } from "../src/rules/combat.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// Tether Grab (on an enemy) and Rocket Punch now roll to-hit like every attacking ART, so
// any test asserting a damage outcome pins the swing. NORMAL_HIT lands a non-crit hit;
// MISS forces a whiff (attackRoll below the 7% miss chance).
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const MISS = { attackRoll: 0.02 };

// A custom board: Juggernaut (p1) plus chosen allies/enemies at set tiles. Everything
// off the default corner spawns so stat/spawn tweaks never break these.
function scenario(overrides = {}) {
  return createBattleState({
    size: 13, seed: 7,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 5, y: 5, ...overrides.jug },
      { id: "p1-ally", type: "swordsman", player: 1, x: 4, y: 4, ...overrides.ally },
      { id: "p2-foe", type: "archer", player: 2, x: 5, y: 8, ...overrides.foe },
      { id: "p2-far", type: "swordsman", player: 2, x: 10, y: 10, ...overrides.far }
    ],
    ...(overrides.extra ? { units: overrides.extra } : {})
  });
}

test("Juggernaut is registered with its stat block", () => {
  const def = getUnitType("juggernaut");
  assert.equal(def.name, "Juggernaut");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 1, strength: 8, defense: 7, maxHp: 30, maxMp: 5 });
});

test("Bruiser Mode: at 0 MP base STR becomes 10 and Move 3; full MP keeps 8/2", () => {
  const empty = scenario({ jug: { mp: 0 } });
  const jugEmpty = getEffectiveStats(findUnit(empty, "p1-jug"), empty);
  assert.equal(jugEmpty.strength, 10);
  assert.equal(jugEmpty.moveRange, 3);

  const full = scenario({ jug: { mp: 5 } });
  const jugFull = getEffectiveStats(findUnit(full, "p1-jug"), full);
  assert.equal(jugFull.strength, 8);
  assert.equal(jugFull.moveRange, 2);
});

test("Bruiser Mode: the Juggernaut takes +1 magic damage while at 0 MP", () => {
  const state = scenario({ jug: { mp: 0 }, extra: [
    { id: "p1-jug", type: "juggernaut", player: 1, x: 5, y: 5, mp: 0 },
    { id: "p2-mag", type: "magician", player: 2, x: 6, y: 5 }
  ] });
  const jug = findUnit(state, "p1-jug");
  const mag = findUnit(state, "p2-mag");
  const baseMagic = getEffectiveStats(mag, state).strength; // magic ignores DEF
  assert.equal(resolveBaseStrike(mag, jug, { damageType: "magic", state }).damage, baseMagic + 1);

  // With MP to spare, no vulnerability.
  jug.mp = 5;
  assert.equal(resolveBaseStrike(mag, jug, { damageType: "magic", state }).damage, baseMagic);
});

test("Tether Grab hauls an enemy adjacent and deals 3 magic; MP is spent", () => {
  const state = scenario();
  const foeHp = findUnit(state, "p2-foe").hp;
  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "tether-grab", { targetId: "p2-foe", ...NORMAL_HIT }));
  const s = r.nextState;
  const foe = findUnit(s, "p2-foe");
  // Foe was at (5,8) on the +y ray; pulled to the tile one step from the Juggernaut.
  assert.deepEqual(foe.position, { x: 5, y: 6 });
  assert.equal(foe.hp, foeHp - 3);
  assert.equal(findUnit(s, "p1-jug").mp, 0); // 5 - 5
});

test("Tether Grab reports only the HP actually lost for its damage float", () => {
  const state = scenario({ foe: { hp: 1 } });
  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "tether-grab", { targetId: "p2-foe", ...NORMAL_HIT }));
  const resolved = r.events.find((event) => event.type === "ART_RESOLVED" && event.artId === "tether-grab");

  assert.equal(findUnit(r.nextState, "p2-foe").hp, 0);
  assert.equal(resolved.damage, 1);
  assert.deepEqual(resolved.damageByTarget, { "p2-foe": 1 });
});

test("Tether Grab that misses its to-hit roll hauls no one and deals no damage (ART still spent)", () => {
  const state = scenario();
  const foeHp = findUnit(state, "p2-foe").hp;
  const foePos = { ...findUnit(state, "p2-foe").position };
  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "tether-grab", { targetId: "p2-foe", ...MISS }));
  const s = r.nextState;
  const foe = findUnit(s, "p2-foe");
  assert.deepEqual(foe.position, foePos); // not pulled
  assert.equal(foe.hp, foeHp);            // no damage
  assert.equal(findUnit(s, "p1-jug").mp, 0); // ART still spent
});

test("Tether Grab repositions an ally with no damage", () => {
  const state = scenario({ ally: { x: 5, y: 2 } }); // on the -y ray, distance 3
  const allyHp = findUnit(state, "p1-ally").hp;
  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "tether-grab", { targetId: "p1-ally" }));
  const ally = findUnit(r.nextState, "p1-ally");
  assert.deepEqual(ally.position, { x: 5, y: 4 }); // one step from the Juggernaut
  assert.equal(ally.hp, allyHp);                    // allies take no damage
});

test("Tether Grab only reaches the FIRST unit on a ray, and rejects an off-line target", () => {
  const state = scenario({
    foe: { x: 5, y: 7 },                    // first on the +y ray (distance 2)
    far: { id: "p2-far", type: "swordsman", player: 2, x: 5, y: 9 } // behind it — blocked
  });
  let r = run(state, beginActivation(1, "p1-jug"));
  // The shielded unit behind the first contact can't be grabbed.
  const blocked = applyCommand(r.nextState, useArt(1, "p1-jug", "tether-grab", { targetId: "p2-far" }));
  assert.ok(!blocked.accepted);
  // A unit not on any straight ray (knight offset) is not a legal target either.
  const off = scenario({ foe: { x: 7, y: 6 } });
  let r2 = run(off, beginActivation(1, "p1-jug"));
  const offResult = applyCommand(r2.nextState, useArt(1, "p1-jug", "tether-grab", { targetId: "p2-foe" }));
  assert.ok(!offResult.accepted);
});

test("Rocket Punch deals fixed 10 physical (Defense reduces it) to the first enemy in line", () => {
  const state = scenario(); // archer foe at (5,8), on the +y ray within range 5
  const foe = findUnit(state, "p2-foe");
  const expected = Math.max(1, 10 - getEffectiveStats(foe, state).defense);
  const foeHp = foe.hp;
  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "rocket-punch", { targetId: "p2-foe", ...NORMAL_HIT, effectRoll: 0.99 }));
  const s = r.nextState;
  assert.equal(findUnit(s, "p2-foe").hp, foeHp - expected);
  assert.equal(findUnit(s, "p1-jug").mp, 0);
});

test("Rocket Punch crits for ×1.5 on a critical to-hit roll", () => {
  const state = scenario();
  const foe = findUnit(state, "p2-foe");
  const def = getEffectiveStats(foe, state).defense;
  const critExpected = Math.ceil(Math.max(1, 10 - def) * 1.5);
  const foeHp = foe.hp;
  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "rocket-punch", { targetId: "p2-foe", attackRoll: 0.5, critRoll: 0.01, effectRoll: 0.99 }));
  assert.equal(findUnit(r.nextState, "p2-foe").hp, foeHp - critExpected);
});

test("Rocket Punch that misses its to-hit roll deals no damage and rolls no stun", () => {
  const state = scenario();
  const foeHp = findUnit(state, "p2-foe").hp;
  let r = run(state, beginActivation(1, "p1-jug"));
  // A failing stun roll is pinned too — but it must never even be consulted on a miss.
  r = run(r.nextState, useArt(1, "p1-jug", "rocket-punch", { targetId: "p2-foe", ...MISS, effectRoll: 0.01 }));
  const foe = findUnit(r.nextState, "p2-foe");
  assert.equal(foe.hp, foeHp);                                       // no damage
  assert.ok(!foe.statuses.some((st) => st.type === "stun"));         // no stun despite a passing effectRoll
  assert.equal(findUnit(r.nextState, "p1-jug").mp, 0);               // ART still spent
});

test("Rocket Punch stuns on a passing roll and does not on a failing one", () => {
  const hit = scenario();
  let r = run(hit, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "rocket-punch", { targetId: "p2-foe", ...NORMAL_HIT, effectRoll: 0.1 })); // < 0.30
  assert.ok(findUnit(r.nextState, "p2-foe").statuses.some((st) => st.type === "stun"));

  const miss = scenario();
  let r2 = run(miss, beginActivation(1, "p1-jug"));
  r2 = run(r2.nextState, useArt(1, "p1-jug", "rocket-punch", { targetId: "p2-foe", ...NORMAL_HIT, effectRoll: 0.9 })); // >= 0.30
  assert.ok(!findUnit(r2.nextState, "p2-foe").statuses.some((st) => st.type === "stun"));
});

test("Rocket Punch is blocked when an ally stands between the Juggernaut and the enemy", () => {
  const state = scenario({
    ally: { x: 5, y: 6 },                    // ally between the Juggernaut and the foe
    foe: { x: 5, y: 8 }
  });
  let r = run(state, beginActivation(1, "p1-jug"));
  const blocked = applyCommand(r.nextState, useArt(1, "p1-jug", "rocket-punch", { targetId: "p2-foe" }));
  assert.ok(!blocked.accepted); // an ally on the ray blocks the shot
});

test("Recharge restores 5 MP, or mends 1 HP when already at full MP", () => {
  const empty = scenario({ jug: { mp: 0 } });
  let r = run(empty, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "recharge"));
  assert.equal(findUnit(r.nextState, "p1-jug").mp, 5);

  const fullButHurt = scenario({ jug: { mp: 5, hp: 20 } });
  let r2 = run(fullButHurt, beginActivation(1, "p1-jug"));
  r2 = run(r2.nextState, useArt(1, "p1-jug", "recharge"));
  const jug = findUnit(r2.nextState, "p1-jug");
  assert.equal(jug.mp, 5);
  assert.equal(jug.hp, 21); // +1 HP at full MP
});

test("Null Zone RAGE grants +2 STR / +2 MOVE and makes ARTS free", () => {
  const state = scenario({ jug: { hp: 4, mp: 5 } }); // hp <= 5 → raging
  const jug = findUnit(state, "p1-jug");
  assert.ok(isRaging(jug));
  const stats = getEffectiveStats(jug, state);
  assert.equal(stats.strength, 8 + 2);   // Null Zone +2 (MP full, so no Bruiser bonus)
  assert.equal(stats.moveRange, 2 + 2);
  // ARTS cost no MP while raging.
  assert.equal(getArtMpCost(jug, getUnitType("juggernaut").arts.find((a) => a.id === "tether-grab")), 0);
  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "tether-grab", { targetId: "p2-foe", ...NORMAL_HIT }));
  assert.equal(findUnit(r.nextState, "p1-jug").mp, 5); // unspent — free ART
});

test("Null Zone disables ALL healing on the board while the Juggernaut rages", () => {
  // A raging Juggernaut + a Mystic and a wounded ally. Pray should heal nobody.
  const disabled = createBattleState({
    size: 13, seed: 3,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 1, y: 1, hp: 4 }, // raging → lockout
      { id: "p1-mystic", type: "mystic", player: 1, x: 5, y: 5 },
      { id: "p1-hurt", type: "swordsman", player: 1, x: 5, y: 6, hp: 10 },
      { id: "p2-foe", type: "archer", player: 2, x: 11, y: 11 }
    ]
  });
  let r = run(disabled, beginActivation(1, "p1-mystic"));
  r = run(r.nextState, useArt(1, "p1-mystic", "pray"));
  assert.equal(findUnit(r.nextState, "p1-hurt").hp, 10); // no healing

  // With the Juggernaut healthy (not raging), Pray heals normally.
  const healthy = createBattleState({
    size: 13, seed: 3,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 1, y: 1, hp: 30 }, // not raging
      { id: "p1-mystic", type: "mystic", player: 1, x: 5, y: 5 },
      { id: "p1-hurt", type: "swordsman", player: 1, x: 5, y: 6, hp: 10 },
      { id: "p2-foe", type: "archer", player: 2, x: 11, y: 11 }
    ]
  });
  let r2 = run(healthy, beginActivation(1, "p1-mystic"));
  r2 = run(r2.nextState, useArt(1, "p1-mystic", "pray"));
  assert.ok(findUnit(r2.nextState, "p1-hurt").hp > 10); // healed
});

test("Recharge cannot mend HP while Null Zone healing is disabled", () => {
  // A raging Juggernaut at full MP tries to mend — but its own Null Zone blocks healing.
  const state = createBattleState({
    size: 13, seed: 5,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 5, y: 5, hp: 4, mp: 5 },
      { id: "p1-ally", type: "swordsman", player: 1, x: 4, y: 4 },
      { id: "p2-foe", type: "archer", player: 2, x: 11, y: 11 }
    ]
  });
  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "recharge"));
  assert.equal(findUnit(r.nextState, "p1-jug").hp, 4); // no mend under the lockout
});

test("Self Destruct is rage-locked, deals 10 true to nearby enemies, and kills the Juggernaut", () => {
  // Not raging → unavailable.
  const healthy = scenario({ jug: { hp: 30 }, foe: { x: 6, y: 5 } });
  let r = run(healthy, beginActivation(1, "p1-jug"));
  const denied = applyCommand(r.nextState, useArt(1, "p1-jug", "self-destruct"));
  assert.ok(!denied.accepted);
  assert.equal(denied.errorCode, "ART_NOT_AVAILABLE");

  // Raging: enemies within 4 tiles take 10 true (ignoring DEF/Defend); the Juggernaut dies.
  const raging = createBattleState({
    size: 13, seed: 9,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 5, y: 5, hp: 4 },
      { id: "p1-ally", type: "swordsman", player: 1, x: 0, y: 0 }, // keeps p1 alive after the blast
      { id: "p2-near", type: "swordsman", player: 2, x: 6, y: 5 }, // distance 1
      { id: "p2-edge", type: "archer", player: 2, x: 5, y: 9 },    // distance 4
      { id: "p2-out", type: "swordsman", player: 2, x: 11, y: 11 } // out of radius
    ]
  });
  let r2 = run(raging, beginActivation(1, "p1-jug"));
  r2 = run(r2.nextState, useArt(1, "p1-jug", "self-destruct"));
  const s = r2.nextState;
  assert.equal(findUnit(s, "p1-jug").hp, 0);                                              // consumed
  assert.equal(findUnit(s, "p2-near").hp, getUnitType("swordsman").stats.maxHp - 10);     // 10 true
  assert.equal(findUnit(s, "p2-edge").hp, getUnitType("archer").stats.maxHp - 10);        // in radius 4
  assert.equal(findUnit(s, "p2-out").hp, getUnitType("swordsman").stats.maxHp);           // untouched
});

test("Self Destruct bypasses Defend (true damage)", () => {
  const raging = createBattleState({
    size: 13, seed: 11,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 5, y: 5, hp: 4 },
      { id: "p1-ally", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "p2-foe", type: "swordsman", player: 2, x: 6, y: 5, defending: true }
    ]
  });
  let r = run(raging, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "self-destruct"));
  assert.equal(findUnit(r.nextState, "p2-foe").hp, getUnitType("swordsman").stats.maxHp - 10); // full 10, Defend ignored
});

test("Self Destruct awards the match to Juggernaut when the sacrifice defeats the last enemy", () => {
  const state = createBattleState({
    size: 13,
    seed: 12,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 5, y: 5, hp: 4 },
      { id: "p2-foe", type: "swordsman", player: 2, x: 6, y: 5, hp: 10 }
    ]
  });

  let r = run(state, beginActivation(1, "p1-jug"));
  r = run(r.nextState, useArt(1, "p1-jug", "self-destruct"));
  assert.equal(findUnit(r.nextState, "p2-foe").hp, 0, "the last enemy falls");
  assert.equal(findUnit(r.nextState, "p1-jug").hp, 0, "Juggernaut still pays the sacrifice");
  assert.equal(r.nextState.phase, "complete");
  assert.equal(r.nextState.winner, 1);
});

test("getLineReachTiles washes the full reach of every ray, stopping AT the first unit", () => {
  // Foe 3 tiles down the +y ray; a far ally further along the same ray is behind it.
  const state = scenario({ foe: { x: 5, y: 8 }, ally: { x: 4, y: 4 }, far: { id: "p2-far", type: "swordsman", player: 2, x: 5, y: 11 } });
  const jug = findUnit(state, "p1-jug"); // at (5,5)
  const keys = new Set(getLineReachTiles(state, jug, 4).map((t) => `${t.x},${t.y}`));
  // The +y ray reaches (5,6),(5,7),(5,8=foe) then STOPS — (5,9) is unreachable (behind the foe).
  assert.ok(keys.has("5,6") && keys.has("5,7") && keys.has("5,8"));
  assert.ok(!keys.has("5,9"));
  // A clear ray (no unit in line, e.g. +x) washes out to the full range of 4.
  assert.ok(keys.has("6,5") && keys.has("7,5") && keys.has("8,5") && keys.has("9,5"));
  assert.ok(!keys.has("10,5")); // beyond range 4
  // The actor's own tile is never in the reach.
  assert.ok(!keys.has("5,5"));
});

test("every implemented Juggernaut ART declares a VFX recipe and an ai.intent", () => {
  const def = getUnitType("juggernaut");
  const arts = [...def.arts].filter((a) => a.kind === "active" && a.implemented);
  for (const art of arts) {
    assert.ok(getAbilityVfx(art.id), `${art.id} missing a VFX recipe`);
    assert.ok(art.ai?.intent, `${art.id} missing ai.intent`);
  }
  assert.equal(getAbilityVfx("self-destruct").type, "magicBurst");
  assert.equal(getAbilityVfx("rocket-punch").type, "projectileFan");
  assert.equal(getAbilityVfx("recharge").type, "healPulse");
});
