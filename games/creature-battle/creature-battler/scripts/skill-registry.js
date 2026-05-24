// skill-registry.js — Execution handlers for class route skills.
// Each handler receives the full action context, spends its own cost, and
// returns a result object compatible with getResultMessage in battle-round.js.
// All RNG calls flow through _battleRng so online sync is preserved.

const SKILL_REGISTRY = {};

function registerSkillHandler(id, handler) {
  SKILL_REGISTRY[id] = handler;
}

// ── Cost utilities ────────────────────────────────────────────────────────────

function calcSkillCost(skill, actor) {
  switch (skill.costType) {
    case 'flatMP':            return { mp: skill.costAmount,                                    hp: 0 };
    case 'percentMP':         return { mp: Math.ceil(actor.mp.max * skill.costAmount),          hp: 0 };
    case 'percentCurrentMP':  return { mp: Math.floor(actor.mp.current * skill.costAmount),     hp: 0 };
    case 'flatHP':            return { mp: 0, hp: skill.costAmount };
    case 'percentHP':         return { mp: 0, hp: Math.floor(actor.hp.current * skill.costAmount) };
    case 'percentMaxHP':      return { mp: 0, hp: Math.floor(actor.hp.max * skill.costAmount) };
    case 'mixed':             return { mp: 30, hp: Math.floor(actor.hp.current * 0.20) };
    default:                  return { mp: 0, hp: 0 };
  }
}

// opts: { bs, actorSide } — optional; used for heroic_surge last-standing check
function canUseSkill(skill, actor, opts = {}) {
  const cost = calcSkillCost(skill, actor);
  if (cost.mp > actor.mp.current) return false;
  if (cost.hp > 0 && actor.hp.current <= cost.hp) return false;
  if (skill.id === 'heroic_surge' && opts.bs && opts.actorSide) {
    const alive = SLOT_NAMES.filter(s => { const c = opts.bs[opts.actorSide][s]; return c && !c.isKnockedOut; });
    if (alive.length > 1) return false;
  }
  // Once-per-battle guards
  if (skill.id === 'stand_firm'    && actor.standFirmUsed)           return false;
  if (skill.id === 'iron_fortress' && actor.ironFortressUsed)        return false;
  if (skill.id === 'arcane_veil'   && actor.arcaneVeilUsed)          return false;
  // Alternating-turn guard
  if (skill.id === 'total_defense' && actor.totalDefenseUsedLastTurn) return false;
  // Conditional: only available after Counter Stance absorbs a hit
  if (skill.id === 'counter_surge' && !actor.counterSurgeAvailable)  return false;
  // Aegis Shield blocks offensive skills for the turn it's active
  if (actor.aegisShieldActive && (skill.damageClass === 'physical' || skill.damageClass === 'magic')) return false;
  return true;
}

function spendSkillCost(skill, actor) {
  const cost = calcSkillCost(skill, actor);
  actor.mp.current = Math.max(0, actor.mp.current - cost.mp);
  if (cost.hp > 0) actor.hp.current = Math.max(1, actor.hp.current - cost.hp);
}

// ── Internal damage helpers ───────────────────────────────────────────────────

// Physical skill damage calculation — all skills are physical and elementally neutral.
// opts.ignoreDefense, opts.hpScaling, opts.finisherBonus, opts.isAoe, opts.skillId
function _calcPhysSkillDamage(actor, target, basePower, opts = {}) {
  const offStat = getEffectiveStat(actor, 'strength');
  const defStat = opts.ignoreDefense ? 0 : getEffectiveStat(target, 'defense');
  const levelMod = actor.level * ENGINE.LEVEL_MOD;
  const pressure = (offStat - defStat) * 1.0;
  const defMod   = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
  const moveLike = { damageClass: 'physical', element: null, canCrit: true, id: opts.skillId || null };
  const critThreshold = ENGINE.CRIT_CHANCE + getPassiveCritBonus(actor, moveLike);
  const isCrit   = _battleRng() < critThreshold;
  const critMod  = isCrit ? ENGINE.CRIT_MOD * getPassiveCritMultiplier(actor, moveLike) : 1.0;
  const randMod  = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  const passiveMult = getPassiveDamageMultiplier(actor, target, moveLike) * getWarlordPresenceBonus(actor, moveLike);
  const incomingMult = getPassiveIncomingMultiplier(target, moveLike);
  const aoeMult = opts.isAoe ? getPassiveAoeBonusMultiplier(actor, moveLike) : 1.0;

  let power = basePower;
  if (opts.hpScaling) {
    const missingRatio = 1 - actor.hp.current / actor.hp.max;
    power += Math.round(basePower * opts.hpScaling * missingRatio);
  }
  if (opts.finisherBonus && target.hp.current / target.hp.max < 0.30) {
    power += Math.round(basePower * opts.finisherBonus);
  }

  const raw = ((power + pressure + levelMod) * defMod * critMod + randMod) * passiveMult * incomingMult * aoeMult;
  return {
    damage: Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw))),
    isCrit,
  };
}

// Defense-scaling skill damage — uses actor's Defense as the offensive stat (Body Check, Counter Surge, etc.).
function _calcDefSkillDamage(actor, target, basePower, opts = {}) {
  const offStat = getEffectiveStat(actor, 'defense');
  const defStat = opts.ignoreDefense ? 0 : getEffectiveStat(target, 'defense');
  const levelMod = actor.level * ENGINE.LEVEL_MOD;
  const pressure = (offStat - defStat) * 1.0;
  const defMod   = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
  const moveLike = { damageClass: 'physical', element: null, canCrit: true, id: opts.skillId || null };
  const critThreshold = ENGINE.CRIT_CHANCE + getPassiveCritBonus(actor, moveLike);
  const isCrit   = _battleRng() < critThreshold;
  const critMod  = isCrit ? ENGINE.CRIT_MOD * getPassiveCritMultiplier(actor, moveLike) : 1.0;
  const randMod  = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  const passiveMult = getPassiveDamageMultiplier(actor, target, moveLike);
  const incomingMult = getPassiveIncomingMultiplier(target, moveLike);
  const raw = ((basePower + pressure + levelMod) * defMod * critMod + randMod) * passiveMult * incomingMult;
  return {
    damage: Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw))),
    isCrit,
  };
}

// Magic skill damage — uses actor's Intelligence offensively and target's Spirit defensively.
// opts.ignoreSpirit, opts.isAoe, opts.skillId
function _calcMagicSkillDamage(actor, target, basePower, opts = {}) {
  const offStat = getEffectiveStat(actor, 'intelligence');
  const defStat = opts.ignoreSpirit ? 0 : getEffectiveStat(target, 'spirit');
  const levelMod = actor.level * ENGINE.LEVEL_MOD;
  const pressure = (offStat - defStat) * 1.0;
  const defMod   = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
  const moveLike = { damageClass: 'magic', element: null, canCrit: true, id: opts.skillId || null };
  const critBonus = getPassiveCritBonus(actor, moveLike);
  const critThreshold = ENGINE.CRIT_CHANCE + critBonus;
  const isCrit   = _battleRng() < critThreshold;
  const critMod  = isCrit ? ENGINE.CRIT_MOD * getPassiveCritMultiplier(actor, moveLike) : 1.0;
  const randMod  = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  const passiveMult = getPassiveDamageMultiplier(actor, target, moveLike);
  const incomingMult = getPassiveIncomingMultiplier(target, moveLike);
  const aoeMult = opts.isAoe ? getPassiveAoeBonusMultiplier(actor, moveLike) : 1.0;
  const arcaneMult = getArcaneDominanceBonus(actor, moveLike);

  let power = basePower;
  if (opts.extraPower) power += opts.extraPower;

  const raw = ((power + pressure + levelMod) * defMod * critMod + randMod) * passiveMult * incomingMult * aoeMult * arcaneMult;
  return {
    damage: Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw))),
    isCrit,
  };
}

// Spirit damage: SPI offensively vs SPI defensively — the dual-purpose stat.
function _calcSpiSkillDamage(actor, target, basePower, opts = {}) {
  const offStat = getEffectiveStat(actor, 'spirit');
  const defStat = opts.ignoreSpirit ? 0 : getEffectiveStat(target, 'spirit');
  const levelMod = actor.level * ENGINE.LEVEL_MOD;
  const pressure = (offStat - defStat) * 1.0;
  const defMod   = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
  const moveLike = { damageClass: 'magic', element: null, canCrit: true, id: opts.skillId || null };
  const critBonus = getPassiveCritBonus(actor, moveLike);
  const isCrit    = _battleRng() < (ENGINE.CRIT_CHANCE + critBonus);
  const critMod   = isCrit ? ENGINE.CRIT_MOD * getPassiveCritMultiplier(actor, moveLike) : 1.0;
  const randMod   = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  const passiveMult   = getPassiveDamageMultiplier(actor, target, moveLike);
  const incomingMult  = getPassiveIncomingMultiplier(target, moveLike);
  const aoeMult       = opts.isAoe ? getPassiveAoeBonusMultiplier(actor, moveLike) : 1.0;
  const dominionMult  = getDominionAuraReduction(target);

  let power = basePower;
  if (opts.extraPower) power += opts.extraPower;

  const raw = ((power + pressure + levelMod) * defMod * critMod + randMod) * passiveMult * incomingMult * aoeMult * dominionMult;
  return {
    damage: Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw))),
    isCrit,
  };
}

// Applies damage to target HP, checks indomitable, and marks KO.
// Returns wasKO boolean. Does NOT call the KO callbacks — those are handled centrally.
function _applySkillDamage(target, damage) {
  target.hp.current = Math.max(0, target.hp.current - damage);
  if (damage > 0) target.wasHitThisRound = true;
  checkPassiveSurviveKO(target);
  const wasKO = !target.isKnockedOut && target.hp.current <= 0;
  if (wasKO) { target.isKnockedOut = true; clearBattleModifiers(target); }
  return wasKO;
}

// ── Dispatcher (called from battle-engine.js resolveAction) ──────────────────

function executeRegisteredSkill(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
  const handler = SKILL_REGISTRY[skill.id];
  if (!handler) return { type: 'skipped' };
  const result = handler.execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs);

  const isMagicResult = skill.classRoute === 'intelligence' || skill.classRoute === 'spirit';
  applyPassiveAfterAction(actor, { damageClass: isMagicResult ? 'magic' : 'physical', id: skill.id });

  if (result.type === 'damage' || result.type === 'crit') {
    const tgt = bs[result.targetSide]?.[result.targetSlot];
    if (tgt) {
      if (result.wasKO) {
        applyPassiveOnKO(actor, tgt);
        applyPassiveOnAllyKO(result.targetSide, bs);
      } else if (result.amount > 0) {
        if (!isMagicResult) {
          applyPassiveOnPhysicalHit(tgt, result.amount, actor);
        } else {
          applyPassiveOnMagicHit(tgt, result.amount, bs);
          // Ward reflection: if target has wardActive, reflect a portion back to attacker.
          if (tgt.wardActive && tgt.wardReflectRatio > 0 && !actor.isKnockedOut) {
            const reflectDmg = Math.max(1, Math.round(result.amount * tgt.wardReflectRatio));
            actor.hp.current = Math.max(0, actor.hp.current - reflectDmg);
            result.wardReflect = reflectDmg;
            if (actor.hp.current <= 0 && !actor.isKnockedOut) {
              actor.isKnockedOut = true;
              clearBattleModifiers(actor);
            }
          }
        }
      }
    }

    // Spell Echo: 20% chance for a second magic hit at 40% power.
    if (isMagicResult && tgt && !result.wasKO && result.amount > 0) {
      const hasEcho = actor.equippedPassives?.some(p => p.id === 'spell_echo');
      if (hasEcho && _battleRng() < 0.20) {
        const echoAmount = Math.max(1, Math.round(result.amount * 0.40));
        const echoWasKO = _applySkillDamage(tgt, echoAmount);
        result.echoAmount = echoAmount;
        result.echoWasKO = echoWasKO;
        if (echoWasKO) { applyPassiveOnKO(actor, tgt); applyPassiveOnAllyKO(result.targetSide, bs); }
      }
    }

    // Spellstorm: 25% chance to double damage on targets below 30% HP.
    // Applies as a direct extra hit (post-facto) if target survived the main hit.
    if (isMagicResult && tgt && !result.wasKO && tgt.hp.current / tgt.hp.max < 0.30) {
      const hasStorm = actor.equippedPassives?.some(p => p.id === 'spellstorm');
      if (hasStorm && _battleRng() < 0.25) {
        const stormAmount = result.amount;
        const stormWasKO = _applySkillDamage(tgt, stormAmount);
        result.stormAmount = stormAmount;
        result.stormWasKO = stormWasKO;
        if (stormWasKO) { applyPassiveOnKO(actor, tgt); applyPassiveOnAllyKO(result.targetSide, bs); }
      }
    }
  } else if (result.type === 'multi') {
    result.hits?.forEach(h => {
      if (h.missed) return;
      const tgt = bs[result.targetSide]?.[h.slot];
      if (!tgt) return;
      if (h.wasKO) {
        applyPassiveOnKO(actor, tgt);
        applyPassiveOnAllyKO(result.targetSide, bs);
      } else if (h.amount > 0) {
        if (!isMagicResult) applyPassiveOnPhysicalHit(tgt, h.amount, actor);
      }
    });
  }

  return result;
}

// ── Brace utility ─────────────────────────────────────────────────────────────

// Checks if target is braced. If so, halves damage and queues Counter Strike on target.
// Returns the effective damage (possibly halved).
function _checkBrace(target, damage, actorSide, actorSlot) {
  if (!target.isBraced) return damage;
  target.isBraced = false;
  target.pendingAutoAction = { commandType: 'skill', moveId: 'counter_strike', targetSide: actorSide, targetSlot: actorSlot };
  return Math.max(1, Math.floor(damage / 2));
}

// ── Strength Tier 1 ───────────────────────────────────────────────────────────

// Cleave — physical damage ignoring DEF, cost 5% MP
registerSkillHandler('cleave', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 22, { ignoreDefense: true });
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Temper — raise user STR +2 stages for 3 turns, cost 10 MP
registerSkillHandler('temper', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'strength', 1, { duration: 3 });
    const statusText = applyStatModifier(actor, 'strength', 1, { duration: 3 });
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText,
    };
  },
});

// Reckless Strike — heavy physical damage + 10% max HP recoil, no cost
registerSkillHandler('reckless_strike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 48);
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    const recoilAmount = Math.max(1, Math.round(actor.hp.max * 0.10));
    actor.hp.current = Math.max(1, actor.hp.current - recoilAmount);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
      recoilAmount,
    };
  },
});

// Final Strike — scales with missing HP, cost 12 MP
registerSkillHandler('final_strike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 20, { hpScaling: 1.0 });
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Finishing Blow — bonus damage when target < 30% HP, cost 14 MP
registerSkillHandler('finishing_blow', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 26, { finisherBonus: 1.5 });
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Strength Tier 2 ───────────────────────────────────────────────────────────

// Cleave II — upgraded Cleave, higher power, ignores DEF, cost 5% MP
registerSkillHandler('cleave_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 30, { ignoreDefense: true });
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Reckless Strike II — heavier damage + 12% max HP recoil, no cost
registerSkillHandler('reckless_strike_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 62);
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    const recoilAmount = Math.max(1, Math.round(actor.hp.max * 0.12));
    actor.hp.current = Math.max(1, actor.hp.current - recoilAmount);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, recoilAmount,
    };
  },
});

// Challenge — forces the target to attack the user next turn (taunts AI; marks human too)
registerSkillHandler('challenge', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    target.isChallengedBy = { side: actorSide, slot: actorSlot };
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName,
      statusText: 'TAUNTED',
    };
  },
});

// Power Through — physical damage + drains HP back to user, cost 12 MP
// vital_drain passive increases the drain ratio from 20% to 35%.
registerSkillHandler('power_through', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 18);
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    const hasVitalDrain = actor.equippedPassives?.some(p => p.id === 'vital_drain');
    const drainRatio = hasVitalDrain ? 0.35 : 0.20;
    const drainAmount = Math.max(1, Math.round(damage * drainRatio));
    if (!wasKO) actor.hp.current = Math.min(actor.hp.max, actor.hp.current + drainAmount);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, drainAmount,
    };
  },
});

// Brace — user braces; the next physical hit they take deals half damage and triggers Counter Strike
registerSkillHandler('brace', {
  execute(skill, actor) {
    actor.isBraced = true;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: 'BRACED',
    };
  },
});

// ── Strength Tier 3 ───────────────────────────────────────────────────────────

// Temper II — raises user STR +3 stages for 3 turns, cost 10 MP
registerSkillHandler('temper_2', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'strength', 1, { duration: 3 });
    applyStatModifier(actor, 'strength', 1, { duration: 3 });
    const statusText = applyStatModifier(actor, 'strength', 1, { duration: 3 });
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText };
  },
});

// Final Strike II — scales harder with missing HP, cost 14 MP
registerSkillHandler('final_strike_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 22, { hpScaling: 1.5 });
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// War Stance — STR +2 for 2 turns, SPD -2 for 2 turns (war_hardened reduces SPD penalty to -1)
registerSkillHandler('war_stance', {
  execute(skill, actor) {
    applyStatModifier(actor, 'strength', 1, { duration: 2 });
    applyStatModifier(actor, 'strength', 1, { duration: 2 });
    const hasWarHardened = actor.equippedPassives?.some(p => p.id === 'war_hardened');
    const spdPenalty = hasWarHardened ? 1 : 2;
    for (let i = 0; i < spdPenalty; i++) applyStatModifier(actor, 'speed', -1, { duration: 2 });
    const statusText = hasWarHardened ? 'STR UP / SPD DOWN (reduced)' : 'STR UP / SPD DOWN';
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText };
  },
});

// Sweep — AoE physical damage to all enemies, cost 16 MP
registerSkillHandler('sweep', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSide = actorSide === 'player' ? 'opponent' : 'player';
    const slots = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
    if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const hits = slots.map(slot => {
      const target = bs[tgtSide][slot];
      const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 15, { isAoe: true });
      const wasKO = _applySkillDamage(target, damage);
      return { slot, name: target.displayName, amount: damage, wasKO, isCrit };
    });
    return { type: 'multi', actorName: actor.displayName, moveName: skill.name, damageClass: 'physical', targetSide: tgtSide, hits };
  },
});

// Courage Strike — pay 50% HP now; wind up for one turn, then auto-fire a massive strike
registerSkillHandler('courage_strike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const hpCost = Math.floor(actor.hp.current * 0.50);
    actor.hp.current = Math.max(1, actor.hp.current - hpCost);
    actor.chargingCourageStrike = true;
    actor.pendingAutoAction = { commandType: 'skill', moveId: 'courage_strike_execute', targetSide, targetSlot: tgtSlot };
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: 'CHARGING',
    };
  },
});

// Courage Strike (execute) — auto-fires the turn after Courage Strike is used
registerSkillHandler('courage_strike_execute', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.chargingCourageStrike = false;
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 80);
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Strength Tier 4 ───────────────────────────────────────────────────────────

// Cleave III — max power Cleave, ignores DEF, cost 5% MP
registerSkillHandler('cleave_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 40, { ignoreDefense: true });
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Reckless Strike III — heaviest damage + 15% max HP recoil, no cost
registerSkillHandler('reckless_strike_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 78);
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    const recoilAmount = Math.max(1, Math.round(actor.hp.max * 0.15));
    actor.hp.current = Math.max(1, actor.hp.current - recoilAmount);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, recoilAmount,
    };
  },
});

// Sweep II — stronger AoE physical, cost 16 MP
registerSkillHandler('sweep_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSide = actorSide === 'player' ? 'opponent' : 'player';
    const slots = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
    if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const hits = slots.map(slot => {
      const target = bs[tgtSide][slot];
      const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 20, { isAoe: true });
      const wasKO = _applySkillDamage(target, damage);
      return { slot, name: target.displayName, amount: damage, wasKO, isCrit };
    });
    return { type: 'multi', actorName: actor.displayName, moveName: skill.name, damageClass: 'physical', targetSide: tgtSide, hits };
  },
});

// Rally Cry — raises STR +1 for all active allies for 1 turn, no cost
registerSkillHandler('rally_cry', {
  execute(skill, actor, actorSide) {
    const bs = state.battleState;
    const slots = SLOT_NAMES.filter(s => { const c = bs[actorSide][s]; return c && !c.isKnockedOut; });
    let statusText = 'STR UP';
    slots.forEach(slot => { statusText = applyStatModifier(bs[actorSide][slot], 'strength', 1, { duration: 1 }) || statusText; });
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: 'all allies', statusText };
  },
});

// Heroic Surge — last-stand massive strike; only usable when the creature is the last one alive on their team
// Cost: 30 MP + 20% current HP (mixed)
registerSkillHandler('heroic_surge', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const alive = SLOT_NAMES.filter(s => { const c = bs[actorSide][s]; return c && !c.isKnockedOut; });
    if (alive.length > 1) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 60);
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Strength Tier 5 ───────────────────────────────────────────────────────────

// Temper III — max potency STR boost, +3 stages for 4 turns, cost 10 MP
registerSkillHandler('temper_3', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'strength', 1, { duration: 4 });
    applyStatModifier(actor, 'strength', 1, { duration: 4 });
    const statusText = applyStatModifier(actor, 'strength', 1, { duration: 4 });
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText };
  },
});

// Final Strike III — max HP-scaling damage, cost 16 MP
registerSkillHandler('final_strike_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 24, { hpScaling: 2.0 });
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Sweep III — strongest AoE physical, cost 16 MP
registerSkillHandler('sweep_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSide = actorSide === 'player' ? 'opponent' : 'player';
    const slots = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
    if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const hits = slots.map(slot => {
      const target = bs[tgtSide][slot];
      const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 26, { isAoe: true });
      const wasKO = _applySkillDamage(target, damage);
      return { slot, name: target.displayName, amount: damage, wasKO, isCrit };
    });
    return { type: 'multi', actorName: actor.displayName, moveName: skill.name, damageClass: 'physical', targetSide: tgtSide, hits };
  },
});

// Defiant — only activates when the user was hit by a super effective move last turn;
// grants STR +2 for the attack (expires end of round), no cost
registerSkillHandler('defiant', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    if (!actor.wasHitSuperEffective) {
      return { type: 'no_activate', actorName: actor.displayName, moveName: skill.name };
    }
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    applyStatModifier(actor, 'strength', 1, { duration: 1 });
    applyStatModifier(actor, 'strength', 1, { duration: 1 });
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 22);
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Castlebreaker — scales with target's DEF; the tankier the target, the harder this hits; cost 18 MP
registerSkillHandler('castlebreaker', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const targetDef  = getEffectiveStat(target, 'defense');
    const bonusPower = Math.round(targetDef * 0.5);
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 28 + bonusPower, { ignoreDefense: true });
    damage = _checkBrace(target, damage, actorSide, actorSlot);
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Defense Tier 1 ───────────────────────────────────────────────────────────

// Rampart — create a barrier worth ~15% max HP, cost 12 MP
registerSkillHandler('rampart', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    actor.barrierHP = Math.max(1, Math.round(actor.hp.max * 0.15));
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'BARRIER UP',
    };
  },
});

// Thick Skin — DEF +2 stages for 2 turns, cost 10 MP
registerSkillHandler('thick_skin', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'defense', 1, { duration: 2 });
    const statusText = applyStatModifier(actor, 'defense', 1, { duration: 2 });
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText };
  },
});

// Shield Bash — physical damage + STR -1 on target, cost 12 MP
registerSkillHandler('shield_bash', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 24);
    const wasKO = _applySkillDamage(target, damage);
    let statusText = null;
    if (!wasKO) statusText = applyStatModifier(target, 'strength', -1, { duration: 1 });
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, statusText,
    };
  },
});

// Recover — restore 25% max HP; Endurance passive adds a missing-HP bonus, cost 14 MP
registerSkillHandler('recover', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    let amount = Math.max(1, Math.round(actor.hp.max * 0.08));
    if (actor.equippedPassives?.some(p => p.id === 'endurance')) {
      const missing = actor.hp.max - actor.hp.current;
      amount += Math.max(0, Math.round(missing * 0.05));
    }
    actor.hp.current = Math.min(actor.hp.max, actor.hp.current + amount);
    return { type: 'heal', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, targetSide: 'player', targetSlot: null, amount };
  },
});

// Counter Stance — set flag; engine halves damage and queues counter_stance_counter when hit, free
registerSkillHandler('counter_stance', {
  execute(skill, actor) {
    actor.counterStanceActive = true;
    actor.counterStanceAbsorbed = actor.counterStanceAbsorbed || 0;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'COUNTER STANCE',
    };
  },
});

// ── Defense Tier 2 ───────────────────────────────────────────────────────────

// Taunt — force target to use offensive moves only next turn, free
registerSkillHandler('taunt', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    target.tauntActive = true;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, statusText: 'TAUNTED',
    };
  },
});

// Thick Skin II — DEF +2 stages for 3 turns, cost 10 MP
registerSkillHandler('thick_skin_2', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'defense', 1, { duration: 3 });
    const statusText = applyStatModifier(actor, 'defense', 1, { duration: 3 });
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText };
  },
});

// Grit — DEF +3 stages for 1 turn, costs 8% current HP
registerSkillHandler('grit', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'defense', 1, { duration: 1 });
    applyStatModifier(actor, 'defense', 1, { duration: 1 });
    const statusText = applyStatModifier(actor, 'defense', 1, { duration: 1 });
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText };
  },
});

// Body Check — Defense-scaling physical damage, cost 14 MP
registerSkillHandler('body_check', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcDefSkillDamage(actor, target, 32, { skillId: 'body_check' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Stand Firm — once per battle: physical damage halved this turn, survive a lethal hit at 1 HP, cost 12 MP
registerSkillHandler('stand_firm', {
  execute(skill, actor) {
    if (actor.standFirmUsed) return { type: 'no_activate', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    actor.standFirmActive = true;
    actor.standFirmUsed   = true;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'STAND FIRM',
    };
  },
});

// ── Defense Tier 3 ───────────────────────────────────────────────────────────

// Retaliation — Retaliation stance; counters each physical hit received this turn (up to 3), free
registerSkillHandler('retaliation', {
  execute(skill, actor) {
    actor.retaliationActive = true;
    actor.retaliationCount  = 0;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'RETALIATION',
    };
  },
});

// Recover II — restore 35% max HP; Endurance bonus applies, cost 14 MP
registerSkillHandler('recover_2', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    let amount = Math.max(1, Math.round(actor.hp.max * 0.12));
    if (actor.equippedPassives?.some(p => p.id === 'endurance')) {
      const missing = actor.hp.max - actor.hp.current;
      amount += Math.max(0, Math.round(missing * 0.07));
    }
    actor.hp.current = Math.min(actor.hp.max, actor.hp.current + amount);
    return { type: 'heal', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, targetSide: 'player', targetSlot: null, amount };
  },
});

// Damage Store — defer all incoming physical damage this turn to a pool, free
registerSkillHandler('damage_store', {
  execute(skill, actor) {
    actor.damageStoreActive = true;
    actor.damageStorePool   = actor.damageStorePool || 0;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'DAMAGE STORED',
    };
  },
});

// Meditate — reduce incoming physical damage 25% this turn AND restore 8% HP now, free
registerSkillHandler('meditate', {
  execute(skill, actor) {
    actor.meditateActive = true;
    const amount = Math.max(1, Math.round(actor.hp.max * 0.08));
    actor.hp.current = Math.min(actor.hp.max, actor.hp.current + amount);
    return {
      type: 'heal',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      targetSide: 'player', targetSlot: null,
      amount,
    };
  },
});

// Shield Wall — team-wide physical damage reduction 15% for 2 turns; user becomes priority target, cost 28 MP
registerSkillHandler('shield_wall', {
  execute(skill, actor, actorSide) {
    spendSkillCost(skill, actor);
    state.battleState[actorSide].shieldWallTurns = 2;
    actor.shieldWallActive = true;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: 'all allies', statusText: 'SHIELD WALL',
    };
  },
});

// ── Defense Tier 4 ───────────────────────────────────────────────────────────

// Rampart II — barrier worth ~25% max HP, cost 18 MP
registerSkillHandler('rampart_2', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    actor.barrierHP = Math.max(1, Math.round(actor.hp.max * 0.25));
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'BARRIER UP',
    };
  },
});

// Shield Bash II — guaranteed STR reduction, higher power, cost 12 MP
registerSkillHandler('shield_bash_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 36);
    const wasKO = _applySkillDamage(target, damage);
    const statusText = wasKO ? null : applyStatModifier(target, 'strength', -1, { duration: 2 });
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, statusText,
    };
  },
});

// Last Bastion — DEF +2 for all allies for 2 turns, costs 20% current HP
registerSkillHandler('last_bastion', {
  execute(skill, actor, actorSide) {
    spendSkillCost(skill, actor);
    const slots = SLOT_NAMES.filter(s => { const c = state.battleState[actorSide][s]; return c && !c.isKnockedOut; });
    let statusText = 'DEF UP';
    slots.forEach(slot => {
      const ally = state.battleState[actorSide][slot];
      applyStatModifier(ally, 'defense', 1, { duration: 2 });
      statusText = applyStatModifier(ally, 'defense', 1, { duration: 2 }) || statusText;
    });
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: 'all allies', statusText };
  },
});

// Absorb — set intercept flag; engine redirects next allied physical hit to this creature, free
registerSkillHandler('absorb', {
  execute(skill, actor) {
    actor.absorbActive = true;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'ABSORB READY',
    };
  },
});

// Total Defense — nullify all incoming physical damage this turn; can't be used consecutively, cost 30 MP
registerSkillHandler('total_defense', {
  execute(skill, actor) {
    if (actor.totalDefenseUsedLastTurn) return { type: 'no_activate', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    actor.totalDefenseActive  = true;
    actor.totalDefenseJustUsed = true;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'TOTAL DEFENSE',
    };
  },
});

// ── Defense Tier 5 ───────────────────────────────────────────────────────────

// Recover III — restore 50% max HP; Endurance bonus applies, cost 14 MP
registerSkillHandler('recover_3', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    let amount = Math.max(1, Math.round(actor.hp.max * 0.18));
    if (actor.equippedPassives?.some(p => p.id === 'endurance')) {
      const missing = actor.hp.max - actor.hp.current;
      amount += Math.max(0, Math.round(missing * 0.10));
    }
    actor.hp.current = Math.min(actor.hp.max, actor.hp.current + amount);
    return { type: 'heal', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, targetSide: 'player', targetSlot: null, amount };
  },
});

// Shield Bash III — max power, guaranteed extended STR reduction, cost 12 MP
registerSkillHandler('shield_bash_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 50);
    const wasKO = _applySkillDamage(target, damage);
    const statusText = wasKO ? null : applyStatModifier(target, 'strength', -1, { duration: 3 });
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, statusText,
    };
  },
});

// Iron Fortress — once per battle: DEF +4 stages (permanent) + max HP +15%, free
registerSkillHandler('iron_fortress', {
  execute(skill, actor) {
    if (actor.ironFortressUsed) return { type: 'no_activate', actorName: actor.displayName, moveName: skill.name };
    actor.ironFortressUsed = true;
    for (let i = 0; i < 4; i++) applyStatModifier(actor, 'defense', 1);
    const hpBonus = Math.round(actor.hp.max * 0.15);
    actor.hp.max     += hpBonus;
    actor.hp.current += hpBonus;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: `DEF MAX / HP +${hpBonus}`,
    };
  },
});

// Counter Surge — conditional; only usable after Counter Stance absorbs a hit, free
// Base power scales from counterStanceAbsorbed; Titan's Wall adds absorbed as flat bonus.
registerSkillHandler('counter_surge', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    if (!actor.counterSurgeAvailable) return { type: 'no_activate', actorName: actor.displayName, moveName: skill.name };
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const absorbed  = actor.counterStanceAbsorbed || 0;
    const hasTitans = actor.equippedPassives?.some(p => p.id === 'titans_wall');
    const basePower = 30 + Math.round(absorbed * 0.5) + (hasTitans ? absorbed : 0);
    actor.counterSurgeAvailable  = false;
    actor.counterStanceAbsorbed  = 0;
    const { damage, isCrit } = _calcDefSkillDamage(actor, target, basePower, { skillId: 'counter_surge' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Aegis Shield — impervious to physical damage this turn; offensive actions disabled in battle-input.js, free
registerSkillHandler('aegis_shield', {
  execute(skill, actor) {
    actor.aegisShieldActive = true;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'AEGIS SHIELD',
    };
  },
});

// ── Defense pseudo-skills — auto-fired by the engine ─────────────────────────

// Counter Stance Counter — Defense-scaling counter; fires after Counter Stance absorbs a hit
registerSkillHandler('counter_stance_counter', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcDefSkillDamage(actor, target, 28, { skillId: 'counter_stance_counter' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Damage Store Strike — fires at round start; power equals the damage stored last turn.
// The damageStorePower field is set on the pendingAutoAction by battle-round.js.
registerSkillHandler('damage_store_strike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const actualTargetSide = actorSide === 'player' ? 'opponent' : 'player';
    const tgtSlot = findValidTarget(actualTargetSide, 'top');
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[actualTargetSide][tgtSlot];
    const storedPower = actor.damageStorePower || 30;
    const { damage, isCrit } = _calcPhysSkillDamage(actor, target, Math.max(10, storedPower));
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide: actualTargetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
    };
  },
});

// Retaliation Counter — fires per physical hit received while Retaliation is active
registerSkillHandler('retaliation_counter', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcDefSkillDamage(actor, target, 20, { skillId: 'retaliation_counter' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Counter Strike (pseudo-skill — auto-fires after Brace absorbs a hit) ─────

registerSkillHandler('counter_strike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    let { damage, isCrit } = _calcPhysSkillDamage(actor, target, 30, { skillId: 'counter_strike' });
    // Counter strike doesn't trigger brace (no infinite loops)
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Intelligence Tier 1 — Adept ───────────────────────────────────────────────

// Mind Spike — reliable INT-scaling magic damage, cost 8 MP
registerSkillHandler('mind_spike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 24, { skillId: 'mind_spike' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Focus — raise INT 2 stages for 2 rounds, cost 6 MP
registerSkillHandler('focus', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'intelligence', 1, { duration: 2 });
    applyStatModifier(actor, 'intelligence', 1, { duration: 2 });
    actor.focusActive = true;
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText: 'INT UP' };
  },
});

// Reckless Cast — magic damage with HP recoil (10% of damage dealt). No MP cost.
// overchannel passive reduces recoil to 5%.
registerSkillHandler('reckless_cast', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 40, { skillId: 'reckless_cast' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    const hasOverchannel = actor.equippedPassives?.some(p => p.id === 'overchannel');
    const recoilRatio = hasOverchannel ? 0.05 : 0.10;
    const recoilAmount = Math.max(1, Math.round(damage * recoilRatio));
    actor.hp.current = Math.max(1, actor.hp.current - recoilAmount);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, recoilAmount,
    };
  },
});

// Mana Surge — magic damage that scales inversely with current MP. Cost 10 MP.
// The lower the user's MP, the harder it hits. surge_mastery passive adds 25% to the scaling bonus.
registerSkillHandler('mana_surge', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const mpRatio = actor.mp.max > 0 ? actor.mp.current / actor.mp.max : 0;
    const hasSurgeMastery = actor.equippedPassives?.some(p => p.id === 'surge_mastery');
    const scalingFactor = hasSurgeMastery ? 1.25 : 1.0;
    // Low MP → higher bonus power. At 0% MP: +scalingFactor*30 extra power. At 100% MP: +0.
    const inverseBonus = Math.round((1 - mpRatio) * 30 * scalingFactor);
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 20, { extraPower: inverseBonus, skillId: 'mana_surge' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Spell Drain — magic damage + restore 15% of damage dealt as MP, cost 8 MP
registerSkillHandler('spell_drain', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 26, { skillId: 'spell_drain' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    const mpRestore = Math.max(1, Math.round(damage * 0.15));
    actor.mp.current = Math.min(actor.mp.max, actor.mp.current + mpRestore);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
      statusText: `${actor.displayName} restored ${mpRestore} MP`,
    };
  },
});

// ── Intelligence Tier 2 — Magician ────────────────────────────────────────────

// Mind Spike II
registerSkillHandler('mind_spike_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 36, { skillId: 'mind_spike_2' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Reckless Cast II
registerSkillHandler('reckless_cast_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 58, { skillId: 'reckless_cast_2' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    const hasOverchannel = actor.equippedPassives?.some(p => p.id === 'overchannel');
    const recoilRatio = hasOverchannel ? 0.05 : 0.10;
    const recoilAmount = Math.max(1, Math.round(damage * recoilRatio));
    actor.hp.current = Math.max(1, actor.hp.current - recoilAmount);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, recoilAmount,
    };
  },
});

// Wild Surge — extreme variance magic damage (double the normal random range), cost 10 MP
registerSkillHandler('wild_surge', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const offStat = getEffectiveStat(actor, 'intelligence');
    const defStat = getEffectiveStat(target, 'spirit');
    const pressure = (offStat - defStat) * 1.0;
    const levelMod = actor.level * ENGINE.LEVEL_MOD;
    const moveLike = { damageClass: 'magic', element: null, canCrit: true, id: 'wild_surge' };
    const isCrit = _battleRng() < (ENGINE.CRIT_CHANCE + getPassiveCritBonus(actor, moveLike));
    const critMod = isCrit ? ENGINE.CRIT_MOD * getPassiveCritMultiplier(actor, moveLike) : 1.0;
    // Double the variance range: pick a random bonus/penalty from -RANDOM_MAX to +RANDOM_MAX
    const wildRand = engineRandom(-ENGINE.RANDOM_MAX, ENGINE.RANDOM_MAX * 2);
    const passiveMult = getPassiveDamageMultiplier(actor, target, moveLike);
    const incomingMult = getPassiveIncomingMultiplier(target, moveLike);
    const defMod = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
    const raw = ((34 + pressure + levelMod) * defMod * critMod + wildRand) * passiveMult * incomingMult;
    const damage = Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw)));
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Mana Burst — spend 25% current MP; damage scales with MP spent. mana_weaver reduces to 17.5%.
registerSkillHandler('mana_burst', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const hasManaWeaver = actor.equippedPassives?.some(p => p.id === 'mana_weaver');
    const spendRatio = hasManaWeaver ? 0.175 : 0.25;
    const mpSpent = Math.max(1, Math.floor(actor.mp.current * spendRatio));
    if (actor.mp.current < mpSpent) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    actor.mp.current = Math.max(0, actor.mp.current - mpSpent);
    const target = bs[targetSide][tgtSlot];
    // Bonus power scales with MP spent — 1 extra power per 3 MP burned
    const extraPower = Math.round(mpSpent / 3);
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 20, { extraPower, skillId: 'mana_burst' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Channel — priority; enter defending stance; engine applies MP restore per hit received
registerSkillHandler('channel', {
  execute(skill, actor) {
    actor.isDefending  = true;
    actor.channelActive = true;
    return { type: 'defend', actorName: actor.displayName, moveName: skill.name };
  },
});

// ── Intelligence Tier 3 — Wizard ──────────────────────────────────────────────

// Focus II — raise INT 3 stages for 2 rounds
registerSkillHandler('focus_2', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'intelligence', 1, { duration: 2 });
    applyStatModifier(actor, 'intelligence', 1, { duration: 2 });
    applyStatModifier(actor, 'intelligence', 1, { duration: 2 });
    actor.focusActive = true;
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText: 'INT UP+' };
  },
});

// Mana Surge II
registerSkillHandler('mana_surge_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const mpRatio = actor.mp.max > 0 ? actor.mp.current / actor.mp.max : 0;
    const hasSurgeMastery = actor.equippedPassives?.some(p => p.id === 'surge_mastery');
    const scalingFactor = hasSurgeMastery ? 1.25 : 1.0;
    const inverseBonus = Math.round((1 - mpRatio) * 42 * scalingFactor);
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 28, { extraPower: inverseBonus, skillId: 'mana_surge_2' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Arcane Surge — AoE magic damage to all enemies, cost 16 MP
registerSkillHandler('arcane_surge', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSide = actorSide === 'player' ? 'opponent' : 'player';
    const slots = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
    if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    actor.usedMagicThisRound = true;
    const hits = slots.map(slot => {
      const target = bs[tgtSide][slot];
      const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 14, { isAoe: true, skillId: 'arcane_surge' });
      const wasKO = _applySkillDamage(target, damage);
      return { slot, name: target.displayName, amount: damage, wasKO, isCrit };
    });
    return { type: 'multi', actorName: actor.displayName, moveName: skill.name, damageClass: 'magic', targetSide: tgtSide, hits };
  },
});

// Grand Incantation — pay MP cost now, wind up for one turn, auto-fire massive hit next turn
registerSkillHandler('grand_incantation', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    actor.chargingGrandIncantation = true;
    actor.pendingAutoAction = { commandType: 'skill', moveId: 'grand_incantation_execute', targetSide, targetSlot: tgtSlot };
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: 'INCANTING',
    };
  },
});

// Attune — set attuneActive; engine applies +50% to next Art
registerSkillHandler('attune', {
  execute(skill, actor) {
    actor.attuneActive = true;
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText: 'ATTUNED' };
  },
});

// ── Intelligence Tier 4 — Sorcerer ────────────────────────────────────────────

// Mind Spike III
registerSkillHandler('mind_spike_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 50, { skillId: 'mind_spike_3' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Reckless Cast III
registerSkillHandler('reckless_cast_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 78, { skillId: 'reckless_cast_3' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    const hasOverchannel = actor.equippedPassives?.some(p => p.id === 'overchannel');
    const recoilRatio = hasOverchannel ? 0.05 : 0.10;
    const recoilAmount = Math.max(1, Math.round(damage * recoilRatio));
    actor.hp.current = Math.max(1, actor.hp.current - recoilAmount);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot, recoilAmount,
    };
  },
});

// Arcane Surge II
registerSkillHandler('arcane_surge_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSide = actorSide === 'player' ? 'opponent' : 'player';
    const slots = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
    if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    actor.usedMagicThisRound = true;
    const hits = slots.map(slot => {
      const target = bs[tgtSide][slot];
      const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 20, { isAoe: true, skillId: 'arcane_surge_2' });
      const wasKO = _applySkillDamage(target, damage);
      return { slot, name: target.displayName, amount: damage, wasKO, isCrit };
    });
    return { type: 'multi', actorName: actor.displayName, moveName: skill.name, damageClass: 'magic', targetSide: tgtSide, hits };
  },
});

// Unravel — lower all enemies' Spirit by 1 stage, cost 12 MP
registerSkillHandler('unravel', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    spendSkillCost(skill, actor);
    const tgtSide = actorSide === 'player' ? 'opponent' : 'player';
    const affected = [];
    SLOT_NAMES.forEach(s => {
      const c = bs[tgtSide][s];
      if (c && !c.isKnockedOut) { applyStatModifier(c, 'spirit', -1, { duration: 2 }); affected.push(c.displayName); }
    });
    if (!affected.length) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, statusText: `SPI DOWN (${affected.join(', ')})` };
  },
});

// Resonant Cast — +30% damage if a magic skill was used last turn, cost 14 MP
registerSkillHandler('resonant_cast', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const basePower = actor.usedMagicLastRound ? Math.round(38 * 1.30) : 38;
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, basePower, { skillId: 'resonant_cast' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Intelligence Tier 5 — Warlock ─────────────────────────────────────────────

// Focus III — raise INT 4 stages for 2 rounds
registerSkillHandler('focus_3', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    for (let i = 0; i < 4; i++) applyStatModifier(actor, 'intelligence', 1, { duration: 2 });
    actor.focusActive = true;
    return { type: 'utility', actorName: actor.displayName, moveName: skill.name, targetName: actor.displayName, statusText: 'INT MAX UP' };
  },
});

// Mana Surge III
registerSkillHandler('mana_surge_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const mpRatio = actor.mp.max > 0 ? actor.mp.current / actor.mp.max : 0;
    const hasSurgeMastery = actor.equippedPassives?.some(p => p.id === 'surge_mastery');
    const scalingFactor = hasSurgeMastery ? 1.25 : 1.0;
    const inverseBonus = Math.round((1 - mpRatio) * 56 * scalingFactor);
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 36, { extraPower: inverseBonus, skillId: 'mana_surge_3' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Arcane Surge III
registerSkillHandler('arcane_surge_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSide = actorSide === 'player' ? 'opponent' : 'player';
    const slots = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
    if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    actor.usedMagicThisRound = true;
    const hits = slots.map(slot => {
      const target = bs[tgtSide][slot];
      const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 28, { isAoe: true, skillId: 'arcane_surge_3' });
      const wasKO = _applySkillDamage(target, damage);
      return { slot, name: target.displayName, amount: damage, wasKO, isCrit };
    });
    return { type: 'multi', actorName: actor.displayName, moveName: skill.name, damageClass: 'magic', targetSide: tgtSide, hits };
  },
});

// Shatter — magic damage that scales with the target's own SPI (more SPI = more damage), cost 18 MP
registerSkillHandler('shatter', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const targetSpi = getEffectiveStat(target, 'spirit');
    // Scales with target's SPI: +1 power per 2 points of target's SPI
    const extraPower = Math.round(targetSpi / 2);
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 22, { extraPower, skillId: 'shatter' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Void Strike — ignores target's SPI entirely, cost 28 MP
registerSkillHandler('void_strike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 60, { ignoreSpirit: true, skillId: 'void_strike' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Grand Incantation (execute) — auto-fires the turn after Grand Incantation ─

registerSkillHandler('grand_incantation_execute', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.chargingGrandIncantation = false;
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcMagicSkillDamage(actor, target, 95, { skillId: 'grand_incantation_execute' });
    actor.usedMagicThisRound = true;
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// ── Spirit route skill handlers ───────────────────────────────────────────────

// T1 — Tactician

registerSkillHandler('spirit_bolt', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcSpiSkillDamage(actor, target, 25, { skillId: 'spirit_bolt' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

registerSkillHandler('inner_reserve', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const hpCost = Math.floor(actor.hp.max * 0.12);
    actor.hp.current = Math.max(1, actor.hp.current - hpCost);
    const restoreAmount = Math.floor(actor.mp.max * 0.50);
    actor.mp.current = Math.min(actor.mp.max, actor.mp.current + restoreAmount);
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: `Restored ${restoreAmount} MP (cost ${hpCost} HP)`,
    };
  },
});

registerSkillHandler('ward', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.wardActive         = true;
    actor.wardDamageReduction = 0.20;
    actor.wardMPRestoreRate  = 0.10;
    actor.wardReflectRatio   = 0;
    actor.isDefending        = true;
    return {
      type: 'defend',
      actorName: actor.displayName, moveName: skill.name,
    };
  },
});

registerSkillHandler('pulse', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const oppSide = targetSide;
    const hits = [];
    SLOT_NAMES.forEach(slot => {
      const tgt = bs[oppSide][slot];
      if (!tgt || tgt.isKnockedOut) return;
      const { damage, isCrit } = _calcSpiSkillDamage(actor, tgt, 20, { isAoe: true, skillId: 'pulse' });
      const wasKO = _applySkillDamage(tgt, damage);
      hits.push({ name: tgt.displayName, slot, amount: damage, wasKO, isCrit, elemMod: 1.0 });
    });
    return {
      type: 'multi',
      actorName: actor.displayName, moveName: skill.name,
      targetSide: oppSide, damageClass: 'magic',
      hits,
    };
  },
});

registerSkillHandler('clarity_spirit', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    if (actor.statusEffects) {
      actor.statusEffects = actor.statusEffects.filter(s =>
        s.id !== 'burn' && s.id !== 'poison' && s.id !== 'slow' && s.id !== 'silence' && s.id !== 'blind'
      );
    }
    const statusText = applyStatModifier(actor, 'spirit', 1, { duration: 3 });
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: statusText || 'Status cleared! SPT raised!',
    };
  },
});

// T2 — Strategist

registerSkillHandler('spirit_bolt_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcSpiSkillDamage(actor, target, 35, { skillId: 'spirit_bolt_2' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

registerSkillHandler('astral_rise', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const statusText = applyStatModifier(actor, 'spirit', 2, { duration: 3 });
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText,
    };
  },
});

registerSkillHandler('mana_siphon', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcSpiSkillDamage(actor, target, 30, { skillId: 'mana_siphon' });
    const wasKO = _applySkillDamage(target, damage);
    const siphonAmount = Math.max(1, Math.round(damage * 0.15));
    actor.mp.current = Math.min(actor.mp.max, actor.mp.current + siphonAmount);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      drainAmount: siphonAmount,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

registerSkillHandler('quicken', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.quickenActive = true;
    const statusText = applyStatModifier(actor, 'speed', 1, { duration: 3 });
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: statusText || 'SPD raised!',
    };
  },
});

registerSkillHandler('null_field', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const oppSide = targetSide;
    SLOT_NAMES.forEach(slot => {
      const tgt = bs[oppSide][slot];
      if (!tgt || tgt.isKnockedOut) return;
      applyStatModifier(tgt, 'intelligence', -1, { duration: 3 });
    });
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: 'all enemies', statusText: 'INT −1!',
    };
  },
});

// T3 — Rulebender

registerSkillHandler('inner_reserve_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const hpCost = Math.floor(actor.hp.max * 0.12);
    actor.hp.current = Math.max(1, actor.hp.current - hpCost);
    const restoreAmount = Math.floor(actor.mp.max * 0.65);
    actor.mp.current = Math.min(actor.mp.max, actor.mp.current + restoreAmount);
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: `Restored ${restoreAmount} MP (cost ${hpCost} HP)`,
    };
  },
});

registerSkillHandler('ward_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.wardActive          = true;
    actor.wardDamageReduction = 0.30;
    actor.wardMPRestoreRate   = 0.15;
    actor.wardReflectRatio    = 0.20;
    actor.isDefending         = true;
    return {
      type: 'defend',
      actorName: actor.displayName, moveName: skill.name,
    };
  },
});

registerSkillHandler('astral_rise_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    applyStatModifier(actor, 'spirit', 2, { duration: 3 });
    const slots = SLOT_NAMES.filter(s => { const c = bs[actorSide][s]; return c && !c.isKnockedOut && c !== actor; });
    slots.forEach(s => applyStatModifier(bs[actorSide][s], 'spirit', 1, { duration: 3 }));
    const statusText = `SPT +2! Allies +1 SPT!`;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText,
    };
  },
});

registerSkillHandler('spirit_surge', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const spiStage = getStatStage(actor, 'spirit');
    const bonus = spiStage > 0 ? spiStage * 5 : 0;
    const { damage, isCrit } = _calcSpiSkillDamage(actor, target, 42, { extraPower: bonus, skillId: 'spirit_surge' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

registerSkillHandler('deep_meditation', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const immediate = Math.floor(actor.mp.max * 0.30);
    actor.mp.current = Math.min(actor.mp.max, actor.mp.current + immediate);
    actor.deepMeditationActive = true;
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: `Restored ${immediate} MP! More at round end.`,
    };
  },
});

// T4 — Rulebreaker

registerSkillHandler('spirit_bolt_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcSpiSkillDamage(actor, target, 48, { skillId: 'spirit_bolt_3' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

registerSkillHandler('soul_rend', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcSpiSkillDamage(actor, target, 50, { skillId: 'soul_rend' });
    const wasKO = _applySkillDamage(target, damage);
    let statusText = '';
    if (!wasKO) {
      applyStatModifier(target, 'spirit', -1, { duration: 3 });
      statusText = applyStatModifier(actor, 'spirit', 1, { duration: 3 }) || 'SPT stolen!';
    }
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0, statusText,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

registerSkillHandler('mana_well', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const hits = [];
    SLOT_NAMES.forEach(slot => {
      const ally = bs[actorSide][slot];
      if (!ally || ally.isKnockedOut) return;
      const restoreAmount = Math.floor(ally.mp.max * 0.40);
      ally.mp.current = Math.min(ally.mp.max, ally.mp.current + restoreAmount);
      hits.push({ name: ally.displayName, slot, amount: restoreAmount, wasKO: false, elemMod: 1.0 });
    });
    return {
      type: 'multi',
      actorName: actor.displayName, moveName: skill.name,
      targetSide: actorSide, damageClass: 'heal', hits,
    };
  },
});

registerSkillHandler('transcendence', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.transcendenceActive = true;
    const statusText = applyStatModifier(actor, 'spirit', 1, { duration: 3 }) || 'Transcendence active!';
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText,
    };
  },
});

registerSkillHandler('arcane_veil', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.arcaneVeilUsed   = true;
    actor.arcaneVeilActive = true;
    return {
      type: 'defend',
      actorName: actor.displayName, moveName: skill.name,
    };
  },
});

// T5 — Mastermind

registerSkillHandler('inner_reserve_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const hpCost = Math.floor(actor.hp.max * 0.10);
    actor.hp.current = Math.max(1, actor.hp.current - hpCost);
    const restoreAmount = Math.floor(actor.mp.max * 0.80);
    actor.mp.current = Math.min(actor.mp.max, actor.mp.current + restoreAmount);
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName,
      statusText: `Restored ${restoreAmount} MP (cost ${hpCost} HP)`,
    };
  },
});

registerSkillHandler('ward_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.wardActive          = true;
    actor.wardDamageReduction = 0.40;
    actor.wardMPRestoreRate   = 0.20;
    actor.wardReflectRatio    = 0.50;
    actor.isDefending         = true;
    return {
      type: 'defend',
      actorName: actor.displayName, moveName: skill.name,
    };
  },
});

registerSkillHandler('astral_rise_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    applyStatModifier(actor, 'spirit', 3, { duration: 4 });
    const slots = SLOT_NAMES.filter(s => { const c = bs[actorSide][s]; return c && !c.isKnockedOut && c !== actor; });
    slots.forEach(s => applyStatModifier(bs[actorSide][s], 'spirit', 1, { duration: 4 }));
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'SPT +3! Allies +1 SPT!',
    };
  },
});

registerSkillHandler('spirit_collapse', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    const target = bs[targetSide][tgtSlot];
    const drained = Math.floor(target.mp.current * 0.20);
    target.mp.current = Math.max(0, target.mp.current - drained);
    const { damage, isCrit } = _calcSpiSkillDamage(actor, target, 55, { extraPower: drained, skillId: 'spirit_collapse' });
    const wasKO = _applySkillDamage(target, damage);
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      statusText: drained > 0 ? `Drained ${drained} MP!` : '',
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

registerSkillHandler('dominion', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    // Lower all enemies' INT and SPI by 2 stages each.
    const oppSide = targetSide;
    SLOT_NAMES.forEach(slot => {
      const tgt = bs[oppSide][slot];
      if (!tgt || tgt.isKnockedOut) return;
      applyStatModifier(tgt, 'intelligence', -2, { duration: 4 });
      applyStatModifier(tgt, 'spirit', -2, { duration: 4 });
    });
    // Raise all allies' SPI by 2 stages.
    SLOT_NAMES.forEach(slot => {
      const ally = bs[actorSide][slot];
      if (!ally || ally.isKnockedOut) return;
      applyStatModifier(ally, 'spirit', 2, { duration: 4 });
    });
    return {
      type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: 'all', statusText: 'Enemies: INT/SPT −2! Allies: SPT +2!',
    };
  },
});
