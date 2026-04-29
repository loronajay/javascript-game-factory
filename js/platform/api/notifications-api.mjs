import { resolvePlatformApiBaseUrl } from "./platform-api.mjs";

function buildJsonOptions(method, value) {
  return {
    method,
    credentials: "include",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(value ?? {}),
  };
}

async function requestEnvelope(fetchImpl, baseUrl, path, options = {}) {
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
    let body = null;
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

async function requestJson(fetchImpl, baseUrl, path, options = {}) {
  const response = await requestEnvelope(fetchImpl, baseUrl, path, options);
  if (!response.ok) {
    return null;
  }
  return response.body;
}

export function createNotificationsApiClient(options = {}) {
  const fetchImpl = typeof options?.fetchImpl === "function"
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

    async sendFriendRequest(toPlayerId, fromDisplayName = "") {
      const result = await this.sendFriendRequestDetailed(toPlayerId, fromDisplayName);
      return result.ok ? result.request : null;
    },

    async sendFriendRequestDetailed(toPlayerId, fromDisplayName = "") {
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

    async acceptFriendRequest(requestId, acceptorDisplayName = "") {
      const encoded = encodeURIComponent(requestId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/friend-requests/${encoded}/accept`,
        buildJsonOptions("POST", { acceptorDisplayName }),
      );
      return payload?.ok === true;
    },

    async rejectFriendRequest(requestId) {
      const encoded = encodeURIComponent(requestId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/friend-requests/${encoded}/reject`,
        buildJsonOptions("POST", {}),
      );
      return payload?.ok === true;
    },

    async sendChallenge(toPlayerId, gameSlug, gameTitle, fromDisplayName = "") {
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        "/challenges",
        buildJsonOptions("POST", { toPlayerId, gameSlug, gameTitle, fromDisplayName }),
      );
      return payload?.challenge || null;
    },

    async acceptChallenge(challengeId) {
      const encoded = encodeURIComponent(challengeId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/challenges/${encoded}/accept`,
        buildJsonOptions("POST", {}),
      );
      return payload?.ok === true;
    },

    async declineChallenge(challengeId) {
      const encoded = encodeURIComponent(challengeId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/challenges/${encoded}/decline`,
        buildJsonOptions("POST", {}),
      );
      return payload?.ok === true;
    },

    async sendGesture(toPlayerId, gestureType, fromDisplayName = "") {
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
