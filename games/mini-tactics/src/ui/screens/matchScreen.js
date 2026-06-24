import { screenRoot } from "./common.js";

// Match screen: the board itself. It wraps the GameController — entering the
// screen starts a match for the requested mode/size. The Rules and Menu (quit)
// toolbar buttons live here; Restart visibility is owned by the controller per
// mode. The controller routes match completion to the results screen.
//
// The looping battle music is owned by this screen's lifecycle: it starts when
// the board is entered and stops on exit (quit, or the move to the results
// screen), so music plays exactly while a match is on-screen.
export function createMatchScreen(ctx) {
  const el = screenRoot("match");

  el.querySelector("#rulesBtn").addEventListener("click", () => ctx.openRules());
  el.querySelector("#quitBtn").addEventListener("click", () => {
    // Quitting an online match abandons it — drop the socket so the opponent is
    // told cleanly (they see a disconnect end). No-op for local play.
    ctx.controller.net?.dispose();
    ctx.nav("mainMenu");
  });

  return {
    el,
    onEnter(params) {
      ctx.controller.startMatch(params);
      ctx.audio?.startMusic("battle");
    },
    onExit() {
      ctx.audio?.stopMusic();
    },
  };
}
