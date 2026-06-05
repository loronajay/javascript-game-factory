export function buildBoardViewModel(state, cardsById, { revealOpponentHand = false } = {}) {
  return {
    phase: state.phase,
    currentPlayerId: state.currentPlayerId,
    currentPlayerName: state.players[state.currentPlayerId].name,
    players: state.playerOrder.map((playerId) => {
      const isCurrentPlayer = playerId === state.currentPlayerId;
      const handRevealed = !isCurrentPlayer && revealOpponentHand;
      return playerView(state.players[playerId], cardsById, isCurrentPlayer, handRevealed);
    }),
    log: state.log,
  };
}

function playerView(player, cardsById, isCurrentPlayer, handRevealed = false) {
  return {
    id: player.id,
    name: player.name,
    isCurrentPlayer,
    hpLabel: `${player.currentHp}/${player.maxHp}`,
    starsLabel: `${player.stars.available - player.stars.spent}/${player.stars.available}`,
    starsRemaining: player.stars.available - player.stars.spent,
    starsAvailable: player.stars.available,
    starsSpent: player.stars.spent,
    starsRemaining: player.stars.available - player.stars.spent,
    finalCleanupStarted: player.finalCleanupStarted ?? false,
    turnsStarted: player.turnsStarted,
    deckCount: player.deck.length,
    graveyardCount: player.graveyard.length,
    hand: player.hand.map((cardInstance) =>
      isCurrentPlayer || handRevealed ? cardSummary(cardInstance, cardsById) : hiddenCardSummary(cardInstance),
    ),
    monsterSlots: player.monsterSlots.map((monster) =>
      monster ? monsterSummary(monster, cardsById) : null,
    ),
    activeLater: player.activeLater.map((cardInstance) => cardSummary(cardInstance, cardsById)),
  };
}

function hiddenCardSummary(cardInstance) {
  return {
    instanceId: cardInstance.instanceId,
    cardId: null,
    type: "hidden",
    name: "Hidden card",
    art: "",
    hidden: true,
  };
}

function cardSummary(cardInstance, cardsById) {
  const card = cardsById[cardInstance.cardId];
  return {
    instanceId: cardInstance.instanceId,
    cardId: cardInstance.cardId,
    type: card?.type ?? "unknown",
    name: card?.name ?? cardInstance.cardId,
    art: card?.art ?? "",
    rulesText: card?.rulesText ?? "",
    summonCostStars: card?.summonCostStars,
    playCostStars: card?.playCostStars,
    baseEquipCostStars: card?.baseEquipCostStars,
    printedHp: card?.printedHp,
    printedStrength: card?.printedStrength,
    effects: card?.effects ?? [],
    effectSlots: card?.effectSlots ?? [],
  };
}

function monsterSummary(monster, cardsById) {
  const card = cardsById[monster.cardId];
  return {
    instanceId: monster.instanceId,
    cardInstanceId: monster.cardInstanceId,
    cardId: monster.cardId,
    type: "monster",
    name: card?.name ?? monster.cardId,
    art: card?.art ?? "",
    rulesText: card?.rulesText ?? "",
    summonCostStars: card?.summonCostStars,
    playCostStars: card?.playCostStars,
    baseEquipCostStars: card?.baseEquipCostStars,
    effectSlots: card?.effectSlots ?? [],
    hpLabel: `${monster.currentHp}/${monster.maxHp}`,
    strengthLabel: String(monster.currentStrength),
    currentHp: monster.currentHp,
    maxHp: monster.maxHp,
    currentStrength: monster.currentStrength,
    hasAttackedThisTurn: monster.hasAttackedThisTurn,
    actionRestrictions: monster.actionRestrictions ?? [],
    attachmentCount: monster.attachments.length,
    attachments: monster.attachments.map((cardInstance) => cardSummary(cardInstance, cardsById)),
  };
}
