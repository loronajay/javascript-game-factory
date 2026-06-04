export function buildSceneLayout(view, uiState = {}) {
  const currentPlayer = view.players.find((player) => player.id === view.currentPlayerId);
  const opponentPlayer = view.players.find((player) => player.id !== view.currentPlayerId);
  const battlefieldInteraction = battlefieldInteractionView(view, uiState);

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
      ...battlefieldInteraction,
      rows: [
        monsterRowView(opponentPlayer, "opponent", battlefieldInteraction),
        monsterRowView(currentPlayer, "player", battlefieldInteraction),
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
      viewer: uiState.selected?.card
        ? selectedCardView(uiState.selected, view.currentPlayerId, currentPlayer, uiState.cleanupMode)
        : null,
      targetPrompt: null,
      confirm: uiState.pendingAction && isPendingActionTargetReady(uiState.pendingAction)
        ? confirmView(uiState.pendingAction, currentPlayer)
        : null,
      discardConfirm: uiState.discardConfirm ? discardConfirmView(uiState.discardConfirm) : null,
      earlyEndConfirm: uiState.earlyEndConfirm ? earlyEndConfirmView(uiState.earlyEndConfirm) : null,
      battleResolution: uiState.battleResolution ?? null,
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

function monsterRowView(player, side, battlefieldInteraction) {
  return {
    playerId: player.id,
    playerName: player.name,
    side,
    isTargetRow: battlefieldInteraction.targetPlayerId === player.id,
    slots: player.monsterSlots.map((monster, slotIndex) =>
      monsterSlotView(player.id, slotIndex, monster, battlefieldInteraction),
    ),
  };
}

function monsterSlotView(playerId, slotIndex, monster, battlefieldInteraction) {
  const isSelected =
    battlefieldInteraction.selectedMonster?.playerId === playerId &&
    battlefieldInteraction.selectedMonster?.slotIndex === slotIndex;
  const isTargeted =
    battlefieldInteraction.targetedMonster?.playerId === playerId &&
    battlefieldInteraction.targetedMonster?.slotIndex === slotIndex;
  const inTargetRow =
    battlefieldInteraction.targetPlayerId === playerId;
  const inAllTargets =
    (battlefieldInteraction.allValidTargets ?? []).some(
      (t) => t.playerId === playerId && t.slotIndex === slotIndex,
    );
  const inValidEmptyTargets =
    !monster &&
    (battlefieldInteraction.validEmptyTargets ?? []).some(
      (t) => t.playerId === playerId && t.slotIndex === slotIndex,
    );
  const isValidTarget =
    (Boolean(monster) && ((inTargetRow && battlefieldInteraction.validTargetSlotIndexes.includes(slotIndex)) || inAllTargets)) ||
    inValidEmptyTargets;
  return {
    playerId,
    slotIndex,
    monster,
    isSelected,
    isTargeted,
    isValidTarget,
    actionCue: isValidTarget ? battlefieldInteraction.actionCue : "",
    ariaLabel: slotAriaLabel(monster, battlefieldInteraction, { isValidTarget, isTargeted }),
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

function selectedCardView(selected, currentPlayerId, currentPlayer, cleanupMode) {
  const isOwnSelection = selected.playerId === currentPlayerId;
  const isOwnHandCard = isOwnSelection && selected.source === "hand";
  const starsRemaining = currentPlayer?.starsRemaining ?? 0;
  const isHandLimitCleanup = cleanupMode === "handLimit";
  const actionsLocked = Boolean(cleanupMode || currentPlayer?.finalCleanupStarted);
  const canDiscard = isOwnHandCard && (starsRemaining > 0 || isHandLimitCleanup);
  const canAttack =
    isOwnSelection &&
    selected.source === "monster" &&
    !actionsLocked &&
    !selected.card.hasAttackedThisTurn &&
    !isOffensiveActionBlocked(selected.card);
  const availableAbilities =
    isOwnSelection && selected.source === "monster" && !actionsLocked
      ? buildAvailableAbilities(selected.card, starsRemaining)
      : [];
  return {
    ...selected,
    card: selected.card,
    detailRulesText: cardDetailRulesText(selected.card),
    isOwnSelection,
    actionsLocked,
    canDiscard,
    canAttack,
    availableAbilities,
    actionBlockedDetail: selected.source === "monster" && isOffensiveActionBlocked(selected.card)
      ? "This monster is blocked from offensive actions."
      : "",
    discardLabel: canDiscard ? "Discard" : "",
    discardDetail: "",
  };
}

function buildAvailableAbilities(card, starsRemaining) {
  const abilities = [];
  const abilityUses = card.abilityUses ?? {};

  for (const slot of card.effectSlots ?? []) {
    if (slot.kind !== "activeAbility") continue;
    const uses = abilityUses[slot.id] ?? 0;
    const oncePerTurn = slot.oncePerTurn ?? true;
    const alreadyUsed = oncePerTurn && uses > 0;
    const canAfford = starsRemaining >= (slot.costStars ?? 0);
    const needsEnemyTarget = (slot.effects ?? []).some((e) => e.target === "enemyMonster");
    const needsAnyTarget = (slot.effects ?? []).some((e) => e.target === "anyMonster");

    const requiresPitchTargeting = (slot.effects ?? []).some(
      (e) => e.family === "forceSummon" && e.target === "opponentHandMonster",
    );
    const isBlocked = (card.actionRestrictions ?? []).some(
      (r) => r.blockedActionCategory === "allActions",
    );

    if (slot.choiceOptions?.length) {
      for (const option of slot.choiceOptions) {
        abilities.push({
          abilityId: slot.id,
          choiceOptionId: option.id,
          name: `${slot.name}: ${option.label}`,
          costStars: slot.costStars ?? 0,
          alreadyUsed,
          canAfford,
          isBlocked,
          requiresEnemyMonsterTarget: false,
          requiresAnyMonsterTarget: false,
          requiresPitchTargeting: false,
        });
      }
    } else {
      abilities.push({
        abilityId: slot.id,
        choiceOptionId: null,
        name: slot.name,
        costStars: slot.costStars ?? 0,
        alreadyUsed,
        canAfford,
        isBlocked,
        requiresEnemyMonsterTarget: needsEnemyTarget,
        requiresAnyMonsterTarget: needsAnyTarget,
        requiresPitchTargeting,
      });
    }
  }

  const allActionsBlocked = (card.actionRestrictions ?? []).some(
    (r) => r.blockedActionCategory === "allActions",
  );

  for (const action of card.grantedActions ?? []) {
    const uses = abilityUses[action.actionId] ?? 0;
    const oncePerTurn = action.oncePerTurn ?? false;
    const alreadyUsed = oncePerTurn && uses > 0;
    const canAfford = starsRemaining >= (action.costStars ?? 0);
    abilities.push({
      abilityId: action.actionId,
      choiceOptionId: null,
      name: action.name,
      costStars: action.costStars ?? 0,
      alreadyUsed,
      canAfford,
      isBlocked: allActionsBlocked,
      requiresEnemyMonsterTarget: false,
      requiresAnyMonsterTarget: false,
      requiresPitchTargeting: false,
    });
  }

  return abilities;
}

function battlefieldInteractionView(view, uiState) {
  const pendingAction = uiState.pendingAction;
  const selected = uiState.selected;
  const selectedMonster =
    selected?.source === "monster" ? { playerId: selected.playerId, slotIndex: selected.slotIndex } : null;
  if (!pendingAction) {
    return {
      mode: "idle",
      statusLabel: "",
      cancelActionLabel: "",
      actionCue: "",
      targetPlayerId: null,
      validTargetSlotIndexes: [],
      validEmptyTargets: null,
      allValidTargets: null,
      selectedMonster,
      targetedMonster: null,
    };
  }

  if (pendingAction.type === "ability" && pendingAction.requiresPitchTargeting && pendingAction.targetHandCardInstanceId === undefined) {
    return {
      mode: "ability",
      statusLabel: "Choose a monster from the opponent's hand",
      cancelActionLabel: "Cancel Ability",
      actionCue: "",
      targetPlayerId: null,
      validTargetSlotIndexes: [],
      validEmptyTargets: null,
      allValidTargets: null,
      selectedMonster: { playerId: pendingAction.playerId, slotIndex: pendingAction.monsterSlotIndex },
      targetedMonster: null,
    };
  }

  if (pendingAction.type === "ability" && pendingAction.requiresPitchTargeting && pendingAction.targetHandCardInstanceId !== undefined) {
    const opponentPlayer = view.players.find((p) => p.id !== view.currentPlayerId);
    const targetedMonster = pendingAction.targetSlotIndex !== undefined
      ? { playerId: opponentPlayer.id, slotIndex: pendingAction.targetSlotIndex }
      : null;
    const validEmptyTargets = opponentPlayer.monsterSlots
      .map((monster, slotIndex) => (monster === null ? { playerId: opponentPlayer.id, slotIndex } : null))
      .filter(Boolean);
    return {
      mode: "ability",
      statusLabel: targetedMonster ? "Confirm Pitch" : "Choose an empty enemy slot",
      cancelActionLabel: targetedMonster ? "" : "Cancel Ability",
      actionCue: "Place Here",
      targetPlayerId: opponentPlayer.id,
      validTargetSlotIndexes: [],
      validEmptyTargets,
      allValidTargets: null,
      selectedMonster: { playerId: pendingAction.playerId, slotIndex: pendingAction.monsterSlotIndex },
      targetedMonster,
    };
  }

  if (pendingAction.type === "attack" || isEnemyTargetedAction(pendingAction)) {
    const targetPlayerId = view.players.find((player) => player.id !== view.currentPlayerId)?.id ?? null;
    const targetedMonster = targetedMonsterView(pendingAction);
    return {
      mode: pendingAction.type,
      statusLabel: targetedMonster
        ? pendingAction.type === "attack"
          ? "Confirm Attack"
          : "Confirm Action"
        : "Choose Target",
      cancelActionLabel: targetedMonster ? "" : pendingCancelLabel(pendingAction),
      actionCue: pendingAction.type === "attack" ? "Attack Target" : "Target",
      targetPlayerId,
      validTargetSlotIndexes: filledSlotIndexes(view, targetPlayerId),
      validEmptyTargets: null,
      allValidTargets: null,
      selectedMonster: pendingAction.type === "ability"
        ? { playerId: pendingAction.playerId, slotIndex: pendingAction.monsterSlotIndex }
        : { playerId: pendingAction.attackerPlayerId, slotIndex: pendingAction.attackerSlotIndex },
      targetedMonster,
    };
  }

  if (pendingAction.type === "ability" && pendingAction.requiresAnyMonsterTarget) {
    const targetedMonster = targetedMonsterView(pendingAction);
    const allValidTargets = view.players.flatMap((player) =>
      filledSlotIndexes(view, player.id).map((si) => ({ playerId: player.id, slotIndex: si })),
    );
    return {
      mode: "ability",
      statusLabel: targetedMonster ? "Confirm Ability" : "Choose Target",
      cancelActionLabel: targetedMonster ? "" : "Cancel Ability",
      actionCue: "Target",
      targetPlayerId: null,
      validTargetSlotIndexes: [],
      validEmptyTargets: null,
      allValidTargets,
      selectedMonster: { playerId: pendingAction.playerId, slotIndex: pendingAction.monsterSlotIndex },
      targetedMonster,
    };
  }

  if (pendingAction.type === "equip" || isOwnMonsterTargetedAction(pendingAction)) {
    const targetedMonster =
      pendingAction.monsterSlotIndex === undefined
        ? pendingAction.targetPlayerId !== undefined
          ? { playerId: pendingAction.targetPlayerId, slotIndex: pendingAction.targetSlotIndex }
          : null
        : { playerId: pendingAction.playerId, slotIndex: pendingAction.monsterSlotIndex };
    const chosenTarget = pendingAction.type === "equip"
      ? (pendingAction.monsterSlotIndex !== undefined)
      : (pendingAction.targetPlayerId !== undefined);
    return {
      mode: pendingAction.type === "equip" ? "equip" : "later",
      statusLabel: chosenTarget ? "Confirm Action" : "Choose Your Monster",
      cancelActionLabel: chosenTarget ? "" : pendingCancelLabel(pendingAction),
      actionCue: "Target Here",
      targetPlayerId: view.currentPlayerId,
      validTargetSlotIndexes: filledSlotIndexes(view, view.currentPlayerId),
      validEmptyTargets: null,
      allValidTargets: null,
      selectedMonster,
      targetedMonster,
    };
  }

  return {
    mode: pendingAction.type,
    statusLabel: "",
    cancelActionLabel: "",
    actionCue: "",
    targetPlayerId: null,
    validTargetSlotIndexes: [],
    validEmptyTargets: null,
    allValidTargets: null,
    selectedMonster,
    targetedMonster: null,
  };
}

function pendingCancelLabel(pendingAction) {
  if (pendingAction.type === "attack") return "Cancel Attack";
  if (pendingAction.type === "equip") return "Cancel Equip";
  if (pendingAction.type === "later") return "Cancel Later";
  if (pendingAction.type === "ability") return "Cancel Ability";
  return "Cancel";
}

function isEnemyTargetedAction(pendingAction) {
  if (pendingAction.type === "later" && pendingAction.requiresEnemyMonsterTarget) return true;
  if (pendingAction.type === "ability" && pendingAction.requiresEnemyMonsterTarget) return true;
  return false;
}

function isOwnMonsterTargetedAction(pendingAction) {
  return pendingAction.type === "later" && pendingAction.requiresOwnMonsterTarget;
}

function targetedMonsterView(pendingAction) {
  if (pendingAction.targetPlayerId === undefined || pendingAction.targetSlotIndex === undefined) return null;
  return { playerId: pendingAction.targetPlayerId, slotIndex: pendingAction.targetSlotIndex };
}

function filledSlotIndexes(view, playerId) {
  const player = view.players.find((candidate) => candidate.id === playerId);
  return player?.monsterSlots.flatMap((monster, slotIndex) => (monster ? [slotIndex] : [])) ?? [];
}

function slotAriaLabel(monster, battlefieldInteraction, slotState) {
  if (!monster) {
    if (slotState.isValidTarget) return "Place monster here";
    return "Empty monster slot";
  }
  const summary = monsterStatusSummary(monster);
  if (slotState.isTargeted) return `Selected ${summary}`;
  if (slotState.isValidTarget && battlefieldInteraction.mode === "attack") return `Attack ${summary}`;
  if (slotState.isValidTarget && battlefieldInteraction.mode === "equip") return `Equip ${summary}`;
  if (slotState.isValidTarget) return `Target ${summary}`;
  return `Inspect ${summary}`;
}

function monsterStatusSummary(monster) {
  const parts = [monster.name];
  if (monster.strengthLabel) parts.push(`${monster.strengthLabel} strength`);
  if (monster.hpLabel) parts.push(`${monster.hpLabel} HP`);
  const attachments = monster.attachments ?? [];
  if (attachments.length) {
    parts.push(`equipped with ${attachments.map((attachment) => attachment.name).join(", ")}`);
  }
  return parts.join(", ");
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
      : `Not enough ★. Need ${starText(cost)}; available ${starText(starsRemaining)}.`,
  };
}

function discardConfirmView(confirm) {
  return {
    ...confirm,
    title: `Discard ${confirm.card.name}?`,
    confirmLabel: "Discard",
  };
}

function earlyEndConfirmView(confirm) {
  return {
    ...confirm,
    title: "End Turn Early?",
    damageLabel: `${confirm.damage} damage`,
    confirmLabel: confirm.damage > 0 ? "Take Damage" : "End Turn",
  };
}

export function pendingActionLabel(pendingAction) {
  if (pendingAction.type === "equip") {
    return pendingAction.monsterSlotIndex === undefined
      ? "Choose one of your monsters to equip."
      : "Confirm accessory equip.";
  }
  if (pendingAction.type === "attack") {
    return pendingAction.targetPlayerId === undefined ? "Choose an enemy monster to attack." : "Confirm attack roll.";
  }
  if (pendingAction.type === "summon") return "Confirm battlefield placement.";
  if (pendingAction.type === "later") {
    if (pendingAction.requiresEnemyMonsterTarget && pendingAction.targetPlayerId === undefined) return "Choose an enemy monster.";
    if (pendingAction.requiresOwnMonsterTarget && pendingAction.targetPlayerId === undefined) return "Choose one of your monsters.";
    return "Confirm Later card.";
  }
  if (pendingAction.type === "ability") {
    if (pendingAction.requiresPitchTargeting) {
      if (pendingAction.targetHandCardInstanceId === undefined) return "Choose a monster from the opponent's hand.";
      if (pendingAction.targetSlotIndex === undefined) return "Choose an empty enemy slot.";
      return "Confirm Pitch.";
    }
    if ((pendingAction.requiresEnemyMonsterTarget || pendingAction.requiresAnyMonsterTarget) && pendingAction.targetPlayerId === undefined) {
      return "Choose a monster to target.";
    }
    return `Confirm ability.`;
  }
  return "";
}

export function isPendingActionReady(pendingAction) {
  return isPendingActionTargetReady(pendingAction);
}

function isPendingActionTargetReady(pendingAction) {
  if (pendingAction.type === "attack") return pendingAction.targetPlayerId !== undefined;
  if (pendingAction.type === "equip") return pendingAction.monsterSlotIndex !== undefined;
  if (pendingAction.type === "later") {
    if (pendingAction.requiresEnemyMonsterTarget || pendingAction.requiresOwnMonsterTarget) {
      return pendingAction.targetPlayerId !== undefined;
    }
  }
  if (pendingAction.type === "ability") {
    if (pendingAction.requiresPitchTargeting) {
      return pendingAction.targetHandCardInstanceId !== undefined && pendingAction.targetSlotIndex !== undefined;
    }
    if (pendingAction.requiresEnemyMonsterTarget || pendingAction.requiresAnyMonsterTarget) {
      return pendingAction.targetPlayerId !== undefined;
    }
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
    if ((pendingAction.requiresEnemyMonsterTarget || pendingAction.requiresOwnMonsterTarget) && pendingAction.targetPlayerId === undefined) {
      return `Choose a target monster. This will spend ${starText(cost)}.${resourceSuffix}`;
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
  if (pendingAction.type === "ability") {
    if (pendingAction.requiresPitchTargeting) {
      if (pendingAction.targetHandCardInstanceId === undefined) {
        return `Choose a monster from your opponent's revealed hand. This will spend ${starText(cost)}.${resourceSuffix}`;
      }
      if (pendingAction.targetSlotIndex === undefined) {
        return `Choose an empty slot on your opponent's side. This will spend ${starText(cost)}.${resourceSuffix}`;
      }
      return `This will spend ${starText(cost)} and force summon the chosen monster. It cannot act until the end of their next turn.${resourceSuffix}`;
    }
    if ((pendingAction.requiresEnemyMonsterTarget || pendingAction.requiresAnyMonsterTarget) && pendingAction.targetPlayerId === undefined) {
      return `Choose a target. This will spend ${starText(cost)}.${resourceSuffix}`;
    }
    return `This will spend ${starText(cost)}.${resourceSuffix}`;
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
  return `${count} ★`;
}

function cardDetailRulesText(card) {
  const rulesText = card.rulesText?.trim() ?? "";
  if (!rulesText) return "";
  if (card.effectSlots?.length) return "";
  return rulesText;
}

function isOffensiveActionBlocked(card) {
  return (card.actionRestrictions ?? []).some(
    (r) => r.blockedActionCategory === "offensive" || r.blockedActionCategory === "allActions",
  );
}
