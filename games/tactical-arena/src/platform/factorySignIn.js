// One seam for "the player needs to sign in".
//
// On the web this stays exactly what it always was: a redirect to the arcade shell's
// sign-in page. Inside the packaged app that page does not exist — the bundle contains
// only the game — so the shared gate's ../../sign-in/index.html redirect is a dead end.
// The app registers an in-app panel here at boot and every gated surface routes through
// this function instead of calling the redirect directly.
//
// Deliberately a tiny registry rather than an import from the UI layer: src/platform/
// must not depend on src/ui/, and the panel is only present in one build posture.

import { redirectToFactoryAccountSignIn } from "./factoryAccount.js";
import { createAuthApiClient } from "../../../../js/platform/api/auth-api.mjs";
import { bindFactoryProfileToSession } from "../../../../js/platform/identity/factory-profile.mjs";

let inAppSignInHandler = null;

// Fired after any sign-in or sign-out so account-gated UI can re-sync without a
// reload. A DOM event rather than a callback chain because the surfaces that trigger
// a sign-in (shop, ranked, friends) are not the ones that need to react (the menus).
export const SESSION_CHANGED_EVENT = "tactical-arena:session-changed";

// A custom-domain move creates a fresh localStorage origin even though the API's
// HttpOnly session cookie can still be valid. Refresh that cookie-backed session before
// account gates render, then bind the new origin's local cache to the canonical player.
export async function refreshFactoryAccountSession({
  auth = createAuthApiClient(),
  bindProfile = bindFactoryProfileToSession,
} = {}) {
  try {
    const result = await auth.getSession();
    if (result?.ok && result.playerId) {
      bindProfile(result.playerId, undefined, {
        profileName: typeof result.profileName === "string" ? result.profileName : "",
      });
    }
    return result;
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function notifySessionChanged(documentRef = globalThis.document) {
  const pending = [];
  try {
    documentRef?.dispatchEvent?.(new CustomEvent(SESSION_CHANGED_EVENT, {
      detail: {
        waitUntil(value) {
          if (value && typeof value.then === "function") pending.push(Promise.resolve(value));
        },
      },
    }));
  } catch {
    // No DOM (tests / headless): nothing to notify.
  }
  // DOM dispatch is synchronous, so listeners have registered every reconciliation
  // promise by this point. Await them without letting an offline failure turn a
  // successful sign-in into an authentication error.
  if (pending.length) await Promise.allSettled(pending);
}

// Registers the in-app sign-in surface. Pass null to unregister (used by tests and
// by any caller that wants the plain web redirect back).
export function setInAppSignInHandler(handler) {
  inAppSignInHandler = typeof handler === "function" ? handler : null;
}

export function hasInAppSignInHandler() {
  return typeof inAppSignInHandler === "function";
}

// True when running inside the Capacitor native shell. Used to decide whether to
// show app-only account UI; it is intentionally false in every browser, so the web
// build's behavior cannot change.
export function isNativeApp(root = globalThis) {
  try {
    const bridge = root?.Capacitor;
    if (!bridge) return false;
    if (typeof bridge.isNativePlatform === "function") return Boolean(bridge.isNativePlatform());
    return Boolean(bridge.isNative);
  } catch {
    return false;
  }
}

// For <a href> sign-in links. Returns true when the click was handled in-app and the
// caller should preventDefault; false to let the anchor navigate normally.
//
// Deliberately NOT requestFactorySignIn: that one falls back to a redirect, which on
// an anchor would fire a navigation on top of the anchor's own href.
export function handleSignInLinkClick(options = {}) {
  if (!inAppSignInHandler) return false;
  try {
    inAppSignInHandler({ ...options });
    return true;
  } catch {
    return false;
  }
}

// Opens the in-app panel when one is registered, otherwise redirects to the shell.
// Returns true if it was handled in-app. `redirect` is injectable for testing.
export function requestFactorySignIn(options = {}) {
  const { redirect = redirectToFactoryAccountSignIn, ...rest } = options;

  if (inAppSignInHandler) {
    try {
      inAppSignInHandler({ ...rest });
      return true;
    } catch {
      // A broken panel must not strand the player with no way to sign in, so fall
      // through to the redirect rather than swallowing the request.
    }
  }

  try {
    redirect(rest);
  } catch {
    // Nothing left to try; the caller's UI stays as it was.
  }
  return false;
}
