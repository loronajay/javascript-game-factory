// passive-registry.js — Hook-based passive effect system.
// Query hooks (onBeforeDamage, onStatCheck, etc.) return pure multipliers — no state mutation.
// Event callbacks (onKO, onAllyKO, onTakePhysicalHit, etc.) may mutate creature state;
// both clients execute identical sorted action sequences so mutations remain deterministic.

const PASSIVE_REGISTRY = {};

function registerPassiveHook(id, hooks) {
  PASSIVE_REGISTRY[id] = hooks;
}

// ── Engine-facing query helpers ───────────────────────────────────────────────

// Combined stat multiplier for a creature's equipped passives.
function getPassiveStatMultiplier(creature, stat) {
  let mult = 1.0;
  for (const passive of (creature.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onStatCheck) mult *= reg.onStatCheck({ creature, stat }) ?? 1.0;
  }
  return mult;
}

// Combined outgoing damage multiplier for an attacker on a given move.
function getPassiveDamageMultiplier(attacker, target, move) {
  let mult = 1.0;
  for (const passive of (attacker.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onBeforeDamage) mult *= reg.onBeforeDamage({ attacker, target, move }) ?? 1.0;
  }
  return mult;
}

// Incoming damage multiplier applied on the defender's side (iron_will, titans_resolve).
function getPassiveIncomingMultiplier(defender, move) {
  let mult = 1.0;
  for (const passive of (defender.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onIncomingDamage) mult *= reg.onIncomingDamage({ defender, move }) ?? 1.0;
  }
  return mult;
}

// Extra crit chance (additive on top of ENGINE.CRIT_CHANCE).
function getPassiveCritBonus(attacker, move) {
  let bonus = 0;
  for (const passive of (attacker.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onCritCheck) bonus += reg.onCritCheck({ attacker, move }) ?? 0;
  }
  return bonus;
}

// Extra crit damage multiplier (multiplicative on top of ENGINE.CRIT_MOD).
function getPassiveCritMultiplier(attacker, move) {
  let mult = 1.0;
  for (const passive of (attacker.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onCritMultiplier) mult *= reg.onCritMultiplier({ attacker, move }) ?? 1.0;
  }
  return mult;
}

// AoE bonus multiplier for the attacker (collateral).
function getPassiveAoeBonusMultiplier(attacker, move) {
  let mult = 1.0;
  for (const passive of (attacker.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onAoeDamage) mult *= reg.onAoeDamage({ attacker, move }) ?? 1.0;
  }
  return mult;
}

// Ally-wide physical damage bonus (warlords_presence).
// Searches the battle state to find whether any alive ally carries the passive.
function getWarlordPresenceBonus(attacker, move) {
  if (move.damageClass !== 'physical') return 1.0;
  const bs = state?.battleState;
  if (!bs) return 1.0;
  const attackerSide = ['player', 'opponent'].find(side =>
    SLOT_NAMES.some(s => bs[side][s] === attacker)
  );
  if (!attackerSide) return 1.0;
  const hasPresence = SLOT_NAMES.some(s => {
    const c = bs[attackerSide][s];
    return c && !c.isKnockedOut && c !== attacker && c.equippedPassives?.some(p => p.id === 'warlords_presence');
  });
  return hasPresence ? 1.08 : 1.0;
}

// ── Engine-facing event callbacks ─────────────────────────────────────────────

// Called after attacker KO's a target (killing_instinct sets a ready flag).
function applyPassiveOnKO(attacker, target) {
  for (const passive of (attacker.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onKO) reg.onKO({ attacker, target });
  }
}

// Called when a creature on defeatedSide is KO'd; notifies surviving allies (vengeance).
function applyPassiveOnAllyKO(defeatedSide, bs) {
  SLOT_NAMES.forEach(slot => {
    const ally = bs[defeatedSide][slot];
    if (!ally || ally.isKnockedOut) return;
    for (const passive of (ally.equippedPassives || [])) {
      const reg = PASSIVE_REGISTRY[passive.id];
      if (reg?.onAllyKO) reg.onAllyKO({ creature: ally });
    }
  });
}

// Called when a physical hit lands on defender (battle_worn stacks DEF).
function applyPassiveOnPhysicalHit(defender, damage) {
  for (const passive of (defender.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onTakePhysicalHit) reg.onTakePhysicalHit({ defender, damage });
  }
}

// Called before wasKO is evaluated; indomitable can survive a KO at 1 HP.
function checkPassiveSurviveKO(defender) {
  if (defender.hp.current > 0 || defender.isKnockedOut) return;
  for (const passive of (defender.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onWouldBeKO) {
      const survived = reg.onWouldBeKO({ defender });
      if (survived) return; // first passive that saves wins
    }
  }
}

// Called when defender is hit by super-effective damage (spite).
function applyPassiveOnSuperEffectiveHit(target) {
  for (const passive of (target.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onSuperEffectiveHit) reg.onSuperEffectiveHit({ creature: target });
  }
}

// Called after each action resolves; tracks relentless physical streak.
function applyPassiveAfterAction(actor, move) {
  for (const passive of (actor.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onAfterAction) reg.onAfterAction({ actor, move });
  }
}

// Called at the start of each round to advance relentless streaks.
// Increments streak for creatures that used physical last turn, resets for those who didn't.
function tickRelentlessStreaks() {
  getAllCreatures().forEach(creature => {
    if (!creature.equippedPassives?.some(p => p.id === 'relentless')) return;
    if (creature.relentlessUsedPhysical) {
      creature.relentlessStreak = Math.min((creature.relentlessStreak || 0) + 1, 4);
    } else {
      creature.relentlessStreak = 0;
    }
    creature.relentlessUsedPhysical = false;
  });
}

// ── Strength Tier 1 passives ──────────────────────────────────────────────────

registerPassiveHook('heavy_hitter', {
  onBeforeDamage({ move }) {
    return move.damageClass === 'physical' ? 1.05 : 1.0;
  },
});

registerPassiveHook('thick_muscles', {
  onStatCheck({ stat }) {
    return stat === 'strength' ? 1.05 : 1.0;
  },
});

registerPassiveHook('native_strength', {
  onBeforeDamage({ attacker, move }) {
    return (move.element && move.element === attacker.element) ? 1.05 : 1.0;
  },
});

registerPassiveHook('battle_instinct', {
  onCritCheck({ move }) {
    return move.damageClass === 'physical' ? 0.03 : 0;
  },
});

registerPassiveHook('berserkers_blood', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass === 'physical' && attacker.hp.current / attacker.hp.max < 0.5) return 1.08;
    return 1.0;
  },
});

// ── Strength Tier 2 passives ──────────────────────────────────────────────────

registerPassiveHook('heavy_hitter_2', {
  onBeforeDamage({ move }) {
    return move.damageClass === 'physical' ? 1.10 : 1.0;
  },
});

// Incoming damage reduced 8% while below 50% HP.
registerPassiveHook('iron_will', {
  onIncomingDamage({ defender }) {
    return defender.hp.current / defender.hp.max < 0.5 ? 0.92 : 1.0;
  },
});

// Physical damage grows with consecutive physical turns (up to 4 stacks, +5% each).
// Streak is tracked via relentlessUsedPhysical and tickled by tickRelentlessStreaks().
registerPassiveHook('relentless', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    return 1.0 + 0.05 * Math.min(attacker.relentlessStreak || 0, 4);
  },
  onAfterAction({ actor, move }) {
    if (move.damageClass === 'physical') actor.relentlessUsedPhysical = true;
  },
});

// Drain ratio for Power Through handled inside the power_through skill handler.
registerPassiveHook('vital_drain', {});

// Counter Strike deals +30% damage.
registerPassiveHook('counter_expert', {
  onBeforeDamage({ move }) {
    return move.id === 'counter_strike' ? 1.30 : 1.0;
  },
});

// ── Strength Tier 3 passives ──────────────────────────────────────────────────

registerPassiveHook('thick_muscles_2', {
  onStatCheck({ stat }) {
    return stat === 'strength' ? 1.10 : 1.0;
  },
});

registerPassiveHook('native_strength_2', {
  onBeforeDamage({ attacker, move }) {
    return (move.element && move.element === attacker.element) ? 1.10 : 1.0;
  },
});

// AoE skills deal +15% damage.
registerPassiveHook('collateral', {
  onAoeDamage() { return 1.15; },
});

// War Stance speed penalty reduced to -1; handled inside the war_stance skill handler.
registerPassiveHook('war_hardened', {});

// Incoming damage reduced 15% during Courage Strike wind-up.
registerPassiveHook('titans_resolve', {
  onIncomingDamage({ defender }) {
    return defender.chargingCourageStrike ? 0.85 : 1.0;
  },
});

// ── Strength Tier 4 passives ──────────────────────────────────────────────────

registerPassiveHook('heavy_hitter_3', {
  onBeforeDamage({ move }) {
    return move.damageClass === 'physical' ? 1.15 : 1.0;
  },
});

// After KO'ing an enemy the next physical attack deals +25% damage.
registerPassiveHook('killing_instinct', {
  onKO({ attacker }) {
    attacker.killingInstinctReady = true;
  },
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical' || !attacker.killingInstinctReady) return 1.0;
    attacker.killingInstinctReady = false;
    return 1.25;
  },
});

// Taking physical hits increases DEF by 1, up to 3 stacks.
registerPassiveHook('battle_worn', {
  onTakePhysicalHit({ defender }) {
    const stacks = defender.battleWornStacks || 0;
    if (stacks < 3) {
      defender.battleWornStacks = stacks + 1;
      applyStatModifier(defender, 'defense', 1);
    }
  },
});

// When an ally is KO'd, this creature gains +20% damage for 2 turns.
registerPassiveHook('vengeance', {
  onAllyKO({ creature }) {
    creature.vengeanceActive = 2;
  },
  onBeforeDamage({ attacker }) {
    return (attacker.vengeanceActive || 0) > 0 ? 1.20 : 1.0;
  },
});

// Once per battle, survive a lethal hit at 1 HP.
registerPassiveHook('indomitable', {
  onWouldBeKO({ defender }) {
    if (defender.indomitableUsed) return false;
    defender.indomitableUsed = true;
    defender.hp.current = 1;
    return true;
  },
});

// ── Strength Tier 5 passives ──────────────────────────────────────────────────

registerPassiveHook('thick_muscles_3', {
  onStatCheck({ stat }) {
    return stat === 'strength' ? 1.15 : 1.0;
  },
});

registerPassiveHook('native_strength_3', {
  onBeforeDamage({ attacker, move }) {
    return (move.element && move.element === attacker.element) ? 1.15 : 1.0;
  },
});

// Critical hits deal +50% more damage on top of normal crit multiplier.
registerPassiveHook('fatal_blow', {
  onCritMultiplier() { return 1.50; },
});

// When hit by a super-effective move, next physical attack deals +20% damage.
registerPassiveHook('spite', {
  onSuperEffectiveHit({ creature }) {
    creature.spiteActive = true;
  },
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass !== 'physical' || !attacker.spiteActive) return 1.0;
    attacker.spiteActive = false;
    return 1.20;
  },
});

// While alive, all allies deal +8% physical damage. Effect is checked via getWarlordPresenceBonus().
registerPassiveHook('warlords_presence', {});
