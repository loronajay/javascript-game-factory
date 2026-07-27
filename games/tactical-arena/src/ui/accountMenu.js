// App-only account control for the main menu.
//
// On the web the arcade shell owns sign-in/session UI, so this stays hidden and the
// web build is untouched. Inside the packaged app there is no shell, so the game has
// to surface the account itself: signed out it opens the auth panel, signed in it
// offers sign-out.
//
// Visibility is gated on isNativeApp(), NOT on pointer type — this is about build
// posture (no shell present), not about touch.

import { openChoiceModal } from "./choiceModal.js";
import { openAuthPanel, AUTH_MODES } from "./authPanel.js";
import { isNativeApp, notifySessionChanged } from "../platform/factorySignIn.js";
import { readStoredFactoryAccountSession } from "../platform/factoryAccount.js";
import { createAuthApiClient } from "../../../../js/platform/api/auth-api.mjs";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";

export const ACCOUNT_CONTROL_SELECTOR = "[data-account-control]";

function currentProfileName() {
  try {
    const name = loadFactoryProfile()?.profileName;
    return typeof name === "string" ? name.trim() : "";
  } catch {
    return "";
  }
}

export function accountControlState({ session = readStoredFactoryAccountSession(), native } = {}) {
  const isApp = typeof native === "boolean" ? native : isNativeApp();
  const signedIn = Boolean(session?.authenticated);
  const name = signedIn ? currentProfileName() : "";
  return Object.freeze({
    visible: isApp,
    signedIn,
    label: signedIn ? name || "Account" : "Sign In",
  });
}

// Shows/hides + labels every [data-account-control] under `root`.
export function syncAccountControls(root = document, options = {}) {
  const state = accountControlState(options);
  const controls = root?.querySelectorAll?.(ACCOUNT_CONTROL_SELECTOR) ?? [];
  for (const control of controls) {
    control.hidden = !state.visible;
    control.textContent = state.label;
    control.classList?.toggle?.("is-signed-in", state.signedIn);
  }
  return state;
}

// Opens the right surface for the current session. `onChanged` re-syncs the menus
// after a sign-in or sign-out so gated buttons flip without a reload.
export async function openAccountPanel({
  auth = createAuthApiClient(),
  onChanged = null,
  session = readStoredFactoryAccountSession(),
} = {}) {
  if (!session?.authenticated) {
    return openAuthPanel({
      mode: AUTH_MODES.signIn,
      auth,
      onSignedIn: async (result) => {
        notifySessionChanged();
        await onChanged?.(result);
      },
    });
  }

  const name = currentProfileName();
  const choice = await openChoiceModal({
    title: "Account",
    subtitle: name ? `Signed in as ${name}.` : "You are signed in.",
    choices: [{ value: "signOut", label: "Sign Out" }],
  });

  if (choice !== "signOut") return null;

  try {
    await auth.logout();
  } catch {
    // logout() clears the local token even when the network call fails, so the
    // player is signed out locally either way.
  }
  notifySessionChanged();
  await onChanged?.({ ok: true, signedOut: true });
  return { ok: true, signedOut: true };
}
