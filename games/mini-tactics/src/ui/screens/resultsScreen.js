import { bindCommonControls, screenRoot } from "./common.js";

const MODE_LABELS = {
  hotseat: "Hot Seat",
  single: "Single Player",
  online: "Online Versus",
  local: "Local",
};

const REASON_LABELS = {
  elimination: "Squad eliminated",
  concede: "Concede",
  disconnect: "Disconnect",
  timeout: "Timeout",
};

// Results screen: populated on entry from the controller's match summary. Rematch
// re-enters the match screen with the same mode and board size.
export function createResultsScreen(ctx) {
  const el = screenRoot("results");
  bindCommonControls(el, ctx);

  const winnerEl = el.querySelector('[data-results="winner"]');
  const statsEl = el.querySelector('[data-results="stats"]');

  let lastSummary = null;

  el.querySelector('[data-action="rematch"]').addEventListener("click", () => {
    if (lastSummary) {
      ctx.nav("match", {
        mode: lastSummary.mode,
        size: lastSummary.size,
        playerCount: lastSummary.playerCount,
        format: lastSummary.format,
        teamColors: lastSummary.teamColors,
      });
    }
  });

  function onEnter(summary) {
    lastSummary = summary;

    winnerEl.textContent = `${summary.winnerLabel ?? `Player ${summary.winner}`} wins.`;
    if (summary.winnerColor) {
      winnerEl.style.setProperty("--team", summary.winnerColor);
    } else {
      winnerEl.style.removeProperty("--team");
    }

    statsEl.innerHTML = "";
    addStat(statsEl, "Mode", MODE_LABELS[summary.mode] ?? summary.mode);
    addStat(
      statsEl,
      "Players",
      summary.format === "teams"
        ? `${summary.playerCount} (2v2 teams)`
        : `${summary.playerCount}${summary.playerCount > 2 ? " (free-for-all)" : ""}`,
    );
    addStat(statsEl, "Board", `${summary.size} × ${summary.size}`);
    addStat(statsEl, "Squad turns", String(summary.turns));
    addStat(statsEl, "Duration", formatDuration(summary.durationMs));
    addStat(statsEl, "Victory", REASON_LABELS[summary.victoryReason] ?? "Squad eliminated");
  }

  return { el, onEnter };
}

function addStat(listEl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  listEl.append(dt, dd);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
