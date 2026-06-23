// App orchestrator: builds the screen manager, the shared chrome (rules overlay),
// the GameController, and every screen, then wires them through a single nav
// context. This is the only place that knows the full screen graph — screens
// themselves only know the context they are handed.
//
// Boot lands on the title screen; no match exists until the match screen is
// entered with a { mode, size }.

import { getUiElements } from "./ui/elements.js";
import { AudioManager } from "./audio/sounds.js";
import { MessageController } from "./ui/messageController.js";
import { TurnAnnouncer } from "./ui/turnFlash.js";
import { RulesModal } from "./ui/rulesModal.js";
import { ConfirmDialog } from "./ui/confirmDialog.js";
import { GameController } from "./game/GameController.js";
import { ScreenManager } from "./ui/screens/screenManager.js";
import { createTitleScreen } from "./ui/screens/titleScreen.js";
import { createMainMenuScreen } from "./ui/screens/mainMenuScreen.js";
import { createSinglePlayerSetupScreen } from "./ui/screens/singlePlayerSetupScreen.js";
import { createHotSeatSetupScreen } from "./ui/screens/hotSeatSetupScreen.js";
import { createMatchScreen } from "./ui/screens/matchScreen.js";
import { createResultsScreen } from "./ui/screens/resultsScreen.js";

export function createApp(documentRef = document) {
  const elements = getUiElements(documentRef);
  const audio = new AudioManager();

  // One delegated click hit for every button on every screen (menus, setup,
  // in-game HUD, modals). The first such click is also the user gesture that
  // unlocks audio playback, so combat/UI sounds work for the rest of the session.
  documentRef.addEventListener("click", (event) => {
    const button = event.target.closest?.("button");
    if (button && !button.disabled) {
      audio.play("buttonClick");
    }
  });

  const messages = new MessageController(elements.message);
  const turnAnnouncer = new TurnAnnouncer(elements.turnFlash);

  const rules = new RulesModal(
    documentRef.getElementById("rulesModal"),
    documentRef.getElementById("closeRulesBtn"),
  );

  const confirmDialog = new ConfirmDialog(
    documentRef.getElementById("confirmModal"),
  );

  const manager = new ScreenManager();

  // The single navigation seam handed to every screen.
  const ctx = {
    nav: (name, params) => manager.show(name, params),
    openRules: () => rules.open(),
  };

  const controller = new GameController({
    elements,
    messages,
    audio,
    turnAnnouncer,
    confirm: (options) => confirmDialog.ask(options),
    onMatchComplete: (summary) => ctx.nav("results", summary),
  });

  manager
    .register("title", createTitleScreen(ctx))
    .register("mainMenu", createMainMenuScreen(ctx))
    .register("spSetup", createSinglePlayerSetupScreen(ctx))
    .register("hsSetup", createHotSeatSetupScreen(ctx))
    .register("match", createMatchScreen({ ...ctx, controller }))
    .register("results", createResultsScreen(ctx));

  return {
    start() {
      controller.start();
      manager.show("title");
    },
  };
}
