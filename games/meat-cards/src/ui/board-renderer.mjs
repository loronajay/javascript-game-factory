import { buildBoardViewModel } from "./board-view-model.mjs";

export function renderBoard(root, state, cardsById, handlers = {}, uiState = {}) {
  const view = buildBoardViewModel(state, cardsById);
  root.innerHTML = "";
  root.append(createBoard(view, handlers, uiState));
}

function createBoard(view, handlers, uiState) {
  const board = el("section", "game-board");
  const opponent = view.players.find((player) => player.id !== view.currentPlayerId);
  const activePlayer = view.players.find((player) => player.id === view.currentPlayerId);

  board.append(createPlayerPanel(opponent, "opponent", handlers, { showHand: true }));
  board.append(createBattlefield(opponent, activePlayer, handlers));
  board.append(createCenterPanel(view, handlers, uiState));
  board.append(createPlayerPanel(activePlayer, "active", handlers, { showHand: true }));
  board.append(createOverlayLayer(uiState, view.currentPlayerId, handlers));
  return board;
}

function createPlayerPanel(player, side, handlers, options = {}) {
  const panel = el("section", `player-panel player-panel--${side}`);
  panel.append(
    el("header", "player-header", [
      el("div", "player-title", player.name),
      el("div", "player-stats", [
        stat("HP", player.hpLabel),
        stat("Stars", player.starsLabel),
        stat("Deck", String(player.deckCount)),
        stat("Grave", String(player.graveyardCount)),
      ]),
    ]),
  );
  if (options.showHand) {
    panel.append(createHand(player, side, handlers));
  }
  return panel;
}

function createBattlefield(opponent, activePlayer, handlers) {
  const battlefield = el("section", "battlefield", { "aria-label": "Battlefield" });
  battlefield.append(
    el("div", "battlefield-label", "Battlefield"),
    el("div", "battlefield-rows", [
      createMonsterLane(opponent, "opponent", handlers),
      createMonsterLane(activePlayer, "active", handlers),
    ]),
  );
  return battlefield;
}

function createMonsterLane(player, side, handlers) {
  return el("section", `monster-lane monster-lane--${side}`, [
    el("div", "zone-label", `${player.name} monsters`),
    createMonsterRow(player, handlers),
  ]);
}

function createMonsterRow(player, handlers) {
  const row = el("div", "monster-row");
  player.monsterSlots.forEach((monster, slotIndex) => {
    const slot = el("button", monster ? "monster-slot monster-slot--filled" : "monster-slot", {
      type: "button",
      "data-player-id": player.id,
      "data-slot-index": String(slotIndex),
    });
    slot.addEventListener("click", () => handlers.onMonsterSlot?.({ playerId: player.id, slotIndex }));
    slot.addEventListener("dragover", (event) => {
      event.preventDefault();
      slot.classList.add("is-drop-ready");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("is-drop-ready"));
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.classList.remove("is-drop-ready");
      const draggedCard = readDraggedCard(event);
      if (draggedCard) handlers.onDropMonsterSlot?.({ playerId: player.id, slotIndex, draggedCard });
    });
    if (monster) {
      slot.append(createMiniCard(monster, { compactStats: `${monster.strengthLabel} / ${monster.hpLabel}` }));
    } else {
      slot.append(el("span", "slot-empty", "Empty"));
    }
    row.append(slot);
  });
  return row;
}

function createHand(player, side, handlers) {
  const hand = el("section", "hand-zone");
  hand.append(el("div", "zone-label", side === "active" ? "Hand" : "Opponent Hand"));
  const cards = el("div", "hand-cards");
  player.hand.forEach((card) => {
    const button = el("button", `hand-card hand-card--${card.type}${card.hidden ? " hand-card--hidden" : ""}`, {
      type: "button",
      "data-player-id": player.id,
      "data-card-instance-id": card.instanceId,
      draggable: card.hidden ? "false" : "true",
    });
    if (!card.hidden) {
      button.addEventListener("click", () => handlers.onHandCard?.({ playerId: player.id, card }));
      button.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("application/json", JSON.stringify({ playerId: player.id, card }));
        event.dataTransfer.effectAllowed = "move";
      });
    }
    if (card.art) {
      button.append(createMiniCard(card));
    } else {
      button.append(createMiniCard(card));
    }
    cards.append(button);
  });
  hand.append(cards);
  return hand;
}

function createCenterPanel(view, handlers, uiState) {
  const panel = el("section", "center-panel");
  panel.append(
    el("div", "turn-banner", [
      el("span", "turn-label", "Current Turn"),
      el("strong", "turn-player", view.currentPlayerName),
      uiState.pendingAction
        ? el("span", "pending-action", pendingActionLabel(uiState.pendingAction))
        : null,
    ]),
  );
  panel.append(
    el("div", "turn-actions", [
      actionButton("End Turn", () => handlers.onEndTurn?.()),
    ]),
  );
  if (uiState.notice) {
    panel.append(el("div", "game-notice", uiState.notice));
  }
  const log = el("ol", "event-log");
  view.log.slice(-6).forEach((message) => log.append(el("li", "", message)));
  panel.append(log);
  return panel;
}

function createOverlayLayer(uiState, currentPlayerId, handlers) {
  const layer = el("div", "overlay-layer");
  if (uiState.selected?.card) {
    layer.append(createCardInspector(uiState.selected, currentPlayerId, handlers));
  }
  if (uiState.pendingAction) {
    layer.append(createPendingConfirm(uiState.pendingAction, handlers));
  }
  return layer;
}

function createCardInspector(selected, currentPlayerId, handlers) {
  const card = selected.card;
  const inspector = el("aside", "card-inspector popup-panel", { "aria-label": "Selected card viewer" });
  inspector.append(
    el("div", "popup-header", [
      el("strong", "", "Card Viewer"),
      actionButton("Close", () => handlers.onCloseViewer?.(), { "aria-label": "Close card viewer" }),
    ]),
    el("div", "inspector-body", [
      el("div", "inspector-card-frame", [createMiniCard(card, { large: true })]),
      el("div", "inspector-copy", [
        el("div", "inspector-type", card.type),
        el("h2", "", card.name),
        createCostLine(card),
        el("p", "inspector-rules", card.rulesText || "No rules text entered yet."),
        ...createEffectSlotList(card),
      ]),
    ]),
    createContextMenu(selected, currentPlayerId, handlers),
  );
  return inspector;
}

function createPendingConfirm(pendingAction, handlers) {
  const panel = el("div", "pending-confirm popup-panel", { "aria-label": "Confirm action" });
  const ready = isPendingActionReady(pendingAction);
  panel.append(
    el("div", "popup-header", [el("strong", "", "Confirm Action")]),
    el("div", "pending-copy", [
      el("strong", "", pendingAction.label),
      el("span", "", pendingActionDetail(pendingAction)),
    ]),
    actionButton("Confirm", () => handlers.onConfirmPendingAction?.(), { disabled: ready ? null : "true" }),
    actionButton("Cancel", () => handlers.onCancelPendingAction?.()),
  );
  return panel;
}

function createContextMenu(selected, currentPlayerId, handlers) {
  const menu = el("div", "context-menu");
  const isOwnSelection = selected.playerId === currentPlayerId;
  if (!isOwnSelection) {
    menu.append(el("span", "context-note", "Viewing opponent card"));
    return menu;
  }
  if (selected.source === "hand" && selected.card.type === "monster") {
    menu.append(actionButton("Summon", () => handlers.onSummonSelected?.()));
  }
  if (selected.source === "hand" && selected.card.type === "later") {
    menu.append(actionButton("Play Later Card", () => handlers.onPlayLaterSelected?.()));
  }
  if (selected.source === "hand" && selected.card.type === "accessory") {
    menu.append(actionButton("Equip", () => handlers.onChooseEquipTarget?.()));
  }
  if (selected.source === "monster") {
    menu.append(actionButton("Attack", () => handlers.onChooseAttackTarget?.()));
  }
  if (!menu.childElementCount) {
    menu.append(el("span", "context-note", "No actions available"));
  }
  return menu;
}

function createMiniCard(card, options = {}) {
  const classes = [
    "mini-card",
    `mini-card--${card.type}`,
    card.hidden ? "mini-card--hidden" : "",
    options.large ? "mini-card--large" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mini = el("article", classes);
  if (card.hidden) {
    mini.append(el("div", "mini-card-back", "Meat Cards"));
    return mini;
  }

  mini.append(
    el("div", "mini-card-header", [
      card.type === "monster" ? el("span", "mini-stat mini-stat--strength", String(card.currentStrength ?? card.printedStrength ?? "")) : null,
      el("span", "mini-title", card.name),
      card.type === "monster" ? el("span", "mini-stat mini-stat--hp", String(card.currentHp ?? card.printedHp ?? "")) : null,
    ]),
    el("div", "mini-art-frame", [
      card.art ? el("img", "mini-art", { src: `/${card.art}`, alt: "" }) : null,
    ]),
    el("div", "mini-card-footer", [
      el("span", "mini-type", card.type),
      options.compactStats ? el("span", "mini-compact-stats", options.compactStats) : null,
    ]),
  );
  return mini;
}

function createCostLine(card) {
  const costs = [];
  if (card.summonCostStars !== undefined) costs.push(`Summon: ${card.summonCostStars} star(s)`);
  if (card.playCostStars !== undefined) costs.push(`Play: ${card.playCostStars} star(s)`);
  if (card.baseEquipCostStars !== undefined) costs.push(`Equip: ${card.baseEquipCostStars} star(s)`);
  return el("div", "inspector-costs", costs.length ? costs.join(" | ") : "No star cost");
}

function createEffectSlotList(card) {
  if (!card.effectSlots?.length) return [];
  return [
    el(
      "div",
      "inspector-slots",
      card.effectSlots.map((slot) =>
        el("div", "inspector-slot", [
          el("strong", "", `${slot.name} ${slot.kind === "passive" ? "Passive" : `${slot.costStars} star(s)`}`),
          el("span", "", slot.rulesText),
        ]),
      ),
    ),
  ];
}

function pendingActionLabel(pendingAction) {
  if (pendingAction.type === "equip") return "Choose one of your monsters to equip.";
  if (pendingAction.type === "attack") return "Choose an enemy monster to attack.";
  if (pendingAction.type === "summon") return "Confirm battlefield placement.";
  if (pendingAction.type === "later") return "Confirm Later card.";
  return "";
}

function isPendingActionReady(pendingAction) {
  if (pendingAction.type === "attack") return pendingAction.targetPlayerId !== undefined;
  if (pendingAction.type === "equip") return pendingAction.monsterSlotIndex !== undefined;
  return true;
}

function pendingActionDetail(pendingAction) {
  const cost = pendingAction.costStars ?? 0;
  if (pendingAction.type === "summon") return `This will spend ${starText(cost)} and place the monster on the battlefield.`;
  if (pendingAction.type === "later") return `This will spend ${starText(cost)} and move the Later card to the graveyard after resolving.`;
  if (pendingAction.type === "equip" && pendingAction.monsterSlotIndex === undefined) {
    return `Choose one of your monsters. This will spend ${starText(cost)}.`;
  }
  if (pendingAction.type === "equip") return `This will spend ${starText(cost)} and attach the accessory.`;
  if (pendingAction.type === "attack" && pendingAction.targetPlayerId === undefined) {
    return `Choose an enemy monster. This will spend ${starText(cost)}.`;
  }
  if (pendingAction.type === "attack") return `This will spend ${starText(cost)} and roll for the attack.`;
  return "";
}

function starText(count) {
  return `${count} star${count === 1 ? "" : "s"}`;
}

function stat(label, value) {
  return el("span", "stat", [el("span", "stat-label", label), el("strong", "stat-value", value)]);
}

function actionButton(label, onClick, attributes = {}) {
  const cleanedAttributes = Object.fromEntries(
    Object.entries({ type: "button", ...attributes }).filter(([, value]) => value !== null),
  );
  const button = el("button", "action-button", cleanedAttributes, label);
  button.addEventListener("click", onClick);
  return button;
}

function readDraggedCard(event) {
  try {
    const raw = event.dataTransfer.getData("application/json");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function el(tag, className, attributesOrChildren, maybeChildren) {
  const element = document.createElement(tag);
  if (className) element.className = className;

  const hasAttributes =
    attributesOrChildren &&
    typeof attributesOrChildren === "object" &&
    !Array.isArray(attributesOrChildren) &&
    !(attributesOrChildren instanceof Node);
  if (hasAttributes) {
    Object.entries(attributesOrChildren).forEach(([name, value]) => element.setAttribute(name, value));
    appendChildren(element, maybeChildren);
  } else {
    appendChildren(element, attributesOrChildren);
  }

  return element;
}

function appendChildren(element, children) {
  if (children === null || children === undefined) return;
  if (Array.isArray(children)) {
    children.forEach((child) => appendChildren(element, child));
    return;
  }
  element.append(children instanceof Node ? children : document.createTextNode(String(children)));
}
