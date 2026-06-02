const STARTING_HP = 20;
const STARTING_HAND_SIZE = 5;
const MONSTER_SLOT_COUNT = 4;
const STARS_PER_TURN = 5;
const NORMAL_ATTACK_COST = 2;
const DEFAULT_ACCESSORY_CAPACITY = 1;

export function createMatch({ cardsById, players }) {
  assertPlayerCount(players);

  const playerOrder = players.map((player) => player.id);
  const statePlayers = Object.fromEntries(
    players.map((player) => {
      const deck = expandDeck(player.deck);
      const { drawn, remainingDeck } = drawFromDeck(deck, STARTING_HAND_SIZE);
      return [
        player.id,
        {
          id: player.id,
          name: player.name,
          deckId: player.deck.id,
          currentHp: STARTING_HP,
          maxHp: STARTING_HP,
          stars: { available: 0, spent: 0 },
          delayedStarsOwed: 0,
          turnsStarted: 0,
          deck: remainingDeck,
          hand: drawn,
          monsterSlots: Array.from({ length: MONSTER_SLOT_COUNT }, () => null),
          activeLater: [],
          graveyard: [],
        },
      ];
    }),
  );

  return {
    phase: "betweenTurns",
    playerOrder,
    currentPlayerId: playerOrder[0],
    players: statePlayers,
    log: [],
    nextMonsterInstanceNumber: 1,
    cardsById,
  };
}

export function startTurn(state) {
  const player = state.players[state.currentPlayerId];
  const drawCount = player.turnsStarted === 0 ? firstTurnDrawCount(state, player.id) : 1;
  const { drawn, remainingDeck, deckOutDamage } = drawFromDeck(player.deck, drawCount);
  const delayedStars = Math.min(player.delayedStarsOwed, STARS_PER_TURN);
  const nextPlayer = {
    ...player,
    turnsStarted: player.turnsStarted + 1,
    stars: {
      available: STARS_PER_TURN,
      spent: delayedStars,
    },
    delayedStarsOwed: 0,
    deck: remainingDeck,
    hand: [...player.hand, ...drawn],
    monsterSlots: player.monsterSlots.map((monster) =>
      monster
        ? {
            ...monster,
            hasAttackedThisTurn: false,
            abilityUses: {},
          }
        : null,
    ),
    currentHp: Math.max(0, player.currentHp - deckOutDamage),
  };

  return replacePlayer(
    {
      ...state,
      phase: "main",
      log: appendLog(state, `${player.name} starts turn and draws ${drawn.length}.`),
    },
    player.id,
    nextPlayer,
  );
}

export function endTurn(state) {
  const currentPlayer = state.players[state.currentPlayerId];
  const cleanedCurrentPlayer = {
    ...currentPlayer,
    monsterSlots: currentPlayer.monsterSlots.map((monster) =>
      monster ? clearExpiredControllerTurnRestrictions(monster) : null,
    ),
  };
  const nextPlayerId = nextPlayerAfter(state, state.currentPlayerId);
  return {
    ...replacePlayer(state, currentPlayer.id, cleanedCurrentPlayer),
    phase: "betweenTurns",
    currentPlayerId: nextPlayerId,
    log: appendLog(state, `${state.players[state.currentPlayerId].name} ends turn.`),
  };
}

export function summonMonster(state, { playerId, handCardInstanceId, slotIndex }) {
  const player = requirePlayer(state, playerId);
  const cardInstance = requireHandCard(player, handCardInstanceId);
  const card = requireCard(state, cardInstance.cardId);

  if (state.currentPlayerId !== playerId) throw new Error("Only the active player can summon.");
  if (card.type !== "monster") throw new Error(`${card.name} is not a monster.`);
  if (!isValidSlot(slotIndex)) throw new Error("Monster slot does not exist.");
  if (player.monsterSlots[slotIndex]) throw new Error("Monster slot is already occupied.");
  requireStars(player, card.summonCostStars);

  const monster = {
    instanceId: `monster_${state.nextMonsterInstanceNumber}`,
    cardInstanceId: cardInstance.instanceId,
    cardId: card.id,
    ownerId: playerId,
    currentHp: card.printedHp,
    maxHp: card.printedHp,
    currentStrength: card.printedStrength,
    attachments: [],
    actionRestrictions: [],
    hasAttackedThisTurn: false,
    abilityUses: {},
  };
  const nextSlots = [...player.monsterSlots];
  nextSlots[slotIndex] = monster;

  const nextPlayer = {
    ...player,
    stars: spendStars(player, card.summonCostStars),
    hand: player.hand.filter((handCard) => handCard.instanceId !== handCardInstanceId),
    monsterSlots: nextSlots,
  };

  return replacePlayer(
    {
      ...state,
      nextMonsterInstanceNumber: state.nextMonsterInstanceNumber + 1,
      log: appendLog(state, `${player.name} summons ${card.name}.`),
    },
    playerId,
    nextPlayer,
  );
}

export function playLaterCard(state, { playerId, handCardInstanceId, targetPlayerId, targetSlotIndex } = {}) {
  const player = requirePlayer(state, playerId);
  const cardInstance = requireHandCard(player, handCardInstanceId);
  const card = requireCard(state, cardInstance.cardId);

  if (state.currentPlayerId !== playerId) throw new Error("Only the active player can play Later cards.");
  if (card.type !== "later") throw new Error(`${card.name} is not a Later card.`);
  if (isSetupTurn(player) && isOffensiveCard(card)) {
    throw new Error("Offensive actions are not allowed during setup turn.");
  }
  validateLaterTargets(state, playerId, card, { targetPlayerId, targetSlotIndex });
  requireStars(player, card.playCostStars);

  let nextPlayer = {
    ...player,
    stars: spendStars(player, card.playCostStars),
    hand: player.hand.filter((handCard) => handCard.instanceId !== handCardInstanceId),
    graveyard: [...player.graveyard, cardInstance],
  };
  let nextState = replacePlayer(state, playerId, nextPlayer);
  nextState = applyLaterCardEffects(nextState, playerId, card, { targetPlayerId, targetSlotIndex });

  return {
    ...nextState,
    log: appendLog(state, `${player.name} plays ${card.name}.`),
  };
}

function applyLaterCardEffects(state, playerId, card, target) {
  return (card.effects ?? []).reduce((nextState, effect) => {
    if (effect.family === "restriction" && effect.target === "enemyMonster") {
      return applyMonsterRestriction(nextState, target.targetPlayerId, target.targetSlotIndex, {
        blockedActionCategory: effect.payload?.blockedActionCategory,
        remainingControllerTurns: effect.payload?.turns ?? 1,
      });
    }
    if (effect.family === "maxHpChange" && effect.target === "selfPlayer") {
      return replacePlayer(
        nextState,
        playerId,
        applySimpleCardEffects(nextState.players[playerId], { effects: [effect] }),
      );
    }
    return nextState;
  }, state);
}

function applyMonsterRestriction(state, playerId, slotIndex, restriction) {
  const player = requirePlayer(state, playerId);
  const monster = requireMonsterSlot(player, slotIndex);
  const nextSlots = [...player.monsterSlots];
  nextSlots[slotIndex] = {
    ...monster,
    actionRestrictions: [...(monster.actionRestrictions ?? []), restriction],
  };
  return replacePlayer(state, playerId, {
    ...player,
    monsterSlots: nextSlots,
  });
}

function validateLaterTargets(state, playerId, card, target) {
  const needsEnemyMonster = (card.effects ?? []).some((effect) => effect.target === "enemyMonster");
  if (!needsEnemyMonster) return;
  if (target.targetPlayerId === undefined || target.targetSlotIndex === undefined) {
    throw new Error("An enemy monster target is required.");
  }
  if (target.targetPlayerId === playerId) throw new Error("Later card must target an enemy monster.");
  requireMonsterSlot(requirePlayer(state, target.targetPlayerId), target.targetSlotIndex);
}

function isOffensiveCard(card) {
  return (card.effects ?? []).some((effect) =>
    ["enemyMonster", "opponentPlayer", "opponentHand", "opponentDeck", "opponentGraveyard"].includes(effect.target),
  );
}

function clearExpiredControllerTurnRestrictions(monster) {
  const restrictions = (monster.actionRestrictions ?? [])
    .map((restriction) => ({
      ...restriction,
      remainingControllerTurns: restriction.remainingControllerTurns - 1,
    }))
    .filter((restriction) => restriction.remainingControllerTurns > 0);
  return {
    ...monster,
    actionRestrictions: restrictions,
  };
}

function requireNoOffensiveRestriction(monster) {
  if ((monster.actionRestrictions ?? []).some((restriction) => restriction.blockedActionCategory === "offensive")) {
    throw new Error("This monster is blocked from offensive actions.");
  }
}

export function equipAccessory(state, { playerId, handCardInstanceId, monsterSlotIndex }) {
  const player = requirePlayer(state, playerId);
  const cardInstance = requireHandCard(player, handCardInstanceId);
  const card = requireCard(state, cardInstance.cardId);
  const monster = requireMonsterSlot(player, monsterSlotIndex);
  const equipCost = card.baseEquipCostStars ?? 0;

  if (state.currentPlayerId !== playerId) throw new Error("Only the active player can equip accessories.");
  if (card.type !== "accessory") throw new Error(`${card.name} is not an accessory.`);
  if (monster.attachments.length >= DEFAULT_ACCESSORY_CAPACITY) {
    throw new Error("Monster accessory capacity is full.");
  }
  requireStars(player, equipCost);

  const nextSlots = [...player.monsterSlots];
  nextSlots[monsterSlotIndex] = {
    ...monster,
    attachments: [...monster.attachments, cardInstance],
  };

  return replacePlayer(
    {
      ...state,
      log: appendLog(state, `${player.name} equips ${card.name}.`),
    },
    playerId,
    {
      ...player,
      stars: spendStars(player, equipCost),
      hand: player.hand.filter((handCard) => handCard.instanceId !== handCardInstanceId),
      monsterSlots: nextSlots,
    },
  );
}

export function countCardsInPlayWithTag(state, tag) {
  const normalizedTag = normalizeTag(tag);
  if (!normalizedTag) return 0;

  return state.playerOrder.reduce((count, playerId) => {
    const player = state.players[playerId];
    return count + cardsInPlayForPlayer(player).filter((cardInstance) =>
      cardHasTag(state.cardsById[cardInstance.cardId], normalizedTag),
    ).length;
  }, 0);
}

export function normalAttack(
  state,
  { attackerPlayerId, attackerSlotIndex, targetPlayerId, targetSlotIndex, roll },
) {
  const attackerPlayer = requirePlayer(state, attackerPlayerId);
  const targetPlayer = requirePlayer(state, targetPlayerId);
  const attacker = requireMonsterSlot(attackerPlayer, attackerSlotIndex);

  if (state.currentPlayerId !== attackerPlayerId) throw new Error("Only the active player can attack.");
  if (isSetupTurn(attackerPlayer)) throw new Error("Offensive actions are not allowed during setup turn.");
  requireNoOffensiveRestriction(attacker);
  if (attackerPlayerId === targetPlayerId) throw new Error("Normal attacks must target the opponent.");
  if (attacker.hasAttackedThisTurn) throw new Error("This monster has already attacked this turn.");
  requireRoll(roll);
  requireStars(attackerPlayer, NORMAL_ATTACK_COST);

  const enemyHasMonsters = targetPlayer.monsterSlots.some(Boolean);
  if (enemyHasMonsters && !isValidSlot(targetSlotIndex)) {
    throw new Error("A monster target is required while the opponent has monsters.");
  }
  if (!enemyHasMonsters && targetSlotIndex !== null && targetSlotIndex !== undefined) {
    throw new Error("Direct attacks should not include a monster target.");
  }

  const nextAttackerSlots = [...attackerPlayer.monsterSlots];
  nextAttackerSlots[attackerSlotIndex] = {
    ...attacker,
    hasAttackedThisTurn: true,
  };
  let nextAttackerPlayer = {
    ...attackerPlayer,
    stars: spendStars(attackerPlayer, NORMAL_ATTACK_COST),
    monsterSlots: nextAttackerSlots,
  };
  let nextTargetPlayer = targetPlayer;

  if (roll !== 1) {
    const damage = attacker.currentStrength + (roll === 6 ? 2 : 0);
    if (enemyHasMonsters) {
      nextTargetPlayer = damageMonster(targetPlayer, targetSlotIndex, damage);
    } else {
      nextTargetPlayer = damagePlayer(targetPlayer, damage);
    }
  }

  let nextState = replacePlayer(state, attackerPlayerId, nextAttackerPlayer);
  nextState = replacePlayer(nextState, targetPlayerId, nextTargetPlayer);
  return {
    ...nextState,
    log: appendLog(
      state,
      `${attackerPlayer.name} attacks with ${requireCard(state, attacker.cardId).name} and rolls ${roll}.`,
    ),
  };
}

function applySimpleCardEffects(player, card) {
  return (card.effects ?? []).reduce((nextPlayer, effect) => {
    if (effect.family === "maxHpChange" && effect.target === "selfPlayer") {
      const amount = effect.amount ?? 0;
      return {
        ...nextPlayer,
        maxHp: nextPlayer.maxHp + amount,
        currentHp: effect.currentHpFollowsMaxIncrease
          ? nextPlayer.currentHp + amount
          : Math.min(nextPlayer.currentHp, nextPlayer.maxHp + amount),
      };
    }
    return nextPlayer;
  }, player);
}

function cardsInPlayForPlayer(player) {
  const monsterCards = player.monsterSlots.flatMap((monster) =>
    monster ? [{ cardId: monster.cardId }, ...monster.attachments] : [],
  );
  return [...monsterCards, ...player.activeLater];
}

function cardHasTag(card, normalizedTag) {
  return (card?.tags ?? []).some((tag) => normalizeTag(tag) === normalizedTag);
}

function normalizeTag(tag) {
  return typeof tag === "string" ? tag.trim().toLowerCase() : "";
}

function isSetupTurn(player) {
  return player.turnsStarted === 1;
}

function expandDeck(deck) {
  const cards = [];
  deck.entries.forEach((entry) => {
    for (let index = 0; index < entry.count; index += 1) {
      cards.push({
        instanceId: `${deck.id}_${entry.cardId}_${index + 1}`,
        cardId: entry.cardId,
        ownerDeckId: deck.id,
      });
    }
  });
  return cards;
}

function drawFromDeck(deck, count) {
  const drawn = deck.slice(0, count);
  const failedDraws = Math.max(0, count - drawn.length);
  return {
    drawn,
    remainingDeck: deck.slice(drawn.length),
    deckOutDamage: failedDraws * 2,
  };
}

function damageMonster(player, slotIndex, damage) {
  const monster = requireMonsterSlot(player, slotIndex);
  const nextHp = monster.currentHp - damage;
  const nextSlots = [...player.monsterSlots];

  if (nextHp > 0) {
    nextSlots[slotIndex] = { ...monster, currentHp: nextHp };
    return { ...player, monsterSlots: nextSlots };
  }

  const overflowDamage = Math.abs(nextHp);
  nextSlots[slotIndex] = null;
  return {
    ...damagePlayer(player, overflowDamage),
    monsterSlots: nextSlots,
    graveyard: [
      ...player.graveyard,
      { instanceId: monster.cardInstanceId, cardId: monster.cardId, reason: "ko" },
      ...monster.attachments,
    ],
  };
}

function damagePlayer(player, damage) {
  return {
    ...player,
    currentHp: Math.max(0, player.currentHp - damage),
  };
}

function firstTurnDrawCount(state, playerId) {
  return state.playerOrder.indexOf(playerId) === 0 ? 1 : 2;
}

function nextPlayerAfter(state, playerId) {
  const index = state.playerOrder.indexOf(playerId);
  return state.playerOrder[(index + 1) % state.playerOrder.length];
}

function replacePlayer(state, playerId, player) {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
    },
  };
}

function appendLog(state, message) {
  return [...state.log, message].slice(-24);
}

function spendStars(player, amount) {
  return {
    ...player.stars,
    spent: player.stars.spent + amount,
  };
}

function requireStars(player, amount) {
  if (player.stars.spent + amount > player.stars.available) {
    throw new Error(`Not enough stars. ${amount} required.`);
  }
}

function requirePlayer(state, playerId) {
  const player = state.players[playerId];
  if (!player) throw new Error(`Unknown player "${playerId}".`);
  return player;
}

function requireHandCard(player, instanceId) {
  const card = player.hand.find((handCard) => handCard.instanceId === instanceId);
  if (!card) throw new Error("Card is not in that player's hand.");
  return card;
}

function requireCard(state, cardId) {
  const card = state.cardsById[cardId];
  if (!card) throw new Error(`Unknown card "${cardId}".`);
  return card;
}

function requireMonsterSlot(player, slotIndex) {
  if (!isValidSlot(slotIndex)) throw new Error("Monster slot does not exist.");
  const monster = player.monsterSlots[slotIndex];
  if (!monster) throw new Error("Monster slot is empty.");
  return monster;
}

function requireRoll(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new Error("Roll must be a d6 result from 1 to 6.");
  }
}

function isValidSlot(slotIndex) {
  return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < MONSTER_SLOT_COUNT;
}

function assertPlayerCount(players) {
  if (!Array.isArray(players) || players.length !== 2) {
    throw new Error("A match requires exactly two players.");
  }
}
