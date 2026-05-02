const TOKEN_KEY = "javascript-game-factory.authToken";

export function getStoredAuthToken() {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function storeAuthToken(token) {
  try {
    if (token) {
      globalThis.localStorage?.setItem(TOKEN_KEY, String(token));
    } else {
      globalThis.localStorage?.removeItem(TOKEN_KEY);
    }
  } catch {
    // storage unavailable
  }
}

export function clearAuthToken() {
  try {
    globalThis.localStorage?.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable
  }
}
