import { loadCardGameData } from "./data/card-data-client.mjs";
import {
  createMatch,
  discardCard,
  discardForHandLimit,
  endTurn,
  equipAccessory,
  normalAttack,
  playLaterCard,
  startTurn,
  summonMonster,
  useActiveAbility,
} from "./engine/game-state.mjs";
import { createAttackResolution } from "./ui/battle-resolution.mjs";
import { renderGameScene } from "./ui/scene/game-scene.mjs";

const HAND_LIMIT = 7;

const DEFAULT_PLAYER_CONFIGS = [
  { id: "p1", name: "Player One", deckId: "meat_deck" },
  { id: "p2", name: "Player Two", deckId: "useless_deck" },
];

export async function bootGameBoard(root, playerConfigs = DEFAULT_PLAYER_CONFIGS, { onMatchEnd } = {}) {
  const data = await loadCardGameData();
  let state = startTurn(createMatch({
    cardsById: data.cardsById,
    players: playerConfigs.map((player) => ({
      id: player.id,
      name: player.name,
      deck: data.decksById[player.deckId],
    })),
  }));
  let selection = emptySelection();
  let matchEnded = false;

  const stats = {
    turnsPlayed: 0,
    byPlayer: Object.fromEntries(
      playerConfigs.map((p) => [p.id, { monstersKilled: 0, damageDealt: 0, cardsPlayed: 0, starsSpent: 0 }]),
    ),
  };

  checkWin(state);

  render();

  function render() {
    if (matchEnded) return;
    renderGameScene(root, state, data.cardsById, {
      onEndTurn() {
        try {
          const player = state.players[state.currentPlayerId];
          if (player.hand.length > HAND_LIMIT) {
            selection = {
              ...emptySelection(),
              cleanupMode: "handLimit",
              notice: "Discard cards from your hand to finish the turn.",
            };
            render();
            return;
          }
          const damage = remainingStars(player);
          if (damage > 0) {
            selection = { ...selection, earlyEndConfirm: { damage }, discardConfirm: null };
            render();
            return;
          }
          passTurn();
        } catch (error) {
          selection = { ...selection, notice: error.message };
        }
        render();
      },
      onChooseDiscardSelected() {
        const selected = selection.selected;
        if (!selected || selected.source !== "hand" || selected.playerId !== state.currentPlayerId) return;
        const effectLabel = "Spend 1 ★ and move this card to your graveyard.";
        selection = {
          ...selection,
          discardConfirm: { card: selected.card, effectLabel },
          earlyEndConfirm: null,
          notice: null,
        };
        render();
      },
      onConfirmDiscard() {
        if (!selection.discardConfirm) return;
        try {
          state = discardSelectedCard(state, selection.discardConfirm.card.instanceId);
          selection = emptySelection();
          advanceTurnIfReady();
        } catch (error) {
          selection = { ...selection, notice: error.message };
        }
        render();
      },
      onCancelDiscard() {
        selection = { ...selection, discardConfirm: null };
        render();
      },
      onConfirmEarlyEnd() {
        try {
          passTurn();
          selection = emptySelection();
        } catch (error) {
          selection = {
            ...selection,
            earlyEndConfirm: null,
            cleanupMode: "handLimit",
            notice: error.message,
          };
        }
        render();
      },
      onCancelEarlyEnd() {
        selection = { ...selection, earlyEndConfirm: null };
        render();
      },
      onHandCard({ playerId, card }) {
        if (card.hidden) return;

        if (
          selection.pendingAction?.type === "ability" &&
          selection.pendingAction.requiresPitchTargeting &&
          selection.pendingAction.targetHandCardInstanceId === undefined &&
          playerId !== state.currentPlayerId &&
          card.type === "monster"
        ) {
          selection = {
            ...selection,
            pendingAction: {
              ...selection.pendingAction,
              targetHandCardInstanceId: card.instanceId,
              label: `Pitch ${card.name} for ${starText(selection.pendingAction.costStars)}?`,
            },
          };
          render();
          return;
        }

        selection = { ...selection, selected: { source: "hand", playerId, card } };
        render();
      },
      onMonsterSlot({ playerId, slotIndex }) {
        const monster = state.players[playerId].monsterSlots[slotIndex];

        if (
          selection.pendingAction?.type === "ability" &&
          selection.pendingAction.requiresPitchTargeting &&
          selection.pendingAction.targetHandCardInstanceId !== undefined &&
          playerId !== state.currentPlayerId &&
          !monster
        ) {
          selection = {
            ...selection,
            pendingAction: {
              ...selection.pendingAction,
              targetPlayerId: playerId,
              targetSlotIndex: slotIndex,
            },
          };
          render();
          return;
        }

        if (!monster) return;

        if (selection.pendingAction?.type === "attack" && playerId !== state.currentPlayerId) {
          selection = {
            ...selection,
            pendingAction: { ...selection.pendingAction, targetPlayerId: playerId, targetSlotIndex: slotIndex },
          };
          render();
          return;
        }

        if (selection.pendingAction?.type === "later" && selection.pendingAction.requiresEnemyMonsterTarget) {
          if (playerId === state.currentPlayerId) return;
          selection = {
            ...selection,
            pendingAction: { ...selection.pendingAction, targetPlayerId: playerId, targetSlotIndex: slotIndex },
          };
          render();
          return;
        }

        if (selection.pendingAction?.type === "later" && selection.pendingAction.requiresOwnMonsterTarget) {
          if (playerId !== state.currentPlayerId) return;
          selection = {
            ...selection,
            pendingAction: { ...selection.pendingAction, targetPlayerId: playerId, targetSlotIndex: slotIndex },
          };
          render();
          return;
        }

        if (selection.pendingAction?.type === "equip" && playerId === state.currentPlayerId) {
          selection = {
            ...selection,
            pendingAction: { ...selection.pendingAction, monsterSlotIndex: slotIndex },
          };
          render();
          return;
        }

        if (selection.pendingAction?.type === "ability") {
          const pa = selection.pendingAction;
          if (pa.requiresEnemyMonsterTarget && playerId === state.currentPlayerId) return;
          selection = {
            ...selection,
            pendingAction: { ...pa, targetPlayerId: playerId, targetSlotIndex: slotIndex },
          };
          render();
          return;
        }

        selection = {
          ...selection,
          selected: {
            source: "monster",
            playerId,
            slotIndex,
            card: monsterToSelectedCard(monster, data.cardsById),
          },
        };
        render();
      },
      onAttachedAccessory({ playerId, slotIndex, attachment }) {
        selection = {
          ...selection,
          selected: {
            source: "attachment",
            playerId,
            slotIndex,
            card: attachment,
          },
        };
        render();
      },
      onSummonSelected() {
        const selected = selection.selected;
        if (!selected || selected.source !== "hand" || selected.playerId !== state.currentPlayerId) return;
        const slotIndex = firstEmptyMonsterSlot(state.players[selected.playerId]);
        if (slotIndex === -1) return;
        selection = {
          ...selection,
          pendingAction: {
            type: "summon",
            playerId: selected.playerId,
            handCardInstanceId: selected.card.instanceId,
            slotIndex,
            costStars: selected.card.summonCostStars ?? 0,
            label: `Summon ${selected.card.name} for ${starText(selected.card.summonCostStars ?? 0)}?`,
          },
        };
        render();
      },
      onPlayLaterSelected() {
        const selected = selection.selected;
        if (!selected || selected.source !== "hand" || selected.playerId !== state.currentPlayerId) return;
        const needsEnemyTarget = requiresEnemyMonsterTarget(selected.card);
        const needsOwnTarget = requiresOwnMonsterTarget(selected.card);
        const needsTarget = needsEnemyTarget || needsOwnTarget;
        selection = {
          ...selection,
          selected: needsTarget ? null : selection.selected,
          pendingAction: {
            type: "later",
            playerId: selected.playerId,
            handCardInstanceId: selected.card.instanceId,
            costStars: selected.card.playCostStars ?? 0,
            requiresEnemyMonsterTarget: needsEnemyTarget,
            requiresOwnMonsterTarget: needsOwnTarget,
            label: `Play ${selected.card.name} for ${starText(selected.card.playCostStars ?? 0)}?`,
          },
        };
        render();
      },
      onChooseEquipTarget() {
        const selected = selection.selected;
        if (!selected || selected.source !== "hand" || selected.playerId !== state.currentPlayerId) return;
        selection = {
          ...selection,
          selected: null,
          pendingAction: {
            type: "equip",
            playerId: selected.playerId,
            handCardInstanceId: selected.card.instanceId,
            costStars: selected.card.baseEquipCostStars ?? 0,
            label: `Equip ${selected.card.name} for ${starText(selected.card.baseEquipCostStars ?? 0)}?`,
          },
        };
        render();
      },
      onChooseAttackTarget() {
        const selected = selection.selected;
        if (!selected || selected.source !== "monster" || selected.playerId !== state.currentPlayerId) return;
        if (isOffensiveActionBlocked(selected.card)) {
          selection = { ...selection, notice: "This monster is blocked from offensive actions." };
          render();
          return;
        }
        selection = {
          ...selection,
          selected: null,
          pendingAction: {
            type: "attack",
            attackerPlayerId: selected.playerId,
            attackerSlotIndex: selected.slotIndex,
            costStars: 2,
            label: `Attack with ${selected.card.name} for ${starText(2)}?`,
          },
        };
        render();
      },
      onUseAbilitySelected({ ability }) {
        const selected = selection.selected;
        if (!selected || selected.source !== "monster" || selected.playerId !== state.currentPlayerId) return;
        selection = {
          ...selection,
          selected: null,
          pendingAction: {
            type: "ability",
            playerId: selected.playerId,
            monsterSlotIndex: selected.slotIndex,
            abilityId: ability.abilityId,
            choiceOptionId: ability.choiceOptionId,
            costStars: ability.costStars,
            requiresEnemyMonsterTarget: ability.requiresEnemyMonsterTarget,
            requiresAnyMonsterTarget: ability.requiresAnyMonsterTarget,
            requiresPitchTargeting: ability.requiresPitchTargeting ?? false,
            label: `Use ${ability.name} for ${starText(ability.costStars)}?`,
          },
        };
        render();
      },
      onDropMonsterSlot({ playerId, slotIndex, draggedCard }) {
        if (draggedCard.playerId !== state.currentPlayerId) return;
        if (playerId !== state.currentPlayerId) return;
        if (draggedCard.card.type === "monster" && state.players[playerId].monsterSlots[slotIndex] === null) {
          selection = {
            selected: { source: "hand", playerId: draggedCard.playerId, card: draggedCard.card },
            pendingAction: {
              type: "summon",
              playerId: draggedCard.playerId,
              handCardInstanceId: draggedCard.card.instanceId,
              slotIndex,
              costStars: draggedCard.card.summonCostStars ?? 0,
              label: `Summon ${draggedCard.card.name} for ${starText(draggedCard.card.summonCostStars ?? 0)}?`,
            },
          };
          render();
          return;
        }
        if (draggedCard.card.type === "accessory" && state.players[playerId].monsterSlots[slotIndex]) {
          selection = {
            selected: { source: "hand", playerId: draggedCard.playerId, card: draggedCard.card },
            pendingAction: {
              type: "equip",
              playerId: draggedCard.playerId,
              handCardInstanceId: draggedCard.card.instanceId,
              monsterSlotIndex: slotIndex,
              costStars: draggedCard.card.baseEquipCostStars ?? 0,
              label: `Equip ${draggedCard.card.name} for ${starText(draggedCard.card.baseEquipCostStars ?? 0)}?`,
            },
          };
          render();
        }
      },
      onConfirmPendingAction() {
        try {
          if (selection.pendingAction?.type === "attack") {
            beginAttackResolution(selection.pendingAction);
            return;
          }
          const prevState = state;
          const actionType = selection.pendingAction?.type;
          state = applyPendingAction(state, selection.pendingAction);
          if (actionType && ["summon", "later", "equip"].includes(actionType)) {
            stats.byPlayer[prevState.currentPlayerId].cardsPlayed++;
          }
          diffStateForStats(prevState, state, prevState.currentPlayerId);
          checkWin(state);
          if (!matchEnded) {
            selection = emptySelection();
            advanceTurnIfReady();
          }
        } catch (error) {
          selection = { ...selection, notice: error.message };
        }
        render();
      },
      onCancelPendingAction() {
        selection = { ...selection, pendingAction: null };
        render();
      },
      onCloseViewer() {
        selection = { ...selection, selected: null };
        render();
      },
    }, selection);
    paintSelection(root, state, selection);
  }

  function passTurn() {
    const endingPlayerId = state.currentPlayerId;
    stats.byPlayer[endingPlayerId].starsSpent += state.players[endingPlayerId].stars.spent;
    stats.turnsPlayed++;
    state = startTurn(endTurn(state));
    selection = emptySelection();
    checkWin(state);
  }

  function advanceTurnIfReady() {
    const player = state.players[state.currentPlayerId];
    if (remainingStars(player) > 0) {
      if (player.finalCleanupStarted) {
        selection = {
          ...selection,
          cleanupMode: "earlyEnd",
          notice: "Discard another card or end the turn to take the remaining damage.",
        };
      }
      return;
    }
    if (player.hand.length > HAND_LIMIT) {
      selection = {
        ...emptySelection(),
        cleanupMode: "handLimit",
        notice: "Discard down to 7 cards to finish the turn.",
      };
      return;
    }
    passTurn();
  }

  function beginAttackResolution(pendingAction) {
    const prevState = state;
    const attackAction = { ...pendingAction, roll: rollD6() };
    const { battleResolution, nextState } = prepareAttackResolution(state, data.cardsById, attackAction);
    selection = { ...emptySelection(), battleResolution };
    render();
    setTimeout(() => {
      try {
        stats.byPlayer[prevState.currentPlayerId].cardsPlayed++;
        diffStateForStats(prevState, nextState, prevState.currentPlayerId);
        state = nextState;
        checkWin(state);
        if (!matchEnded) {
          selection = emptySelection();
          advanceTurnIfReady();
        }
      } catch (error) {
        if (!matchEnded) {
          selection = { ...emptySelection(), notice: error.message };
        }
      }
      render();
    }, battleResolution.durationMs);
  }

  function checkWin(currentState) {
    if (matchEnded) return;
    for (const playerId of currentState.playerOrder) {
      if (currentState.players[playerId].currentHp <= 0) {
        matchEnded = true;
        const winnerId = currentState.playerOrder.find((id) => id !== playerId);
        const winnerName = currentState.players[winnerId].name;
        onMatchEnd?.({ winnerId, winnerName, stats: { ...stats, byPlayer: { ...stats.byPlayer } } });
        return;
      }
    }
  }

  function diffStateForStats(prev, next, actingPlayerId) {
    const opponentId = prev.playerOrder.find((id) => id !== actingPlayerId);
    const hpLoss = prev.players[opponentId].currentHp - next.players[opponentId].currentHp;
    if (hpLoss > 0) stats.byPlayer[actingPlayerId].damageDealt += hpLoss;
    prev.players[opponentId].monsterSlots.forEach((prevMonster, i) => {
      if (prevMonster && !next.players[opponentId].monsterSlots[i]) {
        stats.byPlayer[actingPlayerId].monstersKilled++;
      }
    });
  }
}

export function prepareAttackResolution(state, cardsById, pendingAction, roll = pendingAction.roll ?? rollD6()) {
  const attackAction = { ...pendingAction, roll };
  const nextState = applyPendingAction(state, attackAction);
  return {
    battleResolution: createAttackResolution(state, cardsById, attackAction),
    nextState,
  };
}

function starText(count) {
  return `${count} ★`;
}

function emptySelection() {
  return {
    selected: null,
    pendingAction: null,
    battleResolution: null,
    cleanupMode: null,
    discardConfirm: null,
    earlyEndConfirm: null,
    notice: null,
  };
}

function discardSelectedCard(state, handCardInstanceId) {
  const player = state.players[state.currentPlayerId];
  if (remainingStars(player) > 0) {
    return discardCard(state, { playerId: player.id, handCardInstanceId });
  }
  return discardForHandLimit(state, { playerId: player.id, handCardInstanceId });
}

function remainingStars(player) {
  return player.stars.available - player.stars.spent;
}

function applyPendingAction(state, pendingAction) {
  if (!pendingAction) return state;
  if (pendingAction.type === "summon") {
    return summonMonster(state, {
      playerId: pendingAction.playerId,
      handCardInstanceId: pendingAction.handCardInstanceId,
      slotIndex: pendingAction.slotIndex,
    });
  }
  if (pendingAction.type === "later") {
    return playLaterCard(state, {
      playerId: pendingAction.playerId,
      handCardInstanceId: pendingAction.handCardInstanceId,
      targetPlayerId: pendingAction.targetPlayerId,
      targetSlotIndex: pendingAction.targetSlotIndex,
    });
  }
  if (pendingAction.type === "equip") {
    return equipAccessory(state, {
      playerId: pendingAction.playerId,
      handCardInstanceId: pendingAction.handCardInstanceId,
      monsterSlotIndex: pendingAction.monsterSlotIndex,
    });
  }
  if (pendingAction.type === "attack") {
    return normalAttack(state, {
      attackerPlayerId: pendingAction.attackerPlayerId,
      attackerSlotIndex: pendingAction.attackerSlotIndex,
      targetPlayerId: pendingAction.targetPlayerId,
      targetSlotIndex: pendingAction.targetSlotIndex,
      roll: pendingAction.roll ?? rollD6(),
    });
  }
  if (pendingAction.type === "ability") {
    return useActiveAbility(state, {
      playerId: pendingAction.playerId,
      monsterSlotIndex: pendingAction.monsterSlotIndex,
      abilityId: pendingAction.abilityId,
      targetPlayerId: pendingAction.targetPlayerId,
      targetSlotIndex: pendingAction.targetSlotIndex,
      targetHandCardInstanceId: pendingAction.targetHandCardInstanceId,
      choiceOptionId: pendingAction.choiceOptionId,
    });
  }
  return state;
}

function firstEmptyMonsterSlot(player) {
  return player.monsterSlots.findIndex((slot) => slot === null);
}

function rollD6() {
  return Math.floor(Math.random() * 6) + 1;
}

export function requiresEnemyMonsterTarget(card) {
  return [...(card.effectSlots ?? []), ...(card.effects ?? [])].some((effect) => effect.target === "enemyMonster");
}

function requiresOwnMonsterTarget(card) {
  return (card.effects ?? []).some(
    (e) => e.family === "returnToHand" && e.target === "selfMonster",
  );
}

function paintSelection(root, state, selection) {
  if (selection.selected?.source === "hand") {
    root
      .querySelector(`[data-card-instance-id="${selection.selected.card.instanceId}"]`)
      ?.classList.add("is-selected");
  }
  if (selection.selected?.source === "monster") {
    root
      .querySelector(
        `[data-player-id="${selection.selected.playerId}"][data-slot-index="${selection.selected.slotIndex}"]`,
      )
      ?.classList.add("is-selected");
  }
  if (selection.selected?.source === "attachment") {
    root
      .querySelector(`[data-card-instance-id="${selection.selected.card.instanceId}"]`)
      ?.classList.add("is-selected");
  }
  if (selection.pendingAction?.requiresPitchTargeting && selection.pendingAction.targetHandCardInstanceId !== undefined) {
    root
      .querySelector(`[data-card-instance-id="${selection.pendingAction.targetHandCardInstanceId}"]`)
      ?.classList.add("is-selected");
  }
  if (selection.pendingAction?.targetPlayerId !== undefined && selection.pendingAction?.targetSlotIndex !== undefined) {
    root
      .querySelector(
        `[data-player-id="${selection.pendingAction.targetPlayerId}"][data-slot-index="${selection.pendingAction.targetSlotIndex}"]`,
      )
      ?.classList.add("is-targeted");
  }
  if (selection.pendingAction?.monsterSlotIndex !== undefined) {
    root
      .querySelector(
        `[data-player-id="${selection.pendingAction.playerId}"][data-slot-index="${selection.pendingAction.monsterSlotIndex}"]`,
      )
      ?.classList.add("is-targeted");
  }
  paintValidTargets(root, state, selection.pendingAction);
}

function paintValidTargets(root, state, pendingAction) {
  if (!pendingAction) return;
  if (pendingAction.type === "attack" || (pendingAction.type === "later" && pendingAction.requiresEnemyMonsterTarget)) {
    const opponentId = state.playerOrder.find((playerId) => playerId !== state.currentPlayerId);
    paintFilledSlotsForPlayer(root, state.players[opponentId]);
  }
  if (pendingAction.type === "equip" || (pendingAction.type === "later" && pendingAction.requiresOwnMonsterTarget)) {
    paintFilledSlotsForPlayer(root, state.players[state.currentPlayerId]);
  }
  if (pendingAction.type === "ability") {
    if (pendingAction.requiresEnemyMonsterTarget) {
      const opponentId = state.playerOrder.find((playerId) => playerId !== state.currentPlayerId);
      paintFilledSlotsForPlayer(root, state.players[opponentId]);
    } else if (pendingAction.requiresAnyMonsterTarget) {
      for (const playerId of state.playerOrder) {
        paintFilledSlotsForPlayer(root, state.players[playerId]);
      }
    }
  }
}

function paintFilledSlotsForPlayer(root, player) {
  player.monsterSlots.forEach((monster, slotIndex) => {
    if (!monster) return;
    root
      .querySelector(`[data-player-id="${player.id}"][data-slot-index="${slotIndex}"]`)
      ?.classList.add("is-valid-target");
  });
}

export function monsterToSelectedCard(monster, cardsById) {
  const card = cardsById[monster.cardId];
  const grantedActions = monster.attachments.flatMap((attachment) => {
    const attachCard = cardsById[attachment.cardId];
    return (attachCard?.effects ?? [])
      .filter((effect) => effect.family === "grantAction")
      .map((effect) => ({ ...effect.payload }));
  });
  return {
    instanceId: monster.instanceId,
    cardId: monster.cardId,
    type: "monster",
    name: card.name,
    art: card.art,
    rulesText: card.rulesText,
    summonCostStars: card.summonCostStars,
    playCostStars: card.playCostStars,
    baseEquipCostStars: card.baseEquipCostStars,
    currentHp: monster.currentHp,
    maxHp: monster.maxHp,
    currentStrength: monster.currentStrength,
    actionRestrictions: monster.actionRestrictions ?? [],
    effectSlots: card.effectSlots ?? [],
    abilityUses: monster.abilityUses ?? {},
    grantedActions,
    hasAttackedThisTurn: monster.hasAttackedThisTurn,
  };
}

function isOffensiveActionBlocked(card) {
  return (card.actionRestrictions ?? []).some(
    (r) => r.blockedActionCategory === "offensive" || r.blockedActionCategory === "allActions",
  );
}
