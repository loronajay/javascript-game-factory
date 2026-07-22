import { normalizeFactoryAccountSession } from "../platform/factoryAccount.js";

export const RANKED_ACCOUNT_REQUIRED_ERROR = "RANKED_ACCOUNT_REQUIRED";
export const RANKED_ACCOUNT_REQUIRED_MESSAGE = "Sign in to your Javascript Game Factory account to play ranked.";

export function getRankedAccountGate(account = {}) {
  const session = normalizeFactoryAccountSession(account);
  if (!session.authenticated || !session.token) {
    return Object.freeze({
      eligible: false,
      errorCode: RANKED_ACCOUNT_REQUIRED_ERROR,
      message: RANKED_ACCOUNT_REQUIRED_MESSAGE,
    });
  }
  return Object.freeze({
    eligible: true,
    errorCode: "",
    message: "",
  });
}
