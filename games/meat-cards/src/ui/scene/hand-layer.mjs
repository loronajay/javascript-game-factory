import { createCardPiece } from "./card-piece.mjs";
import { el } from "./dom.mjs";

export function createHandLayer(hand, handlers) {
  const layer = el("section", `hand-layer hand-layer--${hand.side}`);
  layer.append(el("div", "scene-zone-label", hand.side === "player" ? "Hand" : "Opponent Hand"));
  const cards = el("div", "hand-card-row");

  hand.cards.forEach((card) => {
    const button = el("button", `hand-card-shell hand-card-shell--${card.type}${card.hidden ? " is-hidden" : ""}`, {
      type: "button",
      "data-player-id": hand.playerId,
      "data-card-instance-id": card.instanceId,
      draggable: card.hidden ? "false" : "true",
    });

    if (!card.hidden) {
      button.addEventListener("click", () => handlers.onHandCard?.({ playerId: hand.playerId, card }));
      button.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("application/json", JSON.stringify({ playerId: hand.playerId, card }));
        event.dataTransfer.effectAllowed = "move";
      });
    }

    button.append(createCardPiece(card));
    cards.append(button);
  });

  layer.append(cards);
  return layer;
}
