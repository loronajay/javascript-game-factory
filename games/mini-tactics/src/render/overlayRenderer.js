import { ACTION_MODES } from "../config.js";
import { tileKey } from "../geometry/isometric.js";
import { getSelectedUnit } from "../state/gameState.js";

const EMPTY_SET = new Set();

export class OverlayRenderer {
  constructor(boardLayer) {
    this.boardLayer = boardLayer;
  }

  render(state) {
    const selected = getSelectedUnit(state);
    const rangeTiles = state.rangeTiles ?? EMPTY_SET;

    for (const tile of this.boardLayer.querySelectorAll(".tile")) {
      tile.classList.remove(
        "selected",
        "legal-move",
        "legal-attack",
        "legal-heal",
        "attack-range",
        "heal-range"
      );

      const x = Number(tile.dataset.x);
      const y = Number(tile.dataset.y);
      const key = tileKey(x, y);

      if (selected && selected.x === x && selected.y === y) {
        tile.classList.add("selected");
      }

      const isLegal = state.legalTiles.has(key);

      // The range overlay paints every reachable tile faintly; the bright
      // legal-target highlight wins on tiles that actually hold a target.
      if (rangeTiles.has(key) && !isLegal) {
        if (state.mode === ACTION_MODES.ATTACK) {
          tile.classList.add("attack-range");
        } else if (state.mode === ACTION_MODES.HEAL) {
          tile.classList.add("heal-range");
        }
      }

      if (!isLegal) {
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
