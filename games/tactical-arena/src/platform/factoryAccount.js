export const SHOP_LOGIN_REQUIRED_ERROR = "ACCOUNT_LOGIN_REQUIRED";

const AUTH_TOKEN_STORAGE_KEY = "javascript-game-factory.authToken";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function defaultStorage() {
  return globalThis.localStorage;
}

function readStoredAuthToken(storage = defaultStorage()) {
  try {
    return cleanText(storage?.getItem?.(AUTH_TOKEN_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function normalizeFactoryAccountSession(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const playerId = cleanText(source.playerId);
  const token = cleanText(source.token);
  const authenticated = Boolean(source.authenticated ?? source.ok) && Boolean(playerId || token);
  return Object.freeze({
    authenticated,
    playerId,
    token,
  });
}

export function isFactoryAccountLoggedIn(value = {}) {
  return normalizeFactoryAccountSession(value).authenticated;
}

export function readStoredFactoryAccountSession(storage = defaultStorage()) {
  const token = readStoredAuthToken(storage);
  return normalizeFactoryAccountSession({
    authenticated: Boolean(token),
    token,
  });
}
