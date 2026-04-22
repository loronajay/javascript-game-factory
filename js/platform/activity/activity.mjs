import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import { createPlatformApiClient } from "../api/platform-api.mjs";
import {
  recordSharedSessionBetweenPlayers,
  saveProfileRelationshipsRecord,
} from "../relationships/relationships.mjs";

export const ACTIVITY_FEED_STORAGE_KEY = getPlatformStorageKey("activityFeed");
export const ACTIVITY_FEED_LIMIT = 40;

const ACTIVITY_TYPES = new Set([
  "game-result",
]);

const ACTIVITY_VISIBILITIES = new Set([
  "public",
  "friends",
  "private",
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function createFallbackActivityId() {
  return `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStringList(value, maxLength = 120) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    const item = sanitizeSingleLine(entry, maxLength);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 3) return null;
  if (typeof value === "string") return sanitizeSingleLine(value, 280);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return normalizeStringList(value, 120);
  if (!isPlainObject(value)) return null;

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = sanitizeSingleLine(key, 80);
    if (!normalizedKey) continue;
    const normalizedValue = sanitizeMetadataValue(entry, depth + 1);
    if (normalizedValue == null) continue;
    next[normalizedKey] = normalizedValue;
  }
  return next;
}

function parseStoredFeed(raw) {
  if (typeof raw !== "string" || raw.length === 0) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseNormalizedStoredFeed(storage = getDefaultPlatformStorage()) {
  return parseStoredFeed(readStorageText(storage, ACTIVITY_FEED_STORAGE_KEY))
    .map((entry, index) => normalizeActivityItem(entry, index));
}

function mergeStoredActivityFeed(primary = [], fallback = []) {
  const merged = [];
  const seen = new Set();

  for (const entry of [...primary, ...fallback]) {
    const normalized = normalizeActivityItem(entry, merged.length);
    if (!normalized.id || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }

  return merged.sort(compareActivityDesc).slice(0, ACTIVITY_FEED_LIMIT);
}

function writeActivityFeed(storage, activityFeed = []) {
  const normalized = Array.isArray(activityFeed)
    ? activityFeed.map((entry, index) => normalizeActivityItem(entry, index))
    : [];
  writeStorageText(storage, ACTIVITY_FEED_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function mergeRemoteActivityItemIntoStorage(remoteItem, storage) {
  const normalizedRemoteItem = normalizeActivityItem(remoteItem);
  const merged = mergeStoredActivityFeed(
    [normalizedRemoteItem],
    parseNormalizedStoredFeed(storage).filter((entry) => entry.id !== normalizedRemoteItem.id),
  );
  writeActivityFeed(storage, merged);
}

function compareActivityDesc(left, right) {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.summary.localeCompare(right.summary);
}

export function normalizeActivityItem(item = {}, index = 0) {
  const id = sanitizeSingleLine(item?.id, 80) || createFallbackActivityId() || `activity-${index + 1}`;
  const type = sanitizeSingleLine(item?.type, 24).toLowerCase();
  const visibility = sanitizeSingleLine(item?.visibility, 24).toLowerCase();

  return {
    id,
    type: ACTIVITY_TYPES.has(type) ? type : "game-result",
    actorPlayerId: sanitizeSingleLine(item?.actorPlayerId, 80),
    actorDisplayName: sanitizeSingleLine(item?.actorDisplayName, 60),
    gameSlug: sanitizeSingleLine(item?.gameSlug, 80),
    summary: sanitizeTextBlock(item?.summary, 280),
    visibility: ACTIVITY_VISIBILITIES.has(visibility) ? visibility : "friends",
    createdAt: sanitizeSingleLine(item?.createdAt, 40) || new Date().toISOString(),
    metadata: sanitizeMetadataValue(item?.metadata) || {},
  };
}

export function loadActivityFeed(storage = getDefaultPlatformStorage()) {
  return parseNormalizedStoredFeed(storage)
    .sort(compareActivityDesc);
}

export function publishActivityItem(item, storage = getDefaultPlatformStorage(), options = {}) {
  const normalized = normalizeActivityItem(item);
  const current = loadActivityFeed(storage).filter((entry) => entry.id !== normalized.id);
  const next = [normalized, ...current].slice(0, ACTIVITY_FEED_LIMIT);
  writeActivityFeed(storage, next);
  maybeRecordSharedSessionFromActivity(normalized, storage, options);
  return normalized;
}

function normalizeIdentity(identity = {}) {
  return {
    playerId: sanitizeSingleLine(identity?.playerId, 80),
    displayName: sanitizeSingleLine(identity?.displayName, 60),
  };
}

function buildDerivedSessionId(activity) {
  const gameSlug = sanitizeSingleLine(activity?.gameSlug, 80);
  const createdAt = sanitizeSingleLine(activity?.createdAt, 40);
  const leftPlayerId = sanitizeSingleLine(activity?.actorPlayerId, 80);
  const opponentProfile = normalizeIdentity(activity?.metadata?.opponentProfile);
  const boyIdentity = normalizeIdentity(activity?.metadata?.boyIdentity);
  const girlIdentity = normalizeIdentity(activity?.metadata?.girlIdentity);
  const rightPlayerId = opponentProfile.playerId || girlIdentity.playerId || boyIdentity.playerId;
  if (!gameSlug || !createdAt || !leftPlayerId || !rightPlayerId) return "";
  return `${gameSlug}:${leftPlayerId}:${rightPlayerId}:${createdAt}`;
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

function syncRelationshipUpdateToStorage(result, storage) {
  if (result?.leftRecord?.playerId) {
    saveProfileRelationshipsRecord(result.leftRecord, storage);
  }
  if (result?.rightRecord?.playerId) {
    saveProfileRelationshipsRecord(result.rightRecord, storage);
  }
}

function queueSharedSessionRelationshipUpdate(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options?.apiClient;

  if (typeof apiClient?.recordSharedSessionBetweenPlayers === "function") {
    Promise.resolve(apiClient.recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, {
      sessionId: options.sessionId,
      gameSlug: options.gameSlug,
      startedTogether: options.startedTogether,
      reachedResults: options.reachedResults,
      occurredAt: options.occurredAt,
    }))
      .then((result) => {
        if (result?.leftRecord?.playerId || result?.rightRecord?.playerId) {
          syncRelationshipUpdateToStorage(result, storage);
          return;
        }

        recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options);
      })
      .catch(() => {
        recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options);
      });
    return;
  }

  recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options);
}

function actorNameFromOptions(options = {}) {
  return sanitizeSingleLine(options?.actorDisplayName, 60) || "A pilot";
}

export function buildLoversLostRunActivity(runSummary, options = {}) {
  const summary = isPlainObject(runSummary) ? runSummary : {};
  const actorDisplayName = actorNameFromOptions(options);
  const outcome = sanitizeSingleLine(summary.outcome, 24).toLowerCase() || "game_over";
  let text = `${actorDisplayName} finished a Lovers Lost run.`;
  if (outcome === "reunion") {
    text = `${actorDisplayName} reunited both lovers in Lovers Lost with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else if (outcome === "partial") {
    text = `${actorDisplayName} carried one lover to the finish in Lovers Lost for ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else if (summary.disconnectNote) {
    text = `${actorDisplayName} ended a Lovers Lost run after a disconnect with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else {
    text = `${actorDisplayName} timed out in Lovers Lost with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  }

  return normalizeActivityItem({
    type: "game-result",
    actorPlayerId: sanitizeSingleLine(options?.actorPlayerId, 80),
    actorDisplayName,
    gameSlug: "lovers-lost",
    summary: text,
    visibility: options?.visibility || "friends",
    createdAt: options?.createdAt,
    metadata: {
      outcome,
      totalScore: Math.max(0, Math.floor(Number(summary.totalScore) || 0)),
      elapsedFrames: Math.max(0, Math.floor(Number(summary.elapsedFrames) || 0)),
      boyFinished: !!summary.boyFinished,
      girlFinished: !!summary.girlFinished,
      disconnectNote: !!summary.disconnectNote,
      sessionId: sanitizeSingleLine(options?.sessionId, 120),
      boyIdentity: normalizeIdentity(summary.boyIdentity),
      girlIdentity: normalizeIdentity(summary.girlIdentity),
    },
  });
}

export function buildBattleshitsMatchActivity(match, options = {}) {
  const source = isPlainObject(match) ? match : {};
  const myProfile = normalizeIdentity(source.myProfile);
  const opponentProfile = normalizeIdentity(source.opponentProfile);
  const actorDisplayName = myProfile.displayName || actorNameFromOptions(options);
  const result = sanitizeSingleLine(source.result, 24).toLowerCase() || "loss";
  const opponentName = opponentProfile.displayName || "an opponent";

  let text = `${actorDisplayName} finished a Battleshits match against ${opponentName}.`;
  if (result === "win") {
    text = `${actorDisplayName} won a Battleshits match against ${opponentName}.`;
  } else if (result === "forfeit_win") {
    text = `${actorDisplayName} won a Battleshits match by forfeit against ${opponentName}.`;
  } else {
    text = `${actorDisplayName} lost a Battleshits match to ${opponentName}.`;
  }

  return normalizeActivityItem({
    type: "game-result",
    actorPlayerId: myProfile.playerId || sanitizeSingleLine(options?.actorPlayerId, 80),
    actorDisplayName,
    gameSlug: "battleshits",
    summary: text,
    visibility: options?.visibility || "friends",
    createdAt: source.createdAt || options?.createdAt,
    metadata: {
      matchResult: result,
      opponentDisplayName: opponentProfile.displayName,
      matchmakingMode: sanitizeSingleLine(source.matchmakingMode, 40),
      roomCode: sanitizeSingleLine(source.roomCode, 20),
      sessionId: sanitizeSingleLine(source.sessionId, 120) || sanitizeSingleLine(options?.sessionId, 120),
      myProfile,
      opponentProfile,
    },
  });
}

export function publishLoversLostRunActivity(runSummary, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const item = buildLoversLostRunActivity(runSummary, options);
  const saved = publishActivityItem(item, storage, options);
  mirrorPublishedActivityItem(saved, storage, options);
  return saved;
}

export function publishBattleshitsMatchActivity(match, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const item = buildBattleshitsMatchActivity(match, options);
  const saved = publishActivityItem(item, storage, options);
  mirrorPublishedActivityItem(saved, storage, options);
  return saved;
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

  const merged = mergeStoredActivityFeed(
    remoteFeed.map((entry, index) => normalizeActivityItem(entry, index)),
    parseNormalizedStoredFeed(storage),
  );
  writeActivityFeed(storage, merged);
  return loadActivityFeed(storage);
}

export async function publishActivityItemWithApi(
  item,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const saved = publishActivityItem(item, storage, options);
  await mirrorPublishedActivityItem(saved, storage, options);
  return saved;
}

async function mirrorPublishedActivityItem(
  saved,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  if (typeof apiClient?.saveActivityItem !== "function") {
    return null;
  }

  const remoteItem = await apiClient.saveActivityItem(saved).catch(() => null);
  if (remoteItem) {
    mergeRemoteActivityItemIntoStorage(remoteItem, storage);
  }
  return remoteItem;
}
