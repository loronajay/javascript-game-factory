import { ACTION_MODES } from "../config.js";
import { chebyshevDistance, tileKey } from "../geometry/isometric.js";
import { getSelectedUnit } from "../state/gameState.js";
import { prefersReducedMotion } from "./motion.js";

const EMPTY_SET = new Set();

export class OverlayRenderer {
  constructor(boardLayer) {
    this.boardLayer = boardLayer;
  }

  render(state) {
    const selected = getSelectedUnit(state);
    const rangeTiles = state.rangeTiles ?? EMPTY_SET;
    const threatTiles = state.threatTiles ?? EMPTY_SET;

    for (const tile of this.boardLayer.querySelectorAll(".tile")) {
      tile.classList.remove(
        "selected",
        "legal-move",
        "legal-attack",
        "legal-heal",
        "attack-range",
        "heal-range",
        "threatened"
      );

      const x = Number(tile.dataset.x);
      const y = Number(tile.dataset.y);
      const key = tileKey(x, y);

      if (selected && selected.x === x && selected.y === y) {
        tile.classList.add("selected");
      }

      const isLegal = state.legalTiles.has(key);

      // Danger overlay: tiles already under an enemy's reach. Painted beneath the
      // action overlays so a legal move tile that is also threatened still shows
      // its move highlight, with the danger marker layered behind it.
      if (threatTiles.has(key)) {
        tile.classList.add("threatened");
      }

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

  // Ripple the legal tiles in from the selected unit outward. Called once, by the
  // controller, at the moment an action mode is entered (not on every re-render),
  // so it never retriggers mid-targeting. Web-Animations based, so it bypasses the
  // CSS overlay rules cleanly; skipped wholesale under reduced-motion.
  playReveal(state) {
    if (prefersReducedMotion()) {
      return;
    }

    const selected = getSelectedUnit(state);
    const origin = selected ?? { x: 0, y: 0 };

    for (const tile of this.boardLayer.querySelectorAll(
      ".legal-move, .legal-attack, .legal-heal"
    )) {
      const face = tile.querySelector(".tile-face");
      if (!face) {
        continue;
      }

      const x = Number(tile.dataset.x);
      const y = Number(tile.dataset.y);
      const ring = chebyshevDistance(origin, { x, y });

      face.animate(
        [
          { opacity: 0.15 },
          { opacity: 1 },
        ],
        {
          duration: 220,
          delay: Math.min(ring, 6) * 45,
          easing: "ease-out",
        },
      );
    }
  }
}
