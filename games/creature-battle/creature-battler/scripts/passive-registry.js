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

// Ally-wide magic damage bonus (arcane_dominance).
function getArcaneDominanceBonus(attacker, move) {
  if (move.damageClass !== 'magic') return 1.0;
  const bs = state?.battleState;
  if (!bs) return 1.0;
  const attackerSide = ['player', 'opponent'].find(side =>
    SLOT_NAMES.some(s => bs[side][s] === attacker)
  );
  if (!attackerSide) return 1.0;
  const hasDominance = SLOT_NAMES.some(s => {
    const c = bs[attackerSide][s];
    return c && !c.isKnockedOut && c !== attacker && c.equippedPassives?.some(p => p.id === 'arcane_dominance');
  });
  return hasDominance ? 1.08 : 1.0;
}

// Dominion Aura: defenders whose allies carry this passive take 5% less magic damage.
function getDominionAuraReduction(defender) {
  const bs = state?.battleState;
  if (!bs) return 1.0;
  const defSide = ['player', 'opponent'].find(side =>
    SLOT_NAMES.some(s => bs[side][s] === defender)
  );
  if (!defSide) return 1.0;
  const hasAura = SLOT_NAMES.some(s => {
    const c = bs[defSide][s];
    return c && !c.isKnockedOut && c !== defender && c.equippedPassives?.some(p => p.id === 'dominion_aura');
  });
  return hasAura ? 0.95 : 1.0;
}

// Returns the combined Art cost multiplier from all active cost-reduction sources.
function getArtCostMultiplier(actor) {
  let reduction = 0;
  const passives = actor.equippedPassives || [];
  if (passives.some(p => p.id === 'art_affinity'))  reduction += 0.10;
  if (passives.some(p => p.id === 'art_celerity'))  reduction += 0.15;
  if (passives.some(p => p.id === 'art_mastery'))   reduction += 0.10;
  if (actor.quickenActive)                           reduction += 0.15;
  if (actor.transcendenceActive)                     reduction += 1.00;
  return Math.max(0, 1.0 - reduction);
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

// Called when a physical hit lands on defender. attacker may be null for engine-sourced damage.
function applyPassiveOnPhysicalHit(defender, damage, attacker) {
  for (const passive of (defender.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onTakePhysicalHit) reg.onTakePhysicalHit({ defender, damage, attacker });
  }
  // Retaliation skill state: fire one counter per hit received, up to 3 per turn.
  if (defender.retaliationActive && attacker && !attacker.isKnockedOut && (defender.retaliationCount || 0) < 3) {
    defender.retaliationCount = (defender.retaliationCount || 0) + 1;
    const bs = state?.battleState;
    if (bs) {
      const retSide = ['player', 'opponent'].find(side => SLOT_NAMES.some(s => bs[side][s] === defender));
      const atkSide = retSide === 'player' ? 'opponent' : 'player';
      const atkSlot = SLOT_NAMES.find(s => bs[atkSide][s] === attacker);
      if (atkSlot) {
        defender.pendingAutoAction = { commandType: 'skill', moveId: 'retaliation_counter', targetSide: atkSide, targetSlot: atkSlot };
      }
    }
  }
}

// Called when a magic hit lands on defender. Fires defender's arcane_absorption and
// spell_harvest on defender's alive allies.
function applyPassiveOnMagicHit(defender, damage, bs) {
  for (const passive of (defender.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onTakeMagicHit) reg.onTakeMagicHit({ defender, damage });
  }
  // Ward MP restore
  if (defender.wardActive && defender.wardMPRestoreRate > 0 && damage > 0) {
    const hasTrance = defender.equippedPassives?.some(p => p.id === 'trance_mastery');
    const rate = defender.wardMPRestoreRate * (hasTrance ? 1.5 : 1.0);
    const restore = Math.max(1, Math.round(damage * rate));
    defender.mp.current = Math.min(defender.mp.max, defender.mp.current + restore);
  }
  // Spell Harvest: allies restore MP when defender is hit by magic.
  if (bs) {
    const defSide = ['player', 'opponent'].find(side =>
      SLOT_NAMES.some(s => bs[side]?.[s] === defender)
    );
    if (defSide) {
      SLOT_NAMES.forEach(slot => {
        const ally = bs[defSide][slot];
        if (!ally || ally.isKnockedOut || ally === defender) return;
        for (const passive of (ally.equippedPassives || [])) {
          const reg = PASSIVE_REGISTRY[passive.id];
          if (reg?.onAllyTakeMagicHit) reg.onAllyTakeMagicHit({ ally, defender, damage });
        }
      });
    }
  }
}

// Called at end of each round for all alive creatures (Resilient HP regen, etc.).
function applyPassiveOnRoundEnd(creature) {
  for (const passive of (creature.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onRoundEnd) reg.onRoundEnd({ creature });
  }
}

// Returns true if a passive on target (or an ally) blocks the status from being applied.
function checkPassivePreventStatus(target, statusId) {
  for (const passive of (target.equippedPassives || [])) {
    const reg = PASSIVE_REGISTRY[passive.id];
    if (reg?.onStatusWouldApply) {
      if (reg.onStatusWouldApply({ target, statusId })) return true;
    }
  }
  // Check alive allies for nullify_presence-style aura passives.
  const bs = state?.battleState;
  if (bs) {
    const targetSide = ['player', 'opponent'].find(side =>
      SLOT_NAMES.some(s => bs[side]?.[s] === target)
    );
    if (targetSide) {
      for (const slot of SLOT_NAMES) {
        const ally = bs[targetSide][slot];
        if (!ally || ally.isKnockedOut || ally === target) continue;
        for (const passive of (ally.equippedPassives || [])) {
          const reg = PASSIVE_REGISTRY[passive.id];
          if (reg?.onAllyStatusWouldApply) {
            if (reg.onAllyStatusWouldApply({ ally, target, statusId })) return true;
          }
        }
      }
    }
  }
  return false;
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

// ── Defense Tier 1 passives ───────────────────────────────────────────────────

registerPassiveHook('thick_skinned', {
  onStatCheck({ stat }) {
    return stat === 'defense' ? 1.05 : 1.0;
  },
});

// Restores 3% max HP at end of each round.
registerPassiveHook('resilient', {
  onRoundEnd({ creature }) {
    const regen = Math.max(1, Math.round(creature.hp.max * 0.03));
    creature.hp.current = Math.min(creature.hp.max, creature.hp.current + regen);
  },
});

// Attacker takes 8% of damage dealt back as physical.
registerPassiveHook('thornmail', {
  onTakePhysicalHit({ damage, attacker }) {
    if (!attacker || attacker.isKnockedOut) return;
    const reflect = Math.max(1, Math.round(damage * 0.08));
    attacker.hp.current = Math.max(0, attacker.hp.current - reflect);
  },
});

// If a single hit exceeds 25% max HP, reduce it by 12%.
// Stub — threshold check requires damage amount at call time; full impl deferred to engine inline check.
registerPassiveHook('sturdy', {});

// Counter Stance Counter deals +30% damage.
registerPassiveHook('counter_force', {
  onBeforeDamage({ move }) {
    return move.id === 'counter_stance_counter' ? 1.30 : 1.0;
  },
});

// ── Defense Tier 2 passives ───────────────────────────────────────────────────

registerPassiveHook('thick_skinned_2', {
  onStatCheck({ stat }) {
    return stat === 'defense' ? 1.10 : 1.0;
  },
});

// When user takes a physical hit, attacker's Strength is lowered by 1 stage for 1 turn.
registerPassiveHook('pressure_point', {
  onTakePhysicalHit({ attacker }) {
    if (!attacker || attacker.isKnockedOut) return;
    applyStatModifier(attacker, 'strength', -1, { duration: 1 });
  },
});

// Max HP +5% (checked via HP stat hook).
registerPassiveHook('heavy_frame', {
  onStatCheck({ stat }) {
    return stat === 'hp' ? 1.05 : 1.0;
  },
});

// Body Check deals +25% damage.
registerPassiveHook('iron_body', {
  onBeforeDamage({ move }) {
    return move.id === 'body_check' ? 1.25 : 1.0;
  },
});

// Incoming damage reduced 10% while user has any positive Defense stages.
registerPassiveHook('fortified', {
  onIncomingDamage({ defender }) {
    const stage = (defender.statModifiers || []).filter(m => m.stat === 'defense' && m.direction > 0).length;
    return stage > 0 ? 0.90 : 1.0;
  },
});

// ── Defense Tier 3 passives ───────────────────────────────────────────────────

registerPassiveHook('thick_skinned_3', {
  onStatCheck({ stat }) {
    return stat === 'defense' ? 1.15 : 1.0;
  },
});

// Endurance is handled inside recover/recover_2/recover_3 skill handlers.
registerPassiveHook('endurance', {});

// Restores 6% max HP at end of each round.
registerPassiveHook('resilient_2', {
  onRoundEnd({ creature }) {
    const regen = Math.max(1, Math.round(creature.hp.max * 0.06));
    creature.hp.current = Math.min(creature.hp.max, creature.hp.current + regen);
  },
});

// Attacker takes 14% of damage dealt back.
registerPassiveHook('thornmail_2', {
  onTakePhysicalHit({ damage, attacker }) {
    if (!attacker || attacker.isKnockedOut) return;
    const reflect = Math.max(1, Math.round(damage * 0.14));
    attacker.hp.current = Math.max(0, attacker.hp.current - reflect);
  },
});

// Defender's Aura: all allies take 8% less physical damage. Checked via getDefendersAuraBonus().
registerPassiveHook('defenders_aura', {});

// ── Defense Tier 4 passives ───────────────────────────────────────────────────

// Max HP +10%.
registerPassiveHook('heavy_frame_2', {
  onStatCheck({ stat }) {
    return stat === 'hp' ? 1.10 : 1.0;
  },
});

// Each physical hit received grants a stacking -5% incoming DR, max 3 stacks.
registerPassiveHook('toughness', {
  onTakePhysicalHit({ defender }) {
    if ((defender.toughnessStacks || 0) < 3) {
      defender.toughnessStacks = (defender.toughnessStacks || 0) + 1;
    }
  },
  onIncomingDamage({ defender, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    return 1.0 - 0.05 * (defender.toughnessStacks || 0);
  },
});

// Attacker takes 20% of damage dealt back.
registerPassiveHook('thornmail_3', {
  onTakePhysicalHit({ damage, attacker }) {
    if (!attacker || attacker.isKnockedOut) return;
    const reflect = Math.max(1, Math.round(damage * 0.20));
    attacker.hp.current = Math.max(0, attacker.hp.current - reflect);
  },
});

// Sacrifice Drive is handled inside the absorb skill handler.
registerPassiveHook('sacrifice_drive', {});

// Once per battle, block a status application.
registerPassiveHook('unassailable', {
  onStatusWouldApply({ target }) {
    if (target.unassailableUsed) return false;
    target.unassailableUsed = true;
    return true;
  },
});

// ── Defense Tier 5 passives ───────────────────────────────────────────────────

// Defense +5% and HP +5%.
registerPassiveHook('juggernaut', {
  onStatCheck({ stat }) {
    if (stat === 'defense') return 1.05;
    if (stat === 'hp')      return 1.05;
    return 1.0;
  },
});

// If a hit drops user to ≤25% max HP, incoming damage −20% for 2 turns.
// onTakePhysicalHit fires after damage is already applied, so defender.hp.current is post-hit.
registerPassiveHook('indestructible', {
  onTakePhysicalHit({ defender }) {
    if ((defender.indestructibleTurns || 0) > 0) return;
    if (defender.hp.current > 0 && defender.hp.current <= defender.hp.max * 0.25) {
      defender.indestructibleTurns = 2;
    }
  },
  onIncomingDamage({ defender, move }) {
    if (move.damageClass !== 'physical') return 1.0;
    return (defender.indestructibleTurns || 0) > 0 ? 0.80 : 1.0;
  },
  onRoundEnd({ creature }) {
    if (creature.indestructibleTurns > 0) creature.indestructibleTurns--;
  },
});

// Titan's Wall is handled inside the counter_surge skill handler.
registerPassiveHook('titans_wall', {});

// While Total Defense or Aegis Shield is active, super-effective modifier capped to 1.0.
// Physical damage is already 0 when those flags are active, so the elemMod cap is functionally
// covered. Full elemMod intercept requires a hook into calcDamage — deferred.
registerPassiveHook('siege_breaker', {});

// Guardian's Presence: once per battle, an ally survives a lethal hit at 1 HP.
// Checked at KO resolution — handled inline in battle-engine.js checkPassiveSurviveKO extension.
registerPassiveHook('guardians_presence', {});

// ── Intelligence Tier 1 passives ──────────────────────────────────────────────

registerPassiveHook('sharp_mind', {
  onStatCheck({ stat }) { return stat === 'intelligence' ? 1.05 : 1.0; },
});

registerPassiveHook('spell_pressure', {
  onBeforeDamage({ move }) { return move.damageClass === 'magic' ? 1.05 : 1.0; },
});

// Arcane Well: max MP +5%. Treated as a 'mp' stat multiplier.
registerPassiveHook('arcane_well', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.05 : 1.0; },
});

registerPassiveHook('spellcaster', {
  onCritCheck({ move }) { return move.damageClass === 'magic' ? 0.03 : 0; },
});

// Mana Flow: restore 5% max MP at end of each round.
registerPassiveHook('mana_flow', {
  onRoundEnd({ creature }) {
    if (creature.isKnockedOut) return;
    const regen = Math.max(1, Math.round(creature.mp.max * 0.05));
    creature.mp.current = Math.min(creature.mp.max, creature.mp.current + regen);
  },
});

// ── Intelligence Tier 2 passives ──────────────────────────────────────────────

registerPassiveHook('sharp_mind_2', {
  onStatCheck({ stat }) { return stat === 'intelligence' ? 1.10 : 1.0; },
});

registerPassiveHook('berserker_mage', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass === 'magic' && attacker.hp.current / attacker.hp.max < 0.5) return 1.08;
    return 1.0;
  },
});

// Conduit: handled inline in _applyChannelRestore in battle-engine.js.
registerPassiveHook('conduit', {});

// Lingering Power: retain half the INT bonus for one extra round after Focus expires.
// Requires stat-modifier expiry hooks to implement cleanly — deferred, registered as stub.
registerPassiveHook('lingering_power', {});

// Overchannel: handled inline in reckless_cast skill handlers.
registerPassiveHook('overchannel', {});

// ── Intelligence Tier 3 passives ──────────────────────────────────────────────

registerPassiveHook('spell_pressure_2', {
  onBeforeDamage({ move }) { return move.damageClass === 'magic' ? 1.10 : 1.0; },
});

registerPassiveHook('arcane_well_2', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.10 : 1.0; },
});

// Collateral Spell: AoE magic damage +10%.
registerPassiveHook('collateral_spell', {
  onAoeDamage({ move }) { return move.damageClass === 'magic' ? 1.10 : 1.0; },
});

// Concentration: magic damage +12% if the creature was not hit last turn.
registerPassiveHook('concentration', {
  onBeforeDamage({ attacker, move }) {
    if (move.damageClass === 'magic' && !attacker.wasHitLastRound) return 1.12;
    return 1.0;
  },
});

// Incantation Guard: incoming damage -20% during Grand Incantation wind-up.
registerPassiveHook('incantation_guard', {
  onIncomingDamage({ defender }) {
    return defender.chargingGrandIncantation ? 0.80 : 1.0;
  },
});

// ── Intelligence Tier 4 passives ──────────────────────────────────────────────

registerPassiveHook('sharp_mind_3', {
  onStatCheck({ stat }) { return stat === 'intelligence' ? 1.15 : 1.0; },
});

// Spell Echo: 20% chance for second magic hit at 40% power — handled in executeRegisteredSkill.
registerPassiveHook('spell_echo', {});

// Surge Mastery: handled inline in mana_surge skill handlers.
registerPassiveHook('surge_mastery', {});

// Mana Weaver: handled inline in mana_burst skill handler.
registerPassiveHook('mana_weaver', {});

// Indomitable Mind: once per battle, survive a lethal hit at 1 HP.
registerPassiveHook('indomitable_mind', {
  onWouldBeKO({ defender }) {
    if (defender.indomitableMindUsed) return false;
    defender.indomitableMindUsed = true;
    defender.hp.current = 1;
    return true;
  },
});

// ── Intelligence Tier 5 passives ──────────────────────────────────────────────

registerPassiveHook('spell_pressure_3', {
  onBeforeDamage({ move }) { return move.damageClass === 'magic' ? 1.15 : 1.0; },
});

registerPassiveHook('arcane_well_3', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.15 : 1.0; },
});

// Fatal Spell: magic crits deal 50% additional damage.
registerPassiveHook('fatal_spell', {
  onCritMultiplier({ move }) { return move.damageClass === 'magic' ? 1.50 : 1.0; },
});

// Arcane Dominance: all allies deal +8% magic damage — handled via getArcaneDominanceBonus.
registerPassiveHook('arcane_dominance', {});

// Spellstorm: 25% chance to double damage on targets below 30% HP — handled in executeRegisteredSkill.
registerPassiveHook('spellstorm', {});

// ── Spirit route passive hooks ────────────────────────────────────────────────

// T1 — Tactician

// Spirit Ward I/II/III: Ward stats set by ward skill handlers; this hook is the descriptor.
registerPassiveHook('spirit_ward',   {});
registerPassiveHook('spirit_ward_2', {});
registerPassiveHook('spirit_ward_3', {});

// Arcane Resilience I/II/III: Spirit +5/10/15%.
registerPassiveHook('arcane_resilience', {
  onStatCheck({ stat }) { return stat === 'spirit' ? 1.05 : 1.0; },
});
registerPassiveHook('arcane_resilience_2', {
  onStatCheck({ stat }) { return stat === 'spirit' ? 1.10 : 1.0; },
});
registerPassiveHook('arcane_resilience_3', {
  onStatCheck({ stat }) { return stat === 'spirit' ? 1.15 : 1.0; },
});

// Mana Reservoir I/II/III: max MP +8/12/16%.
registerPassiveHook('mana_reservoir', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.08 : 1.0; },
});
registerPassiveHook('mana_reservoir_2', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.12 : 1.0; },
});
registerPassiveHook('mana_reservoir_3', {
  onStatCheck({ stat }) { return stat === 'mp' ? 1.16 : 1.0; },
});

// Art Affinity: Art cost -10% — handled in getArtCostMultiplier (empty hook).
registerPassiveHook('art_affinity', {});

// Still Mind: raises SPI +1 at battle start (applied during creature init via onBattleStart hook).
registerPassiveHook('still_mind', {
  onBattleStart({ creature }) {
    applyStatModifier(creature, 'spirit', 1, { duration: 999 });
  },
});

// T2 — Strategist

// Arcane Absorption: when struck by magic, restore 5% max MP.
registerPassiveHook('arcane_absorption', {
  onTakeMagicHit({ defender }) {
    const restore = Math.max(1, Math.floor(defender.mp.max * 0.05));
    defender.mp.current = Math.min(defender.mp.max, defender.mp.current + restore);
  },
});

// Mana Discipline: +5% Art damage per positive SPI stage.
registerPassiveHook('mana_discipline', {
  onBeforeDamage({ attacker, move }) {
    if (move.category !== 'art') return 1.0;
    const stage = getStatStage(attacker, 'spirit');
    return stage > 0 ? 1.0 + stage * 0.05 : 1.0;
  },
});

// Art Amplify: Arts deal +8% damage.
registerPassiveHook('art_amplify', {
  onBeforeDamage({ attacker, move }) {
    if (move.category === 'art') return 1.08;
    return 1.0;
  },
});

// Runic Skin: take -5% magic damage.
registerPassiveHook('runic_skin', {
  onIncomingDamage({ move }) {
    if (move.damageClass === 'magic') return 0.95;
    return 1.0;
  },
});

// T3 — Rulebender

// Trance Mastery: Ward MP restore rate +50% — handled inline in applyPassiveOnMagicHit (empty hook).
registerPassiveHook('trance_mastery', {});

// Spirit Flow: after using an Art, restore 10% of its MP cost.
registerPassiveHook('spirit_flow', {
  onAfterAction({ actor, move }) {
    if (move.category !== 'art') return;
    const mpCost = move.mpCost || 0;
    if (mpCost <= 0) return;
    const restore = Math.max(1, Math.round(mpCost * 0.10));
    actor.mp.current = Math.min(actor.mp.max, actor.mp.current + restore);
  },
});

// Replenishing Mind: restore 3% max MP at round end.
registerPassiveHook('replenishing_mind', {
  onRoundEnd({ creature }) {
    const restore = Math.max(1, Math.floor(creature.mp.max * 0.03));
    creature.mp.current = Math.min(creature.mp.max, creature.mp.current + restore);
  },
});

// T4 — Rulebreaker

// Art Celerity: Art cost -15% — handled in getArtCostMultiplier (empty hook).
registerPassiveHook('art_celerity', {});

// Spell Harvest: when an ally is hit by magic, restore 5% max MP to self.
registerPassiveHook('spell_harvest', {
  onAllyTakeMagicHit({ ally }) {
    const restore = Math.max(1, Math.floor(ally.mp.max * 0.05));
    ally.mp.current = Math.min(ally.mp.max, ally.mp.current + restore);
  },
});

// Indomitable Will: survive a KO at 1 HP and restore 20% max MP once per battle.
registerPassiveHook('indomitable_will', {
  onWouldBeKO({ defender }) {
    if (defender.indomitableWillUsed) return false;
    defender.indomitableWillUsed = true;
    defender.hp.current = 1;
    const restore = Math.floor(defender.mp.max * 0.20);
    defender.mp.current = Math.min(defender.mp.max, defender.mp.current + restore);
    return true;
  },
});

// Dominion Aura: allies take -5% magic damage — handled via getDominionAuraReduction (empty hook).
registerPassiveHook('dominion_aura', {});

// T5 — Mastermind

// Spirit Overload: Arts used during Transcendence deal +20% damage.
registerPassiveHook('spirit_overload', {
  onBeforeDamage({ attacker, move }) {
    return (move.category === 'art' && attacker.transcendenceActive) ? 1.20 : 1.0;
  },
});

// Art Mastery: Art cost -10% — handled in getArtCostMultiplier (empty hook).
registerPassiveHook('art_mastery', {});

// Nullify Presence: allies cannot be inflicted with status conditions while this creature is alive.
registerPassiveHook('nullify_presence', {
  onAllyStatusWouldApply({ ally, target, statusId }) {
    return true; // block all status applications on allies
  },
});
