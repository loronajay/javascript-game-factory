import { bindCommonControls, screenRoot } from "./common.js";

// Main menu: routes to the mode-setup screens. Single Player and Online Versus
// are present but disabled in the markup until their modes are built (CPU next,
// then online). Hot Seat is fully wired today.
export function createMainMenuScreen(ctx) {
  const el = screenRoot("mainMenu");
  bindCommonControls(el, ctx);
  el.querySelector('[data-action="startTutorial"]')?.addEventListener("click", () => {
    ctx.nav("match", {
      mode: "tutorial",
      size: 10,
      playerCount: 2,
      format: "ffa",
      difficulty: "tutorial",
    });
  });
  return { el };
}
