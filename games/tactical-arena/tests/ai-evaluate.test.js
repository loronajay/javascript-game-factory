import test from "node:test";
import assert from "node:assert/strict";

import {
  expectedStrike,
  expectedFixedHit,
  expectedHeal,
  statusValue,
  offenseEstimate,
  incomingThreat,
  nearestEnemyDistance,
  unitThreatValue,
  isKeyUnit
} from "../src/ai/evaluate.js";

// Pure EV math — no state mutation, no RNG. Expectations are hand-computed from the
// real resolvers (96% range-1 base accuracy, crit 15%, crit x1.5 rounded up, physical = STR-DEF
// floored at 1, magic ignores DEF). Pass state=null for two-unit cases so no team /
// enemy auras fold in and the numbers stay legible.

const close = (actual, expected, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} ≈ ${expected}`);

const HIT_BASELINE = 0.96;

const makeUnit = (over) => ({
  id: over.id ?? `${over.type}-${over.player}`,
  type: over.type,
  player: over.player ?? 1,
  hp: over.hp,
  mp: over.mp ?? 20,
  position: over.position ?? { x: 0, y: 0 },
  statModifiers: over.statModifiers ?? {},
  statuses: over.statuses ?? [],
  ...(over.defending ? { defending: true } : {})
});

test("expectedStrike: basic physical hit blends normal + crit by probability", () => {
  const attacker = makeUnit({ type: "swordsman", player: 1, hp: 25, position: { x: 0, y: 0 } });
  const target = makeUnit({ type: "swordsman", player: 2, hp: 25, position: { x: 1, y: 0 } });

  const ev = expectedStrike(null, attacker, target);
  // normal = max(1, 10−5) = 5; crit = ceil(5×1.5) = 8.
  assert.equal(ev.normalDamage, 5);
  assert.equal(ev.critDamage, 8);
  // pHit x (85% normal + 15% crit)
  close(ev.expDamage, HIT_BASELINE * (0.85 * 5 + 0.15 * 8));
  assert.equal(ev.pKill, 0);
  assert.equal(ev.riderValue, 0);
});

test("expectedStrike: pKill is the hit-weighted kill probability when lethal", () => {
  const attacker = makeUnit({ type: "swordsman", player: 1, hp: 25 });
  const target = makeUnit({ type: "swordsman", player: 2, hp: 4, position: { x: 1, y: 0 } });
  const ev = expectedStrike(null, attacker, target);
  // Both a normal (5) and a crit (8) kill a 4-HP target, so pKill = pHit.
  close(ev.pKill, HIT_BASELINE);
});

test("expectedStrike: magic damageType ignores DEF", () => {
  const magician = makeUnit({ type: "magician", player: 1, hp: 23 });
  const target = makeUnit({ type: "swordsman", player: 2, hp: 25, position: { x: 3, y: 0 } });
  const ev = expectedStrike(null, magician, target, { damageType: "magic" });
  // magic = STR 6 (DEF ignored); crit = ceil(6×1.5) = 9.
  assert.equal(ev.normalDamage, 6);
  assert.equal(ev.critDamage, 9);
  close(ev.expDamage, 0.94 * (0.85 * 6 + 0.15 * 9));
});

test("expectedStrike: art accuracy tunes hit-weighted damage", () => {
  const attacker = makeUnit({ type: "swordsman", player: 1, hp: 25 });
  const target = makeUnit({ type: "swordsman", player: 2, hp: 25, position: { x: 1, y: 0 } });
  const ev = expectedStrike(null, attacker, target, { accuracy: 0.5 });

  close(ev.expDamage, 0.5 * (0.85 * 5 + 0.15 * 8));
});

test("expectedStrike: status rider is survival × chance × statusValue", () => {
  const attacker = makeUnit({ type: "swordsman", player: 1, hp: 25 });
  const target = makeUnit({ type: "swordsman", player: 2, hp: 25, position: { x: 1, y: 0 } });
  const art = { effect: { type: "status", status: "blind", chance: 0.7, durationTurns: 1 } };
  const ev = expectedStrike(null, attacker, target, art);
  // pSurvive = pHit (neither hit kills a 25-HP target); blind value = offense for 1 turn.
  close(ev.riderValue, HIT_BASELINE * 0.7 * (6 * HIT_BASELINE));
});

test("offenseEstimate: bruiser off STR−DEF, caster off raw STR", () => {
  close(offenseEstimate(makeUnit({ type: "swordsman", hp: 25 })), Math.max(1, 10 - 4) * HIT_BASELINE);
  close(offenseEstimate(makeUnit({ type: "magician", hp: 23 })), 6 * HIT_BASELINE); // caster uses raw STR 6
});

test("statusValue: immunity zeroes it", () => {
  const mystic = makeUnit({ type: "mystic", player: 2, hp: 23 });
  assert.equal(statusValue(mystic, { status: "silence", durationTurns: 1 }), 0); // Anointed
  const paladin = makeUnit({ type: "paladin", player: 2, hp: 26 });
  assert.equal(statusValue(paladin, { status: "blind", durationTurns: 1 }), 0); // Chosen
});

test("statusValue: silence scaled up for casters, capped at threatValue", () => {
  const magician = makeUnit({ type: "magician", player: 2, hp: 23 });
  // offense x duration 1 x caster mult 1.5 (< threatValue 13, so uncapped)
  close(statusValue(magician, { status: "silence", durationTurns: 1 }), 6 * HIT_BASELINE * 1.5);
});

test("statusValue: stun is valued as full action denial over its duration", () => {
  const swordsman = makeUnit({ type: "swordsman", player: 2, hp: 25 });
  close(statusValue(swordsman, { status: "stun", durationTurns: 1 }), 6 * HIT_BASELINE);
  assert.equal(statusValue(swordsman, { status: "stun", durationTurns: 3 }), 10);
});

test("statusValue: poison uses the fixed horizon, bounded by surviving HP", () => {
  const target = makeUnit({ type: "swordsman", player: 2, hp: 25 });
  const poison = { status: "poison", duration: "permanent", turnStartDamage: 1 };
  assert.equal(statusValue(target, poison), 3); // 1 × min(3, 25)
  assert.equal(statusValue(target, poison, null, { survivingHp: 2 }), 2); // 1 × min(3, 2)
});

test("expectedHeal: capped by missing HP, never overheals", () => {
  const wounded = makeUnit({ type: "swordsman", hp: 20 }); // maxHp 25, missing 5
  assert.equal(expectedHeal(wounded, 3), 3);
  assert.equal(expectedHeal(wounded, 10), 5);
});

test("expectedFixedHit: true ignores Defend, magic honors it", () => {
  const target = makeUnit({ type: "swordsman", player: 2, hp: 25 });
  assert.equal(expectedFixedHit(null, target, { amount: 2, type: "true" }).damage, 2);
  assert.equal(expectedFixedHit(null, target, { amount: 12, type: "magic" }).damage, 12);

  const bracing = makeUnit({ type: "swordsman", player: 2, hp: 25, defending: true });
  assert.equal(expectedFixedHit(null, bracing, { amount: 12, type: "magic" }).damage, 6); // halved
  assert.equal(expectedFixedHit(null, bracing, { amount: 2, type: "true" }).damage, 2); // true unaffected
});

test("expectedFixedHit: fire-tagged magic is zero against a fire-immune target", () => {
  const gargoyle = makeUnit({ type: "gargoyle", player: 2, hp: 30 });
  assert.equal(expectedFixedHit(null, gargoyle, { amount: 5, type: "magic", affinity: "fire" }).damage, 0);
});

test("incomingThreat: only in-reach enemies count, defending lowers it", () => {
  const victim = makeUnit({ type: "swordsman", player: 1, hp: 25, position: { x: 0, y: 0 } });
  const adjacent = makeUnit({ type: "swordsman", player: 2, hp: 25, position: { x: 1, y: 0 } });
  const far = makeUnit({ type: "swordsman", player: 2, hp: 25, position: { x: 11, y: 0 } });

  const near = { units: [victim, adjacent] };
  close(incomingThreat(near, victim, victim.position, false), HIT_BASELINE * (0.85 * 5 + 0.15 * 8));
  assert.ok(
    incomingThreat(near, victim, victim.position, true) < HIT_BASELINE * (0.85 * 5 + 0.15 * 8),
    "bracing should reduce projected incoming damage"
  );

  const distant = { units: [victim, far] };
  assert.equal(incomingThreat(distant, victim, victim.position, false), 0);
});

test("nearestEnemyDistance: Chebyshev to the closest enemy", () => {
  const me = makeUnit({ type: "swordsman", player: 1, hp: 25, position: { x: 0, y: 0 } });
  const foe = makeUnit({ type: "swordsman", player: 2, hp: 25, position: { x: 3, y: 4 } });
  assert.equal(nearestEnemyDistance({ units: [me, foe] }, 1, { x: 0, y: 0 }), 4);
  assert.equal(nearestEnemyDistance({ units: [me] }, 1, { x: 0, y: 0 }), 0); // no enemy → no pull
});

test("unit worth reads from the ai metadata block", () => {
  assert.equal(unitThreatValue({ type: "swordsman" }), 10);
  assert.equal(unitThreatValue({ type: "mystic" }), 14);
  assert.equal(isKeyUnit({ type: "swordsman" }), false);
  assert.equal(isKeyUnit({ type: "mystic" }), true);
});
