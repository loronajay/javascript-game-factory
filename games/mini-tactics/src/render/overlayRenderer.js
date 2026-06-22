import { ACTION_MODES } from "../config.js";
import { tileKey } from "../geometry/isometric.js";
import { getSelectedUnit } from "../state/gameState.js";

export class OverlayRenderer {
  constructor(boardLayer) {
    this.boardLayer = boardLayer;
  }

  render(state) {
    const selected = getSelectedUnit(state);

    for (const tile of this.boardLayer.querySelectorAll(".tile")) {
      tile.classList.remove(
        "selected",
        "legal-move",
        "legal-attack",
        "legal-heal"
      );

      const x = Number(tile.dataset.x);
      const y = Number(tile.dataset.y);

      if (selected && selected.x === x && selected.y === y) {
        tile.classList.add("selected");
      }

      if (!state.legalTiles.has(tileKey(x, y))) {
        continue;
      }

      switch (state.mode) {
        case ACTION_MODES.MOVE:
          tile.classList.add("legal-move");
          break;
        case ACTION_MODES.ATTACK:
          tile.classList.add("legal-attack");
          break;
        case ACTION_MODES.HEAL:
          tile.classList.add("legal-heal");
          break;
      }
    }
  }
}
