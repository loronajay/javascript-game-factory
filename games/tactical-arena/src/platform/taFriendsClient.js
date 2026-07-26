// Tactical Arena friends client — the game's seam onto the per-game social graph
// (`/games/tactical-arena/social/...` on the platform API).
//
// These friends are TA's own, deliberately separate from the factory-wide friends
// list on /me and /player. Being someone's TA friend does not make you their factory
// friend, and the platform profile links on the results screen stay available
// alongside this as the other, wider option.
//
// Everything here is I/O plus normalization. Display shaping lives in
// src/ui/taFriendsModel.js so it can be tested without a DOM or a network, and the
// panels stay renderers. All dependencies are injectable for the same reason.

import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { isFactoryAccountLoggedIn, readStoredFactoryAccountSession } from "./factoryAccount.js";
import { TACTICAL_ARENA_GAME_SLUG } from "./gameProgressClient.js";

export const TA_SOCIAL_SIGNED_OUT = "signed_out";
export const TA_SOCIAL_UNAVAILABLE = "unavailable";

// The client methods this feature needs. If the shared platform client predates them
// (an older cached build, say), the panel shows "unavailable" rather than throwing on
// the first click.
const REQUIRED_METHODS = Object.freeze([
  "fetchGameFriends",
  "fetchGameFriendRequests",
  "sendGameFriendRequest",
  "searchGamePlayers",
]);

function defaultApiClient() {
  try {
    return createPlatformApiClient();
  } catch {
    return null;
  }
}

export function isTaSocialApiReady(apiClient) {
  if (!apiClient?.isConfigured) return false;
  return REQUIRED_METHODS.every((name) => typeof apiClient[name] === "function");
}

/**
 * Availability of the friends feature right now: `"ready"`, `TA_SOCIAL_SIGNED_OUT`,
 * or `TA_SOCIAL_UNAVAILABLE`. Callers render three different states from this, and
 * conflating them is how a signed-in player with a flaky API gets told to sign in.
 */
export function taSocialAvailability({
  apiClient = defaultApiClient(),
  account = readStoredFactoryAccountSession(),
} = {}) {
  if (!isFactoryAccountLoggedIn(account)) return TA_SOCIAL_SIGNED_OUT;
  if (!isTaSocialApiReady(apiClient)) return TA_SOCIAL_UNAVAILABLE;
  return "ready";
}

function cleanText(value, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanCount(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// One player as every TA social surface consumes them. The server already shapes
// this; normalizing again means a partial or legacy payload still renders.
export function normalizeTaPlayer(value) {
  if (!value || typeof value !== "object") return null;
  const playerId = cleanText(value.playerId, 120);
  if (!playerId) return null;
  const rating = Number(value.rating);
  return {
    playerId,
    displayName: cleanText(value.displayName, 80),
    tagline: cleanText(value.tagline, 120),
    avatarUnit: cleanText(value.avatarUnit, 60) || null,
    avatarSkin: cleanText(value.avatarSkin, 60) || null,
    rating: Number.isFinite(rating) ? rating : null,
    tier: value.tier && typeof value.tier === "object"
      ? { id: cleanText(value.tier.id, 40), label: cleanText(value.tier.label, 40) }
      : null,
    wins: cleanCount(value.wins),
    losses: cleanCount(value.losses),
    draws: cleanCount(value.draws),
    relationship: cleanText(value.relationship, 40) || "none",
    requestId: cleanText(value.requestId, 40) || null,
    friendsSince: value.friendsSince || null,
    blockedAt: value.blockedAt || null,
  };
}

function normalizeRequest(value) {
  if (!value || typeof value !== "object") return null;
  const requestId = cleanText(value.requestId, 40);
  if (!requestId) return null;
  return {
    requestId,
    requesterPlayerId: cleanText(value.requesterPlayerId, 120),
    recipientPlayerId: cleanText(value.recipientPlayerId, 120),
    createdAt: value.createdAt || null,
    player: normalizeTaPlayer(value.player),
  };
}

function normalizeList(values, normalize) {
  return (Array.isArray(values) ? values : []).map(normalize).filter(Boolean);
}

// The list endpoints don't repeat the viewer's relationship on each row — being in the
// friends list *is* the relationship. Stamp it here so rows can't fall back to "none"
// and offer a friend an Add Friend button.
function withRelationship(players, relationship) {
  return players.map((player) => ({ ...player, relationship }));
}

/**
 * Create the friends client. Every method resolves to normalized data or `null`
 * (network/service failure); refusals from the server arrive as `{ error }` so the
 * caller can show the specific reason instead of a generic failure.
 */
export function createTaFriendsClient({
  apiClient = defaultApiClient(),
  gameSlug = TACTICAL_ARENA_GAME_SLUG,
} = {}) {
  const call = async (fn) => {
    if (!isTaSocialApiReady(apiClient)) return null;
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  return {
    get isReady() { return isTaSocialApiReady(apiClient); },

    async listFriends() {
      const res = await call(() => apiClient.fetchGameFriends(gameSlug));
      return res ? { friends: withRelationship(normalizeList(res.friends, normalizeTaPlayer), "friend") } : null;
    },

    async listRequests() {
      const res = await call(() => apiClient.fetchGameFriendRequests(gameSlug));
      if (!res) return null;
      return {
        incoming: normalizeList(res.incoming, normalizeRequest),
        outgoing: normalizeList(res.outgoing, normalizeRequest),
      };
    },

    async listBlocked() {
      if (typeof apiClient?.fetchGameBlocks !== "function") return null;
      const res = await call(() => apiClient.fetchGameBlocks(gameSlug));
      return res ? { blocked: withRelationship(normalizeList(res.blocked, normalizeTaPlayer), "blocked") } : null;
    },

    async search(query, limit) {
      const res = await call(() => apiClient.searchGamePlayers(gameSlug, query, limit));
      return res ? { query: cleanText(res.query, 80), results: normalizeList(res.results, normalizeTaPlayer) } : null;
    },

    sendRequest(playerId) {
      return call(() => apiClient.sendGameFriendRequest(gameSlug, playerId));
    },
    acceptRequest(requestId) {
      return call(() => apiClient.acceptGameFriendRequest(gameSlug, requestId));
    },
    declineRequest(requestId) {
      return call(() => apiClient.declineGameFriendRequest(gameSlug, requestId));
    },
    cancelRequest(requestId) {
      return call(() => apiClient.cancelGameFriendRequest(gameSlug, requestId));
    },
    removeFriend(playerId) {
      return call(() => apiClient.removeGameFriend(gameSlug, playerId));
    },
    blockPlayer(playerId) {
      return call(() => apiClient.blockGamePlayer(gameSlug, playerId));
    },
    unblockPlayer(playerId) {
      return call(() => apiClient.unblockGamePlayer(gameSlug, playerId));
    },

    async relationshipWith(playerId) {
      if (typeof apiClient?.fetchGamePlayerRelationship !== "function") return null;
      return call(() => apiClient.fetchGamePlayerRelationship(gameSlug, playerId));
    },

    async badgesFor(playerId) {
      if (typeof apiClient?.fetchGamePlayerBadges !== "function") return null;
      const res = await call(() => apiClient.fetchGamePlayerBadges(gameSlug, playerId));
      return res ? { badges: Array.isArray(res.badges) ? res.badges : [] } : null;
    },
  };
}
