import { createCardPiece, createCostLine, createEffectSlotList } from "./card-piece.mjs";
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
        el("p", "viewer-rules", card.rulesText || "No rules text entered yet."),
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
