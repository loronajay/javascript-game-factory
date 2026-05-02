import { sanitizeProfileFriendCode } from "../profile/profile.mjs";
import { getStoredAuthToken } from "./auth-token.mjs";

function sanitizeSingleLine(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeBaseUrl(value) {
  return sanitizeSingleLine(value).replace(/\/+$/, "");
}

function isLocalHostname(value) {
  const hostname = sanitizeSingleLine(value).toLowerCase();
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname === "[::1]"
    || hostname === "::1";
}

function encodePathSegment(value) {
  return encodeURIComponent(sanitizeSingleLine(value));
}

function buildThoughtListPath(viewerPlayerId = "") {
  const encodedViewerPlayerId = encodePathSegment(viewerPlayerId);
  return encodedViewerPlayerId
    ? `/thoughts?viewerPlayerId=${encodedViewerPlayerId}`
    : "/thoughts";
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildAuthHeaders() {
  const token = getStoredAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function requestJson(fetchImpl, baseUrl, path, options = {}) {
  if (typeof fetchImpl !== "function" || !baseUrl) {
    return null;
  }

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, options);
    if (!response?.ok) {
      return null;
    }
    return await readJsonResponse(response);
  } catch {
    return null;
  }
}

function buildJsonRequestOptions(method, value) {
  return {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...buildAuthHeaders(),
    },
    body: JSON.stringify(value ?? {}),
  };
}

export function resolvePlatformApiBaseUrl(options = {}) {
  const root = options?.root ?? globalThis.window;
  const override = sanitizeBaseUrl(
    options?.baseUrl
    || options?.override
    || root?.__JGF_PLATFORM_API_URL__
    || root?.JGF_PLATFORM_API_URL
    || "",
  );

  if (override) {
    return override;
  }

  const location = options?.location || root?.location;
  if (isLocalHostname(location?.hostname)) {
    return "http://127.0.0.1:3001";
  }

  return "";
}

export function createPlatformApiClient(options = {}) {
  const fetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const baseUrl = resolvePlatformApiBaseUrl(options);

  async function get(path, responseKey) {
    const payload = await requestJson(fetchImpl, baseUrl, path, {
      credentials: "include",
      headers: buildAuthHeaders(),
    });
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function put(path, value, responseKey) {
    const payload = await requestJson(
      fetchImpl,
      baseUrl,
      path,
      buildJsonRequestOptions("PUT", value),
    );
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function post(path, value, responseKey) {
    const payload = await requestJson(
      fetchImpl,
      baseUrl,
      path,
      buildJsonRequestOptions("POST", value),
    );
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function del(path, responseKey) {
    const payload = await requestJson(fetchImpl, baseUrl, path, {
      method: "DELETE",
      credentials: "include",
      headers: buildAuthHeaders(),
    });
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  return {
    baseUrl,
    isConfigured: !!baseUrl && typeof fetchImpl === "function",
    loadPlayerProfile(playerId) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/profile`, "player") : Promise.resolve(null);
    },
    loadPlayerProfileByFriendCode(friendCode) {
      const encoded = encodePathSegment(sanitizeProfileFriendCode(friendCode));
      return encoded ? get(`/players/by-friend-code/${encoded}`, "player") : Promise.resolve(null);
    },
    savePlayerProfile(playerId, patch = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/profile`, patch, "player") : Promise.resolve(null);
    },
    loadPlayerMetrics(playerId) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/metrics`, "metrics") : Promise.resolve(null);
    },
    savePlayerMetrics(playerId, patch = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/metrics`, patch, "metrics") : Promise.resolve(null);
    },
    loadPlayerRelationships(playerId) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/relationships`, "relationships") : Promise.resolve(null);
    },
    savePlayerRelationships(playerId, patch = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/relationships`, patch, "relationships") : Promise.resolve(null);
    },
    createFriendshipBetweenPlayers(leftPlayerId, rightPlayerId) {
      return post("/friendships", { leftPlayerId, rightPlayerId }, "friendship");
    },
    removeFriend(viewerPlayerId, targetPlayerId) {
      const encodedViewer = encodePathSegment(viewerPlayerId);
      const encodedTarget = encodePathSegment(targetPlayerId);
      return encodedViewer && encodedTarget
        ? del(`/players/${encodedViewer}/friends/${encodedTarget}`, "removed")
        : Promise.resolve(null);
    },
    recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
      return post("/relationships/shared-session", {
        leftPlayerId,
        rightPlayerId,
        ...options,
      }, "relationshipUpdate");
    },
    recordSharedEventBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
      return post("/relationships/shared-event", {
        leftPlayerId,
        rightPlayerId,
        ...options,
      }, "relationshipUpdate");
    },
    recordDirectInteractionBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
      return post("/relationships/direct-interaction", {
        leftPlayerId,
        rightPlayerId,
        ...options,
      }, "relationshipUpdate");
    },
    searchPlayers(q = "") {
      const encoded = encodeURIComponent(q.trim());
      return encoded ? get(`/players/search?q=${encoded}`, "players") : Promise.resolve([]);
    },
    listActivityItems() {
      return get("/activity", "items");
    },
    saveActivityItem(item = {}) {
      return post("/activity", item, "item");
    },
    listThoughts(viewerPlayerId = "") {
      return get(buildThoughtListPath(viewerPlayerId), "thoughts");
    },
    listThoughtComments(thoughtId) {
      const encoded = encodePathSegment(thoughtId);
      return encoded ? get(`/thoughts/${encoded}/comments`, "comments") : Promise.resolve(null);
    },
    saveThought(thought = {}) {
      return post("/thoughts", thought, "thought");
    },
    shareThought(thoughtId, viewerPlayerId, viewerAuthorDisplayName = "", shareOptions = {}) {
      const encoded = encodePathSegment(thoughtId);
      return encoded
        ? post(`/thoughts/${encoded}/shares`, { viewerPlayerId, viewerAuthorDisplayName, ...shareOptions }, "share")
        : Promise.resolve(null);
    },
    reactToThought(thoughtId, viewerPlayerId, reactionId) {
      const encoded = encodePathSegment(thoughtId);
      return encoded
        ? post(`/thoughts/${encoded}/reactions`, { viewerPlayerId, reactionId }, "thought")
        : Promise.resolve(null);
    },
    commentOnThought(thoughtId, viewerPlayerId, viewerAuthorDisplayName = "", text = "") {
      const encoded = encodePathSegment(thoughtId);
      return encoded
        ? post(`/thoughts/${encoded}/comments`, { viewerPlayerId, viewerAuthorDisplayName, text }, "commentRecord")
        : Promise.resolve(null);
    },
    deleteThought(thoughtId) {
      const encoded = encodePathSegment(thoughtId);
      return encoded ? del(`/thoughts/${encoded}`, "deleted") : Promise.resolve(null);
    },
    async uploadAvatar(file) {
      if (!fetchImpl || !baseUrl || !file) return null;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await fetchImpl(`${baseUrl}/upload/avatar`, {
          method: "POST",
          credentials: "include",
          headers: buildAuthHeaders(),
          body: formData,
        });
        if (!response?.ok) {
          const body = await readJsonResponse(response);
          return { uploadError: body?.error || String(response.status) };
        }
        return await readJsonResponse(response);
      } catch {
        return null;
      }
    },
    async uploadBackground(file) {
      if (!fetchImpl || !baseUrl || !file) return null;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await fetchImpl(`${baseUrl}/upload/background`, {
          method: "POST",
          credentials: "include",
          headers: buildAuthHeaders(),
          body: formData,
        });
        if (!response?.ok) {
          const body = await readJsonResponse(response);
          return { uploadError: body?.error || String(response.status) };
        }
        return await readJsonResponse(response);
      } catch {
        return null;
      }
    },
    async uploadPhoto(file) {
      if (!fetchImpl || !baseUrl || !file) return null;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await fetchImpl(`${baseUrl}/upload/photo`, {
          method: "POST",
          credentials: "include",
          headers: buildAuthHeaders(),
          body: formData,
        });
        if (!response?.ok) return null;
        return await readJsonResponse(response);
      } catch {
        return null;
      }
    },
    async listPlayerPhotos(playerId, { visibility } = {}) {
      if (!fetchImpl || !baseUrl || !playerId) return [];
      const encoded = encodePathSegment(playerId);
      if (!encoded) return [];
      const url = `${baseUrl}/players/${encoded}/photos${visibility ? `?visibility=${encodeURIComponent(visibility)}` : ""}`;
      try {
        const response = await fetchImpl(url, { credentials: "include", headers: buildAuthHeaders() });
        if (!response?.ok) return [];
        const data = await readJsonResponse(response);
        return Array.isArray(data?.photos) ? data.photos : [];
      } catch {
        return [];
      }
    },
    async savePlayerPhoto(playerId, photoData) {
      if (!fetchImpl || !baseUrl || !playerId) return null;
      const encoded = encodePathSegment(playerId);
      if (!encoded) return null;
      const payload = await post(`/players/${encoded}/photos`, photoData);
      return payload?.photo ? payload : null;
    },
    async deletePlayerPhoto(playerId, photoId) {
      if (!fetchImpl || !baseUrl || !playerId || !photoId) return false;
      const encodedPlayer = encodePathSegment(playerId);
      const encodedPhoto = encodePathSegment(photoId);
      if (!encodedPlayer || !encodedPhoto) return false;
      try {
        const response = await fetchImpl(`${baseUrl}/players/${encodedPlayer}/photos/${encodedPhoto}`, {
          method: "DELETE",
          credentials: "include",
          headers: buildAuthHeaders(),
        });
        return response?.ok === true;
      } catch {
        return false;
      }
    },
    async getPlayerPhoto(playerId, photoId) {
      if (!fetchImpl || !baseUrl || !playerId || !photoId) return null;
      const encodedPlayer = encodePathSegment(playerId);
      const encodedPhoto = encodePathSegment(photoId);
      if (!encodedPlayer || !encodedPhoto) return null;
      try {
        const response = await fetchImpl(`${baseUrl}/players/${encodedPlayer}/photos/${encodedPhoto}`, {
          credentials: "include",
          headers: buildAuthHeaders(),
        });
        if (!response?.ok) return null;
        const data = await readJsonResponse(response);
        return data?.photo || null;
      } catch {
        return null;
      }
    },
    async listPhotoComments(photoId) {
      if (!fetchImpl || !baseUrl || !photoId) return [];
      const encoded = encodePathSegment(photoId);
      if (!encoded) return [];
      try {
        const response = await fetchImpl(`${baseUrl}/photos/${encoded}/comments`, {
          credentials: "include",
          headers: buildAuthHeaders(),
        });
        if (!response?.ok) return [];
        const data = await readJsonResponse(response);
        return Array.isArray(data?.comments) ? data.comments : [];
      } catch {
        return [];
      }
    },
    async reactToPhoto(photoId, viewerPlayerId, reactionId) {
      if (!fetchImpl || !baseUrl || !photoId) return null;
      const encoded = encodePathSegment(photoId);
      if (!encoded) return null;
      const payload = await post(`/photos/${encoded}/reactions`, { viewerPlayerId, reactionId });
      return payload?.photo || null;
    },
    async commentOnPhoto(photoId, viewerPlayerId, viewerAuthorDisplayName, text) {
      if (!fetchImpl || !baseUrl || !photoId) return null;
      const encoded = encodePathSegment(photoId);
      if (!encoded) return null;
      const payload = await post(`/photos/${encoded}/comments`, { viewerPlayerId, viewerAuthorDisplayName, text });
      return payload?.commentRecord || null;
    },
  };
}
