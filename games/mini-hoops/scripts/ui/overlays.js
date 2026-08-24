// The two overlays that sit on top of the court: pause and results.
//
// A binding, like the HUD. It renders a result it is handed and reports button
// presses back as intents; it decides nothing about what those intents do.

import { hoopModeById } from "../sim/hoop.js";
import { locationById } from "../assets/location-catalog.js";
import { ballById } from "../assets/ball-catalog.js";

export function createOverlays(root, { onIntent = () => {} } = {}) {
  const pause = root.querySelector("#pauseOverlay");
  const results = root.querySelector("#resultsOverlay");

  const resultNodes = {
    score: root.querySelector("#resultScore"),
    title: root.querySelector("#resultTitle"),
    meta: root.querySelector("#resultMeta"),
    shots: root.querySelector("#resultShots"),
    accuracy: root.querySelector("#resultAccuracy"),
    rank: root.querySelector("#resultRank"),
    streak: root.querySelector("#resultStreak"),
  };

  // One delegated listener rather than a handler per button: adding a button to
  // an overlay becomes a markup change plus a case in the caller's switch.
  root.querySelectorAll("[data-intent]").forEach((button) => {
    button.addEventListener("click", () => onIntent(button.dataset.intent));
  });

  const setText = (node, value) => {
    if (node) node.textContent = String(value);
  };

  return {
    showPause() {
      pause?.classList.add("is-shown");
    },
    hidePause() {
      pause?.classList.remove("is-shown");
    },
    isPauseShown() {
      return Boolean(pause?.classList.contains("is-shown"));
    },

    /**
     * @param summary from `runSummary()`
     * @param placement `{ rank, previousBest }` from the board store
     */
    showResults(summary, placement) {
      setText(resultNodes.score, summary.score);
      setText(
        resultNodes.title,
        summary.score > placement.previousBest && summary.score > 0 ? "New Local Best" : "Run Complete",
      );
      setText(
        resultNodes.meta,
        [
          hoopModeById(summary.modeId).label,
          summary.duration === 60 ? "1 min" : `${summary.duration} sec`,
          locationById(summary.locationId).label,
          ballById(summary.ballId).label,
        ].join(" · "),
      );
      setText(resultNodes.shots, summary.shots);
      setText(resultNodes.accuracy, `${summary.accuracy}%`);
      setText(resultNodes.rank, placement.rank > 0 ? `#${placement.rank}` : "—");
      setText(resultNodes.streak, summary.bestStreak);
      results?.classList.add("is-shown");
    },
    hideResults() {
      results?.classList.remove("is-shown");
    },

    hideAll() {
      this.hidePause();
      this.hideResults();
    },
  };
}
