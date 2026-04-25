import { resolvePlatformApiBaseUrl } from "./platform-api.mjs";

function buildJsonOptions(method, value) {
  return {
    method,
    credentials: "include",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(value ?? {}),
  };
}

async function requestJson(fetchImpl, baseUrl, path, options = {}) {
  if (typeof fetchImpl !== "function" || !baseUrl) return null;
  try {
    const response = await fetchImpl(`${baseUrl}${path}`, options);
    if (!response?.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
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
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        "/friend-requests",
        buildJsonOptions("POST", { toPlayerId, fromDisplayName }),
      );
      return payload?.request || null;
    },

    async acceptFriendRequest(requestId) {
      const encoded = encodeURIComponent(requestId);
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        `/friend-requests/${encoded}/accept`,
        buildJsonOptions("POST", {}),
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
  };
}
