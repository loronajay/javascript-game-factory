import { bindCommonControls, screenRoot } from "./common.js";

// Title screen: Continue → main menu, How to Play → rules overlay. Per the scope,
// no board-size or debug controls live here. Settings is a placeholder for now.
export function createTitleScreen(ctx) {
  const el = screenRoot("title");
  bindCommonControls(el, ctx);
  return { el };
}
