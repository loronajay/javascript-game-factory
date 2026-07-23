// Shared DOM helper for login-gated online controls. Any control marked with the
// [data-online-account-feature] attribute is disabled + tooltipped when the viewer is
// not signed into a real Javascript Game Factory account, and re-enabled once they are.
//
// This is the generic version of Tactical Arena's original ranked-only feature gate;
// the ranked gate now wraps this with its own selector + copy. See
// planning-docs/ONLINE_LOGIN_GATE_PLAN.md.
import { getOnlineAccountGate, readFactoryAccountSession, ONLINE_ACCOUNT_REQUIRED_MESSAGE, } from "../api/factory-account-gate.mjs";
export const ONLINE_ACCOUNT_FEATURE_MESSAGE = ONLINE_ACCOUNT_REQUIRED_MESSAGE;
export const ONLINE_ACCOUNT_FEATURE_SELECTOR = "[data-online-account-feature]";
export function onlineAccountFeatureState(account = readFactoryAccountSession(), { message = ONLINE_ACCOUNT_FEATURE_MESSAGE } = {}) {
    const gate = getOnlineAccountGate(account);
    return Object.freeze({
        enabled: gate.eligible,
        message: gate.eligible ? "" : message,
    });
}
// Toggles disabled / .is-locked / aria-disabled + title on every matching control.
// `selector` and `message` are overridable so mode-specific wrappers (e.g. ranked) can
// reuse the exact same DOM behavior with their own attribute and copy.
export function syncOnlineAccountFeatureControls(root = document, { account = readFactoryAccountSession(), selector = ONLINE_ACCOUNT_FEATURE_SELECTOR, message = ONLINE_ACCOUNT_FEATURE_MESSAGE, } = {}) {
    const state = onlineAccountFeatureState(account, { message });
    const controls = root?.querySelectorAll?.(selector) ?? [];
    for (const control of controls) {
        control.disabled = !state.enabled;
        control.classList?.toggle?.("is-locked", !state.enabled);
        if (state.enabled) {
            control.removeAttribute?.("aria-disabled");
            control.title = "";
        }
        else {
            control.setAttribute?.("aria-disabled", "true");
            control.title = state.message;
        }
    }
    return state;
}
