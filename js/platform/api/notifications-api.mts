import { resolvePlatformApiBaseUrl } from "./platform-api.mjs";
import type { PlatformApiClientOptions } from "./platform-api.mjs";

type FetchImpl = typeof fetch | null;

interface RequestEnvelope {
  ok: boolean;
  status: number;
  error: string;
  body: any;
}

function buildJsonOptions(method: string, value: unknown): RequestInit {
  return {
    method,
    credentials: "include",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(value ?? {}),
  };
}

async function requestEnvelope(fetchImpl: FetchImpl, baseUrl: string, path: string, options: RequestInit = {}): Promise<RequestEnvelope> {
  if (typeof fetchImpl !== "function" || !baseUrl) {
    return {
      ok: false,
      status: 0,
      error: "not_configured",
      body: null,
    };
  }
  try {
    const response = await fetchImpl(`${baseUrl}${path}`, options);
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response?.ok) {
      return {
        ok: true,
        status: response.status,
        error: "",
        body,
      };
    }
    return {
      ok: false,
      status: response?.status || 0,
      error: body?.error || "request_failed",
      body,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      error: "network_error",
      body: null,
    };
  }
}

async function requestJson(fetchImpl: FetchImpl, baseUrl: string, path: string, options: RequestInit = {}): Promise<any> {
  const response = await requestEnvelope(fetchImpl, baseUrl, path, options);
  if (!response.ok) {
    return null;
  }
  return response.body;
}

export function createNotificationsApiClient(options: PlatformApiClientOptions = {}) {
  const fetchImpl: FetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const baseUrl = resolvePlatformApiBaseUrl(options);

  return {
    isConfigured: !!baseUrl && typeof fetchImpl === "function",

    async listNotifications() {
      const payload = await requestJson(fetchImpl, baseUrl, "/notifications", { credentials: "include" });
      return payload || { notifications: [], unreadCount: 0 };
    },

    async markAllRead() {
      await requestJson(fetchImpl, baseUrl, "/notifications/read-all", buildJsonOptions("POST", {}));
    },

    async sendFriendRequest(toPlayerId: string, fromDisplayName = "") {
      const result = await this.sendFriendRequestDetailed(toPlayerId, fromDisplayName);
      return result.ok ? result.request : null;
    },

    async sendFriendRequestDetailed(toPlayerId: string, fromDisplayName = "") {
      const result = await requestEnvelope(
        fetchImpl,
        baseUrl,
        "/friend-requests",
        buildJsonOptions("POST", { toPlayerId, fromDisplayName }),
      );
      return {
        ok: result.ok,
        status: result.status,
        error: result.error,
        request: result.body?.request || null,
      };
    },

    async acceptFriendRequest(requestId: string, acceptorDisplayName = "") {
      const encoded = encodeURIComponent(requestId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/friend-requests/${encoded}/accept`,
        buildJsonOptions("POST", { acceptorDisplayName }),
      );
      return payload?.ok === true;
    },

    async rejectFriendRequest(requestId: string) {
      const encoded = encodeURIComponent(requestId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/friend-requests/${encoded}/reject`,
        buildJsonOptions("POST", {}),
      );
      return payload?.ok === true;
    },

    async sendChallenge(toPlayerId: string, gameSlug: string, gameTitle: string, fromDisplayName = "") {
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        "/challenges",
        buildJsonOptions("POST", { toPlayerId, gameSlug, gameTitle, fromDisplayName }),
      );
      return payload?.challenge || null;
    },

    async acceptChallenge(challengeId: string) {
      const encoded = encodeURIComponent(challengeId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/challenges/${encoded}/accept`,
        buildJsonOptions("POST", {}),
      );
      return payload?.ok === true;
    },

    async declineChallenge(challengeId: string) {
      const encoded = encodeURIComponent(challengeId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/challenges/${encoded}/decline`,
        buildJsonOptions("POST", {}),
      );
      return payload?.ok === true;
    },

    async sendGesture(toPlayerId: string, gestureType: string, fromDisplayName = "") {
      const encoded = encodeURIComponent(toPlayerId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/players/${encoded}/gesture`,
        buildJsonOptions("POST", { gestureType, fromDisplayName }),
      );
      return payload?.ok === true;
    },
  };
}
