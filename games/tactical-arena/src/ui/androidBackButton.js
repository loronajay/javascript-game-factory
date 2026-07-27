// Android hardware/gesture back handling for the packaged app.
//
// Without this, Capacitor's default is to finish the activity — so a stray edge
// swipe closes the whole game, even mid-match. This maps back onto the screen
// stack the game already has.
//
// The decision is a pure function so the policy is testable; the wiring below is
// the only part that touches the Capacitor bridge. Plugins are read off the global
// `Capacitor.Plugins` rather than imported, because this project is unbundled ESM
// and a bare `@capacitor/app` specifier would not resolve in the browser.

export const MODAL_SELECTOR = ".ref-modal:not([hidden])";

// Returns one of: "closeModal" | "toTitle" | "toMainMenu" | "minimize" | "none".
export function decideBackAction({ modalOpen = false, activeScreen = "" } = {}) {
  if (modalOpen) return "closeModal";

  const screen = typeof activeScreen === "string" ? activeScreen : "";
  if (!screen) return "none";

  // Deliberately inert during a match. Losing a match to a mis-swipe is far worse
  // than back appearing to do nothing; leaving is done through the Menu button.
  if (screen === "match") return "none";

  if (screen === "title") return "minimize";
  if (screen === "mainMenu") return "toTitle";
  return "toMainMenu";
}

function isModalOpen(documentRef) {
  return Boolean(documentRef?.querySelector?.(MODAL_SELECTOR));
}

// Overlays across this codebase already close on Escape (choice modal, auth panel,
// roster/skin pickers, codex). Synthesizing Escape reuses each one's own teardown
// instead of reaching into their internals.
function sendEscape(documentRef) {
  documentRef?.dispatchEvent?.(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

export function wireAndroidBackButton({
  getActiveScreen,
  navigate,
  documentRef = globalThis.document,
  plugins = globalThis.Capacitor?.Plugins,
} = {}) {
  const app = plugins?.App;
  if (!app?.addListener) return { supported: false, destroy() {} };

  const handle = () => {
    const action = decideBackAction({
      modalOpen: isModalOpen(documentRef),
      activeScreen: getActiveScreen?.() ?? "",
    });

    switch (action) {
      case "closeModal": sendEscape(documentRef); break;
      case "toTitle": navigate?.("title"); break;
      case "toMainMenu": navigate?.("mainMenu"); break;
      // minimizeApp backgrounds the app like Home rather than destroying it, so
      // returning to the game resumes where the player left off.
      case "minimize": app.minimizeApp?.(); break;
      default: break;
    }
  };

  const registration = app.addListener("backButton", handle);

  return {
    supported: true,
    async destroy() {
      try {
        const handle = await registration;
        await handle?.remove?.();
      } catch {
        // Bridge already gone; nothing to detach.
      }
    },
  };
}
