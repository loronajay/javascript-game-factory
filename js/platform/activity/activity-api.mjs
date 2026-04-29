import { getDefaultPlatformStorage } from "../storage/storage.mjs";
import { createPlatformApiClient } from "../api/platform-api.mjs";
import { recordSharedSessionBetweenPlayers } from "../relationships/relationships.mjs";
import {
  buildDerivedSessionId,
  normalizeActivityItem,
  normalizeIdentity,
  sanitizeSingleLine,
} from "./activity-normalize.mjs";
import {
  loadActivityFeed,
  parseNormalizedStoredFeed,
  upsertActivityFeedItem,
  writeActivityFeed,
} from "./activity-store.mjs";
import {
  buildBattleshitsMatchActivity,
  buildLoversLostRunActivity,
} from "./activity-builders.mjs";

function queueSharedSessionRelationshipUpdate(leftPlayerId, rightPlayerId, options = {}) {
  void recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options);
}

function maybeRecordSharedSessionFromActivity(activity, storage, options = {}) {
  const item = normalizeActivityItem(activity);
  if (item.type !== "game-result") return;

  if (item.gameSlug === "lovers-lost") {
    const boyIdentity = normalizeIdentity(item.metadata?.boyIdentity);
    const girlIdentity = normalizeIdentity(item.metadata?.girlIdentity);
    if (!boyIdentity.playerId || !girlIdentity.playerId || item.metadata?.disconnectNote) return;

    const sessionOptions = {
      storage,
      apiClient: options?.apiClient,
      sessionId: sanitizeSingleLine(item.metadata?.sessionId, 120) || buildDerivedSessionId(item),
      gameSlug: item.gameSlug,
      startedTogether: true,
      reachedResults: true,
      occurredAt: item.createdAt,
    };
    queueSharedSessionRelationshipUpdate(boyIdentity.playerId, girlIdentity.playerId, sessionOptions);
    return;
  }

  if (item.gameSlug === "battleshits") {
    const myProfile = normalizeIdentity(item.metadata?.myProfile);
    const opponentProfile = normalizeIdentity(item.metadata?.opponentProfile);
    const matchResult = sanitizeSingleLine(item.metadata?.matchResult, 24).toLowerCase();
    if (!myProfile.playerId || !opponentProfile.playerId || matchResult === "forfeit_win") return;

    const sessionOptions = {
      storage,
      apiClient: options?.apiClient,
      sessionId: sanitizeSingleLine(item.metadata?.sessionId, 120) || buildDerivedSessionId(item),
      gameSlug: item.gameSlug,
      startedTogether: true,
      reachedResults: true,
      occurredAt: item.createdAt,
    };
    queueSharedSessionRelationshipUpdate(myProfile.playerId, opponentProfile.playerId, sessionOptions);
  }
}

export function publishActivityItem(item, storage = getDefaultPlatformStorage(), options = {}) {
  const normalized = upsertActivityFeedItem(storage, item);
  maybeRecordSharedSessionFromActivity(normalized, storage, options);
  return normalized;
}

export function publishLoversLostRunActivity(runSummary, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const item = buildLoversLostRunActivity(runSummary, options);
  return publishActivityItemWithApi(item, storage, options);
}

export function publishBattleshitsMatchActivity(match, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const item = buildBattleshitsMatchActivity(match, options);
  return publishActivityItemWithApi(item, storage, options);
}

export async function syncActivityFeedFromApi(
  storage = getDefaultPlatformStorage(),
  apiClient = createPlatformApiClient(),
) {
  const canLoad = apiClient && typeof apiClient.listActivityItems === "function";
  if (!canLoad) {
    return loadActivityFeed(storage);
  }

  const remoteFeed = await apiClient.listActivityItems().catch(() => null);
  if (!Array.isArray(remoteFeed)) {
    return loadActivityFeed(storage);
  }

  writeActivityFeed(storage, remoteFeed.map((entry, index) => normalizeActivityItem(entry, index)));
  return loadActivityFeed(storage);
}

export async function publishActivityItemWithApi(
  item,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const isAuth = typeof apiClient?.saveActivityItem === "function";

  if (!isAuth) {
    return publishActivityItem(item, storage, options);
  }

  const normalized = normalizeActivityItem(item);
  if (!normalized.type) return null;

  const remoteItem = await apiClient.saveActivityItem(normalized).catch(() => null);
  if (!remoteItem) return null;

  const saved = normalizeActivityItem(remoteItem);
  upsertActivityFeedItem(storage, saved);
  maybeRecordSharedSessionFromActivity(saved, storage, options);
  return saved;
}

export { parseNormalizedStoredFeed } from "./activity-store.mjs";
