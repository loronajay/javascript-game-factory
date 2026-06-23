import { bindCommonControls, bindSegmented, screenRoot } from "./common.js";
import { BOARD_SIZES } from "../../config.js";

// Single Player setup: board size + CPU difficulty, then start. Per the scope the
// human is always Player 1 and the CPU is Player 2, so the match is a fixed
// two-player free-for-all — only the board size and difficulty are chosen here.
const DIFFICULTIES = ["easy", "normal", "hard"];

export function createSinglePlayerSetupScreen(ctx) {
  const el = screenRoot("spSetup");
  bindCommonControls(el, ctx);

  const state = { size: 10, difficulty: "normal" };

  bindSegmented(el, "boardSize", (seg) => {
    const chosen = Number(seg.dataset.size);
    if (BOARD_SIZES.includes(chosen)) state.size = chosen;
  });

  bindSegmented(el, "difficulty", (seg) => {
    if (DIFFICULTIES.includes(seg.dataset.difficulty)) {
      state.difficulty = seg.dataset.difficulty;
    }
  });

  el.querySelector('[data-action="startSingle"]').addEventListener("click", () => {
    ctx.nav("match", {
      mode: "single",
      size: state.size,
      playerCount: 2,
      format: "ffa",
      difficulty: state.difficulty,
    });
  });

  return { el };
}
