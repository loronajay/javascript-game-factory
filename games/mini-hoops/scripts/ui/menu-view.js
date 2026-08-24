// The title screen.
//
// The design brief was to stop the menu looking like a settings dialog stacked
// on a dimmed screenshot. So the menu is DIEGETIC: the room you are about to
// play in is shown at full strength, and the menu is a lit marquee hanging on
// its wall with a hand-lettered options board beneath it.
//
// Two consequences shape this file:
//
//   The room is the hero, so it is not covered by a full-bleed scrim. Legibility
//   comes from a shaped vignette behind the marquee only (see menu.css), which
//   means the art stays readable as art.
//
//   The room must feel alive, or a static photo behind a static menu is just a
//   dimmer screenshot. Hence parallax — a slow idle drift plus a slight lean
//   toward the pointer. Both are CSS; this file only feeds it two numbers, so
//   the animation stays off the main thread and costs the menu nothing.
//
// Motion is suppressed for `prefers-reduced-motion` in the stylesheet, not here.

import { locationBackdropPath, locationById } from "../assets/location-catalog.js";

// How far the scene leans, as a fraction of its own size. Small on purpose:
// enough to feel like a held camera, not enough to read as a moving background.
const PARALLAX_RANGE = 0.02;

export function createMenuView(root, { onCommand = () => {} } = {}) {
  const scene = root.querySelector("#menuScene");
  const backdrop = root.querySelector("#menuBackdrop");
  const summary = root.querySelector("#menuSummary");
  const best = root.querySelector("#menuBest");
  const items = [...root.querySelectorAll("#menuOptions [data-command]")];

  items.forEach((item) => {
    item.addEventListener("click", () => onCommand(item.dataset.command));
  });

  // Arrow-key navigation, for the arcade-cabinet feel. Native tab order still
  // works; this is additive.
  root.querySelector("#menuOptions")?.addEventListener("keydown", (event) => {
    const index = items.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    }
  });

  // Pointer lean. Passive: this never blocks scrolling, and it never runs a
  // frame loop of its own — it hands CSS two custom properties and stops.
  if (scene) {
    scene.addEventListener(
      "pointermove",
      (event) => {
        const rect = scene.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        scene.style.setProperty("--lean-x", `${(-x * PARALLAX_RANGE * 100).toFixed(3)}%`);
        scene.style.setProperty("--lean-y", `${(-y * PARALLAX_RANGE * 100).toFixed(3)}%`);
      },
      { passive: true },
    );
    scene.addEventListener("pointerleave", () => {
      scene.style.setProperty("--lean-x", "0%");
      scene.style.setProperty("--lean-y", "0%");
    });
  }

  return {
    /** Point the marquee at the room the player has selected. */
    render({ selection, bestScore }) {
      if (backdrop) {
        backdrop.src = locationBackdropPath(selection.locationId);
        backdrop.alt = `${locationById(selection.locationId).label} — the court you are about to play`;
      }
      if (summary) summary.textContent = selection.summary;
      if (best) {
        best.textContent = bestScore > 0 ? `Local best · ${bestScore}` : "No local best yet";
      }
    },

    /** Put keyboard focus on the first option, so the menu is playable from the keyboard. */
    focus() {
      items[0]?.focus();
    },
  };
}
