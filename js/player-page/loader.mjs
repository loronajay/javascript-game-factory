import {
  loadFactoryProfile,
  saveFactoryProfile,
} from "../platform/identity/factory-profile.mjs";
import {
  loadProfileMetricsRecord,
  saveProfileMetricsRecord,
} from "../platform/metrics/metrics.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { enrichProfileFriendPreviewsFromApi } from "../platform/profile/friend-preview-enrichment.mjs";
import {
  loadProfileRelationshipsRecord,
  saveProfileRelationshipsRecord,
} from "../platform/relationships/relationships.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import {
  buildPlayerThoughtFeed,
  syncThoughtFeedFromApi,
} from "../platform/thoughts/thoughts.mjs";

export function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildThoughtBackedProfile(thoughtFeed = [], requestedPlayerId = "") {
  const playerThoughtFeed = buildPlayerThoughtFeed(thoughtFeed, requestedPlayerId);
  if (playerThoughtFeed.length === 0) return null;

  return {
    version: 1,
    playerId: requestedPlayerId,
    profileName: playerThoughtFeed[0].authorDisplayName,
    bio: "",
    tagline: "",
    avatarAssetId: "",
    favoriteGameSlug: "",
    ladderPlacements: [],
    friendsPreview: [],
    mainSqueeze: null,
    badgeIds: [],
    links: [],
    recentActivity: [],
    thoughtCount: playerThoughtFeed.length,
    preferences: {},
  };
}

export function loadRequestedPlayerProfile(storage = getDefaultPlatformStorage(), requestedPlayerId = "", options = {}) {
  const cachedProfile = loadFactoryProfile(storage);
  const routePlayerId = sanitizePlayerId(requestedPlayerId);
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : [];

  if (!routePlayerId || routePlayerId === cachedProfile.playerId) {
    return cachedProfile;
  }

  return buildThoughtBackedProfile(thoughtFeed, routePlayerId);
}

export async function loadPlayerPageData(options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const params = new URLSearchParams(options.search || globalThis.location?.search || "");
  const requestedPlayerId = sanitizePlayerId(params.get("id"));
  const localProfile = loadFactoryProfile(storage);
  const viewerPlayerId = sanitizePlayerId(options?.authSessionPlayerId || localProfile.playerId);
  const isOwnerView = !requestedPlayerId || requestedPlayerId === viewerPlayerId;
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const thoughtFeed = Array.isArray(options?.thoughtFeed)
    ? options.thoughtFeed
    : await syncThoughtFeedFromApi(storage, apiClient, localProfile.playerId);

  let profile = options.profile ?? loadRequestedPlayerProfile(storage, requestedPlayerId, { thoughtFeed });
  const targetPlayerId = sanitizePlayerId(profile?.playerId || requestedPlayerId || localProfile.playerId);
  let metricsRecord = options?.metricsRecord?.playerId
    ? options.metricsRecord
    : loadProfileMetricsRecord(targetPlayerId, storage);
  let relationshipsRecord = options?.relationshipsRecord?.playerId
    ? options.relationshipsRecord
    : loadProfileRelationshipsRecord(targetPlayerId, storage);
  const canLoad = targetPlayerId
    && apiClient
    && typeof apiClient.loadPlayerProfile === "function"
    && typeof apiClient.loadPlayerMetrics === "function"
    && typeof apiClient.loadPlayerRelationships === "function";

  if (canLoad) {
    const [profileResult, metricsResult, relationshipsResult] = await Promise.all([
      apiClient.loadPlayerProfile(targetPlayerId).catch(() => null),
      apiClient.loadPlayerMetrics(targetPlayerId).catch(() => null),
      apiClient.loadPlayerRelationships(targetPlayerId).catch(() => null),
    ]);

    if (profileResult?.playerId === targetPlayerId) {
      profile = isOwnerView
        ? saveFactoryProfile({
            ...localProfile,
            ...profileResult,
            playerId: localProfile.playerId,
          }, storage)
        : profileResult;
    }

    if (metricsResult?.playerId === targetPlayerId) {
      metricsRecord = saveProfileMetricsRecord({
        ...metricsResult,
        playerId: targetPlayerId,
      }, storage) || metricsRecord;
    }

    if (relationshipsResult?.playerId === targetPlayerId) {
      relationshipsRecord = saveProfileRelationshipsRecord({
        ...relationshipsResult,
        playerId: targetPlayerId,
      }, storage) || relationshipsRecord;
    }
  }

  const enrichedProfile = await enrichProfileFriendPreviewsFromApi(profile, relationshipsRecord, apiClient);

  return {
    requestedPlayerId,
    isOwnerView,
    thoughtFeed,
    profile: enrichedProfile,
    metricsRecord,
    relationshipsRecord,
    storage,
  };
}
