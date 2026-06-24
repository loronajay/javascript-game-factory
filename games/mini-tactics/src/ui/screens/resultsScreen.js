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
  desync: "Connection lost",
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
  const reportEl = el.querySelector('[data-results="report"]');
  const statsEl = el.querySelector('[data-results="stats"]');
  const burstEl = el.querySelector('[data-results="burst"]');
  const rematchBtn = el.querySelector('[data-action="rematch"]');

  let lastSummary = null;

  rematchBtn.addEventListener("click", () => {
    if (!lastSummary) return;
    // Online matches can't be re-run locally (the relay session is gone) — send
    // the player back to the lobby to find a fresh opponent instead.
    if (lastSummary.mode === "online") {
      ctx.nav("onlineSetup");
      return;
    }
    ctx.nav("match", {
      mode: lastSummary.mode,
      size: lastSummary.size,
      playerCount: lastSummary.playerCount,
      format: lastSummary.format,
      teamColors: lastSummary.teamColors,
      teamNames: lastSummary.teamNames,
      difficulty: lastSummary.difficulty,
    });
  });

  function onEnter(summary) {
    lastSummary = summary;

    rematchBtn.textContent = summary.mode === "online" ? "New Match" : "Rematch";

    // Desync/disconnect endings have no clean winner — lead with the termination
    // reason and skip the victory styling/confetti.
    if (summary.terminated) {
      winnerEl.textContent = summary.terminationReason || "Match ended.";
      winnerEl.style.removeProperty("--team");
    } else {
      winnerEl.textContent = `${summary.winnerLabel ?? `Player ${summary.winner}`} wins.`;
      if (summary.winnerColor) {
        winnerEl.style.setProperty("--team", summary.winnerColor);
      } else {
        winnerEl.style.removeProperty("--team");
      }
    }

    renderReport(reportEl, summary.teams ?? []);

    statsEl.innerHTML = "";
    addStat(statsEl, "Mode", MODE_LABELS[summary.mode] ?? summary.mode);
    if (summary.mode === "single") {
      addStat(statsEl, "CPU", DIFFICULTY_LABELS[summary.difficulty] ?? summary.difficulty);
    }
    if (summary.format === "teams") {
      addStat(statsEl, "Format", "2v2 teams");
    } else if (summary.playerCount > 2) {
      addStat(statsEl, "Format", `${summary.playerCount}-player free-for-all`);
    }
    addStat(statsEl, "Board", `${summary.size} × ${summary.size}`);
    addStat(statsEl, "Squad turns", String(summary.turns));
    addStat(statsEl, "Duration", formatDuration(summary.durationMs));
    addStat(
      statsEl,
      "Ended by",
      summary.terminated
        ? REASON_LABELS[summary.terminated] ?? "Ended"
        : REASON_LABELS[summary.victoryReason] ?? "Squad eliminated",
    );

    // No celebration for a match that ended on a drop or desync.
    if (summary.terminated) {
      burstEl.replaceChildren();
    } else {
      spawnConfetti(burstEl, summary.winnerColor);
    }
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

  const palette = [winnerColor || "#e6c065", "#e6c065", "#f6edd4"];

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

// Per-team battle report: one card per side, winner first (the controller already
// sorted them). Each card shows surviving force as an HP bar tinted to the team's
// hue plus the squad's offensive tally. Loser cards read dimmed with 0 survivors.
function renderReport(host, teams) {
  if (!host) {
    return;
  }
  host.replaceChildren();

  for (const team of teams) {
    const card = document.createElement("div");
    card.className = `report-team${team.isWinner ? " is-winner" : ""}`;
    card.style.setProperty("--team", team.color || "#b6a585");

    const head = document.createElement("div");
    head.className = "report-head";
    head.innerHTML = `
      <span class="report-dot"></span>
      <span class="report-name">${escapeHtml(team.label)}</span>
      ${team.isWinner ? '<span class="report-badge">Winner</span>' : ""}
      <span class="report-survivors">${team.unitsAlive}/${team.unitsTotal} units</span>
    `;

    const pct = team.hpTotal > 0 ? Math.round((team.hpRemaining / team.hpTotal) * 100) : 0;
    const bar = document.createElement("div");
    bar.className = "report-hpbar";
    bar.innerHTML = `<div class="report-hpfill" style="width:${pct}%"></div>`;

    const tallies = document.createElement("div");
    tallies.className = "report-tallies";
    tallies.append(
      tally("Damage", team.damageDealt),
      tally("Kills", team.kills),
    );
    if (team.healingDone > 0) {
      tallies.append(tally("Healed", team.healingDone));
    }
    tallies.append(tally("HP left", team.hpRemaining));

    card.append(head, bar, tallies);
    host.append(card);
  }
}

function tally(label, value) {
  const el = document.createElement("span");
  el.className = "report-tally";
  el.innerHTML = `<b>${value}</b><i>${label}</i>`;
  return el;
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]),
  );
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
