// Menu / screen flow — owns the title → main menu → hot-seat setup → match →
// results loop and the Settings overlay. Kept out of main.js (which owns the
// match itself) so neither file becomes a mixed-purpose controller. Ported in
// spirit from Mini-Tactics' screen system, trimmed to the modes Tactical Arena
// currently supports (hot-seat 1v1); the other menu options are present but
// flagged "Soon" until their units/CPU/online land.
import { ScreenManager } from "./screenManager.js";
import { createSquadPicker, DEFAULT_SQUAD } from "./squadPicker.js";

const TEAM_COLOR = { 1: "#5288c6", 2: "#c4463f" };
const CONFETTI_COUNT = 44;

export function createMenuFlow({ audio, onStartMatch, openCodex }) {
  const screens = new ScreenManager();
  const $ = (sel, root = document) => root.querySelector(sel);
  const screenEl = (name) => $(`[data-screen="${name}"]`);

  for (const name of ["title", "mainMenu", "hsSetup", "spSetup", "results", "match"]) {
    screens.register(name, { el: screenEl(name) });
  }

  // ── Setup screens: board size + custom squads (and difficulty for solo) ───
  // Squads are always custom — both sides build a four-piece squad from the roster
  // pop-up (squadPicker → rosterPicker). These modes are casual, so duplicate units
  // are allowed; draft/ranked will pass allowDuplicates:false later.
  function buildSquadPickers(host, p2Title) {
    host.replaceChildren();
    const p1 = createSquadPicker({ title: "Player 1", initial: DEFAULT_SQUAD, accent: TEAM_COLOR[1], allowDuplicates: true });
    const p2 = createSquadPicker({ title: p2Title, initial: DEFAULT_SQUAD, accent: TEAM_COLOR[2], allowDuplicates: true });
    host.append(p1.el, p2.el);
    return { p1, p2 };
  }

  const hsSetup = screenEl("hsSetup");
  const spSetup = screenEl("spSetup");
  const hsPickers = buildSquadPickers($("[data-squad-pickers]", hsSetup), "Player 2");
  const spPickers = buildSquadPickers($("[data-sp-squad-pickers]", spSetup), "Computer");

  function gatherHotSeatConfig() {
    const size = Number(selectedValue(hsSetup, "boardSize", "size")) || 13;
    return { mode: "hotseat", size, squads: { 1: hsPickers.p1.getSquad(), 2: hsPickers.p2.getSquad() } };
  }

  function gatherSingleConfig() {
    const size = Number(selectedValue(spSetup, "boardSize", "size")) || 13;
    const difficulty = selectedValue(spSetup, "difficulty", "difficulty") || "normal";
    return { mode: "single", difficulty, size, squads: { 1: spPickers.p1.getSquad(), 2: spPickers.p2.getSquad() } };
  }

  // ── Results ──────────────────────────────────────────────────────────────
  const results = screenEl("results");
  const burstEl = $("[data-results='burst']", results);
  let lastConfig = null;

  function showResults(summary) {
    $("[data-results='winner']", results).textContent = `Player ${summary.winner} wins.`;
    $("[data-results='winner']", results).style.setProperty("--team", TEAM_COLOR[summary.winner]);
    renderReport($("[data-results='report']", results), summary.teams);
    const stats = $("[data-results='stats']", results);
    stats.innerHTML = "";
    addStat(stats, "Mode", lastConfig?.mode === "single"
      ? `Single Player · ${(lastConfig.difficulty ?? "normal").replace(/^./, (c) => c.toUpperCase())}`
      : "Hot Seat");
    addStat(stats, "Board", `${summary.size} × ${summary.size}`);
    addStat(stats, "Squad turns", String(summary.turns));
    addStat(stats, "Duration", formatDuration(summary.durationMs));
    addStat(stats, "Ended by", "Squad eliminated");
    screens.show("results");
    spawnConfetti(burstEl, TEAM_COLOR[summary.winner]);
  }

  // ── Settings overlay ─────────────────────────────────────────────────────
  const settingsModal = $("#settingsModal");
  const soundToggle = $("#setSoundToggle", settingsModal);
  const sfxRange = $("#setSfxVolume", settingsModal);
  const musicRange = $("#setMusicVolume", settingsModal);

  function openSettings() {
    soundToggle.checked = audio.enabled !== false;
    sfxRange.value = String(Math.round((audio.volume ?? 0.85) * 100));
    musicRange.value = String(Math.round((audio.musicVolume ?? 0.32) * 100));
    settingsModal.hidden = false;
  }
  function closeSettings() { settingsModal.hidden = true; }

  soundToggle.addEventListener("change", () => audio.setEnabled(soundToggle.checked));
  sfxRange.addEventListener("input", () => audio.setVolume(Number(sfxRange.value) / 100));
  musicRange.addEventListener("input", () => audio.setMusicVolume(Number(musicRange.value) / 100));
  $("#setCloseBtn", settingsModal).addEventListener("click", closeSettings);
  settingsModal.addEventListener("click", (event) => { if (event.target === settingsModal) closeSettings(); });

  // ── Global delegated wiring (nav + actions + segmented controls) ──────────
  document.addEventListener("click", (event) => {
    const navBtn = event.target.closest("[data-nav]");
    if (navBtn && !navBtn.disabled) {
      if (navBtn.dataset.nav !== "match") audio.stopMusic();
      screens.show(navBtn.dataset.nav);
      return;
    }

    const seg = event.target.closest(".seg");
    if (seg && !seg.disabled) {
      for (const sibling of seg.parentElement.querySelectorAll(".seg")) sibling.classList.toggle("is-selected", sibling === seg);
      return;
    }

    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn || actionBtn.disabled) return;
    switch (actionBtn.dataset.action) {
      case "rules": openCodex(); break;
      case "settings": openSettings(); break;
      case "startHotSeat": { lastConfig = gatherHotSeatConfig(); onStartMatch(lastConfig); break; }
      case "startSingle": { lastConfig = gatherSingleConfig(); onStartMatch(lastConfig); break; }
      case "rematch": if (lastConfig) onStartMatch(lastConfig); break;
      default: break;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settingsModal.hidden) closeSettings();
  });

  return {
    show: (name) => screens.show(name),
    showResults,
    get active() { return screens.active; }
  };
}

// The selected button's data value within a named segmented control.
function selectedValue(root, field, dataKey) {
  const group = root.querySelector(`[data-field="${field}"]`);
  const selected = group?.querySelector(".seg.is-selected");
  return selected?.dataset[dataKey] ?? null;
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
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
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
