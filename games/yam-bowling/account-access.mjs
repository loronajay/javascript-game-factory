import {
  getOnlineAccountGate,
  readFactoryAccountSession,
  redirectToFactoryAccountSignIn,
} from "../../js/platform/api/factory-account-gate.mjs";
import { syncOnlineAccountFeatureControls } from "../../js/platform/ui/online-account-feature-gate.mjs";
import { AUTH_SESSION_EXPIRED_EVENT } from "../../js/platform/api/auth-token.mjs";

export const FACTORY_ACCOUNT_FEATURE_SELECTOR = "[data-factory-account-feature]";
export const FACTORY_ACCOUNT_FEATURE_MESSAGE = "Sign in to your Factory profile to open your room, enter the Circuit, or play online.";

export function createYamAccountAccess({
  readAccount = readFactoryAccountSession,
  redirectToSignIn = redirectToFactoryAccountSignIn,
} = {}) {
  function gate() {
    return getOnlineAccountGate(readAccount());
  }

  function isEligible() {
    return gate().eligible;
  }

  function requireFactoryAccount() {
    if (isEligible()) return true;
    redirectToSignIn();
    return false;
  }

  function syncControls(root = document) {
    return syncOnlineAccountFeatureControls(root, {
      account: readAccount(),
      selector: FACTORY_ACCOUNT_FEATURE_SELECTOR,
      message: FACTORY_ACCOUNT_FEATURE_MESSAGE,
    });
  }

  function bindSessionChanges(root = document, onExpired = () => {}) {
    root?.addEventListener?.(AUTH_SESSION_EXPIRED_EVENT, () => {
      syncControls(root);
      onExpired();
    });
  }

  return { bindSessionChanges, isEligible, requireFactoryAccount, syncControls };
}
