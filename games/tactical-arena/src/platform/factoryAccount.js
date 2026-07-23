// Thin compatibility shim over the shared factory-account gate. The canonical
// implementation now lives in js/platform/api/factory-account-gate.mjs so every game
// reads the auth token through one seam (see planning-docs/ONLINE_LOGIN_GATE_PLAN.md).
// This file only preserves Tactical Arena's original import surface — including the
// readStoredFactoryAccountSession alias and the shop-specific error constant.

import {
  normalizeFactoryAccountSession,
  isFactoryAccountLoggedIn,
  readFactoryAccountSession,
  createFactoryAccountSignInUrl,
  redirectToFactoryAccountSignIn,
} from "../../../../js/platform/api/factory-account-gate.mjs";

export const SHOP_LOGIN_REQUIRED_ERROR = "ACCOUNT_LOGIN_REQUIRED";

export {
  normalizeFactoryAccountSession,
  isFactoryAccountLoggedIn,
  createFactoryAccountSignInUrl,
  redirectToFactoryAccountSignIn,
};

// Original TA export name; the shared module calls it readFactoryAccountSession.
export function readStoredFactoryAccountSession() {
  return readFactoryAccountSession();
}
