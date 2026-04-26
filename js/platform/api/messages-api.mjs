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

export function createMessagesApiClient(options = {}) {
  const fetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const baseUrl = resolvePlatformApiBaseUrl(options);

  return {
    isConfigured: !!baseUrl && typeof fetchImpl === "function",

    async listConversations() {
      const payload = await requestJson(fetchImpl, baseUrl, "/messages", { credentials: "include" });
      return payload?.conversations || null;
    },

    async findConversationWith(playerId) {
      const encoded = encodeURIComponent(playerId);
      const payload = await requestJson(fetchImpl, baseUrl, `/messages/with/${encoded}`, { credentials: "include" });
      return payload?.conversation || null;
    },

    async getConversation(conversationId) {
      const encoded = encodeURIComponent(conversationId);
      const payload = await requestJson(fetchImpl, baseUrl, `/messages/${encoded}`, { credentials: "include" });
      return payload || null;
    },

    async sendMessage(toPlayerId, text) {
      const payload = await requestJson(
        fetchImpl,
        baseUrl,
        "/messages",
        buildJsonOptions("POST", { toPlayerId, text }),
      );
      return payload || null;
    },

    async markRead(conversationId) {
      const encoded = encodeURIComponent(conversationId);
      await requestJson(fetchImpl, baseUrl, `/messages/${encoded}/read`, buildJsonOptions("POST", {}));
    },
  };
}
