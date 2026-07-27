import { composePage } from "./ui/pageComposer.js";
import { isNativeApp, notifySessionChanged, setInAppSignInHandler } from "./platform/factorySignIn.js";

async function bootstrap() {
  await composePage();

  // Packaged-app only. The bundle contains just the game, so the shared account
  // gate's redirect to ../../sign-in/index.html is a dead end — route every
  // "please sign in" request to the in-app panel instead. Dynamically imported so
  // the panel never loads in the web build, where this branch is always false.
  if (isNativeApp()) {
    // Marks the document for the packaged-app-only CSS in styles/screens/native-app.css.
    // Never set in a browser, so the web build cannot be affected.
    document.documentElement.dataset.nativeApp = "on";

    const { openAuthPanel } = await import("./ui/authPanel.js");
    setInAppSignInHandler((options = {}) =>
      openAuthPanel({ ...options, onSignedIn: () => notifySessionChanged() }),
    );
  }

  await import("./main.js");
}

bootstrap().catch((error) => {
  console.error("Tactical Arena failed to start.", error);
  const message = document.createElement("p");
  message.className = "boot-error";
  message.setAttribute("role", "alert");
  message.textContent = "Tactical Arena could not load. Refresh the page to try again.";
  document.body.append(message);
});

