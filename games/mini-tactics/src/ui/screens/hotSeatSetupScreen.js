import { bindCommonControls, bindSegmented, screenRoot, selectSeg } from "./common.js";
import { BOARD_SIZES, PLAYER_COLORS } from "../../config.js";
import { createSquadPicker } from "./squadBuilder.js";

// Hot Seat setup: choose player count (2-4), format (free-for-all or 2v2 teams,
// teams only when 4 players), per-team colors, and board size, then start the
// match. Board size follows the locked rule — 13×13 for 3-4 players, 10×10 for a
// 2-player duel — by disabling the mismatched option.
const HUES = [
  PLAYER_COLORS[1],
  PLAYER_COLORS[2],
  PLAYER_COLORS[3],
  PLAYER_COLORS[4],
];

export function createHotSeatSetupScreen(ctx) {
  const el = screenRoot("hsSetup");
  bindCommonControls(el, ctx);

  // Mutable selection state for the screen.
  const state = {
    playerCount: 2,
    format: "ffa",
    size: 10,
    teamColors: { 1: PLAYER_COLORS[1], 2: PLAYER_COLORS[4] },
    // Optional custom team names; empty falls back to "Team 1"/"Team 2".
    teamNames: { 1: "", 2: "" },
    // Custom squads are off by default — Standard keeps the one-click classic
    // path (compositions stay null). Each seat keeps its own live picker so
    // toggling Standard/Custom or changing player count never loses a choice.
    customSquads: false,
  };

  const groups = {
    format: el.querySelector('[data-group="format"]'),
    teamNames: el.querySelector('[data-group="teamNames"]'),
    teamColors: el.querySelector('[data-group="teamColors"]'),
  };
  const sizeSegs = [...el.querySelectorAll('[data-field="boardSize"] .seg')];

  // One squad picker per seat (1-4), built lazily and kept alive across toggles.
  // The host shows only the pickers for the currently selected player count.
  const squadHost = el.querySelector("[data-squad-pickers]");
  const squadHint = el.querySelector("[data-squad-hint]");
  const pickers = new Map();

  bindSegmented(el, "playerCount", (seg) => {
    state.playerCount = Number(seg.dataset.count);
    if (state.playerCount !== 4) state.format = "ffa";
    syncFormat();
    syncBoardSize();
    syncVisibility();
    syncSquads();
  });

  bindSegmented(el, "squadMode", (seg) => {
    state.customSquads = seg.dataset.squad === "custom";
    syncSquads();
  });

  bindSegmented(el, "format", (seg) => {
    state.format = seg.dataset.format;
    syncVisibility();
  });

  bindSegmented(el, "boardSize", (seg) => {
    const chosen = Number(seg.dataset.size);
    if (BOARD_SIZES.includes(chosen) && !seg.disabled) {
      state.size = chosen;
    }
  });

  buildSwatches(el, 1, state, renderSwatches);
  buildSwatches(el, 2, state, renderSwatches);

  // Custom team names are optional; the field is only visible/used in 2v2 teams.
  // Typing a name also relabels that team's color row so the two stay in sync.
  el.querySelectorAll(".team-name-input").forEach((input) => {
    input.addEventListener("input", () => {
      const team = input.dataset.teamName;
      state.teamNames[team] = input.value;
      syncTeamColorLabel(team);
    });
  });

  el.querySelector('[data-action="startHotSeat"]').addEventListener("click", () => {
    ctx.nav("match", {
      mode: "hotseat",
      size: state.size,
      playerCount: state.playerCount,
      format: state.format,
      teamColors: state.format === "teams" ? { ...state.teamColors } : null,
      teamNames: state.format === "teams" ? { ...state.teamNames } : null,
      compositions: collectCompositions(),
    });
  });

  // Build the { seat: composition } map for the active player count, or null in
  // Standard mode so the classic one-of-each squad path is used unchanged.
  function collectCompositions() {
    if (!state.customSquads) return null;
    const compositions = {};
    for (let seat = 1; seat <= state.playerCount; seat += 1) {
      compositions[seat] = ensurePicker(seat).getComposition();
    }
    return compositions;
  }

  function ensurePicker(seat) {
    let picker = pickers.get(seat);
    if (!picker) {
      picker = createSquadPicker({
        title: `Player ${seat}`,
        accent: PLAYER_COLORS[seat],
      });
      pickers.set(seat, picker);
    }
    return picker;
  }

  // Show the Custom pickers (one per active seat) only when Custom is selected.
  function syncSquads() {
    const custom = state.customSquads;
    squadHost.hidden = !custom;
    squadHint.hidden = !custom;
    if (!custom) return;
    squadHost.replaceChildren();
    for (let seat = 1; seat <= state.playerCount; seat += 1) {
      squadHost.appendChild(ensurePicker(seat).el);
    }
  }

  function syncFormat() {
    selectSeg(el, "format", (seg) => seg.dataset.format === state.format);
  }

  // 3-4 players force 13×13; a 2-player duel defaults to 10×10. The off-rule
  // size button is disabled and selection snapped to the valid one.
  function syncBoardSize() {
    const multi = state.playerCount > 2;
    state.size = multi ? 13 : state.size;
    for (const seg of sizeSegs) {
      const value = Number(seg.dataset.size);
      seg.disabled = multi && value === 10;
      seg.classList.toggle("is-selected", value === state.size);
    }
  }

  function syncVisibility() {
    const teams = state.playerCount === 4 && state.format === "teams";
    groups.format.hidden = state.playerCount !== 4;
    groups.teamNames.hidden = !teams;
    groups.teamColors.hidden = !teams;
    renderSwatches();
  }

  // The color row's label echoes the typed team name (or the default placeholder
  // text) so it is clear which swatch row belongs to which named team.
  function syncTeamColorLabel(team) {
    const label = el.querySelector(`[data-team-color-name="${team}"]`);
    if (label) label.textContent = state.teamNames[team].trim() || `Team ${team}`;
  }

  function renderSwatches() {
    for (const team of [1, 2]) {
      const other = team === 1 ? 2 : 1;
      const host = el.querySelector(`[data-swatches="${team}"]`);
      for (const btn of host.querySelectorAll(".swatch")) {
        const hue = btn.dataset.hue;
        btn.classList.toggle("is-selected", hue === state.teamColors[team]);
        // A hue already taken by the other team is unavailable here.
        btn.disabled = hue === state.teamColors[other];
      }
    }
  }

  // Initial sync so the screen opens in a consistent state.
  syncBoardSize();
  syncVisibility();
  syncSquads();

  return { el };
}

function buildSwatches(root, team, state, onChange) {
  const host = root.querySelector(`[data-swatches="${team}"]`);
  for (const hue of HUES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.dataset.hue = hue;
    btn.style.setProperty("--swatch", hue);
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      state.teamColors[team] = hue;
      onChange();
    });
    host.appendChild(btn);
  }
}
