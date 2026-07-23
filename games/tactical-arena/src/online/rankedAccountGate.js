import { getOnlineAccountGate } from "../../../../js/platform/api/factory-account-gate.mjs";

export const RANKED_ACCOUNT_REQUIRED_ERROR = "RANKED_ACCOUNT_REQUIRED";
export const RANKED_ACCOUNT_REQUIRED_MESSAGE = "Sign in to your Javascript Game Factory account to play ranked.";

// Ranked reuses the shared online-account eligibility check, but keeps its own
// ranked-specific error code and copy for callers that surface it.
export function getRankedAccountGate(account = {}) {
  const gate = getOnlineAccountGate(account);
  if (gate.eligible) return gate;
  return Object.freeze({
    eligible: false,
    errorCode: RANKED_ACCOUNT_REQUIRED_ERROR,
    message: RANKED_ACCOUNT_REQUIRED_MESSAGE,
  });
}
