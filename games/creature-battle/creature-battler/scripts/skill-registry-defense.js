// skill-registry-defense.js — Defense route skill handlers.
// Requires skill-registry-core.js (registerSkillHandler, _calcPhysSkillDamage, etc.).

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
