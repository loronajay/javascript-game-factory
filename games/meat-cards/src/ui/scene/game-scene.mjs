import { buildBoardViewModel } from "../board-view-model.mjs";
import { createBattlefieldLayer } from "./battlefield-layer.mjs";
import { el } from "./dom.mjs";
import { createHandLayer } from "./hand-layer.mjs";
import { createHudLayer, createPileLayer } from "./hud-layer.mjs";
import { createOverlayLayer } from "./overlay-layer.mjs";
import { buildSceneLayout } from "./scene-layout.mjs";

export function renderGameScene(root, state, cardsById, handlers = {}, uiState = {}) {
  const revealOpponentHand = uiState.pendingAction?.requiresPitchTargeting === true;
  const view = buildBoardViewModel(state, cardsById, { revealOpponentHand });
  const scene = buildSceneLayout(view, uiState);
  root.innerHTML = "";
  root.append(createGameScene(scene, handlers));
}

function createGameScene(scene, handlers) {
  const stage = el("section", "game-stage", { "aria-label": "Meat Cards game scene" });
  stage.append(
    el("div", "table-background"),
    createHudLayer(scene.huds.opponent, "opponent"),
    createPileLayer(scene.piles.opponent, "opponent"),
    createHandLayer(scene.opponentHand, handlers),
    createBattlefieldLayer(scene.battlefield, handlers),
    createTurnLayer(scene, handlers),
    createHudLayer(scene.huds.player, "player"),
    createPileLayer(scene.piles.player, "player"),
    createHandLayer(scene.playerHand, handlers),
    createLogLayer(scene.log),
    createOverlayLayer(scene.overlays, scene.currentPlayer.id, handlers),
  );
  return stage;
}

function createTurnLayer(scene, handlers) {
  const layer = el("section", "turn-layer");
  layer.append(
    el("div", "turn-banner", [
      el("span", "turn-label", "Current Turn"),
      el("strong", "turn-player", scene.turn.playerName),
      scene.turn.pendingActionLabel ? el("span", "pending-action", scene.turn.pendingActionLabel) : null,
    ]),
    el("div", "turn-actions", [
      el("button", "scene-button scene-button--end-turn", { type: "button" }, "End Turn"),
    ]),
  );
  layer.querySelector(".scene-button--end-turn").addEventListener("click", () => handlers.onEndTurn?.());
  return layer;
}

function createLogLayer(log) {
  const panel = el("section", "event-log-layer", { "aria-label": "Event log" });
  const list = el("ol", "event-log");
  log.slice(-5).forEach((message) => list.append(el("li", "", message)));
  panel.append(list);
  return panel;
}
