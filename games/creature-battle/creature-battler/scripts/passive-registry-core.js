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

// Updates speedStreak for relentless_pace and flow_state: counts consecutive rounds a Speed creature
// acted before all opponents on the same round.
function tickSpeedStreaks() {
  if (typeof state === 'undefined' || !state.battleState) return;
  const bs = state.battleState;
  ['player', 'opponent'].forEach(side => {
    const oppSide = side === 'player' ? 'opponent' : 'player';
    if (typeof SLOT_NAMES === 'undefined') return;
    SLOT_NAMES.forEach(slot => {
      const c = bs[side][slot];
      if (!c || c.isKnockedOut) return;
      const hasSpeedPassive = (c.equippedPassives || []).some(
        p => p.id === 'relentless_pace' || p.id === 'flow_state'
      );
      if (!hasSpeedPassive) return;
      const mySpd  = typeof getEffectiveStat === 'function' ? getEffectiveStat(c, 'speed') : (c.stats?.speed ?? 0);
      // Check if ANY alive opponent is faster — if so, streak breaks.
      const anySloter = SLOT_NAMES.some(os => {
        const opp = bs[oppSide][os];
        if (!opp || opp.isKnockedOut) return false;
        const oppSpd = typeof getEffectiveStat === 'function' ? getEffectiveStat(opp, 'speed') : (opp.stats?.speed ?? 0);
        return oppSpd > mySpd;
      });
      if (anySloter) {
        c.speedStreak = 0;
      } else {
        c.speedStreak = Math.min((c.speedStreak ?? 0) + 1, 10);
      }
    });
  });
}
