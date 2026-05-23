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
    case 'flatMP':    return { mp: skill.costAmount,                               hp: 0 };
    case 'percentMP': return { mp: Math.ceil(actor.mp.max * skill.costAmount),     hp: 0 };
    case 'flatHP':    return { mp: 0, hp: skill.costAmount };
    case 'percentHP': return { mp: 0, hp: Math.floor(actor.hp.current * skill.costAmount) };
    default:          return { mp: 0, hp: 0 };
  }
}

function canUseSkill(skill, actor) {
  const cost = calcSkillCost(skill, actor);
  if (cost.mp > actor.mp.current) return false;
  if (cost.hp > 0 && actor.hp.current <= cost.hp) return false;
  return true;
}

function spendSkillCost(skill, actor) {
  const cost = calcSkillCost(skill, actor);
  actor.mp.current = Math.max(0, actor.mp.current - cost.mp);
  if (cost.hp > 0) actor.hp.current = Math.max(1, actor.hp.current - cost.hp);
}

// ── Internal damage helper ────────────────────────────────────────────────────
// Skills are physical and elementally neutral (no native element tag on moves).

function _calcPhysSkillDamage(actor, target, basePower, opts = {}) {
  const offStat = getEffectiveStat(actor, 'strength');
  const defStat = opts.ignoreDefense ? 0 : getEffectiveStat(target, 'defense');
  const levelMod = actor.level * ENGINE.LEVEL_MOD;
  const pressure = (offStat - defStat) * 1.0;
  const defMod   = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
  const moveLike = { damageClass: 'physical', element: null, canCrit: true };
  const critThreshold = ENGINE.CRIT_CHANCE + getPassiveCritBonus(actor, moveLike);
  const isCrit   = _battleRng() < critThreshold;
  const critMod  = isCrit ? ENGINE.CRIT_MOD : 1.0;
  const randMod  = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  const passiveMult = getPassiveDamageMultiplier(actor, target, moveLike);

  let power = basePower;
  if (opts.hpScaling) {
    const missingRatio = 1 - actor.hp.current / actor.hp.max;
    power += Math.round(basePower * opts.hpScaling * missingRatio);
  }
  if (opts.finisherBonus && target.hp.current / target.hp.max < 0.30) {
    power += Math.round(basePower * opts.finisherBonus);
  }

  const raw = ((power + pressure + levelMod) * defMod * critMod + randMod) * passiveMult;
  return {
    damage: Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw))),
    isCrit,
  };
}

// ── Dispatcher (called from battle-engine.js resolveAction) ──────────────────

function executeRegisteredSkill(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
  const handler = SKILL_REGISTRY[skill.id];
  if (!handler) return { type: 'skipped' };
  return handler.execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs);
}

// ── Strength Tier 1 ───────────────────────────────────────────────────────────

// Cleave — physical damage ignoring DEF, cost 5% MP
registerSkillHandler('cleave', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const tgtSlot = findValidTarget(targetSide, targetSlot);
    if (!tgtSlot) return { type: 'no_target', actorName: actor.displayName, moveName: skill.name };
    spendSkillCost(skill, actor);
    const target = bs[targetSide][tgtSlot];
    const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 22, { ignoreDefense: true });
    target.hp.current = Math.max(0, target.hp.current - damage);
    const wasKO = !target.isKnockedOut && target.hp.current <= 0;
    if (wasKO) { target.isKnockedOut = true; clearBattleModifiers(target); }
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});

// Temper — raise user STR +2 stages, cost 10 MP
registerSkillHandler('temper', {
  execute(skill, actor) {
    spendSkillCost(skill, actor);
    applyStatModifier(actor, 'strength', 1);
    const statusText = applyStatModifier(actor, 'strength', 1);
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
    const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 48);
    target.hp.current = Math.max(0, target.hp.current - damage);
    const wasKO = !target.isKnockedOut && target.hp.current <= 0;
    if (wasKO) { target.isKnockedOut = true; clearBattleModifiers(target); }
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
    const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 20, { hpScaling: 1.0 });
    target.hp.current = Math.max(0, target.hp.current - damage);
    const wasKO = !target.isKnockedOut && target.hp.current <= 0;
    if (wasKO) { target.isKnockedOut = true; clearBattleModifiers(target); }
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
    const { damage, isCrit } = _calcPhysSkillDamage(actor, target, 26, { finisherBonus: 1.5 });
    target.hp.current = Math.max(0, target.hp.current - damage);
    const wasKO = !target.isKnockedOut && target.hp.current <= 0;
    if (wasKO) { target.isKnockedOut = true; clearBattleModifiers(target); }
    return {
      type: isCrit ? 'crit' : 'damage',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, targetSide, targetSlot: tgtSlot,
      amount: damage, isCrit, wasKO, elemMod: 1.0,
      retargeted: tgtSlot !== targetSlot,
    };
  },
});
