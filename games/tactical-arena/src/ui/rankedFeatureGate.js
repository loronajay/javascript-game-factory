import { getRankedAccountGate } from "../online/rankedAccountGate.js";
import { readStoredFactoryAccountSession } from "../platform/factoryAccount.js";

export const RANKED_ACCOUNT_FEATURE_MESSAGE = "Sign in to your Javascript Game Factory account to use ranked features.";

export function rankedAccountFeatureState(account = readStoredFactoryAccountSession()) {
  const gate = getRankedAccountGate(account);
  return Object.freeze({
    enabled: gate.eligible,
    message: gate.eligible ? "" : RANKED_ACCOUNT_FEATURE_MESSAGE,
  });
}

export function syncRankedAccountFeatureControls(root = document, { account = readStoredFactoryAccountSession() } = {}) {
  const state = rankedAccountFeatureState(account);
  const controls = root?.querySelectorAll?.("[data-ranked-account-feature]") ?? [];
  for (const control of controls) {
    control.disabled = !state.enabled;
    control.classList?.toggle?.("is-locked", !state.enabled);
    if (state.enabled) {
      control.removeAttribute?.("aria-disabled");
      control.title = "";
    } else {
      control.setAttribute?.("aria-disabled", "true");
      control.title = state.message;
    }
  }
  return state;
}
