const ENGINE = {
  LEVEL_MOD:       0.75,
  CRIT_CHANCE:     0.05,
  CRIT_MOD:        1.5,
  DEFEND_MOD:      0.5,
  RANDOM_MIN:      -2,
  RANDOM_MAX:      4,
  MIN_DAMAGE:      1,
  MAX_DAMAGE:      9999,
  SPECIES_ACC_BASE: 70,
  SPECIES_EVA_BASE: 60,
};

function engineRandom(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function getElementModifier(moveElement, resistances) {
  if (!moveElement || moveElement === 'neutral' || moveElement === 'none') return 1.0;
  return resistances[moveElement] ?? 1.0;
}

function calcHitChance(attacker, target, move) {
  if (move.accuracy >= 100) return 100;
  const atkAcc = ENGINE.SPECIES_ACC_BASE + attacker.stats.speed * 0.15 + attacker.stats.intelligence * 0.10;
  const tgtEva = ENGINE.SPECIES_EVA_BASE + target.stats.speed * 0.15 + target.stats.intelligence * 0.10;
  return Math.max(75, Math.min(98, move.accuracy + (atkAcc - tgtEva) * 0.25));
}

function resolveHit(attacker, target, move) {
  return Math.random() * 100 < calcHitChance(attacker, target, move);
}

function calcDamage(attacker, target, move) {
  const offStat   = move.damageClass === 'physical' ? attacker.stats.strength     : attacker.stats.intelligence;
  const defStat   = move.damageClass === 'physical' ? target.stats.defense        : target.stats.spirit;
  const levelMod  = attacker.level * ENGINE.LEVEL_MOD;
  const pressure  = (offStat - defStat) * move.offensiveScaling;
  const elemMod   = getElementModifier(move.element, target.resistances);
  const isCrit    = move.canCrit && Math.random() < ENGINE.CRIT_CHANCE;
  const critMod   = isCrit ? ENGINE.CRIT_MOD : 1.0;
  const defMod    = target.isDefending ? ENGINE.DEFEND_MOD : 1.0;
  const randMod   = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  const raw = (move.basePower + move.movePowerModifier + pressure + levelMod)
              * elemMod * defMod * critMod + randMod;
  return {
    damage: Math.max(ENGINE.MIN_DAMAGE, Math.min(ENGINE.MAX_DAMAGE, Math.round(raw))),
    isCrit,
    elemMod,
  };
}

function calcHeal(caster, move) {
  const levelMod = caster.level * ENGINE.LEVEL_MOD;
  const pressure = caster.stats.spirit * move.offensiveScaling;
  const randMod  = engineRandom(ENGINE.RANDOM_MIN, ENGINE.RANDOM_MAX);
  return Math.max(1, Math.round(move.basePower + move.movePowerModifier + pressure + levelMod + randMod));
}

// Search upward from preferredSlot for next alive target on a side
function findValidTarget(side, preferredSlot) {
  const start = SLOT_NAMES.indexOf(preferredSlot);
  for (let i = 0; i < SLOT_NAMES.length; i++) {
    const slot = SLOT_NAMES[(start - i + SLOT_NAMES.length) % SLOT_NAMES.length];
    const c = state.battleState[side][slot];
    if (c && !c.isKnockedOut) return slot;
  }
  return null;
}

function sortActions(actions) {
  return [...actions].sort((a, b) => {
    if (b.speed !== a.speed) return b.speed - a.speed;
    // player side wins speed ties
    if (a.actorSide !== b.actorSide) return a.actorSide === 'player' ? -1 : 1;
    return SLOT_NAMES.indexOf(a.actorSlot) - SLOT_NAMES.indexOf(b.actorSlot);
  });
}

function checkBattleEnd() {
  const bs = state.battleState;
  const pAlive = SLOT_NAMES.some(s => bs.player[s] && !bs.player[s].isKnockedOut);
  const oAlive = SLOT_NAMES.some(s => bs.opponent[s] && !bs.opponent[s].isKnockedOut);
  if (!pAlive && !oAlive) return 'draw';
  if (!pAlive) return 'opponent';
  if (!oAlive) return 'player';
  return null;
}

function resolveAction(action) {
  const bs    = state.battleState;
  const actor = bs[action.actorSide][action.actorSlot];

  if (!actor || actor.isKnockedOut) {
    return { type: 'skipped' };
  }

  if (action.commandType === 'defend') {
    actor.isDefending = true;
    return { type: 'defend', actorName: actor.displayName };
  }

  const move = getMoveData(action.moveId);
  if (!move) return { type: 'skipped' };

  // Utility moves: deduct MP, no damage yet
  if (move.damageClass === 'utility') {
    actor.mp.current = Math.max(0, actor.mp.current - move.mpCost);
    return { type: 'utility', actorName: actor.displayName, moveName: move.name };
  }

  // Multi-target moves (all_enemies or all_allies)
  if (move.targeting === 'all_enemies' || move.targeting === 'all_allies') {
    const tgtSide = move.targeting === 'all_allies' ? action.actorSide : (action.actorSide === 'player' ? 'opponent' : 'player');
    const slots   = SLOT_NAMES.filter(s => { const c = bs[tgtSide][s]; return c && !c.isKnockedOut; });
    if (!slots.length) return { type: 'no_target', actorName: actor.displayName, moveName: move.name };

    actor.mp.current = Math.max(0, actor.mp.current - move.mpCost);
    const hits = slots.map(slot => {
      const target = bs[tgtSide][slot];
      if (move.damageClass === 'heal') {
        const amt = calcHeal(actor, move);
        target.hp.current = Math.min(target.hp.max, target.hp.current + amt);
        return { slot, name: target.displayName, amount: amt, wasKO: false };
      }
      if (!resolveHit(actor, target, move)) return { slot, name: target.displayName, missed: true };
      const { damage, isCrit, elemMod } = calcDamage(actor, target, move);
      target.hp.current = Math.max(0, target.hp.current - damage);
      const wasKO = !target.isKnockedOut && target.hp.current <= 0;
      if (wasKO) target.isKnockedOut = true;
      return { slot, name: target.displayName, amount: damage, wasKO, isCrit, elemMod };
    });
    return { type: 'multi', actorName: actor.displayName, moveName: move.name, damageClass: move.damageClass, targetSide: tgtSide, hits };
  }

  // Single-target heal
  if (move.damageClass === 'heal') {
    const tgtSlot = action.targetSlot || action.actorSlot;
    const target  = bs[action.targetSide || action.actorSide][tgtSlot];
    if (!target || target.isKnockedOut) {
      return { type: 'miss', actorName: actor.displayName, moveName: move.name };
    }
    actor.mp.current  = Math.max(0, actor.mp.current - move.mpCost);
    const amt = calcHeal(actor, move);
    target.hp.current = Math.min(target.hp.max, target.hp.current + amt);
    return { type: 'heal', actorName: actor.displayName, moveName: move.name, targetName: target.displayName, amount: amt };
  }

  // Single-target damage — retarget if needed
  const tgtSide = action.targetSide;
  const tgtSlot = findValidTarget(tgtSide, action.targetSlot);
  if (!tgtSlot) {
    return { type: 'no_target', actorName: actor.displayName, moveName: move.name };
  }

  const target  = bs[tgtSide][tgtSlot];
  const retargeted = tgtSlot !== action.targetSlot;

  if (!resolveHit(actor, target, move)) {
    return { type: 'miss', actorName: actor.displayName, moveName: move.name, targetName: target.displayName };
  }

  actor.mp.current = Math.max(0, actor.mp.current - move.mpCost);
  const { damage, isCrit, elemMod } = calcDamage(actor, target, move);
  target.hp.current = Math.max(0, target.hp.current - damage);
  const wasKO = !target.isKnockedOut && target.hp.current <= 0;
  if (wasKO) target.isKnockedOut = true;

  return {
    type: isCrit ? 'crit' : 'damage',
    actorName: actor.displayName,
    moveName: move.name,
    targetName: target.displayName,
    targetSide: tgtSide,
    targetSlot: tgtSlot,
    amount: damage,
    elemMod,
    isCrit,
    wasKO,
    retargeted,
  };
}
