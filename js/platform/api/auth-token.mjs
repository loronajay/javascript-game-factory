const TOKEN_KEY = "javascript-game-factory.authToken";
// Fired when the server rejects the stored token. A JWT can stop working long before
// it expires — the server pins one live session per account (`accounts.current_session_id`),
// so signing in anywhere else revokes this one. Without this signal the client keeps a
// dead token, still reports "signed in" (the only test is "is a token present"), and every
// call fails as a bogus network error. Listeners re-render account-gated UI as signed out.
export const AUTH_SESSION_EXPIRED_EVENT = "javascript-game-factory:auth-session-expired";
export function getStoredAuthToken() {
    try {
        return globalThis.localStorage?.getItem(TOKEN_KEY) || "";
    }
    catch {
        return "";
    }
}
export function storeAuthToken(token) {
    try {
        if (token) {
            globalThis.localStorage?.setItem(TOKEN_KEY, String(token));
        }
        else {
            globalThis.localStorage?.removeItem(TOKEN_KEY);
        }
    }
    catch {
        // storage unavailable
    }
}
export function clearAuthToken() {
    try {
        globalThis.localStorage?.removeItem(TOKEN_KEY);
    }
    catch {
        // storage unavailable
    }
}
// Called by the API client on any 401. Drops the rejected token and announces it, so a
// revoked session becomes an honest "signed out" instead of a permanently failing one.
// No stored token means the 401 was an ordinary unauthenticated probe (`/auth/me` at
// boot, say) — nothing to clear and nothing to announce.
export function handleUnauthorizedResponse() {
    if (!getStoredAuthToken())
        return false;
    clearAuthToken();
    try {
        const target = globalThis.document ?? globalThis;
        target?.dispatchEvent?.(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
    }
    catch {
        // No DOM (tests / headless): the token is still cleared, which is the part that matters.
    }
    return true;
}
