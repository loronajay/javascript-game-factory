import { bindCommonControls, screenRoot } from "./common.js";
import { prefersReducedMotion } from "../../render/motion.js";

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

const DIFFICULTY_LABELS = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

// Results screen: populated on entry from the controller's match summary. Rematch
// re-enters the match screen with the same mode and board size.
export function createResultsScreen(ctx) {
  const el = screenRoot("results");
  bindCommonControls(el, ctx);

  const winnerEl = el.querySelector('[data-results="winner"]');
  const statsEl = el.querySelector('[data-results="stats"]');
  const burstEl = el.querySelector('[data-results="burst"]');

  let lastSummary = null;

  el.querySelector('[data-action="rematch"]').addEventListener("click", () => {
    if (lastSummary) {
      ctx.nav("match", {
        mode: lastSummary.mode,
        size: lastSummary.size,
        playerCount: lastSummary.playerCount,
        format: lastSummary.format,
        teamColors: lastSummary.teamColors,
        teamNames: lastSummary.teamNames,
        difficulty: lastSummary.difficulty,
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
    if (summary.mode === "single") {
      addStat(statsEl, "CPU", DIFFICULTY_LABELS[summary.difficulty] ?? summary.difficulty);
    }
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

    spawnConfetti(burstEl, summary.winnerColor);
  }

  return { el, onEnter };
}

// Celebratory confetti shower tinted to the winner's hue, mixed with gold and a
// bright accent so the burst reads festive rather than monochrome. Each piece is
// a CSS-animated chip that removes itself; the whole field is cleared first so a
// rematch loop never stacks. Skipped under reduced-motion.
const CONFETTI_COUNT = 44;

function spawnConfetti(host, winnerColor) {
  if (!host) {
    return;
  }

  host.replaceChildren();

  if (prefersReducedMotion()) {
    return;
  }

  const palette = [winnerColor || "#ffd26a", "#ffd26a", "#f2f4f8"];

  for (let i = 0; i < CONFETTI_COUNT; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = palette[i % palette.length];
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty("--spin", `${(Math.random() - 0.5) * 900}deg`);
    piece.style.setProperty("--dur", `${1.6 + Math.random() * 1.4}s`);
    piece.style.setProperty("--delay", `${Math.random() * 0.5}s`);
    piece.style.setProperty("--size", `${6 + Math.random() * 7}px`);
    host.appendChild(piece);
  }

  // Tidy up once the longest fall has finished so the node count stays flat.
  window.setTimeout(() => host.replaceChildren(), 4200);
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
