import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, moveUnit, useArt } from "../src/core/commands.js";
import { getEffectiveStats, getUnitType, isDefending, isRaging } from "../src/core/unitCatalog.js";
import { getProtectLandingTiles } from "../src/rules/arts.js";
import { getLegalMoves, positionKey } from "../src/rules/movement.js";
import { applyStatus } from "../src/rules/statuses.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };
const MISS = { attackRoll: 0.02 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

function scenario(overrides = {}) {
  return createBattleState({
    size: 13,
    seed: 17,
    units: overrides.units ?? [
      { id: "p1-monk", type: "monk", player: 1, x: 5, y: 5, ...overrides.monk },
      { id: "p1-ally", type: "swordsman", player: 1, x: 5, y: 8, ...overrides.ally },
      { id: "p2-foe", type: "archer", player: 2, x: 6, y: 5, ...overrides.foe },
      { id: "p2-far", type: "swordsman", player: 2, x: 10, y: 10, ...overrides.far }
    ],
    tileObjects: overrides.tileObjects ?? []
  });
}

test("Monk is registered with its authored stat block", () => {
  const def = getUnitType("monk");
  assert.equal(def.name, "Monk");
  assert.equal(def.classType, "melee");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 1, strength: 9, defense: 6, maxHp: 26, maxMp: 25 });
});

test("Shadow Step makes Monk movement a Chebyshev radius instead of orthogonal pathing", () => {
  const state = scenario({ monk: { x: 5, y: 5 } });
  const monk = findUnit(state, "p1-monk");
  const legal = getLegalMoves(state, monk);

  assert.ok(legal.has("7,7"), "diagonal two-step tile should be legal");
  assert.ok(legal.has("3,5"), "orthogonal two-step tile should remain legal");
  assert.ok(!legal.has("8,5"), "outside move radius should be illegal");

  let r = run(state, beginActivation(1, "p1-monk"));
  r = run(r.nextState, moveUnit(1, "p1-monk", 7, 7));
  assert.deepEqual(findUnit(r.nextState, "p1-monk").position, { x: 7, y: 7 });
});

test("Heightened Sense blocks Blind and grants +1 STR for each 5 missing HP", () => {
  const state = scenario({ monk: { hp: 16 } });
  const monk = findUnit(state, "p1-monk");
  assert.equal(getEffectiveStats(monk, state).strength, 11);

  const result = applyStatus(monk, { type: "blind", duration: 1 });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "IMMUNE");
});

test("Front Kick deals base 10 physical damage and spends 4 MP", () => {
  const state = scenario();
  const foe = findUnit(state, "p2-foe");
  const foeHp = foe.hp;
  const expected = Math.max(1, 10 - getEffectiveStats(foe, state).defense);
  let r = run(state, beginActivation(1, "p1-monk"));
  r = run(r.nextState, useArt(1, "p1-monk", "front-kick", { targetId: "p2-foe", ...NORMAL_HIT }));

  assert.equal(findUnit(r.nextState, "p2-foe").hp, foeHp - expected);
  assert.equal(findUnit(r.nextState, "p1-monk").mp, 21);
});

test("Front Kick scales with effective STR from Heightened Sense", () => {
  const state = scenario({ monk: { hp: 16 } }); // +2 STR, so kick power is 12
  const foe = findUnit(state, "p2-foe");
  const foeHp = foe.hp;
  const expected = Math.max(1, 12 - getEffectiveStats(foe, state).defense);
  let r = run(state, beginActivation(1, "p1-monk"));
  r = run(r.nextState, useArt(1, "p1-monk", "front-kick", { targetId: "p2-foe", ...NORMAL_HIT }));

  assert.equal(findUnit(r.nextState, "p2-foe").hp, foeHp - expected);
});

test("Front Kick knocks the target back 3 on crit and stops before blockers", () => {
  const state = scenario({
    units: [
      { id: "p1-monk", type: "monk", player: 1, x: 5, y: 5 },
      { id: "p1-ally", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "p2-foe", type: "swordsman", player: 2, x: 6, y: 5 },
      { id: "p2-blocker", type: "archer", player: 2, x: 9, y: 5 }
    ]
  });
  let r = run(state, beginActivation(1, "p1-monk"));
  r = run(r.nextState, useArt(1, "p1-monk", "front-kick", { targetId: "p2-foe", ...CRIT }));

  assert.deepEqual(findUnit(r.nextState, "p2-foe").position, { x: 8, y: 5 });
});

test("Front Kick misses cleanly and does not knock back without a crit outside RAGE", () => {
  const missState = scenario();
  const missHp = findUnit(missState, "p2-foe").hp;
  let r = run(missState, beginActivation(1, "p1-monk"));
  r = run(r.nextState, useArt(1, "p1-monk", "front-kick", { targetId: "p2-foe", ...MISS }));
  assert.equal(findUnit(r.nextState, "p2-foe").hp, missHp);
  assert.deepEqual(findUnit(r.nextState, "p2-foe").position, { x: 6, y: 5 });

  const normalState = scenario();
  let r2 = run(normalState, beginActivation(1, "p1-monk"));
  r2 = run(r2.nextState, useArt(1, "p1-monk", "front-kick", { targetId: "p2-foe", ...NORMAL_HIT }));
  assert.deepEqual(findUnit(r2.nextState, "p2-foe").position, { x: 6, y: 5 });
});

test("Protect moves Monk to the near side of an ally and defends them both", () => {
  const state = scenario({ monk: { x: 5, y: 5 }, ally: { x: 5, y: 8, spent: true } });
  const monk = findUnit(state, "p1-monk");
  const ally = findUnit(state, "p1-ally");
  assert.deepEqual([...getProtectLandingTiles(state, monk, ally)].sort(), ["5,7"]);

  let r = run(state, beginActivation(1, "p1-monk"));
  r = run(r.nextState, useArt(1, "p1-monk", "protect", { targetId: "p1-ally" }));
  assert.deepEqual(findUnit(r.nextState, "p1-monk").position, { x: 5, y: 7 });
  assert.equal(isDefending(findUnit(r.nextState, "p1-monk")), true);
  assert.equal(isDefending(findUnit(r.nextState, "p1-ally")), true);
  assert.equal(findUnit(r.nextState, "p1-monk").mp, 20);
});

test("Protect rejects enemies, blocked landing tiles, and allies outside range", () => {
  const blocked = scenario({
    units: [
      { id: "p1-monk", type: "monk", player: 1, x: 5, y: 5 },
      { id: "p1-ally", type: "swordsman", player: 1, x: 5, y: 8 },
      { id: "p2-foe", type: "archer", player: 2, x: 6, y: 5 },
      { id: "p2-blocker", type: "archer", player: 2, x: 5, y: 7 }
    ]
  });
  let r = run(blocked, beginActivation(1, "p1-monk"));
  assert.equal(applyCommand(r.nextState, useArt(1, "p1-monk", "protect", { targetId: "p1-ally" })).accepted, false);

  const enemy = scenario();
  let r2 = run(enemy, beginActivation(1, "p1-monk"));
  assert.equal(applyCommand(r2.nextState, useArt(1, "p1-monk", "protect", { targetId: "p2-foe" })).accepted, false);

  const far = scenario({ ally: { x: 5, y: 9 } });
  let r3 = run(far, beginActivation(1, "p1-monk"));
  assert.equal(applyCommand(r3.nextState, useArt(1, "p1-monk", "protect", { targetId: "p1-ally" })).accepted, false);
});

test("Nirvana adds Move and ART range; kick always knocks back and Protect heals 2", () => {
  const state = scenario({
    monk: { hp: 4, x: 5, y: 5 },
    ally: { x: 5, y: 9, hp: 20 },
    foe: { x: 7, y: 5 }
  });
  const monk = findUnit(state, "p1-monk");
  assert.ok(isRaging(monk));
  assert.equal(getEffectiveStats(monk, state).moveRange, 4);
  assert.ok(getLegalMoves(state, monk).has(positionKey({ x: 9, y: 9 })));

  let r = run(state, beginActivation(1, "p1-monk"));
  r = run(r.nextState, useArt(1, "p1-monk", "front-kick", { targetId: "p2-foe", ...NORMAL_HIT }));
  assert.deepEqual(findUnit(r.nextState, "p2-foe").position, { x: 10, y: 5 });

  const protectState = scenario({ monk: { hp: 4, x: 5, y: 5 }, ally: { x: 5, y: 9, hp: 20 } });
  let r2 = run(protectState, beginActivation(1, "p1-monk"));
  r2 = run(r2.nextState, useArt(1, "p1-monk", "protect", { targetId: "p1-ally" }));
  assert.deepEqual(findUnit(r2.nextState, "p1-monk").position, { x: 5, y: 8 });
  assert.equal(findUnit(r2.nextState, "p1-ally").hp, 22);
});

test("every implemented Monk ART declares a VFX recipe and an ai.intent", () => {
  const def = getUnitType("monk");
  const arts = [...def.arts].filter((a) => a.kind === "active" && a.implemented);
  for (const art of arts) {
    assert.ok(getAbilityVfx(art.id), `${art.id} missing a VFX recipe`);
    assert.ok(art.ai?.intent, `${art.id} missing ai.intent`);
  }
});
