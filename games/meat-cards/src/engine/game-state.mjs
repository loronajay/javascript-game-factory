const STARTING_HP = 20;
const STARTING_HAND_SIZE = 5;
const HAND_LIMIT = 7;
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
      const { drawn, remainingDeck, deckOutDamage } = drawFromDeck(deck, STARTING_HAND_SIZE);
      return [
        player.id,
        {
          id: player.id,
          name: player.name,
          deckId: player.deck.id,
          currentHp: Math.max(0, STARTING_HP - deckOutDamage),
          maxHp: STARTING_HP,
          stars: { available: 0, spent: 0 },
          delayedStarsOwed: 0,
          finalCleanupStarted: false,
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
    finalCleanupStarted: false,
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

  let nextState = replacePlayer(
    {
      ...state,
      phase: "main",
      log: appendLog(state, `${player.name} starts turn and draws ${drawn.length}.`),
    },
    player.id,
    nextPlayer,
  );

  nextState = applyStartOfTurnPassives(nextState, player.id);

  return nextState;
}

export function endTurn(
  state,
  { unusedStarDiscardInstanceIds = [], handLimitDiscardInstanceIds = [] } = {},
) {
  const currentPlayer = state.players[state.currentPlayerId];
  const unusedStars = currentPlayer.stars.available - currentPlayer.stars.spent;
  assertCardInstanceIds(unusedStarDiscardInstanceIds, "Unused-star discards");
  assertCardInstanceIds(handLimitDiscardInstanceIds, "Hand-limit discards");
  if (unusedStarDiscardInstanceIds.length > unusedStars) {
    throw new Error("Cannot discard more cards than unused stars.");
  }

  let cleanedCurrentPlayer = discardCardsFromHand(
    currentPlayer,
    unusedStarDiscardInstanceIds,
    "unusedStars",
  );
  const uncoveredUnusedStars = unusedStars - unusedStarDiscardInstanceIds.length;
  if (uncoveredUnusedStars > 0) {
    cleanedCurrentPlayer = damagePlayer(cleanedCurrentPlayer, uncoveredUnusedStars);
  }

  const excessHandCards = Math.max(0, cleanedCurrentPlayer.hand.length - HAND_LIMIT);
  if (excessHandCards === 0 && handLimitDiscardInstanceIds.length > 0) {
    throw new Error("No hand-limit discards are needed.");
  }
  if (excessHandCards > 0 && handLimitDiscardInstanceIds.length !== excessHandCards) {
    throw new Error(`Player must discard down to ${HAND_LIMIT} cards before ending the turn.`);
  }
  cleanedCurrentPlayer = discardCardsFromHand(
    cleanedCurrentPlayer,
    handLimitDiscardInstanceIds,
    "handLimit",
  );

  let nextLog = state.log;
  if (unusedStarDiscardInstanceIds.length > 0) {
    nextLog = appendLogMessage(
      nextLog,
      `${currentPlayer.name} discards ${unusedStarDiscardInstanceIds.length} to cover unused stars.`,
    );
  }
  if (uncoveredUnusedStars > 0) {
    nextLog = appendLogMessage(
      nextLog,
      `${currentPlayer.name} takes ${uncoveredUnusedStars} damage from unused stars.`,
    );
  }
  if (handLimitDiscardInstanceIds.length > 0) {
    nextLog = appendLogMessage(
      nextLog,
      `${currentPlayer.name} discards ${handLimitDiscardInstanceIds.length} for hand limit.`,
    );
  }

  const finalCurrentPlayer = {
    ...cleanedCurrentPlayer,
    finalCleanupStarted: false,
    monsterSlots: cleanedCurrentPlayer.monsterSlots.map((monster) =>
      monster ? clearExpiredControllerTurnRestrictions(monster) : null,
    ),
  };
  const nextPlayerId = nextPlayerAfter(state, state.currentPlayerId);
  return {
    ...replacePlayer(state, currentPlayer.id, finalCurrentPlayer),
    phase: "betweenTurns",
    currentPlayerId: nextPlayerId,
    log: appendLogMessage(nextLog, `${state.players[state.currentPlayerId].name} ends turn.`),
  };
}

export function summonMonster(state, { playerId, handCardInstanceId, slotIndex }) {
  const player = requirePlayer(state, playerId);
  const cardInstance = requireHandCard(player, handCardInstanceId);
  const card = requireCard(state, cardInstance.cardId);

  if (state.currentPlayerId !== playerId) throw new Error("Only the active player can summon.");
  requireActionsAvailable(player);
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
  requireActionsAvailable(player);
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
    if (effect.family === "damage" && effect.target === "opponentPlayer") {
      return replacePlayer(
        nextState,
        target.targetPlayerId,
        damagePlayer(nextState.players[target.targetPlayerId], effect.amount ?? 0),
      );
    }
    if (effect.family === "returnToHand" && effect.target === "selfMonster") {
      return returnMonsterToHand(nextState, target.targetPlayerId, target.targetSlotIndex);
    }
    if (effect.family === "massKoWithSplashDamage") {
      return applyMassKoWithSplashDamage(nextState, playerId, effect.payload);
    }
    return nextState;
  }, state);
}

function applyMassKoWithSplashDamage(state, _playerId, payload) {
  const monsterCounts = {};
  for (const pid of state.playerOrder) {
    monsterCounts[pid] = state.players[pid].monsterSlots.filter(Boolean).length;
  }

  const allMonstersToKo = state.playerOrder.flatMap((pid) =>
    state.players[pid].monsterSlots
      .map((monster, slotIndex) => (monster ? { pid, slotIndex } : null))
      .filter(Boolean),
  );

  let nextState = state;
  for (const { pid, slotIndex } of allMonstersToKo) {
    if (nextState.players[pid].monsterSlots[slotIndex]) {
      nextState = koMonsterNoOverflow(nextState, pid, slotIndex);
    }
  }

  const splashDamage = payload?.splashDamage ?? 5;
  for (const pid of state.playerOrder) {
    nextState = replacePlayer(nextState, pid, damagePlayer(nextState.players[pid], splashDamage));
  }

  const extraPerMonster = payload?.extraDamagePerExtraMonster ?? 1;
  if (extraPerMonster > 0) {
    const [pid1, pid2] = state.playerOrder;
    const diff = monsterCounts[pid1] - monsterCounts[pid2];
    if (diff > 0) {
      nextState = replacePlayer(nextState, pid1, damagePlayer(nextState.players[pid1], diff * extraPerMonster));
    } else if (diff < 0) {
      nextState = replacePlayer(nextState, pid2, damagePlayer(nextState.players[pid2], Math.abs(diff) * extraPerMonster));
    }
  }

  return nextState;
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
  if (needsEnemyMonster) {
    if (target.targetPlayerId === undefined || target.targetSlotIndex === undefined) {
      throw new Error("An enemy monster target is required.");
    }
    if (target.targetPlayerId === playerId) throw new Error("Later card must target an enemy monster.");
    requireMonsterSlot(requirePlayer(state, target.targetPlayerId), target.targetSlotIndex);
  }

  const needsOpponentPlayer = (card.effects ?? []).some((effect) => effect.target === "opponentPlayer");
  if (needsOpponentPlayer) {
    if (target.targetPlayerId === undefined) {
      throw new Error("An opponent player target is required.");
    }
    if (target.targetPlayerId === playerId) throw new Error("Later card must target the opponent player.");
    if (target.targetSlotIndex !== null && target.targetSlotIndex !== undefined) {
      throw new Error("Player-target Later cards should not include a monster slot.");
    }
    requirePlayer(state, target.targetPlayerId);
  }

  const needsSelfMonster = (card.effects ?? []).some(
    (e) => e.family === "returnToHand" && e.target === "selfMonster",
  );
  if (needsSelfMonster) {
    if (target.targetPlayerId === undefined || target.targetSlotIndex === undefined) {
      throw new Error("A target monster is required.");
    }
    if (target.targetPlayerId !== playerId) throw new Error("Curfew must target your own monster.");
    requireMonsterSlot(requirePlayer(state, target.targetPlayerId), target.targetSlotIndex);
  }
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

function requireNotBlockedFromAttacking(monster, targetPlayerId, targetSlotIndex) {
  for (const restriction of monster.actionRestrictions ?? []) {
    if (restriction.blockedActionCategory === "allActions") {
      throw new Error("This monster cannot take any actions this turn.");
    }
    if (restriction.blockedActionCategory === "offensive") {
      throw new Error("This monster is blocked from offensive actions.");
    }
    if (
      restriction.blockedActionCategory === "specificTarget" &&
      restriction.blockedTargetPlayerId === targetPlayerId &&
      restriction.blockedTargetSlotIndex === targetSlotIndex
    ) {
      throw new Error("This monster cannot attack that target.");
    }
  }
}

export function equipAccessory(state, { playerId, handCardInstanceId, monsterSlotIndex }) {
  const player = requirePlayer(state, playerId);
  const cardInstance = requireHandCard(player, handCardInstanceId);
  const card = requireCard(state, cardInstance.cardId);
  const monster = requireMonsterSlot(player, monsterSlotIndex);
  const equipCost = card.baseEquipCostStars ?? 0;

  if (state.currentPlayerId !== playerId) throw new Error("Only the active player can equip accessories.");
  requireActionsAvailable(player);
  if (card.type !== "accessory") throw new Error(`${card.name} is not an accessory.`);
  if (monster.attachments.length >= accessoryCapacityForMonster(state, monster)) {
    throw new Error("Monster accessory capacity is full.");
  }
  validateAccessoryEquipRequirements(card, monster);
  requireStars(player, equipCost);

  const nextSlots = [...player.monsterSlots];
  nextSlots[monsterSlotIndex] = applyAccessoryEffectsToMonster({
    ...monster,
    attachments: [...monster.attachments, cardInstance],
  }, card);

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

function accessoryCapacityForMonster(state, monster) {
  const card = requireCard(state, monster.cardId);
  return (card.effectSlots ?? []).reduce((capacity, slot) => {
    return (slot.effects ?? []).reduce((nextCapacity, effect) => {
      if (
        effect.family === "accessorySlotModification" &&
        effect.target === "selfMonster" &&
        effect.payload?.mode === "setCapacity" &&
        Number.isInteger(effect.payload.capacity) &&
        effect.payload.capacity >= 0
      ) {
        return effect.payload.capacity;
      }
      return nextCapacity;
    }, capacity);
  }, DEFAULT_ACCESSORY_CAPACITY);
}

function validateAccessoryEquipRequirements(card, monster) {
  for (const effect of card.effects ?? []) {
    const minimumStrength = effect.payload?.requiresCurrentStrengthGreaterThan;
    if (
      effect.family === "strengthChange" &&
      effect.target === "equippedMonster" &&
      Number.isFinite(minimumStrength) &&
      monster.currentStrength <= minimumStrength
    ) {
      throw new Error(`${card.name} requires a monster with strength above ${minimumStrength}.`);
    }
  }
}

function applyAccessoryEffectsToMonster(monster, card) {
  return (card.effects ?? []).reduce((nextMonster, effect) => {
    if (effect.family === "strengthChange" && effect.target === "equippedMonster") {
      if (effect.payload?.mode === "setToCurrentMaxHp") {
        return { ...nextMonster, currentStrength: nextMonster.maxHp };
      }
      if (effect.payload?.mode === "add" && Number.isFinite(effect.payload.amount)) {
        return { ...nextMonster, currentStrength: nextMonster.currentStrength + effect.payload.amount };
      }
    }
    return nextMonster;
  }, monster);
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
  requireActionsAvailable(attackerPlayer);
  if (isSetupTurn(attackerPlayer)) throw new Error("Offensive actions are not allowed during setup turn.");
  requireNotBlockedFromAttacking(attacker, targetPlayerId, targetSlotIndex);
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
  let nextState = replacePlayer(state, attackerPlayerId, {
    ...attackerPlayer,
    stars: spendStars(attackerPlayer, NORMAL_ATTACK_COST),
    monsterSlots: nextAttackerSlots,
  });
  nextState = {
    ...nextState,
    log: appendLog(
      state,
      `${attackerPlayer.name} attacks with ${requireCard(state, attacker.cardId).name} and rolls ${roll}.`,
    ),
  };

  if (roll !== 1) {
    const damage = attacker.currentStrength + (roll === 6 ? 2 : 0);
    if (enemyHasMonsters) {
      nextState = damageMonsterInState(nextState, targetPlayerId, targetSlotIndex, damage);
      nextState = checkPassivesAfterAttacked(nextState, attackerPlayerId, attackerSlotIndex, targetPlayerId, targetSlotIndex);
    } else {
      nextState = replacePlayer(nextState, targetPlayerId, damagePlayer(nextState.players[targetPlayerId], damage));
    }
  }

  return nextState;
}

export function useActiveAbility(state, {
  playerId,
  monsterSlotIndex,
  abilityId,
  targetPlayerId,
  targetSlotIndex,
  targetHandCardInstanceId,
  choiceOptionId,
}) {
  const player = requirePlayer(state, playerId);
  const monster = requireMonsterSlot(player, monsterSlotIndex);
  const card = requireCard(state, monster.cardId);

  if (state.currentPlayerId !== playerId) throw new Error("Only the active player can use abilities.");
  requireActionsAvailable(player);

  const { ability } = findAbilityOnMonster(state, monster, card, abilityId);
  if (!ability) throw new Error(`Unknown ability "${abilityId}" on this monster.`);

  const oncePerTurn = ability.oncePerTurn ?? true;
  if (oncePerTurn && (monster.abilityUses[abilityId] ?? 0) > 0) {
    throw new Error(`${ability.name} can only be used once per turn.`);
  }

  for (const restriction of monster.actionRestrictions ?? []) {
    if (restriction.blockedActionCategory === "allActions") {
      throw new Error("This monster cannot take any actions this turn.");
    }
  }

  if (isOffensiveAbility(ability) && isSetupTurn(player)) {
    throw new Error("Offensive actions are not allowed during setup turn.");
  }

  const costStars = ability.costStars ?? 0;
  requireStars(player, costStars);

  validateAbilityTargets(state, playerId, monsterSlotIndex, ability, { targetPlayerId, targetSlotIndex, targetHandCardInstanceId });

  const nextSlots = [...player.monsterSlots];
  nextSlots[monsterSlotIndex] = {
    ...monster,
    abilityUses: {
      ...monster.abilityUses,
      [abilityId]: (monster.abilityUses[abilityId] ?? 0) + 1,
    },
  };
  let nextState = replacePlayer(
    {
      ...state,
      log: appendLog(state, `${player.name} uses ${ability.name} with ${card.name}.`),
    },
    playerId,
    {
      ...player,
      stars: spendStars(player, costStars),
      monsterSlots: nextSlots,
    },
  );

  const effects = getAbilityEffects(ability, choiceOptionId);
  nextState = applyAbilityEffects(nextState, playerId, monsterSlotIndex, effects, { targetPlayerId, targetSlotIndex, targetHandCardInstanceId });

  nextState = triggerAfterAbilityPassives(nextState, playerId, monsterSlotIndex, abilityId);

  return nextState;
}

function findAbilityOnMonster(state, monster, card, abilityId) {
  const slot = (card.effectSlots ?? []).find((s) => s.id === abilityId);
  if (slot) return { ability: slot };

  for (const attachment of monster.attachments) {
    const attachCard = state.cardsById[attachment.cardId];
    for (const effect of attachCard?.effects ?? []) {
      if (effect.family === "grantAction" && effect.payload?.actionId === abilityId) {
        return { ability: { ...effect.payload, kind: "activeAbility" } };
      }
    }
  }

  return { ability: null };
}

function getAbilityEffects(ability, choiceOptionId) {
  if (choiceOptionId && ability.choiceOptions) {
    const option = ability.choiceOptions.find((o) => o.id === choiceOptionId);
    return option?.effects ?? [];
  }
  return ability.effects ?? [];
}

function isOffensiveAbility(ability) {
  const effects = [...(ability.effects ?? [])];
  for (const option of ability.choiceOptions ?? []) {
    effects.push(...(option.effects ?? []));
  }
  return effects.some((e) => ["enemyMonster", "anyMonster"].includes(e.target));
}

function validateAbilityTargets(state, playerId, monsterSlotIndex, ability, target) {
  const effects = getAbilityEffects(ability, null);
  const needsEnemyMonster = effects.some((e) => e.target === "enemyMonster");
  const needsAnyMonster = effects.some((e) => e.target === "anyMonster");
  const needsForceSummon = effects.some(
    (e) => e.family === "forceSummon" && e.target === "opponentHandMonster",
  );

  if (needsEnemyMonster) {
    if (target.targetPlayerId === undefined || target.targetSlotIndex === undefined) {
      throw new Error("An enemy monster target is required.");
    }
    if (target.targetPlayerId === playerId) throw new Error("Ability must target an enemy monster.");
    requireMonsterSlot(requirePlayer(state, target.targetPlayerId), target.targetSlotIndex);
  }

  if (needsAnyMonster) {
    if (target.targetPlayerId === undefined || target.targetSlotIndex === undefined) {
      throw new Error("A monster target is required.");
    }
    requireMonsterSlot(requirePlayer(state, target.targetPlayerId), target.targetSlotIndex);
  }

  if (needsForceSummon) {
    const opponentId = state.playerOrder.find((id) => id !== playerId);
    const opponent = requirePlayer(state, opponentId);
    if (opponent.monsterSlots.filter(Boolean).length >= 4) {
      throw new Error("Pitch requires the opponent to have fewer than 4 monsters in play.");
    }
    if (!target.targetHandCardInstanceId) {
      throw new Error("Pitch requires a monster card from the opponent's hand.");
    }
    const handCardInstance = opponent.hand.find((c) => c.instanceId === target.targetHandCardInstanceId);
    if (!handCardInstance) throw new Error("That card is not in the opponent's hand.");
    const handCard = requireCard(state, handCardInstance.cardId);
    if (handCard.type !== "monster") throw new Error("Pitch can only target monster cards.");
    if (!isValidSlot(target.targetSlotIndex)) throw new Error("A valid empty opponent slot is required.");
    if (opponent.monsterSlots[target.targetSlotIndex]) throw new Error("That opponent slot is already occupied.");
  }
}

function applyAbilityEffects(state, playerId, monsterSlotIndex, effects, target) {
  return effects.reduce((nextState, effect) => {
    if (effect.family === "heal" && effect.target === "selfMonster") {
      return healMonster(nextState, playerId, monsterSlotIndex, effect.amount);
    }
    if (effect.family === "gainMaxHp" && effect.target === "selfMonster") {
      return increaseMonsterMaxHp(nextState, playerId, monsterSlotIndex, effect.amount);
    }
    if (effect.family === "strengthChange" && effect.target === "selfMonster") {
      return changeMonsterStrength(nextState, playerId, monsterSlotIndex, effect.amount);
    }
    if (effect.family === "returnToHand" && effect.target === "enemyMonster") {
      return returnMonsterToHand(nextState, target.targetPlayerId, target.targetSlotIndex);
    }
    if (effect.family === "restriction" && effect.target === "enemyMonster") {
      const restriction = {
        blockedActionCategory: effect.payload?.blockedActionCategory ?? "offensive",
        remainingControllerTurns: effect.payload?.turns ?? 1,
      };
      if (effect.payload?.blockedActionCategory === "specificTarget") {
        restriction.blockedTargetPlayerId = playerId;
        restriction.blockedTargetSlotIndex = monsterSlotIndex;
      }
      return applyMonsterRestriction(nextState, target.targetPlayerId, target.targetSlotIndex, restriction);
    }
    if (effect.family === "koMonster" && effect.target === "selfMonster") {
      return koMonsterNoOverflow(nextState, playerId, monsterSlotIndex);
    }
    if (effect.family === "conditionalKo" && effect.target === "anyMonster") {
      return conditionalKoMonster(nextState, target.targetPlayerId, target.targetSlotIndex, effect.payload);
    }
    if (effect.family === "forceSummon" && effect.target === "opponentHandMonster") {
      return applyForceSummon(nextState, playerId, target);
    }
    return nextState;
  }, state);
}

function triggerAfterAbilityPassives(state, playerId, monsterSlotIndex, abilityId) {
  const monster = state.players[playerId]?.monsterSlots[monsterSlotIndex];
  if (!monster) return state;

  const card = state.cardsById[monster.cardId];
  let nextState = state;

  for (const slot of card?.effectSlots ?? []) {
    for (const effect of slot.effects ?? []) {
      if (effect.timing === "afterAbilityUse" && effect.triggeredByAbilityId === abilityId) {
        if (effect.family === "strengthChange" && effect.target === "selfMonster") {
          nextState = changeMonsterStrength(nextState, playerId, monsterSlotIndex, effect.amount);
        }
      }
    }
  }

  return nextState;
}

function healMonster(state, playerId, slotIndex, amount) {
  if (isHealingPrevented(state)) return state;
  const player = requirePlayer(state, playerId);
  const monster = player.monsterSlots[slotIndex];
  if (!monster) return state;
  const newHp = Math.min(monster.currentHp + amount, monster.maxHp);
  if (newHp === monster.currentHp) return state;
  const nextSlots = [...player.monsterSlots];
  nextSlots[slotIndex] = { ...monster, currentHp: newHp };
  return replacePlayer(state, playerId, { ...player, monsterSlots: nextSlots });
}

function healPlayerHp(state, playerId, amount) {
  if (isHealingPrevented(state)) return state;
  const player = requirePlayer(state, playerId);
  const newHp = Math.min(player.currentHp + amount, player.maxHp);
  if (newHp === player.currentHp) return state;
  return replacePlayer(state, playerId, { ...player, currentHp: newHp });
}

function changeMonsterStrength(state, playerId, slotIndex, amount) {
  const player = requirePlayer(state, playerId);
  const monster = player.monsterSlots[slotIndex];
  if (!monster) return state;
  const nextSlots = [...player.monsterSlots];
  nextSlots[slotIndex] = { ...monster, currentStrength: Math.max(0, monster.currentStrength + amount) };
  return replacePlayer(state, playerId, { ...player, monsterSlots: nextSlots });
}

function increaseMonsterMaxHp(state, playerId, slotIndex, amount) {
  const player = requirePlayer(state, playerId);
  const monster = player.monsterSlots[slotIndex];
  if (!monster) return state;
  const nextSlots = [...player.monsterSlots];
  nextSlots[slotIndex] = {
    ...monster,
    maxHp: monster.maxHp + amount,
    currentHp: monster.currentHp + amount,
  };
  return replacePlayer(state, playerId, { ...player, monsterSlots: nextSlots });
}

function returnMonsterToHand(state, playerId, slotIndex) {
  const player = requirePlayer(state, playerId);
  const monster = requireMonsterSlot(player, slotIndex);
  const returnedCards = [
    { instanceId: monster.cardInstanceId, cardId: monster.cardId },
    ...monster.attachments.map((att) => ({ instanceId: att.instanceId, cardId: att.cardId })),
  ];
  const nextSlots = [...player.monsterSlots];
  nextSlots[slotIndex] = null;
  return replacePlayer(state, playerId, {
    ...player,
    monsterSlots: nextSlots,
    hand: [...player.hand, ...returnedCards],
  });
}

function koMonsterNoOverflow(state, playerId, slotIndex) {
  const player = requirePlayer(state, playerId);
  const monster = requireMonsterSlot(player, slotIndex);
  const nextSlots = [...player.monsterSlots];
  nextSlots[slotIndex] = null;
  let nextState = replacePlayer(state, playerId, {
    ...player,
    monsterSlots: nextSlots,
    graveyard: [
      ...player.graveyard,
      { instanceId: monster.cardInstanceId, cardId: monster.cardId, reason: "ko" },
      ...monster.attachments,
    ],
  });
  nextState = checkPassivesAfterMonsterDeath(nextState, playerId, monster);
  return nextState;
}

function applyForceSummon(state, playerId, target) {
  const opponentId = state.playerOrder.find((id) => id !== playerId);
  const opponent = requirePlayer(state, opponentId);
  const handCardInstance = opponent.hand.find((c) => c.instanceId === target.targetHandCardInstanceId);
  const card = requireCard(state, handCardInstance.cardId);

  const monster = {
    instanceId: `monster_${state.nextMonsterInstanceNumber}`,
    cardInstanceId: handCardInstance.instanceId,
    cardId: card.id,
    ownerId: opponentId,
    currentHp: card.printedHp,
    maxHp: card.printedHp,
    currentStrength: card.printedStrength,
    attachments: [],
    actionRestrictions: [{ blockedActionCategory: "allActions", remainingControllerTurns: 1 }],
    hasAttackedThisTurn: false,
    abilityUses: {},
  };

  const nextOpponentSlots = [...opponent.monsterSlots];
  nextOpponentSlots[target.targetSlotIndex] = monster;

  return {
    ...replacePlayer(state, opponentId, {
      ...opponent,
      hand: opponent.hand.filter((c) => c.instanceId !== target.targetHandCardInstanceId),
      monsterSlots: nextOpponentSlots,
    }),
    nextMonsterInstanceNumber: state.nextMonsterInstanceNumber + 1,
  };
}

function conditionalKoMonster(state, targetPlayerId, targetSlotIndex, payload) {
  const targetPlayer = requirePlayer(state, targetPlayerId);
  const monster = requireMonsterSlot(targetPlayer, targetSlotIndex);

  if (payload?.condition === "strengthPlusHpLessThan") {
    const total = monster.currentStrength + monster.currentHp;
    if (total >= payload.threshold) {
      throw new Error(
        `Cannot target: monster's strength + HP (${total}) is not below ${payload.threshold}.`,
      );
    }
  }

  return koMonsterNoOverflow(state, targetPlayerId, targetSlotIndex);
}

function isHealingPrevented(state) {
  return state.playerOrder.some((playerId) => {
    const player = state.players[playerId];
    return player.monsterSlots.some((monster) => {
      if (!monster) return false;
      const card = state.cardsById[monster.cardId];
      return (card?.effectSlots ?? []).some((slot) =>
        (slot.effects ?? []).some((effect) => effect.family === "preventHealing"),
      );
    });
  });
}

function applyStartOfTurnPassives(state, playerId) {
  const originalSlots = [...state.players[playerId].monsterSlots];
  let nextState = state;

  for (let slotIndex = 0; slotIndex < originalSlots.length; slotIndex++) {
    const monster = originalSlots[slotIndex];
    if (!monster) continue;
    const card = nextState.cardsById[monster.cardId];
    for (const slot of card?.effectSlots ?? []) {
      for (const effect of slot.effects ?? []) {
        if (effect.timing !== "startOfTurn") continue;
        if (effect.family === "heal" && effect.target === "ownerAlliedMonsters") {
          for (let allySlot = 0; allySlot < MONSTER_SLOT_COUNT; allySlot++) {
            if (nextState.players[playerId].monsterSlots[allySlot]) {
              nextState = healMonster(nextState, playerId, allySlot, effect.amount);
            }
          }
        }
      }
    }
  }

  return nextState;
}

function checkPassivesAfterMonsterDeath(state, deadMonsterOwnerId, deadMonster) {
  const deadCard = state.cardsById[deadMonster.cardId];
  let nextState = state;

  for (const slot of deadCard?.effectSlots ?? []) {
    for (const effect of slot.effects ?? []) {
      if (effect.timing !== "onSourceDies") continue;
      if (effect.family === "heal" && effect.target === "ownerPlayer") {
        nextState = healPlayerHp(nextState, deadMonsterOwnerId, effect.amount);
      }
    }
  }

  const ownerMonsterSlots = [...nextState.players[deadMonsterOwnerId].monsterSlots];
  for (let slotIndex = 0; slotIndex < ownerMonsterSlots.length; slotIndex++) {
    const allyMonster = ownerMonsterSlots[slotIndex];
    if (!allyMonster) continue;
    const allyCard = nextState.cardsById[allyMonster.cardId];
    for (const slot of allyCard?.effectSlots ?? []) {
      for (const effect of slot.effects ?? []) {
        if (effect.timing !== "onAllyDies") continue;
        if (effect.family === "strengthChange" && effect.target === "selfMonster") {
          nextState = changeMonsterStrength(nextState, deadMonsterOwnerId, slotIndex, effect.amount);
        }
      }
    }
  }

  return nextState;
}

function checkPassivesAfterAttacked(state, attackerPlayerId, attackerSlotIndex, targetPlayerId, targetSlotIndex) {
  const targetMonster = state.players[targetPlayerId]?.monsterSlots[targetSlotIndex];
  if (!targetMonster) return state;

  const targetCard = state.cardsById[targetMonster.cardId];
  let nextState = state;

  for (const slot of targetCard?.effectSlots ?? []) {
    for (const effect of slot.effects ?? []) {
      if (effect.timing !== "afterAttacked") continue;
      if (effect.family === "damage" && effect.target === "attackingEnemyMonster") {
        const attackerPlayer = nextState.players[attackerPlayerId];
        const attackerMonster = attackerPlayer?.monsterSlots[attackerSlotIndex];
        if (!attackerMonster) continue;

        const dmg = effect.amount ?? 0;
        const newHp = attackerMonster.currentHp - dmg;
        const nextSlots = [...attackerPlayer.monsterSlots];

        if (newHp <= 0) {
          nextSlots[attackerSlotIndex] = null;
          let nextAttackerPlayer = {
            ...attackerPlayer,
            monsterSlots: nextSlots,
            graveyard: [
              ...attackerPlayer.graveyard,
              { instanceId: attackerMonster.cardInstanceId, cardId: attackerMonster.cardId, reason: "ko" },
              ...attackerMonster.attachments,
            ],
          };
          nextState = replacePlayer(nextState, attackerPlayerId, nextAttackerPlayer);
          nextState = checkPassivesAfterMonsterDeath(nextState, attackerPlayerId, attackerMonster);
        } else {
          nextSlots[attackerSlotIndex] = { ...attackerMonster, currentHp: newHp };
          nextState = replacePlayer(nextState, attackerPlayerId, { ...attackerPlayer, monsterSlots: nextSlots });
        }
      }
    }
  }

  return nextState;
}

function damageMonsterInState(state, playerId, slotIndex, damage) {
  const player = state.players[playerId];
  const monster = player.monsterSlots[slotIndex];
  if (!monster) return state;

  const nextHp = monster.currentHp - damage;
  const nextSlots = [...player.monsterSlots];

  if (nextHp > 0) {
    nextSlots[slotIndex] = { ...monster, currentHp: nextHp };
    return replacePlayer(state, playerId, { ...player, monsterSlots: nextSlots });
  }

  const overflowDamage = Math.abs(nextHp);
  nextSlots[slotIndex] = null;
  let nextState = replacePlayer(state, playerId, {
    ...damagePlayer({ ...player, monsterSlots: nextSlots }, overflowDamage),
    graveyard: [
      ...player.graveyard,
      { instanceId: monster.cardInstanceId, cardId: monster.cardId, reason: "ko" },
      ...monster.attachments,
    ],
  });

  nextState = checkPassivesAfterMonsterDeath(nextState, playerId, monster);

  return nextState;
}

export function discardCard(state, { playerId, handCardInstanceId }) {
  const player = requirePlayer(state, playerId);
  const cardInstance = requireHandCard(player, handCardInstanceId);
  requireActivePlayer(state, playerId, "discard a card");
  requireStars(player, 1);

  return replacePlayer(
    {
      ...state,
      log: appendLog(state, `${player.name} discards ${requireCard(state, cardInstance.cardId).name}.`),
    },
    playerId,
    {
      ...discardCardsFromHand(player, [handCardInstanceId], "manualDiscard"),
      stars: spendStars(player, 1),
      finalCleanupStarted: false,
    },
  );
}

export function discardForHandLimit(state, { playerId, handCardInstanceId }) {
  const player = requirePlayer(state, playerId);
  requireActivePlayer(state, playerId, "discard for hand limit");
  if (player.hand.length <= HAND_LIMIT) throw new Error("No hand-limit discard is needed.");

  return replacePlayer(
    {
      ...state,
      log: appendLog(state, `${player.name} discards a card for hand limit.`),
    },
    playerId,
    {
      ...discardCardsFromHand(player, [handCardInstanceId], "handLimit"),
      finalCleanupStarted: true,
    },
  );
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

function discardCardsFromHand(player, cardInstanceIds, reason) {
  if (cardInstanceIds.length === 0) return player;

  const discardedCards = cardInstanceIds.map((instanceId) => ({
    ...requireHandCard(player, instanceId),
    reason,
  }));
  const discardSet = new Set(cardInstanceIds);
  return {
    ...player,
    hand: player.hand.filter((cardInstance) => !discardSet.has(cardInstance.instanceId)),
    graveyard: [...player.graveyard, ...discardedCards],
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
  return appendLogMessage(state.log, message);
}

function appendLogMessage(log, message) {
  return [...log, message].slice(-24);
}

function spendStars(player, amount) {
  return {
    ...player.stars,
    spent: player.stars.spent + amount,
  };
}

function requireActivePlayer(state, playerId, action) {
  if (state.currentPlayerId !== playerId) throw new Error(`Only the active player can ${action}.`);
}

function requireActionsAvailable(player) {
  if (player.finalCleanupStarted) {
    throw new Error("Turn cleanup has started; no more actions can be taken.");
  }
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

function assertCardInstanceIds(cardInstanceIds, label) {
  if (!Array.isArray(cardInstanceIds)) {
    throw new Error(`${label} must be a list of card instance ids.`);
  }
  const uniqueIds = new Set(cardInstanceIds);
  if (uniqueIds.size !== cardInstanceIds.length) {
    throw new Error(`${label} cannot include duplicate cards.`);
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
