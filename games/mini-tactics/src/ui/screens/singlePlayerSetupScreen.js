import { bindCommonControls, bindSegmented, screenRoot } from "./common.js";
import { BOARD_SIZES, PLAYER_COLORS } from "../../config.js";
import { createSquadPicker } from "./squadBuilder.js";

// Single Player setup: board size + CPU difficulty, then start. Per the scope the
// human is always Player 1 and the CPU is Player 2, so the match is a fixed
// two-player free-for-all — only the board size and difficulty are chosen here.
// Custom squads add a picker for the human AND the CPU (the CPU build is handy
// for testing specific matchups; the AI handles any composition).
const DIFFICULTIES = ["easy", "normal", "hard"];

export function createSinglePlayerSetupScreen(ctx) {
  const el = screenRoot("spSetup");
  bindCommonControls(el, ctx);

  const state = { size: 10, difficulty: "normal", customSquads: false };

  const squadHost = el.querySelector("[data-squad-pickers]");
  const squadHint = el.querySelector("[data-squad-hint]");
  // Seat 1 = the human, seat 2 = the CPU. Both pickers stay alive across toggles.
  const humanPicker = createSquadPicker({ title: "You", accent: PLAYER_COLORS[1] });
  const cpuPicker = createSquadPicker({ title: "CPU", accent: PLAYER_COLORS[2] });

  bindSegmented(el, "boardSize", (seg) => {
    const chosen = Number(seg.dataset.size);
    if (BOARD_SIZES.includes(chosen)) state.size = chosen;
  });

  bindSegmented(el, "difficulty", (seg) => {
    if (DIFFICULTIES.includes(seg.dataset.difficulty)) {
      state.difficulty = seg.dataset.difficulty;
    }
  });

  bindSegmented(el, "squadMode", (seg) => {
    state.customSquads = seg.dataset.squad === "custom";
    syncSquads();
  });

  el.querySelector('[data-action="startSingle"]').addEventListener("click", () => {
    ctx.nav("match", {
      mode: "single",
      size: state.size,
      playerCount: 2,
      format: "ffa",
      difficulty: state.difficulty,
      compositions: state.customSquads
        ? { 1: humanPicker.getComposition(), 2: cpuPicker.getComposition() }
        : null,
    });
  });

  // Standard keeps compositions null (classic one-of-each squads); Custom reveals
  // both pickers.
  function syncSquads() {
    squadHost.hidden = !state.customSquads;
    squadHint.hidden = !state.customSquads;
    if (!state.customSquads) return;
    squadHost.replaceChildren(humanPicker.el, cpuPicker.el);
  }

  syncSquads();

  return { el };
}
