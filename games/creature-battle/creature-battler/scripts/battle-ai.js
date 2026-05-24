function selectAiCommands() {
  return SLOT_NAMES
    .map(slot => {
      const c = state.battleState.opponent[slot];
      return (c && !c.isKnockedOut) ? buildAiAction(c, slot) : null;
    })
    .filter(Boolean);
}

function buildAiAction(creature, slot) {
  const bs = state.battleState;

  // Challenge taunt: forced to target the challenger if still alive
  if (creature.isChallengedBy) {
    const { side: cSide, slot: cSlot } = creature.isChallengedBy;
    const challenger = bs[cSide]?.[cSlot];
    if (challenger && !challenger.isKnockedOut) {
      const dmgMove = creature.moves
        .filter(m => (m.damageClass === 'physical' || m.damageClass === 'magic') && m.mpCost <= creature.mp.current)
        .sort((a, b) => b.basePower - a.basePower)[0];
      const move = dmgMove || getMoveData('basic_attack');
      return { actorSide: 'opponent', actorSlot: slot, commandType: move.category === 'art' ? 'art' : 'attack', moveId: move.id, targetSide: cSide, targetSlot: cSlot, speed: getEffectiveSpeed(creature) };
    }
    creature.isChallengedBy = null; // challenger KO'd, ignore
  }

  // Self-heal: use if this creature itself is below 50% HP
  const selfHealMove = creature.moves.find(m => m.damageClass === 'heal' && m.targeting === 'self' && m.mpCost <= creature.mp.current);
  if (selfHealMove && creature.hp.current / creature.hp.max < 0.5) {
    return { actorSide: 'opponent', actorSlot: slot, commandType: 'art', moveId: selfHealMove.id, targetSide: 'opponent', targetSlot: slot, speed: getEffectiveSpeed(creature) };
  }

  // Ally-heal: use on the most-hurt teammate below 50% HP
  const allyHealMove = creature.moves.find(m => m.damageClass === 'heal' && m.targeting === 'single_ally' && m.mpCost <= creature.mp.current);
  if (allyHealMove) {
    const hurtAlly = SLOT_NAMES
      .map(s => bs.opponent[s])
      .filter(c => c && !c.isKnockedOut && c.hp.current / c.hp.max < 0.5)
      .sort((a, b) => a.hp.current / a.hp.max - b.hp.current / b.hp.max)[0];
    if (hurtAlly) {
      return { actorSide: 'opponent', actorSlot: slot, commandType: 'art', moveId: allyHealMove.id, targetSide: 'opponent', targetSlot: hurtAlly.slot, speed: getEffectiveSpeed(creature) };
    }
  }

  // Best affordable damage move
  const dmgMove = creature.moves
    .filter(m => (m.damageClass === 'physical' || m.damageClass === 'magic') && m.mpCost <= creature.mp.current)
    .sort((a, b) => b.basePower - a.basePower)[0];

  const move   = dmgMove || getMoveData('basic_attack');
  const target = pickAiTarget('player');
  return {
    actorSide: 'opponent',
    actorSlot: slot,
    commandType: move.category === 'art' ? 'art' : 'attack',
    moveId: move.id,
    targetSide: 'player',
    targetSlot: target,
    speed: getEffectiveSpeed(creature),
  };
}

function pickAiTarget(side) {
  // Target the alive player creature with the lowest current HP
  return SLOT_NAMES
    .filter(s => { const c = state.battleState[side][s]; return c && !c.isKnockedOut; })
    .sort((a, b) => state.battleState[side][a].hp.current - state.battleState[side][b].hp.current)[0] || 'top';
}
