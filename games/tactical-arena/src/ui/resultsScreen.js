// The post-match results screen: winner banner, per-team battle report, stat list,
// and the confetti shower. Extracted from menuFlow.js; the menu router passes the
// last-started match config so Mode/Rematch behave identically for hot-seat,
// single-player, campaign, and online.

import { escapeHtml } from "./domHelpers.js";
import { MENU_TEAM_COLORS } from "./teamDisplay.js";
import { formatValor } from "../progression/marketplace.js";
import { campaignResultsValorLabel, unitLabel } from "./campaignMenuModel.js";
import { renderOpponentCard } from "./resultsOpponentCard.js";
import { renderRankedResult } from "./rankedResults.js";

const CONFETTI_COUNT = 44;

export function syncResultsActions({ rematchBtn, campaignMapBtn } = {}, { online = false, campaign = null } = {}) {
  const isCampaign = Boolean(campaign);
  // Campaign rewards and newly opened missions live on the map, so make that the
  // primary post-mission action while still leaving Main Menu available.
  if (rematchBtn) rematchBtn.hidden = online || isCampaign;
  if (campaignMapBtn) campaignMapBtn.hidden = !isCampaign;
}

export function createResultsScreen({
  showScreen = () => {},
  getLastConfig = () => null,
  announceProgression = () => {},
} = {}) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const results = $('[data-screen="results"]');
  const burstEl = $("[data-results='burst']", results);
  const rematchBtn = $("[data-action='rematch']", results);
  const campaignMapBtn = $("[data-results='campaign-map']", results);
  const resultsMainMenuBtn = $("[data-nav='mainMenu']", results);
  const opponentEl = $("[data-results='opponent']", results);

  function showResults(summary) {
    const lastConfig = getLastConfig();
    const online = lastConfig?.mode === "online";
    const campaign = summary.campaign ?? null;
    $("[data-results='title']", results).textContent = campaign ? (campaign.victory ? "Mission Complete" : "Mission Failed") : "Victory";
    $("[data-results='winner']", results).textContent = campaign
      ? `${campaign.missionTitle}: ${campaign.stars}/3 stars, grade ${campaign.grade}.`
      : `${summary.winnerLabel ?? `Player ${summary.winner}`} wins.`;
    $("[data-results='winner']", results).style.setProperty("--team", summary.winnerColor ?? MENU_TEAM_COLORS[summary.winner]);
    renderReport($("[data-results='report']", results), summary.teams);
    const stats = $("[data-results='stats']", results);
    stats.innerHTML = "";
    results.querySelector?.(".ranked-placement-result")?.remove?.();
    addStat(stats, "Mode", online
      ? "Online Versus"
      : lastConfig?.mode === "campaign"
        ? "Campaign"
      : lastConfig?.mode === "tempo-single"
        ? `Tempo Battle · ${(lastConfig.difficulty ?? "normal").replace(/^./, (c) => c.toUpperCase())}`
      : lastConfig?.mode === "single"
        ? `Single Player · ${(lastConfig.difficulty ?? "normal").replace(/^./, (c) => c.toUpperCase())}`
        : "Hot Seat");
    if (campaign) {
      addStat(stats, "Stars", `${campaign.stars} / 3`);
      addStat(stats, "Grade", campaign.grade);
      if (campaign.bonusObjectives?.some((objective) => objective.earned)) {
        addStat(stats, "Bonus", campaign.bonusObjectives.filter((objective) => objective.earned).map((objective) => objective.label.replace(/^Bonus:\s*/i, "")).join(", "));
      }
      addStat(stats, "Reward", campaign.newRewardUnits?.length ? campaign.newRewardUnits.map(unitLabel).join(", ") : campaign.victory ? "Already unlocked" : "Win to unlock");
      addStat(stats, "Valor", campaignResultsValorLabel(campaign));
    } else if (online && summary.onlineValor) {
      addStat(stats, "Valor", summary.onlineValor.valorGranted > 0 ? `+${formatValor(summary.onlineValor.valorGranted)}` : "No reward");
    }
    if (online && lastConfig?.ranked) {
      void renderRankedResult(lastConfig.ranked, stats);
    }
    if (opponentEl) {
      const rankedOutcome = online && lastConfig?.ranked
        ? summary.winner === lastConfig.mySeat ? "win" : "loss"
        : null;
      renderOpponentCard(opponentEl, online ? lastConfig?.ranked : null, {
        net: lastConfig?.net,
        mySeat: lastConfig?.mySeat,
        outcome: rankedOutcome,
      });
    }
    addStat(stats, "Board", `${summary.size} × ${summary.size}`);
    addStat(stats, "Squad turns", String(summary.turns));
    addStat(stats, "Duration", formatDuration(summary.durationMs));
    addStat(stats, "Ended by", "Squad eliminated");
    // A finished online session can't be locally replayed — Main Menu only.
    syncResultsActions({ rematchBtn, campaignMapBtn }, { online, campaign });
    // Some campaign missions (The Wandering Party) must route the player back through the
    // map so a post-match cutscene + reward pick can run without the player escaping to
    // the menu first. In that case Campaign Map is the only exit off the results screen.
    if (resultsMainMenuBtn) resultsMainMenuBtn.hidden = Boolean(campaign?.forceMapReturn);
    showScreen("results");
    spawnConfetti(burstEl, MENU_TEAM_COLORS[summary.winner]);
    if (campaign?.victory) announceProgression({ delay: 550 });
  }

  return { showResults };
}

// Per-player battle report card — winner first (caller sorts). Surviving force as
// an HP bar tinted to the team hue, plus the squad's offensive tally.
function renderReport(host, teams) {
  host.replaceChildren();
  for (const team of teams) {
    const card = document.createElement("div");
    card.className = `report-team${team.isWinner ? " is-winner" : ""}`;
    card.style.setProperty("--team", team.color);
    const pct = team.hpTotal > 0 ? Math.round((team.hpRemaining / team.hpTotal) * 100) : 0;
    card.innerHTML =
      `<div class="report-head"><span class="report-dot"></span>` +
      `<span class="report-name">${escapeHtml(team.label)}</span>` +
      `${team.isWinner ? '<span class="report-badge">Winner</span>' : ""}` +
      `<span class="report-survivors">${team.unitsAlive}/${team.unitsTotal} units</span></div>` +
      `<div class="report-hpbar"><div class="report-hpfill" style="width:${pct}%"></div></div>` +
      `<div class="report-tallies">${tally("Damage", team.damageDealt)}${tally("Kills", team.kills)}${tally("HP left", team.hpRemaining)}</div>`;
    host.append(card);
  }
}

function tally(label, value) {
  return `<span class="report-tally"><b>${value}</b><i>${label}</i></span>`;
}

function addStat(listEl, label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  listEl.append(dt, dd);
  return dd;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Celebratory confetti shower tinted to the winner; each chip removes itself and
// the field is cleared first so a rematch loop never stacks. Skipped under reduced motion.
function spawnConfetti(host, winnerColor) {
  host.replaceChildren();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const palette = [winnerColor, "#e6c065", "#f6edd4"];
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
  window.setTimeout(() => host.replaceChildren(), 4200);
}
