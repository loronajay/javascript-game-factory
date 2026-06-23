import { bindCommonControls, screenRoot } from "./common.js";
import { BOARD_SIZES, PLAYER_COLORS } from "../../config.js";

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
  };

  const groups = {
    format: el.querySelector('[data-group="format"]'),
    teamColors: el.querySelector('[data-group="teamColors"]'),
  };
  const sizeSegs = [...el.querySelectorAll('[data-field="boardSize"] .seg')];

  bindSegmented(el, "playerCount", (seg) => {
    state.playerCount = Number(seg.dataset.count);
    if (state.playerCount !== 4) state.format = "ffa";
    syncFormat();
    syncBoardSize();
    syncVisibility();
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

  el.querySelector('[data-action="startHotSeat"]').addEventListener("click", () => {
    ctx.nav("match", {
      mode: "hotseat",
      size: state.size,
      playerCount: state.playerCount,
      format: state.format,
      teamColors: state.format === "teams" ? { ...state.teamColors } : null,
    });
  });

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
    groups.format.hidden = state.playerCount !== 4;
    groups.teamColors.hidden = !(state.playerCount === 4 && state.format === "teams");
    renderSwatches();
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

  return { el };
}

function bindSegmented(root, field, onPick) {
  root.querySelectorAll(`[data-field="${field}"] .seg`).forEach((seg) => {
    seg.addEventListener("click", () => {
      if (seg.disabled) return;
      selectSeg(root, field, (candidate) => candidate === seg);
      onPick(seg);
    });
  });
}

function selectSeg(root, field, isChosen) {
  root.querySelectorAll(`[data-field="${field}"] .seg`).forEach((seg) => {
    seg.classList.toggle("is-selected", isChosen(seg));
  });
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
