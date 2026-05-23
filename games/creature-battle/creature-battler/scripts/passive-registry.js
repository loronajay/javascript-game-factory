// passive-registry.js — Hook-based passive effect system.
// Each passive registers hooks that the battle engine calls at defined points.
// All hooks are pure multipliers or additive bonuses — no RNG, no state mutation —
// so online sync is preserved: both clients evaluate identical hook results.

const PASSIVE_REGISTRY = {};

function registerPassiveHook(id, hooks) {
  PASSIVE_REGISTRY[id] = hooks;
}

// ── Engine-facing helpers (called from battle-engine.js) ──────────────────────

// Combined stat multiplier for a creature's equipped passives.
// Called from getEffectiveStat() after stage scaling is applied.
function getPassiveStatMultiplier(creature, stat) {
  let mult = 1.0;
  for (const passive of (creature.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onStatCheck) mult *= reg.onStatCheck({ creature, stat }) ?? 1.0;
  }
  return mult;
}

// Combined damage multiplier for an attacker on a given move.
// Called from calcDamage() and applied to the final raw damage value.
function getPassiveDamageMultiplier(attacker, target, move) {
  let mult = 1.0;
  for (const passive of (attacker.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onBeforeDamage) mult *= reg.onBeforeDamage({ attacker, target, move }) ?? 1.0;
  }
  return mult;
}

// Extra crit chance (additive on top of ENGINE.CRIT_CHANCE).
// Called from calcDamage() before the crit roll.
function getPassiveCritBonus(attacker, move) {
  let bonus = 0;
  for (const passive of (attacker.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onCritCheck) bonus += reg.onCritCheck({ attacker, move }) ?? 0;
  }
  return bonus;
}

// ── Strength Tier 1 passives ──────────────────────────────────────────────────

// +5% physical damage dealt
registerPassiveHook('heavy_hitter', {
  onBeforeDamage({ move }) {
    return move.damageClass === 'physical' ? 1.05 : 1.0;
  },
});

// +5% effective STR
registerPassiveHook('thick_muscles', {
  onStatCheck({ stat }) {
    return stat === 'strength' ? 1.05 : 1.0;
  },
});

// +5% damage when move element matches creature's native element
registerPassiveHook('native_strength', {
  onBeforeDamage({ attacker, move }) {
    return (move.element && move.element === attacker.element) ? 1.05 : 1.0;
  },
});

// +3% crit chance on physical moves
registerPassiveHook('battle_instinct', {
  onCritCheck({ move }) {
    return move.damageClass === 'physical' ? 0.03 : 0;
  },
});

// +8% physical damage when below 50% HP
registerPassiveHook('berserkers_blood', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass === 'physical' && attacker.hp.current / attacker.hp.max < 0.5) return 1.08;
    return 1.0;
  },
});
