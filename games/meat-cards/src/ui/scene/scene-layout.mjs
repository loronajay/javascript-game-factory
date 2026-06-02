export function buildSceneLayout(view, uiState = {}) {
  const currentPlayer = view.players.find((player) => player.id === view.currentPlayerId);
  const opponentPlayer = view.players.find((player) => player.id !== view.currentPlayerId);

  return {
    phase: view.phase,
    currentPlayer,
    opponentPlayer,
    huds: {
      opponent: hudView(opponentPlayer),
      player: hudView(currentPlayer),
    },
    piles: {
      opponent: pileViews(opponentPlayer),
      player: pileViews(currentPlayer),
    },
    battlefield: {
      rows: [
        monsterRowView(opponentPlayer, "opponent"),
        monsterRowView(currentPlayer, "player"),
      ],
    },
    opponentHand: handView(opponentPlayer, "opponent"),
    playerHand: handView(currentPlayer, "player"),
    turn: {
      playerName: view.currentPlayerName,
      pendingActionLabel: uiState.pendingAction ? pendingActionLabel(uiState.pendingAction) : "",
    },
    log: view.log,
    overlays: {
      viewer: uiState.selected?.card ? selectedCardView(uiState.selected, view.currentPlayerId) : null,
      targetPrompt: uiState.pendingAction && !isPendingActionTargetReady(uiState.pendingAction)
        ? targetPromptView(uiState.pendingAction)
        : null,
      confirm: uiState.pendingAction && isPendingActionTargetReady(uiState.pendingAction)
        ? confirmView(uiState.pendingAction, currentPlayer)
        : null,
      notice: shouldShowNotice(uiState.pendingAction, currentPlayer, uiState.notice) ? uiState.notice : null,
    },
  };
}

function hudView(player) {
  return {
    id: player.id,
    name: player.name,
    isCurrentPlayer: player.isCurrentPlayer,
    hpLabel: player.hpLabel,
    starsLabel: player.starsLabel,
    starsRemaining: player.starsRemaining,
    deckCount: player.deckCount,
    graveyardCount: player.graveyardCount,
  };
}

function monsterRowView(player, side) {
  return {
    playerId: player.id,
    playerName: player.name,
    side,
    slots: player.monsterSlots.map((monster, slotIndex) => ({
      playerId: player.id,
      slotIndex,
      monster,
    })),
  };
}

function handView(player, side) {
  return {
    playerId: player.id,
    playerName: player.name,
    side,
    cards: player.hand,
  };
}

function pileViews(player) {
  return [
    { kind: "deck", label: "Deck", count: player.deckCount },
    { kind: "graveyard", label: "Grave", count: player.graveyardCount },
  ];
}

function selectedCardView(selected, currentPlayerId) {
  return {
    ...selected,
    card: selected.card,
    isOwnSelection: selected.playerId === currentPlayerId,
  };
}

function confirmView(pendingAction, currentPlayer) {
  const cost = pendingAction.costStars ?? 0;
  const starsRemaining = currentPlayer?.starsRemaining ?? 0;
  const canAfford = starsRemaining >= cost;
  return {
    pendingAction,
    label: pendingAction.label,
    detail: pendingActionDetail(pendingAction, { canAfford, starsRemaining }),
    ready: isPendingActionTargetReady(pendingAction) && canAfford,
    canAfford,
    costStars: cost,
    starsRemaining,
    warning: canAfford
      ? ""
      : `Not enough stars. You need ${starText(cost)} but only have ${starText(starsRemaining)}.`,
  };
}

function targetPromptView(pendingAction) {
  return {
    pendingAction,
    label: pendingAction.label,
    detail: pendingActionDetail(pendingAction),
  };
}

export function pendingActionLabel(pendingAction) {
  if (pendingAction.type === "equip") return "Choose one of your monsters to equip.";
  if (pendingAction.type === "attack") return "Choose an enemy monster to attack.";
  if (pendingAction.type === "summon") return "Confirm battlefield placement.";
  if (pendingAction.type === "later" && pendingAction.requiresEnemyMonsterTarget) return "Choose an enemy monster.";
  if (pendingAction.type === "later") return "Confirm Later card.";
  return "";
}

export function isPendingActionReady(pendingAction) {
  return isPendingActionTargetReady(pendingAction);
}

function isPendingActionTargetReady(pendingAction) {
  if (pendingAction.type === "attack") return pendingAction.targetPlayerId !== undefined;
  if (pendingAction.type === "equip") return pendingAction.monsterSlotIndex !== undefined;
  if (pendingAction.type === "later" && pendingAction.requiresEnemyMonsterTarget) {
    return pendingAction.targetPlayerId !== undefined;
  }
  return true;
}

export function pendingActionDetail(pendingAction, options = {}) {
  const cost = pendingAction.costStars ?? 0;
  const starsRemaining = options.starsRemaining;
  const resourceSuffix =
    options.canAfford === false && Number.isFinite(starsRemaining)
      ? ` You have ${starText(starsRemaining)} available.`
      : "";
  if (pendingAction.type === "summon") {
    return `This will spend ${starText(cost)} and place the monster on the battlefield.${resourceSuffix}`;
  }
  if (pendingAction.type === "later") {
    if (pendingAction.requiresEnemyMonsterTarget && pendingAction.targetPlayerId === undefined) {
      return `Choose an enemy monster. This will spend ${starText(cost)}.${resourceSuffix}`;
    }
    return `This will spend ${starText(cost)} and move the Later card to the graveyard after resolving.${resourceSuffix}`;
  }
  if (pendingAction.type === "equip" && pendingAction.monsterSlotIndex === undefined) {
    return `Choose one of your monsters. This will spend ${starText(cost)}.${resourceSuffix}`;
  }
  if (pendingAction.type === "equip") {
    return `This will spend ${starText(cost)} and attach the accessory.${resourceSuffix}`;
  }
  if (pendingAction.type === "attack" && pendingAction.targetPlayerId === undefined) {
    return `Choose an enemy monster. This will spend ${starText(cost)}.${resourceSuffix}`;
  }
  if (pendingAction.type === "attack") {
    return `This will spend ${starText(cost)} and roll for the attack.${resourceSuffix}`;
  }
  return "";
}

function shouldShowNotice(pendingAction, currentPlayer, notice) {
  if (!notice) return false;
  if (!pendingAction || !/not enough stars/i.test(notice)) return true;
  const cost = pendingAction.costStars ?? 0;
  return (currentPlayer?.starsRemaining ?? 0) >= cost;
}

function starText(count) {
  return `${count} star${count === 1 ? "" : "s"}`;
}
