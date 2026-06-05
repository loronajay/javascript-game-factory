export const ATTACK_RESOLUTION_MS = 2400;
const PLAYER_IDLE_AVATAR_SRC = "player-avatars/idle.png";
const PLAYER_HURT_AVATAR_SRC = "player-avatars/hurt.png";

export function createAttackResolution(state, cardsById, attack) {
  const attacker = requireMonster(state, attack.attackerPlayerId, attack.attackerSlotIndex);
  const target = attack.targetSlotIndex === null || attack.targetSlotIndex === undefined
    ? requirePlayerTarget(state, attack.targetPlayerId)
    : requireMonsterTarget(state, cardsById, attack.targetPlayerId, attack.targetSlotIndex);
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
      kind: target.kind,
      playerId: attack.targetPlayerId,
      slotIndex: target.slotIndex,
      beforeHp: target.currentHp,
      afterHp: targetAfterHp,
      card: {
        ...target.card,
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

function requireMonsterTarget(state, cardsById, playerId, slotIndex) {
  const monster = requireMonster(state, playerId, slotIndex);
  return {
    kind: "monster",
    slotIndex,
    currentHp: monster.currentHp,
    card: monsterCardView(monster, cardsById),
  };
}

function requirePlayerTarget(state, playerId) {
  const player = state.players[playerId];
  if (!player) throw new Error("Attack resolution requires a player target.");
  return {
    kind: "player",
    slotIndex: null,
    currentHp: player.currentHp,
    card: {
      instanceId: `${player.id}_player_target`,
      cardId: null,
      type: "player",
      name: player.name,
      art: PLAYER_IDLE_AVATAR_SRC,
      hurtArt: PLAYER_HURT_AVATAR_SRC,
      rulesText: "",
      currentHp: player.currentHp,
      maxHp: player.maxHp,
      currentStrength: 0,
      effectSlots: [],
    },
  };
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
