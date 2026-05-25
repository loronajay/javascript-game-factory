// skill-registry-core.js — Core infrastructure for class route skill handlers.
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
  if (skill.id === 'ghost_step'    && actor.ghostStepUsed)           return false;
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

// Speed damage: SPD offensively vs DEF defensively — faster creatures hit harder.
function _calcSpdSkillDamage(actor, target, basePower, opts = {}) {
  const offStat = getEffectiveStat(actor, 'speed');
  const defStat = opts.ignoreDefense ? 0 : getEffectiveStat(target, 'defense');
  const levelMod = actor.level * ENGINE.LEVEL_MOD;
  const pressure = (offStat - defStat) * 1.0;
  const defMod   = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
  const moveLike = { damageClass: 'physical', element: null, canCrit: true, id: opts.skillId || null };
  const critThreshold = ENGINE.CRIT_CHANCE + getPassiveCritBonus(actor, moveLike);
  const isCrit   = _battleRng() < critThreshold;
  const critMod  = isCrit ? ENGINE.CRIT_MOD * getPassiveCritMultiplier(actor, moveLike) : 1.0;
  const randMod  = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  const passiveMult  = getPassiveDamageMultiplier(actor, target, moveLike);
  const incomingMult = getPassiveIncomingMultiplier(target, moveLike);
  const aoeMult = opts.isAoe ? getPassiveAoeBonusMultiplier(actor, moveLike) : 1.0;

  let power = basePower;
  if (opts.extraPower) power += opts.extraPower;

  const raw = ((power + pressure + levelMod) * defMod * critMod + randMod) * passiveMult * incomingMult * aoeMult;
  return {
    damage: Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw))),
    isCrit,
  };
}

// Fires onCritLand passive hooks for the actor when a skill crits.
function fireOnCritLand(actor, target, isCrit, bs) {
  if (!isCrit) return;
  (actor.equippedPassives || []).forEach(p => {
    const reg = typeof PASSIVE_REGISTRY !== 'undefined' ? PASSIVE_REGISTRY[p.id] : null;
    if (reg?.onCritLand) reg.onCritLand({ attacker: actor, target, bs });
  });
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
