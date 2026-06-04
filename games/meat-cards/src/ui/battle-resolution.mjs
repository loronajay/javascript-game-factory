export const ATTACK_RESOLUTION_MS = 2400;

export function createAttackResolution(state, cardsById, attack) {
  const attacker = requireMonster(state, attack.attackerPlayerId, attack.attackerSlotIndex);
  const target = requireMonster(state, attack.targetPlayerId, attack.targetSlotIndex);
  const hit = attack.roll !== 1;
  const damage = hit ? attacker.currentStrength + (attack.roll === 6 ? 2 : 0) : 0;
  const targetAfterHp = Math.max(0, target.currentHp - damage);
  const visibleHpLoss = target.currentHp - targetAfterHp;

  return {
    type: "attack",
    durationMs: ATTACK_RESOLUTION_MS,
    roll: attack.roll,
    hit,
    damage,
    floatText: hit ? `-${visibleHpLoss} HP` : "MISS!",
    attacker: {
      playerId: attack.attackerPlayerId,
      slotIndex: attack.attackerSlotIndex,
      card: monsterCardView(attacker, cardsById),
    },
    target: {
      playerId: attack.targetPlayerId,
      slotIndex: attack.targetSlotIndex,
      beforeHp: target.currentHp,
      afterHp: targetAfterHp,
      card: {
        ...monsterCardView(target, cardsById),
        currentHp: targetAfterHp,
      },
    },
  };
}

function requireMonster(state, playerId, slotIndex) {
  const monster = state.players[playerId]?.monsterSlots[slotIndex];
  if (!monster) throw new Error("Attack resolution requires a monster card.");
  return monster;
}

function monsterCardView(monster, cardsById) {
  const card = cardsById[monster.cardId];
  return {
    instanceId: monster.instanceId,
    cardId: monster.cardId,
    type: "monster",
    name: card?.name ?? monster.cardId,
    art: card?.art ?? "",
    rulesText: card?.rulesText ?? "",
    summonCostStars: card?.summonCostStars,
    playCostStars: card?.playCostStars,
    baseEquipCostStars: card?.baseEquipCostStars,
    currentHp: monster.currentHp,
    maxHp: monster.maxHp,
    currentStrength: monster.currentStrength,
    effectSlots: card?.effectSlots ?? [],
  };
}
