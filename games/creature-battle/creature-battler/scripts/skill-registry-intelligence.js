// skill-registry-intelligence.js — Intelligence route skill handlers.
// Requires skill-registry-core.js (registerSkillHandler, _calcMagicSkillDamage, etc.).

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
