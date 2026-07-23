import { sanitizeProfileFriendCode } from "../profile/profile.mjs";
import { getStoredAuthToken } from "./auth-token.mjs";

export interface PlatformApiClientOptions {
  root?: any;
  baseUrl?: string;
  override?: string;
  location?: { hostname?: string } | null;
  fetchImpl?: typeof fetch;
}

type FetchImpl = typeof fetch | null;

function sanitizeSingleLine(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeBaseUrl(value: unknown): string {
  return sanitizeSingleLine(value).replace(/\/+$/, "");
}

function isLocalHostname(value: unknown): boolean {
  const hostname = sanitizeSingleLine(value).toLowerCase();
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "0.0.0.0"
    || hostname === "[::1]"
    || hostname === "::1";
}

function encodePathSegment(value: unknown): string {
  return encodeURIComponent(sanitizeSingleLine(value));
}

function buildThoughtListPath(viewerPlayerId: unknown = ""): string {
  const encodedViewerPlayerId = encodePathSegment(viewerPlayerId);
  return encodedViewerPlayerId
    ? `/thoughts?viewerPlayerId=${encodedViewerPlayerId}`
    : "/thoughts";
}

async function readJsonResponse(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildAuthHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function requestJson(fetchImpl: FetchImpl, baseUrl: string, path: string, options: RequestInit = {}): Promise<any> {
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

function buildJsonRequestOptions(method: string, value: unknown, options: RequestInit = {}): RequestInit {
  return {
    method,
    credentials: "include",
    ...options,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...buildAuthHeaders(),
      ...(options.headers || {}),
    },
    body: JSON.stringify(value ?? {}),
  };
}

export function resolvePlatformApiBaseUrl(options: PlatformApiClientOptions = {}): string {
  const root: any = options?.root ?? globalThis.window;
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

  const location: any = options?.location || root?.location;
  if (isLocalHostname(location?.hostname)) {
    return "http://127.0.0.1:3001";
  }

  return "";
}

export function createPlatformApiClient(options: PlatformApiClientOptions = {}) {
  const fetchImpl: FetchImpl = typeof options?.fetchImpl === "function"
    ? options.fetchImpl
    : (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  const baseUrl = resolvePlatformApiBaseUrl(options);

  async function get(path: string, responseKey?: string): Promise<any> {
    const payload = await requestJson(fetchImpl, baseUrl, path, {
      credentials: "include",
      headers: buildAuthHeaders(),
    });
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function put(path: string, value: unknown, responseKey?: string): Promise<any> {
    const payload = await requestJson(
      fetchImpl,
      baseUrl,
      path,
      buildJsonRequestOptions("PUT", value),
    );
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function post(path: string, value: unknown, responseKey?: string, options: RequestInit = {}): Promise<any> {
    const payload = await requestJson(
      fetchImpl,
      baseUrl,
      path,
      buildJsonRequestOptions("POST", value, options),
    );
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  async function del(path: string, responseKey?: string, options: RequestInit = {}): Promise<any> {
    const payload = await requestJson(fetchImpl, baseUrl, path, {
      method: "DELETE",
      credentials: "include",
      ...options,
      headers: buildAuthHeaders(),
    });
    return payload && responseKey ? (payload[responseKey] ?? null) : payload;
  }

  return {
    baseUrl,
    isConfigured: !!baseUrl && typeof fetchImpl === "function",
    loadPlayerProfile(playerId: string) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/profile`, "player") : Promise.resolve(null);
    },
    loadPlayerProfileByFriendCode(friendCode: unknown) {
      const encoded = encodePathSegment(sanitizeProfileFriendCode(friendCode));
      return encoded ? get(`/players/by-friend-code/${encoded}`, "player") : Promise.resolve(null);
    },
    savePlayerProfile(playerId: string, patch: unknown = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/profile`, patch, "player") : Promise.resolve(null);
    },
    loadPlayerMetrics(playerId: string) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/metrics`, "metrics") : Promise.resolve(null);
    },
    savePlayerMetrics(playerId: string, patch: unknown = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/metrics`, patch, "metrics") : Promise.resolve(null);
    },
    loadPlayerRelationships(playerId: string) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/relationships`, "relationships") : Promise.resolve(null);
    },
    savePlayerRelationships(playerId: string, patch: unknown = {}) {
      const encoded = encodePathSegment(playerId);
      return encoded ? put(`/players/${encoded}/relationships`, patch, "relationships") : Promise.resolve(null);
    },
    createFriendshipBetweenPlayers(leftPlayerId: string, rightPlayerId: string) {
      return post("/friendships", { leftPlayerId, rightPlayerId }, "friendship");
    },
    removeFriend(viewerPlayerId: string, targetPlayerId: string) {
      const encodedViewer = encodePathSegment(viewerPlayerId);
      const encodedTarget = encodePathSegment(targetPlayerId);
      return encodedViewer && encodedTarget
        ? del(`/players/${encodedViewer}/friends/${encodedTarget}`, "removed")
        : Promise.resolve(null);
    },
    recordSharedSessionBetweenPlayers(leftPlayerId: string, rightPlayerId: string, options: Record<string, unknown> = {}) {
      return post("/relationships/shared-session", {
        leftPlayerId,
        rightPlayerId,
        ...options,
      }, "relationshipUpdate");
    },
    recordSharedEventBetweenPlayers(leftPlayerId: string, rightPlayerId: string, options: Record<string, unknown> = {}) {
      return post("/relationships/shared-event", {
        leftPlayerId,
        rightPlayerId,
        ...options,
      }, "relationshipUpdate");
    },
    recordDirectInteractionBetweenPlayers(leftPlayerId: string, rightPlayerId: string, options: Record<string, unknown> = {}) {
      return post("/relationships/direct-interaction", {
        leftPlayerId,
        rightPlayerId,
        ...options,
      }, "relationshipUpdate");
    },
    searchPlayers(q: string = "") {
      const encoded = encodeURIComponent(q.trim());
      return encoded ? get(`/players/search?q=${encoded}`, "players") : Promise.resolve([]);
    },
    listActivityItems() {
      return get("/activity", "items");
    },
    saveActivityItem(item: unknown = {}) {
      return post("/activity", item, "item");
    },
    listThoughts(viewerPlayerId: string = "") {
      return get(buildThoughtListPath(viewerPlayerId), "thoughts");
    },
    listThoughtComments(thoughtId: string) {
      const encoded = encodePathSegment(thoughtId);
      return encoded ? get(`/thoughts/${encoded}/comments`, "comments") : Promise.resolve(null);
    },
    saveThought(thought: unknown = {}) {
      return post("/thoughts", thought, "thought");
    },
    shareThought(thoughtId: string, viewerPlayerId: string, viewerAuthorDisplayName = "", shareOptions: Record<string, unknown> = {}) {
      const encoded = encodePathSegment(thoughtId);
      return encoded
        ? post(`/thoughts/${encoded}/shares`, { viewerPlayerId, viewerAuthorDisplayName, ...shareOptions }, "share")
        : Promise.resolve(null);
    },
    reactToThought(thoughtId: string, viewerPlayerId: string, reactionId: string) {
      const encoded = encodePathSegment(thoughtId);
      return encoded
        ? post(`/thoughts/${encoded}/reactions`, { viewerPlayerId, reactionId }, "thought")
        : Promise.resolve(null);
    },
    commentOnThought(thoughtId: string, viewerPlayerId: string, viewerAuthorDisplayName = "", text = "") {
      const encoded = encodePathSegment(thoughtId);
      return encoded
        ? post(`/thoughts/${encoded}/comments`, { viewerPlayerId, viewerAuthorDisplayName, text }, "commentRecord")
        : Promise.resolve(null);
    },
    deleteThought(thoughtId: string) {
      const encoded = encodePathSegment(thoughtId);
      return encoded ? del(`/thoughts/${encoded}`, "deleted") : Promise.resolve(null);
    },
    async uploadAvatar(file: File | Blob | null) {
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
    async uploadBackground(file: File | Blob | null) {
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
    async uploadMusic(file: File | Blob | null) {
      if (!fetchImpl || !baseUrl || !file) return null;
      const formData = new FormData();
      formData.append("file", file);
      try {
        const response = await fetchImpl(`${baseUrl}/upload/music`, {
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
    async uploadPhoto(file: File | Blob | null) {
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
    async listPlayerPhotos(playerId: string, { visibility }: { visibility?: string } = {}) {
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
    async savePlayerPhoto(playerId: string, photoData: unknown) {
      if (!fetchImpl || !baseUrl || !playerId) return null;
      const encoded = encodePathSegment(playerId);
      if (!encoded) return null;
      const payload = await post(`/players/${encoded}/photos`, photoData);
      return payload?.photo ? payload : null;
    },
    async deletePlayerPhoto(playerId: string, photoId: string) {
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
    async getPlayerPhoto(playerId: string, photoId: string) {
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
    async listPhotoComments(photoId: string) {
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
    async reactToPhoto(photoId: string, viewerPlayerId: string, reactionId: string) {
      if (!fetchImpl || !baseUrl || !photoId) return null;
      const encoded = encodePathSegment(photoId);
      if (!encoded) return null;
      const payload = await post(`/photos/${encoded}/reactions`, { viewerPlayerId, reactionId });
      return payload?.photo || null;
    },
    async commentOnPhoto(photoId: string, viewerPlayerId: string, viewerAuthorDisplayName: string, text: string) {
      if (!fetchImpl || !baseUrl || !photoId) return null;
      const encoded = encodePathSegment(photoId);
      if (!encoded) return null;
      const payload = await post(`/photos/${encoded}/comments`, { viewerPlayerId, viewerAuthorDisplayName, text });
      return payload?.commentRecord || null;
    },
    fetchMyLayout() {
      return get("/profile/layout", "layout");
    },
    saveMyLayout(layout: unknown) {
      return post("/profile/layout", { layout }, "layout");
    },
    fetchPlayerLayout(playerId: string) {
      const encoded = encodePathSegment(playerId);
      return encoded ? get(`/players/${encoded}/layout`, "layout") : Promise.resolve(null);
    },
    // ELO/MMR
    updateGameRating(gameSlug: string, { opponentPlayerId, outcome, sessionId }: { opponentPlayerId?: unknown; outcome?: unknown; sessionId?: unknown }) {
      const encoded = encodePathSegment(gameSlug);
      return encoded ? post(`/ratings/${encoded}`, { opponentPlayerId, outcome, sessionId }) : Promise.resolve(null);
    },
    getGameRating(gameSlug: string, playerId: string) {
      const gs = encodePathSegment(gameSlug);
      const pid = encodePathSegment(playerId);
      return gs && pid ? get(`/ratings/${gs}/${pid}`, "rating") : Promise.resolve(null);
    },
    fetchGameProgress(gameSlug: string) {
      const encoded = encodePathSegment(gameSlug);
      return encoded ? get(`/game-progress/${encoded}`, "progress") : Promise.resolve(null);
    },
    recordGameProgressClaim(gameSlug: string, claim: unknown = {}) {
      const encoded = encodePathSegment(gameSlug);
      return encoded ? post(`/game-progress/${encoded}/claims`, claim) : Promise.resolve(null);
    },
    // Server-authoritative Valor spend: the server prices the offer and deducts+grants
    // atomically. The client only names the offer; it must never send a price.
    spendGameValor(gameSlug: string, offer: unknown) {
      const encoded = encodePathSegment(gameSlug);
      return encoded ? post(`/game-progress/${encoded}/spend`, { offer }) : Promise.resolve(null);
    },
    // Reset campaign mission progress only (Valor / unlocks / skins preserved server-side).
    resetGameCampaign(gameSlug: string) {
      const encoded = encodePathSegment(gameSlug);
      return encoded ? post(`/game-progress/${encoded}/reset`, {}) : Promise.resolve(null);
    },
    // One-time migration of existing local ownership to the server (server-idempotent).
    backfillGameOwnership(gameSlug: string, payload: unknown) {
      const encoded = encodePathSegment(gameSlug);
      return encoded ? post(`/game-progress/${encoded}/backfill`, payload) : Promise.resolve(null);
    },
    enqueueRankedMatch(gameSlug: string) {
      const gs = encodePathSegment(gameSlug);
      return gs ? post(`/ranked/${gs}/queue`, {}) : Promise.resolve(null);
    },
    pollRankedMatch(gameSlug: string) {
      const gs = encodePathSegment(gameSlug);
      return gs ? get(`/ranked/${gs}/queue`) : Promise.resolve(null);
    },
    cancelRankedMatch(gameSlug: string, options: RequestInit = {}) {
      const gs = encodePathSegment(gameSlug);
      return gs ? del(`/ranked/${gs}/queue`, undefined, options) : Promise.resolve(null);
    },
    startRankedMatch(gameSlug: string, { matchId }: any = {}) {
      const gs = encodePathSegment(gameSlug);
      return gs ? post(`/ranked/${gs}/start`, { matchId }) : Promise.resolve(null);
    },
    reportRankedResult(gameSlug: string, { matchId, outcome, squad, unitResults }: any = {}, options: RequestInit = {}) {
      const gs = encodePathSegment(gameSlug);
      return gs ? post(`/ranked/${gs}/report`, { matchId, outcome, squad, unitResults }, undefined, options) : Promise.resolve(null);
    },
    setRankedLobby(gameSlug: string, { matchId, lobbyCode }: any = {}) {
      const gs = encodePathSegment(gameSlug);
      return gs ? post(`/ranked/${gs}/lobby`, { matchId, lobbyCode }) : Promise.resolve(null);
    },
    fetchRankedStanding(gameSlug: string) {
      const gs = encodePathSegment(gameSlug);
      return gs ? get(`/ranked/${gs}/standing`, "standing") : Promise.resolve(null);
    },
    saveRankedProfile(gameSlug: string, patch: any = {}) {
      const gs = encodePathSegment(gameSlug);
      return gs ? put(`/ranked/${gs}/profile`, patch, "profile") : Promise.resolve(null);
    },
    fetchRankedCard(gameSlug: string, playerId: string) {
      const gs = encodePathSegment(gameSlug);
      const pid = encodePathSegment(playerId);
      return gs && pid ? get(`/ranked/${gs}/card/${pid}`, "card") : Promise.resolve(null);
    },
    fetchRankedUnitStats(gameSlug: string, playerId: string) {
      const gs = encodePathSegment(gameSlug);
      const pid = encodePathSegment(playerId);
      return gs && pid ? get(`/ranked/${gs}/units/${pid}`, "unitStats") : Promise.resolve(null);
    },
    fetchRankedMatches(gameSlug: string, playerId: string) {
      const gs = encodePathSegment(gameSlug);
      const pid = encodePathSegment(playerId);
      return gs && pid ? get(`/ranked/${gs}/matches/${pid}`, "matches") : Promise.resolve(null);
    },
    fetchRankedLeaderboard(gameSlug: string, limit?: number) {
      const gs = encodePathSegment(gameSlug);
      if (!gs) return Promise.resolve(null);
      const query = Number.isFinite(Number(limit)) ? `?limit=${encodeURIComponent(String(limit))}` : "";
      return get(`/ranked/${gs}/leaderboard${query}`, "leaderboard");
    },
  };
}

export type PlatformApiClient = ReturnType<typeof createPlatformApiClient>;
