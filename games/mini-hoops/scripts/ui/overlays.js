// The two overlays that sit on top of the court: pause and results.
//
// A binding, like the HUD. It renders a result it is handed and reports button
// presses back as intents; it decides nothing about what those intents do.

import { hoopModeById } from "../sim/hoop.js";
import { onFireLevel } from "../sim/shot.js";
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
    rankLabel: root.querySelector("#resultRankLabel"),
    streak: root.querySelector("#resultStreak"),
    streakLine: root.querySelector("#resultStreakLine"),
  };
  const nextHotseat = root.querySelector("#nextHotseatButton");
  const replay = results?.querySelector('[data-intent="restart"]');
  const changeSetup = results?.querySelector('[data-intent="change-setup"]');
  const viewBoards = results?.querySelector('[data-intent="view-boards"]');

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
      if (nextHotseat) nextHotseat.hidden = true;
      if (replay) replay.hidden = false;
      if (changeSetup) changeSetup.hidden = false;
      if (viewBoards) viewBoards.hidden = false;
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
      setText(resultNodes.rankLabel, "Local Rank");
      setText(resultNodes.streak, summary.bestStreak);
      // The payoff for the HUD burning during the run: a best streak that ever
      // caught keeps its flames on the card that reports it.
      const heat = onFireLevel(summary.bestStreak);
      resultNodes.streakLine?.classList.toggle("is-on-fire", heat > 0);
      resultNodes.streakLine?.style?.setProperty("--heat", String(heat));
      results?.classList.add("is-shown");
    },
    showHotseatPass(summary, playerName = "Player 1") {
      this.showResults(summary, { rank: 0, previousBest: summary.score });
      setText(resultNodes.title, `${playerName} scored ${summary.score}`);
      setText(resultNodes.rank, "—");
      setText(resultNodes.rankLabel, "Next");
      if (nextHotseat) nextHotseat.hidden = false;
      if (replay) replay.hidden = true;
      if (changeSetup) changeSetup.hidden = true;
      if (viewBoards) viewBoards.hidden = true;
    },
    showDuelResults(summary, { title, record = "—", recordLabel = "Duel", replayable = true } = {}) {
      this.showResults(summary, { rank: 0, previousBest: summary.score });
      setText(resultNodes.title, title || "Match Complete");
      setText(resultNodes.rank, record);
      setText(resultNodes.rankLabel, recordLabel);
      if (nextHotseat) nextHotseat.hidden = true;
      if (replay) replay.hidden = !replayable;
      if (viewBoards) viewBoards.hidden = true;
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
