// skill-registry-strength.js — Strength route skill handlers.
// Requires skill-registry-core.js (registerSkillHandler, _calcPhysSkillDamage, etc.).

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
