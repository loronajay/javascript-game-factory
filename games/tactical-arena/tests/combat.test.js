import test from "node:test";
import assert from "node:assert/strict";

import { getCritChance, getMissChance, getProximityBonus, isBlinded, resolvePhysicalStrike } from "../src/rules/combat.js";
import { createBattleState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, useArt } from "../src/core/commands.js";

// Force a clean normal hit (no miss, no crit) so damage assertions are deterministic.
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

// The forecast and the reducer must read the same number — these lock the shared
// resolver to the as-built combat so a preview can never drift from the real hit.

test("resolvePhysicalStrike folds STR, DEF, and Defend halving (rounded up)", () => {
  const attacker = { type: "swordsman", hp: 25, position: { x: 0, y: 0 } };
  const target = { type: "swordsman", hp: 25, defending: false, position: { x: 1, y: 0 } };
  assert.equal(resolvePhysicalStrike(attacker, target).damage, 5); // 10 STR - 5 DEF

  target.defending = true;
  assert.equal(resolvePhysicalStrike(attacker, target).damage, 3); // ceil(5 / 2)
});

test("proximity passive adds bonus only when the strike is eligible for it", () => {
  const archer = { type: "archer", hp: 24, position: { x: 0, y: 0 } };
  const adjacent = { type: "swordsman", hp: 25, defending: false, position: { x: 1, y: 0 } };

  assert.equal(getProximityBonus(archer, adjacent), 2);
  assert.equal(resolvePhysicalStrike(archer, adjacent, { proximity: true }).damage, 5); // 8-5 +2
  assert.equal(resolvePhysicalStrike(archer, adjacent, { proximity: false }).damage, 3); // ART path: no bonus

  const twoAway = { type: "swordsman", hp: 25, defending: false, position: { x: 2, y: 0 } };
  assert.equal(getProximityBonus(archer, twoAway), 1);

  // A unit without a proximity passive gets nothing.
  const swordsman = { type: "swordsman", hp: 25, position: { x: 0, y: 0 } };
  assert.equal(getProximityBonus(swordsman, adjacent), 0);
});

test("the forecast number equals the damage the reducer actually deals (basic ATTACK)", () => {
  const state = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const actor = state.units.find((u) => u.id === "p1-archer");
  const target = state.units.find((u) => u.id === "p2-swordsman");
  const predicted = resolvePhysicalStrike(actor, target, { proximity: true }).damage;

  const selected = applyCommand(state, beginActivation(1, "p1-archer"));
  const resolved = applyCommand(selected.nextState, attack(1, "p1-archer", "p2-swordsman", NORMAL_HIT));
  const actualDamage = target.hp - resolved.nextState.units.find((u) => u.id === "p2-swordsman").hp;

  assert.equal(predicted, actualDamage);
});

test("the forecast number equals the damage the reducer deals through a targeted ART (no proximity)", () => {
  const state = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const actor = state.units.find((u) => u.id === "p1-archer");
  const target = state.units.find((u) => u.id === "p2-swordsman");
  const predicted = resolvePhysicalStrike(actor, target, { proximity: false }).damage;

  const selected = applyCommand(state, beginActivation(1, "p1-archer"));
  const resolved = applyCommand(selected.nextState, useArt(1, "p1-archer", "leg-shot", {
    targetId: "p2-swordsman", effectRoll: 0.9, ...NORMAL_HIT
  }));
  const actualDamage = target.hp - resolved.nextState.units.find((u) => u.id === "p2-swordsman").hp;

  assert.equal(predicted, actualDamage);
});

test("isBlinded reflects a guaranteed-miss attacker", () => {
  assert.equal(isBlinded({ statuses: [{ type: "blind", duration: 1 }] }), true);
  assert.equal(isBlinded({ statuses: [] }), false);
  assert.equal(isBlinded({}), false);
});

test("miss and crit chances honor blind and the raging Archer's kit", () => {
  const swordsman = { type: "swordsman", hp: 25, statuses: [] };
  assert.equal(getMissChance(swordsman), 0.10);
  assert.equal(getCritChance(swordsman), 0.15);

  // Blind = guaranteed miss.
  assert.equal(getMissChance({ type: "swordsman", hp: 25, statuses: [{ type: "blind", duration: 1 }] }), 1);

  // Raging Archer: never misses (even while blinded) and crits at 50%.
  const ragingArcher = { type: "archer", hp: 5, statuses: [{ type: "blind", duration: 1 }] };
  assert.equal(getMissChance(ragingArcher), 0);
  assert.equal(getCritChance(ragingArcher), 0.50);

  // The Swordsman's RAGE has no combat block, so it keeps base chances.
  assert.equal(getCritChance({ type: "swordsman", hp: 5, statuses: [] }), 0.15);
});

test("a pinned low to-hit roll makes the reducer's attack miss; a pinned crit roll scales damage", () => {
  const makeState = () => createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });

  // attackRoll 0.01 < 10% miss → whiff, target untouched, primary still spent.
  let s = makeState();
  s = applyCommand(s, beginActivation(1, "p1-swordsman")).nextState;
  const missed = applyCommand(s, attack(1, "p1-swordsman", "p2-swordsman", { attackRoll: 0.01 }));
  assert.equal(missed.events[0].missed, true);
  assert.equal(missed.nextState.units.find((u) => u.id === "p2-swordsman").hp, 25);
  assert.equal(missed.nextState.activation.primaryUsed, true);

  // Normal hit: 10 STR - 5 DEF = 5 damage.
  s = makeState();
  s = applyCommand(s, beginActivation(1, "p1-swordsman")).nextState;
  const normal = applyCommand(s, attack(1, "p1-swordsman", "p2-swordsman", { attackRoll: 0.5, critRoll: 0.99 }));
  assert.equal(normal.events[0].critical, false);
  assert.equal(normal.nextState.units.find((u) => u.id === "p2-swordsman").hp, 20);

  // Crit: base 5 → ceil(5 * 1.5) = 8 damage.
  s = makeState();
  s = applyCommand(s, beginActivation(1, "p1-swordsman")).nextState;
  const crit = applyCommand(s, attack(1, "p1-swordsman", "p2-swordsman", { attackRoll: 0.5, critRoll: 0.01 }));
  assert.equal(crit.events[0].critical, true);
  assert.equal(crit.nextState.units.find((u) => u.id === "p2-swordsman").hp, 17);
});

test("a missed ART deals no damage, lands no status, but still spends MP and the unit", () => {
  const state = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(state, beginActivation(1, "p1-archer"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-archer", "poison-arrow", {
    targetId: "p2-swordsman", effectRoll: 0, attackRoll: 0.01
  }));

  const target = result.nextState.units.find((u) => u.id === "p2-swordsman");
  const actor = result.nextState.units.find((u) => u.id === "p1-archer");
  assert.equal(result.events[0].missed, true);
  assert.equal(target.hp, 25);
  assert.deepEqual(target.statuses, []);
  assert.equal(actor.mp, 18); // 22 - 4 MP, spent even on a miss
  assert.equal(actor.spent, true);
});

test("rolls are deterministic from the seed: same seed + commands ⇒ same outcome", () => {
  const run = () => {
    const state = createBattleState({
      seed: 12345,
      units: [
        { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
        { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
      ]
    });
    const selected = applyCommand(state, beginActivation(1, "p1-swordsman"));
    return applyCommand(selected.nextState, attack(1, "p1-swordsman", "p2-swordsman"));
  };
  const a = run();
  const b = run();
  assert.equal(a.events[0].roll, b.events[0].roll);
  assert.equal(a.events[0].missed, b.events[0].missed);
  assert.equal(
    a.nextState.units.find((u) => u.id === "p2-swordsman").hp,
    b.nextState.units.find((u) => u.id === "p2-swordsman").hp
  );
});
