import { createCardPiece, createCostLine, createEffectSlotList, formatRulesText } from "./card-piece.mjs";
import { actionButton, el } from "./dom.mjs";

export function createOverlayLayer(overlays, currentPlayerId, handlers) {
  const layer = el("div", "scene-overlay-layer");
  if (overlays.notice) {
    layer.append(el("div", "scene-notice popup-panel", overlays.notice));
  }
  if (overlays.viewer) {
    layer.append(createCardViewer(overlays.viewer, currentPlayerId, handlers));
  }
  if (overlays.targetPrompt) {
    layer.append(createTargetPrompt(overlays.targetPrompt, handlers));
  }
  if (overlays.confirm) {
    layer.append(createPendingConfirm(overlays.confirm, handlers));
  }
  if (overlays.discardConfirm) {
    layer.append(createDiscardConfirm(overlays.discardConfirm, handlers));
  }
  if (overlays.earlyEndConfirm) {
    layer.append(createEarlyEndConfirm(overlays.earlyEndConfirm, handlers));
  }
  if (overlays.battleResolution) {
    layer.append(createBattleResolution(overlays.battleResolution));
  }
  return layer;
}

function createCardViewer(selected, currentPlayerId, handlers) {
  const card = selected.card;
  const viewer = el("aside", "card-viewer popup-panel", { "aria-label": "Selected card viewer" });
  viewer.append(
    el("div", "popup-header", [
      el("strong", "", "Card Viewer"),
      actionButton("Close", () => handlers.onCloseViewer?.(), { "aria-label": "Close card viewer" }),
    ]),
    el("div", "viewer-body", [
      el("div", "viewer-card-frame", [createCardPiece(card, { large: true })]),
      el("div", "viewer-copy", [
        el("div", "viewer-type", card.type),
        el("h2", "", card.name),
        createCostLine(card),
        selected.detailRulesText ? el("p", "viewer-rules", formatRulesText(selected.detailRulesText)) : null,
        ...createEffectSlotList(card),
      ]),
    ]),
    createContextMenu(selected, currentPlayerId, handlers),
  );
  return viewer;
}

function createPendingConfirm(confirm, handlers) {
  const classes = `pending-confirm popup-panel${confirm.canAfford === false ? " is-blocked" : ""}`;
  const panel = el("div", classes, { "aria-label": "Confirm action" });
  panel.append(
    el("div", "popup-header", [el("strong", "", "Confirm Action")]),
    el("div", "pending-copy", [
      el("strong", "", confirm.label),
      el("span", "", confirm.detail),
      confirm.warning ? el("div", "pending-warning", { role: "alert" }, confirm.warning) : null,
    ]),
    el("div", "pending-actions", [
      actionButton("Cancel", () => handlers.onCancelPendingAction?.()),
      actionButton("Confirm", () => handlers.onConfirmPendingAction?.(), { disabled: confirm.ready ? null : "true" }),
    ]),
  );
  return panel;
}

function createTargetPrompt(prompt, handlers) {
  const panel = el("div", "target-prompt popup-panel", { "aria-label": "Choose target" });
  panel.append(
    el("div", "target-copy", [
      el("strong", "", prompt.label),
      el("span", "", prompt.detail),
    ]),
    actionButton("Cancel", () => handlers.onCancelPendingAction?.()),
  );
  return panel;
}

function createDiscardConfirm(confirm, handlers) {
  const panel = el("div", "discard-confirm popup-panel", { "aria-label": "Confirm discard" });
  panel.append(
    el("div", "popup-header", [el("strong", "", confirm.title)]),
    el("div", "discard-copy", [
      el("strong", "", confirm.card.name),
      el("span", "", confirm.effectLabel),
    ]),
    el("div", "pending-actions", [
      actionButton("Cancel", () => handlers.onCancelDiscard?.()),
      actionButton(confirm.confirmLabel, () => handlers.onConfirmDiscard?.()),
    ]),
  );
  return panel;
}

function createEarlyEndConfirm(confirm, handlers) {
  const panel = el("div", "early-end-confirm popup-panel", { "aria-label": "End turn early" });
  panel.append(
    el("div", "popup-header", [el("strong", "", confirm.title)]),
    el("div", "discard-copy", [
      el("strong", confirm.damage > 0 ? "cleanup-damage" : "", confirm.damageLabel),
      el(
        "span",
        "",
        confirm.damage > 0
          ? "Unused ★ will hit your player. Discard cards from your hand first to prevent damage."
          : "Your turn will pass now.",
      ),
    ]),
    el("div", "pending-actions", [
      actionButton("Cancel", () => handlers.onCancelEarlyEnd?.()),
      actionButton(confirm.confirmLabel, () => handlers.onConfirmEarlyEnd?.()),
    ]),
  );
  return panel;
}

function createBattleResolution(resolution) {
  const classes = `battle-resolution battle-resolution--${resolution.type}${resolution.hit ? " is-hit" : " is-miss"}`;
  const overlay = el("div", classes, { "aria-live": "polite", "aria-label": "Battle resolution" });
  overlay.append(
    el("div", "battle-resolution-dim"),
    el("div", "battle-resolution-stage", [
      el("div", "battle-card battle-card--attacker", [
        createBattleCardHeader("Attacker", resolution.attacker.card),
        createCardPiece(resolution.attacker.card, { large: true }),
      ]),
      el("div", "battle-roll", [
        el("span", "battle-roll-label", "ROLL"),
        el("span", "battle-die", String(resolution.roll)),
        el("span", resolution.hit ? "battle-result battle-result--hit" : "battle-result battle-result--miss", resolution.hit ? "HIT" : "MISS"),
      ]),
      el("div", "battle-card battle-card--target", [
        createBattleCardHeader("Target", resolution.target.card, {
          beforeHp: resolution.target.beforeHp,
          afterHp: resolution.target.afterHp,
        }),
        el("div", "battle-target-card-wrap", [
          createBattleTargetPiece(resolution.target.card, resolution.hit),
          el("span", resolution.hit ? "battle-float is-damage" : "battle-float is-miss", resolution.floatText),
        ]),
      ]),
    ]),
  );
  return overlay;
}

function createBattleTargetPiece(card, hit) {
  if (card.type !== "player") return createCardPiece(card, { large: true });
  return el("div", "battle-player-target", [
    el("img", "battle-player-avatar", {
      src: hit ? `/${card.hurtArt}` : `/${card.art}`,
      alt: "",
      draggable: "false",
    }),
    el("span", "battle-player-hp", `${card.currentHp}/${card.maxHp} HP`),
  ]);
}

function createBattleCardHeader(label, card, hpPreview) {
  const hpLabel = hpPreview
    ? `${hpPreview.beforeHp} -> ${hpPreview.afterHp} HP`
    : `${card.currentHp}/${card.maxHp} HP`;
  if (card.type === "player") {
    return el("div", "battle-card-header", [
      el("span", "battle-card-role", label),
      el("strong", "battle-card-name", card.name),
      el("span", "battle-card-stats", hpLabel),
    ]);
  }
  return el("div", "battle-card-header", [
    el("span", "battle-card-role", label),
    el("strong", "battle-card-name", card.name),
    el("span", "battle-card-stats", `STR ${card.currentStrength} / ${hpLabel}`),
  ]);
}

function createContextMenu(selected, currentPlayerId, handlers) {
  const menu = el("div", "context-menu");
  const isOwnSelection = selected.playerId === currentPlayerId;
  if (!isOwnSelection) {
    menu.append(el("span", "context-note", "Viewing opponent card"));
    return menu;
  }
  if (!selected.actionsLocked && selected.source === "hand" && selected.card.type === "monster") {
    menu.append(actionButton("Summon", () => handlers.onSummonSelected?.()));
  }
  if (!selected.actionsLocked && selected.source === "hand" && selected.card.type === "later") {
    menu.append(actionButton("Play Later Card", () => handlers.onPlayLaterSelected?.()));
  }
  if (!selected.actionsLocked && selected.source === "hand" && selected.card.type === "accessory") {
    menu.append(actionButton("Equip", () => handlers.onChooseEquipTarget?.()));
  }
  if (selected.canDiscard) {
    menu.append(actionButton(selected.discardLabel, () => handlers.onChooseDiscardSelected?.()));
    if (selected.discardDetail) menu.append(el("span", "context-note", selected.discardDetail));
  }
  if (selected.actionBlockedDetail) {
    menu.append(el("span", "context-note", selected.actionBlockedDetail));
  }
  if (selected.canAttack) {
    menu.append(actionButton("Attack (2★)", () => handlers.onChooseAttackTarget?.()));
  }
  for (const ability of selected.availableAbilities ?? []) {
    const label = `${ability.name} (${ability.costStars}★)`;
    const btn = actionButton(label, () => handlers.onUseAbilitySelected?.({ ability }));
    if (ability.isBlocked) {
      btn.disabled = true;
      btn.title = "This monster cannot take any actions this turn";
    } else if (ability.alreadyUsed) {
      btn.disabled = true;
      btn.title = "Already used this turn";
    } else if (!ability.canAfford) {
      btn.disabled = true;
      btn.title = "Not enough stars";
    }
    menu.append(btn);
  }
  if (!menu.childElementCount) {
    menu.append(el("span", "context-note", "No actions available"));
  }
  return menu;
}
