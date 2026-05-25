// skill-registry-spirit.js — Spirit route skill handlers.
// Requires skill-registry-core.js (registerSkillHandler, _calcSpiSkillDamage, etc.).

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
