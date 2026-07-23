import {
  onlineAccountFeatureState,
  syncOnlineAccountFeatureControls,
} from "../../../../js/platform/ui/online-account-feature-gate.mjs";
import { readStoredFactoryAccountSession } from "../platform/factoryAccount.js";

export const RANKED_ACCOUNT_FEATURE_MESSAGE = "Sign in to your Javascript Game Factory account to use ranked features.";
const RANKED_ACCOUNT_FEATURE_SELECTOR = "[data-ranked-account-feature]";

export function rankedAccountFeatureState(account = readStoredFactoryAccountSession()) {
  return onlineAccountFeatureState(account, { message: RANKED_ACCOUNT_FEATURE_MESSAGE });
}

export function syncRankedAccountFeatureControls(root = document, { account = readStoredFactoryAccountSession() } = {}) {
  return syncOnlineAccountFeatureControls(root, {
    account,
    selector: RANKED_ACCOUNT_FEATURE_SELECTOR,
    message: RANKED_ACCOUNT_FEATURE_MESSAGE,
  });
}
