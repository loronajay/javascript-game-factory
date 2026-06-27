import { bindCommonControls, screenRoot } from "./common.js";

export const ARCADE_GRID_URL = "../../grid.html";

export function goBackToArcade(windowRef = window) {
  windowRef.location.assign(ARCADE_GRID_URL);
}

// Main menu: routes to the mode-setup screens. Single Player and Online Versus
// are present but disabled in the markup until their modes are built (CPU next,
// then online). Hot Seat is fully wired today.
export function createMainMenuScreen(ctx) {
  const el = screenRoot("mainMenu");
  bindCommonControls(el, ctx);
  el.querySelector('[data-action="backArcade"]')?.addEventListener("click", () => {
    goBackToArcade();
  });
  return { el };
}
