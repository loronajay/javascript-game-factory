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

  // Consider healing if a teammate is below 50% HP
  const healMove = creature.moves.find(m => m.damageClass === 'heal' && m.mpCost <= creature.mp.current);
  if (healMove) {
    const hurtAlly = SLOT_NAMES
      .map(s => bs.opponent[s])
      .filter(c => c && !c.isKnockedOut && c.hp.current / c.hp.max < 0.5)
      .sort((a, b) => a.hp.current / a.hp.max - b.hp.current / b.hp.max)[0];
    if (hurtAlly) {
      return { actorSide: 'opponent', actorSlot: slot, commandType: 'art', moveId: healMove.id, targetSide: 'opponent', targetSlot: hurtAlly.slot, speed: creature.stats.speed };
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
    speed: creature.stats.speed,
  };
}

function pickAiTarget(side) {
  // Target the alive player creature with the lowest current HP
  return SLOT_NAMES
    .filter(s => { const c = state.battleState[side][s]; return c && !c.isKnockedOut; })
    .sort((a, b) => state.battleState[side][a].hp.current - state.battleState[side][b].hp.current)[0] || 'top';
}
