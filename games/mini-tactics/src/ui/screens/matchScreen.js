import { screenRoot } from "./common.js";

// Match screen: the board itself. It wraps the GameController — entering the
// screen starts a match for the requested mode/size. The Rules and Menu (quit)
// toolbar buttons live here; Restart visibility is owned by the controller per
// mode. The controller routes match completion to the results screen.
export function createMatchScreen(ctx) {
  const el = screenRoot("match");

  el.querySelector("#rulesBtn").addEventListener("click", () => ctx.openRules());
  el.querySelector("#quitBtn").addEventListener("click", () => ctx.nav("mainMenu"));

  return {
    el,
    onEnter(params) {
      ctx.controller.startMatch(params);
    },
  };
}
