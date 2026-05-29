import { resolvePlatformApiBaseUrl } from "./platform-api.mjs";
import type { PlatformApiClientOptions } from "./platform-api.mjs";
import { clearAuthToken, getStoredAuthToken, storeAuthToken } from "./auth-token.mjs";

type FetchImpl = typeof fetch | null;

export interface AuthResult {
  ok: boolean;
  token?: string;
  error?: string;
  [key: string]: any;
}

async function authRequest(fetchImpl: FetchImpl, baseUrl: string, path: string, options: RequestInit = {}): Promise<AuthResult> {
  if (typeof fetchImpl !== "function" || !baseUrl) {
    return { ok: false, error: "not_configured" };
  }
  try {
    const token = getStoredAuthToken();
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...((options.headers as Record<string, string>) || {}),
      },
    });
    let body: any = null;
    try { body = await response.json(); } catch { /* ignore */ }
    return response.ok ? { ok: true, ...(body || {}) } : { ok: false, ...(body || {}) };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export function createAuthApiClient(options: PlatformApiClientOptions = {}) {
  const fetchImpl: FetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const baseUrl = resolvePlatformApiBaseUrl(options);

  return {
    isConfigured: !!baseUrl && typeof fetchImpl === "function",

    register({ email, password, profileName, claimPlayerId }: {
      email?: unknown; password?: unknown; profileName?: unknown; claimPlayerId?: unknown;
    } = {}) {
      return authRequest(fetchImpl, baseUrl, "/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, profileName, claimPlayerId }),
      }).then(result => {
        if (result?.ok && result?.token) storeAuthToken(result.token);
        return result;
      });
    },

    login({ email, password }: { email?: unknown; password?: unknown } = {}) {
      return authRequest(fetchImpl, baseUrl, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }).then(result => {
        if (result?.ok && result?.token) storeAuthToken(result.token);
        return result;
      });
    },

    logout() {
      return authRequest(fetchImpl, baseUrl, "/auth/logout", { method: "POST" }).then(result => {
        clearAuthToken();
        return result;
      });
    },

    getSession() {
      return authRequest(fetchImpl, baseUrl, "/auth/me", { method: "GET" }).then((result) => {
        if (result?.ok && result?.token) storeAuthToken(result.token);
        return result;
      });
    },

    forgotPassword({ email }: { email?: unknown } = {}) {
      return authRequest(fetchImpl, baseUrl, "/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },

    resetPassword({ token, newPassword }: { token?: unknown; newPassword?: unknown } = {}) {
      return authRequest(fetchImpl, baseUrl, "/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
    },

    deleteAccount() {
      return authRequest(fetchImpl, baseUrl, "/auth/account", { method: "DELETE" });
    },
  };
}
