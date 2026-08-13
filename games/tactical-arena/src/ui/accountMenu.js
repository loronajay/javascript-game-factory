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
import { bindFactoryProfileToSession, loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";

export const ACCOUNT_CONTROL_SELECTOR = "[data-account-control]";

function currentProfileName() {
  try {
    const name = loadFactoryProfile()?.profileName;
    return typeof name === "string" ? name.trim() : "";
  } catch {
    return "";
  }
}

// The local factory profile only learns the display name when the player registers or
// signs in from a build that stored it. Anyone already signed in — or signed in through
// an older build — has a nameless local profile, which is why the account panel used to
// say "You are signed in." with no name. Ask the server once and cache it locally.
let profileNameLookupDone = false;

export async function refreshAccountProfileName({
  auth = createAuthApiClient(),
  session = readStoredFactoryAccountSession(),
} = {}) {
  const cached = currentProfileName();
  if (cached) return cached;
  if (!session?.authenticated || !auth?.isConfigured) return "";
  // An account whose profile genuinely has no name would otherwise re-ask on every
  // visit to the title screen. One lookup per session is enough.
  if (profileNameLookupDone) return "";
  profileNameLookupDone = true;
  let result = null;
  try {
    result = await auth.getSession();
  } catch {
    profileNameLookupDone = false;
    return "";
  }
  const name = typeof result?.profileName === "string" ? result.profileName.trim() : "";
  if (!result?.ok || !result.playerId) return "";
  bindFactoryProfileToSession(result.playerId, undefined, name ? { profileName: name } : {});
  return name;
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

// Sync now, then relabel once the display name arrives. The control reads "Account"
// in the meantime rather than blocking the menu on a network round-trip.
export function syncAccountControlsWithName(root = document, options = {}) {
  const state = syncAccountControls(root, options);
  if (state.visible && state.signedIn && !currentProfileName()) {
    refreshAccountProfileName()
      .then((name) => { if (name) syncAccountControls(root, options); })
      .catch(() => { /* the generic label is a fine fallback */ });
  }
  return state;
}

// Opens the right surface for the current session. `onChanged` re-syncs the menus
// after a sign-in, sign-out, or deletion so gated buttons flip without a reload.
//
// `choose` is injected so the whole flow — including the two-step delete confirmation —
// is testable without a DOM.
export async function openAccountPanel({
  auth = createAuthApiClient(),
  onChanged = null,
  session = readStoredFactoryAccountSession(),
  choose = openChoiceModal,
} = {}) {
  if (!session?.authenticated) {
    return openAuthPanel({
      mode: AUTH_MODES.signIn,
      auth,
      onSignedIn: async (result) => {
        // A different account means a different name to look up.
        profileNameLookupDone = false;
        await notifySessionChanged();
        await onChanged?.(result);
      },
    });
  }

  const name = currentProfileName() || await refreshAccountProfileName({ auth, session });
  const choice = await choose({
    title: "Account",
    subtitle: name ? `Signed in as ${name}.` : "You are signed in.",
    choices: [
      { value: "signOut", label: "Sign Out" },
      { value: "deleteAccount", label: "Delete Account", sub: "Permanently erase this account" },
    ],
  });

  if (choice === "deleteAccount") return deleteAccountFlow({ auth, onChanged, choose });
  if (choice !== "signOut") return null;

  try {
    await auth.logout();
  } catch {
    // logout() clears the local token even when the network call fails, so the
    // player is signed out locally either way.
  }
  await notifySessionChanged();
  await onChanged?.({ ok: true, signedOut: true });
  return { ok: true, signedOut: true };
}

// Account deletion, which Google Play requires to be reachable in-app for any app that
// offers in-app account creation — the auth panel does, so this is not optional.
//
// Two steps on purpose: deletion is irreversible and takes paid entitlements with it, so
// the second prompt states both rather than relying on the player reading the first.
async function deleteAccountFlow({ auth, onChanged, choose }) {
  const confirmed = await choose({
    title: "Delete Account?",
    subtitle: "This is permanent and cannot be undone. Your progress, Valor, ranked standing "
      + "and every purchase on this account are erased. Purchases cannot be restored afterwards.",
    choices: [{ value: "confirmDelete", label: "Delete My Account" }],
    cancelLabel: "Keep My Account",
  });
  if (confirmed !== "confirmDelete") return null;

  let result = null;
  try {
    result = await auth.deleteAccount();
  } catch {
    result = { ok: false, error: "delete_failed" };
  }
  // A failed delete leaves the account and its session intact, so the player stays signed in
  // rather than being half-dropped into a state where the app thinks they are gone.
  if (!result?.ok) return { ok: false, error: result?.error || "delete_failed" };

  // deleteAccount() clears the stored token on success; this re-syncs everything reading it.
  await notifySessionChanged();
  const outcome = { ok: true, deleted: true, signedOut: true };
  await onChanged?.(outcome);
  return outcome;
}
