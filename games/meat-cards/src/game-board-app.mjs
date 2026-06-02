import { loadCardGameData } from "./data/card-data-client.mjs";
import {
  createMatch,
  endTurn,
  equipAccessory,
  normalAttack,
  playLaterCard,
  startTurn,
  summonMonster,
} from "./engine/game-state.mjs";
import { renderGameScene } from "./ui/scene/game-scene.mjs";

const PLAYER_CONFIGS = [
  { id: "p1", name: "Player One", deckId: "meat_deck" },
  { id: "p2", name: "Player Two", deckId: "useless_deck" },
];

export async function bootGameBoard(root) {
  const data = await loadCardGameData();
  let state = startTurn(createMatch({
    cardsById: data.cardsById,
    players: PLAYER_CONFIGS.map((player) => ({
      id: player.id,
      name: player.name,
      deck: data.decksById[player.deckId],
    })),
  }));
  let selection = emptySelection();

  render();

  function render() {
    renderGameScene(root, state, data.cardsById, {
      onEndTurn() {
        state = startTurn(endTurn(state));
        selection = emptySelection();
        render();
      },
      onHandCard({ playerId, card }) {
        if (card.hidden) return;
        selection = { ...selection, selected: { source: "hand", playerId, card } };
        render();
      },
      onMonsterSlot({ playerId, slotIndex }) {
        const monster = state.players[playerId].monsterSlots[slotIndex];
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
        if (selection.pendingAction?.type === "equip" && playerId === state.currentPlayerId) {
          selection = {
            ...selection,
            pendingAction: { ...selection.pendingAction, monsterSlotIndex: slotIndex },
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
        const needsTarget = requiresEnemyMonsterTarget(selected.card);
        selection = {
          ...selection,
          selected: needsTarget ? null : selection.selected,
          pendingAction: {
            type: "later",
            playerId: selected.playerId,
            handCardInstanceId: selected.card.instanceId,
            costStars: selected.card.playCostStars ?? 0,
            requiresEnemyMonsterTarget: needsTarget,
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
        selection = {
          ...selection,
          selected: null,
          pendingAction: {
            type: "attack",
            attackerPlayerId: selected.playerId,
            attackerSlotIndex: selected.slotIndex,
            costStars: 2,
            label: `Attack with ${selected.card.name} for 2 stars?`,
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
          state = applyPendingAction(state, selection.pendingAction);
          selection = emptySelection();
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
}

function starText(count) {
  return `${count} star${count === 1 ? "" : "s"}`;
}

function emptySelection() {
  return {
    selected: null,
    pendingAction: null,
    notice: null,
  };
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
      roll: rollD6(),
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

function requiresEnemyMonsterTarget(card) {
  return (card.effectSlots ?? card.effects ?? []).some((effect) => effect.target === "enemyMonster");
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
  if (selection.pendingAction?.targetPlayerId !== undefined) {
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
  if (pendingAction.type === "equip") {
    paintFilledSlotsForPlayer(root, state.players[state.currentPlayerId]);
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

function monsterToSelectedCard(monster, cardsById) {
  const card = cardsById[monster.cardId];
  return {
    instanceId: monster.instanceId,
    cardId: monster.cardId,
    type: "monster",
    name: card.name,
    art: card.art,
    rulesText: card.rulesText,
    currentHp: monster.currentHp,
    maxHp: monster.maxHp,
    currentStrength: monster.currentStrength,
    effectSlots: card.effectSlots ?? [],
  };
}
