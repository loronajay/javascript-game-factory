// skill-registry-speed.js — Speed route skill handlers.
// Requires skill-registry-core.js (registerSkillHandler, _calcSpdSkillDamage, etc.).

// ── Speed route skills ────────────────────────────────────────────────────────

// T1: Quick Strike — light physical, crits lower target SPD 1 stage
registerSkillHandler('quick_strike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 20, { skillId: 'quick_strike' });
    const wasKO = _applySkillDamage(target, damage);
    if (isCrit) applyStatModifier(target, 'speed', -1, { duration: 3 });
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T1: Feint — debuff, lower target evasion 1 stage
registerSkillHandler('feint', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    applyStatModifier(target, 'evasion', -1, { duration: 3 });
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, statusText: 'Evasion −1!' };
  },
});

// T1: Dash — priority, raise self evasion 1 stage
registerSkillHandler('dash', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    applyStatModifier(actor, 'evasion', 1, { duration: 2 });
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'Evasion +1!' };
  },
});

// T1: Double Tap — two quick hits
registerSkillHandler('double_tap', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    let totalDamage = 0; let isCrit = false;
    for (let i = 0; i < 2; i++) {
      if (target.isKnockedOut) break;
      const hit = _calcSpdSkillDamage(actor, target, 14, { skillId: 'double_tap' });
      totalDamage += hit.damage;
      if (hit.isCrit) isCrit = true;
      _applySkillDamage(target, hit.damage);
    }
    fireOnCritLand(actor, target, isCrit, bs);
    const wasKO = target.isKnockedOut;
    return { type: 'damage', damage: totalDamage, isCrit, wasKO, hits: 2,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T1: Low Blow — physical, 40% chance to apply slow
registerSkillHandler('low_blow', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 22, { skillId: 'low_blow' });
    const wasKO = _applySkillDamage(target, damage);
    fireOnCritLand(actor, target, isCrit, bs);
    if (!wasKO && _battleRng() < 0.40) applyStatus(target, 'slow', actor);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T2: Quick Strike II — upgraded quick strike, crits lower target SPD 1 stage
registerSkillHandler('quick_strike_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 32, { skillId: 'quick_strike_2' });
    const wasKO = _applySkillDamage(target, damage);
    if (isCrit) applyStatModifier(target, 'speed', -1, { duration: 3 });
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T2: Afterimage — priority setup, next physical hit against actor auto-misses
registerSkillHandler('afterimage', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.afterimageActive = true;
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'Afterimage! Next hit will miss!' };
  },
});

// T2: Blitz — burst physical hit, lower self SPD 1 stage
registerSkillHandler('blitz', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 50, { skillId: 'blitz' });
    const wasKO = _applySkillDamage(target, damage);
    applyStatModifier(actor, 'speed', -1, { duration: 3 });
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T2: Trip — lower target SPD 2 stages
registerSkillHandler('trip', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    applyStatModifier(target, 'speed', -2, { duration: 4 });
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, statusText: 'SPD −2!' };
  },
});

// T2: Haste — raise one ally SPD 2 stages
registerSkillHandler('haste', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    applyStatModifier(target, 'speed', 2, { duration: 4 });
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: target.displayName, statusText: 'SPD +2!' };
  },
});

// T3: Dash II — priority, raise self evasion 2 stages
registerSkillHandler('dash_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    applyStatModifier(actor, 'evasion', 2, { duration: 2 });
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'Evasion +2!' };
  },
});

// T3: Afterimage II — priority, next 2 physical hits against actor auto-miss
registerSkillHandler('afterimage_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.afterimageActive = 2;
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'Double Afterimage!' };
  },
});

// T3: Flurry — three hits
registerSkillHandler('flurry', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    let totalDamage = 0; let isCrit = false;
    for (let i = 0; i < 3; i++) {
      if (target.isKnockedOut) break;
      const hit = _calcSpdSkillDamage(actor, target, 16, { skillId: 'flurry' });
      totalDamage += hit.damage;
      if (hit.isCrit) isCrit = true;
      _applySkillDamage(target, hit.damage);
    }
    fireOnCritLand(actor, target, isCrit, bs);
    const wasKO = target.isKnockedOut;
    return { type: 'damage', damage: totalDamage, isCrit, wasKO, hits: 3,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T3: Vault — priority full-evasion window; queues vault_counter on dodge
registerSkillHandler('vault', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.vaultActive = true;
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'Vaulted! Ready to counter!' };
  },
});

// T3: Haste 2 — raise all allies' SPD 2 stages
registerSkillHandler('haste_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    SLOT_NAMES.forEach(slot => {
      const ally = bs[actorSide][slot];
      if (!ally || ally.isKnockedOut) return;
      applyStatModifier(ally, 'speed', 2, { duration: 4 });
    });
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: 'all allies', statusText: 'All allies SPD +2!' };
  },
});

// T4: Quick Strike III — highest tier, crits lower target SPD 1 stage
registerSkillHandler('quick_strike_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 46, { skillId: 'quick_strike_3' });
    const wasKO = _applySkillDamage(target, damage);
    if (isCrit) applyStatModifier(target, 'speed', -1, { duration: 3 });
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T4: Afterimage III — priority, next physical hit auto-misses + queues a counter
registerSkillHandler('afterimage_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.afterimageActive = true;
    actor.afterimage3Ready = true;
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'Phantom Afterimage!' };
  },
});

// T4: Blitz II — upgraded burst, lower self SPD 1 stage
registerSkillHandler('blitz_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 70, { skillId: 'blitz_2' });
    const wasKO = _applySkillDamage(target, damage);
    applyStatModifier(actor, 'speed', -1, { duration: 3 });
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T4: Flurry II — four hits
registerSkillHandler('flurry_2', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    let totalDamage = 0; let isCrit = false;
    for (let i = 0; i < 4; i++) {
      if (target.isKnockedOut) break;
      const hit = _calcSpdSkillDamage(actor, target, 16, { skillId: 'flurry_2' });
      totalDamage += hit.damage;
      if (hit.isCrit) isCrit = true;
      _applySkillDamage(target, hit.damage);
    }
    fireOnCritLand(actor, target, isCrit, bs);
    const wasKO = target.isKnockedOut;
    return { type: 'damage', damage: totalDamage, isCrit, wasKO, hits: 4,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T4: Phantom Drive — extra power based on how much faster actor is than target
registerSkillHandler('phantom_drive', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const actorSpd = getEffectiveStat(actor, 'speed');
    const targetSpd = getEffectiveStat(target, 'speed');
    const spdDelta = Math.max(0, actorSpd - targetSpd);
    const extraPower = Math.round(spdDelta * 0.5);
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 38, { extraPower, skillId: 'phantom_drive' });
    const wasKO = _applySkillDamage(target, damage);
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T5: Dash III — priority, raise self evasion 3 stages
registerSkillHandler('dash_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    applyStatModifier(actor, 'evasion', 3, { duration: 2 });
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'Evasion +3!' };
  },
});

// T5: Flurry III — five hits
registerSkillHandler('flurry_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    let totalDamage = 0; let isCrit = false;
    for (let i = 0; i < 5; i++) {
      if (target.isKnockedOut) break;
      const hit = _calcSpdSkillDamage(actor, target, 17, { skillId: 'flurry_3' });
      totalDamage += hit.damage;
      if (hit.isCrit) isCrit = true;
      _applySkillDamage(target, hit.damage);
    }
    fireOnCritLand(actor, target, isCrit, bs);
    const wasKO = target.isKnockedOut;
    return { type: 'damage', damage: totalDamage, isCrit, wasKO, hits: 5,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T5: Blitz III — upgraded burst, lower self SPD 1 stage
registerSkillHandler('blitz_3', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 90, { skillId: 'blitz_3' });
    const wasKO = _applySkillDamage(target, damage);
    applyStatModifier(actor, 'speed', -1, { duration: 3 });
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T5: Tempo Crush — damage + lower target SPD 2 stages, raise self SPD 1 stage
registerSkillHandler('tempo_crush', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 55, { skillId: 'tempo_crush' });
    const wasKO = _applySkillDamage(target, damage);
    if (!wasKO) applyStatModifier(target, 'speed', -2, { duration: 4 });
    applyStatModifier(actor, 'speed', 1, { duration: 4 });
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// T5: Velocity — AoE, hits all enemies with speed-scaling damage
registerSkillHandler('velocity', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const oppSide = actorSide === 'player' ? 'opponent' : 'player';
    let totalDamage = 0; let isCrit = false;
    SLOT_NAMES.forEach(slot => {
      const tgt = bs[oppSide][slot];
      if (!tgt || tgt.isKnockedOut) return;
      const hit = _calcSpdSkillDamage(actor, tgt, 28, { isAoe: true, skillId: 'velocity' });
      totalDamage += hit.damage;
      if (hit.isCrit) isCrit = true;
      _applySkillDamage(tgt, hit.damage);
      fireOnCritLand(actor, tgt, hit.isCrit, bs);
    });
    return { type: 'damage', damage: totalDamage, isCrit, wasKO: false,
      actorName: actor.displayName, moveName: skill.name, targetName: 'all enemies' };
  },
});

// Pseudo: Vault Counter — fires when vault dodge triggers
registerSkillHandler('vault_counter', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 28, { skillId: 'vault_counter' });
    const wasKO = _applySkillDamage(target, damage);
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// Pseudo: Dodge Counter Strike — fires when dodge_counter passive triggers
registerSkillHandler('dodge_counter_strike', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    const target = bs[targetSide][targetSlot];
    if (!target || target.isKnockedOut) return { type: 'skipped' };
    const { damage, isCrit } = _calcSpdSkillDamage(actor, target, 22, { skillId: 'dodge_counter_strike' });
    const wasKO = _applySkillDamage(target, damage);
    fireOnCritLand(actor, target, isCrit, bs);
    return { type: 'damage', damage, isCrit, wasKO,
      actorName: actor.displayName, moveName: skill.name, targetName: target.displayName };
  },
});

// Ghost Step — once per battle, survive KO at 1 HP + raise self evasion 2 stages
registerSkillHandler('ghost_step', {
  execute(skill, actor, actorSide, actorSlot, targetSide, targetSlot, bs) {
    actor.ghostStepUsed = true;
    actor.ghostStepActive = true;
    applyStatModifier(actor, 'evasion', 2, { duration: 999 });
    return { type: 'utility',
      actorName: actor.displayName, moveName: skill.name,
      targetName: actor.displayName, statusText: 'Ghost Step! Will survive next KO at 1 HP!' };
  },
});
