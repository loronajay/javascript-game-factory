// Expected-value combat math for the CPU.
//
// The AI plans against averages and NEVER rolls a die: it must not peek at — or
// consume — the authoritative RNG carried in match state, and its evaluation has
// to be deterministic so a replay reproduces the same choices. A d6 resolves as
// 1 = miss, 2-5 = normal, 6 = crit, so each outcome class carries a fixed
// probability that turns any attack/heal into an exact expected value.
//
// Pure and headless: no DOM, no RNG, no state mutation.

import { UNIT_TYPES } from "../config.js";
import { chebyshevDistance } from "../geometry/isometric.js";
import { getBaseDamage } from "../rules/combat.js";
import { sameTeam } from "../state/gameState.js";

const P_NORMAL = 4 / 6; // rolls 2-5
const P_CRIT = 1 / 6; //   roll 6
// (roll 1 misses and contributes nothing, so P_MISS is implicit.)

// Tactical worth of keeping a unit alive, before HP. Support/range pieces score
// higher so the CPU protects its own medic and ranger and prioritizes killing
// the enemy's.
const UNIT_VALUE = Object.freeze({
  warrior: 10,
  tank: 9,
  ranger: 12,
  medic: 13,
});

export function unitValue(type) {
  return UNIT_VALUE[type] ?? 10;
}

export function isKeyUnit(type) {
  return type === "medic" || type === "ranger";
}

// Expected damage and kill probability of `attacker` hitting `target`, honoring
// the target's defend bonus. The caller is responsible for confirming the shot
// is actually legal (range / line-of-fire) — this only does the math.
export function expectedAttack(attacker, target) {
  const base = getBaseDamage(attacker, target);
  const reduce = target.defending ? 1 : 0;
  const normalDmg = Math.max(0, base - reduce);
  const critDmg = Math.max(0, base + 1 - reduce);

  const expDamage = P_NORMAL * normalDmg + P_CRIT * critDmg;

  // A roll kills if its damage class meets the target's current HP. Normal
  // damage covers rolls 2-5; a crit covers roll 6.
  let pKill = 0;
  if (normalDmg >= target.hp) pKill += P_NORMAL;
  if (critDmg >= target.hp) pKill += P_CRIT;

  return { expDamage, pKill, expTargetHp: Math.max(0, target.hp - expDamage) };
}

// Expected healing applied to `target`, capped by its missing HP (no overheal).
export function expectedHeal(target) {
  const missing = Math.max(0, target.maxHp - target.hp);
  if (missing <= 0) return { expHeal: 0, expTargetHp: target.hp };

  const expHeal = P_NORMAL * Math.min(3, missing) + P_CRIT * Math.min(4, missing);
  return { expHeal, expTargetHp: Math.min(target.maxHp, target.hp + expHeal) };
}

// Expected damage the enemy squad could land on `victim` next turn if it sat at
// `pos`, approximated by reach = move range + attack range. This deliberately
// ignores blockers and turn order — an over-estimate that keeps the CPU's units
// (especially its medic and ranger) wary of walking into crossfire.
export function incomingThreat(state, units, victim, pos, defending) {
  const proxy = { ...victim, x: pos.x, y: pos.y, defending };
  let threat = 0;

  for (const enemy of units) {
    if (enemy.hp <= 0 || sameTeam(state, enemy, victim)) continue;
    const def = UNIT_TYPES[enemy.type];
    const reach = def.moveRange + def.attackRange;
    if (chebyshevDistance(enemy, pos) > reach) continue;
    threat += expectedAttack(enemy, proxy).expDamage;
  }

  return threat;
}

// Chebyshev distance from `pos` to the nearest living enemy of `forPlayer`. Used
// to reward closing the gap when no attack is available yet. Returns 0 when no
// enemy remains (the caller treats that as "no pull").
export function nearestEnemyDistance(state, units, forPlayer, pos) {
  let best = Infinity;
  for (const other of units) {
    if (other.hp <= 0 || sameTeam(state, other.player, forPlayer)) continue;
    best = Math.min(best, chebyshevDistance(other, pos));
  }
  return best === Infinity ? 0 : best;
}
