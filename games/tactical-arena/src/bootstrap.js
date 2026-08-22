import { composePage } from "./ui/pageComposer.js";
import {
  isNativeApp,
  notifySessionChanged,
  refreshFactoryAccountSession,
  setInAppSignInHandler,
} from "./platform/factorySignIn.js";
import { AUTH_SESSION_EXPIRED_EVENT } from "../../../js/platform/api/auth-token.mjs";
import { activateTournamentAccessFromUrl } from "./tournament/tournamentAccess.js";

async function bootstrap() {
  await composePage();

  // Organizer links use a URL fragment so the access code is never sent to the
  // static host. Activation is tab-session-only and the fragment is scrubbed.
  await activateTournamentAccessFromUrl();

  // The platform API client clears the stored token whenever the server rejects it
  // (one live session per account, so signing in elsewhere revokes this one). Bridge
  // that into TA's own session signal so account-gated menus re-render as signed out
  // instead of sitting there looking signed in while every call 401s.
  document.addEventListener(AUTH_SESSION_EXPIRED_EVENT, () => notifySessionChanged());

  // Hydrate a cookie-backed account into this origin's token/profile cache before
  // account-gated game modules read it. Failure is non-fatal: the game still boots.
  await refreshFactoryAccountSession();

  // Packaged-app only. The bundle contains just the game, so the shared account
  // gate's redirect to ../../sign-in/index.html is a dead end — route every
  // "please sign in" request to the in-app panel instead. Dynamically imported so
  // the panel never loads in the web build, where this branch is always false.
  if (isNativeApp()) {
    // Marks the document for the packaged-app-only CSS in styles/screens/native-app.css.
    // Never set in a browser, so the web build cannot be affected.
    document.documentElement.dataset.nativeApp = "on";

    // Version gate. Runs BEFORE main.js so a build the server refuses to talk to never
    // reaches the menu, a save, or a purchase. It only ever blocks on an affirmative
    // answer — an unreachable API, an unknown build, or no configured minimum all fall
    // through and play normally (see platform/appUpdateGate.js).
    const { checkForRequiredUpdate } = await import("./platform/appUpdateGate.js");
    const { resolvePlatformApiBaseUrl } = await import("../../../js/platform/api/platform-api.mjs");
    const requirement = await checkForRequiredUpdate({
      baseUrl: resolvePlatformApiBaseUrl(),
      platform: "android",
    });
    if (requirement.blocked) {
      const { renderAppUpdateOverlay } = await import("./ui/appUpdateOverlay.js");
      renderAppUpdateOverlay(requirement);
      return;
    }

    const { openAuthPanel } = await import("./ui/authPanel.js");
    setInAppSignInHandler((options = {}) =>
      openAuthPanel({ ...options, onSignedIn: () => notifySessionChanged() }),
    );
  }

  await import("./main.js");
  document.documentElement.dataset.gameReady = "true";
}

bootstrap().catch((error) => {
  console.error("Tactical Arena failed to start.", error);
  const message = document.createElement("p");
  message.className = "boot-error";
  message.setAttribute("role", "alert");
  message.textContent = "Tactical Arena could not load. Refresh the page to try again.";
  document.body.append(message);
});
