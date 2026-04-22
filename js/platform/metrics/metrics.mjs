import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";

export const PROFILE_METRICS_STORAGE_KEY = getPlatformStorageKey("profileMetrics");

const PROFILE_OPEN_SOURCE_KEYS = Object.freeze([
  "direct",
  "resultsScreen",
  "chatLobby",
  "event",
  "activity",
  "thoughtFeed",
  "bulletin",
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizePlayerId(value) {
  return sanitizeSingleLine(value, 80);
}

function sanitizeGameSlug(value) {
  return sanitizeSingleLine(value, 80);
}

function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

function normalizeFriendPoints(value) {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized, [playerId, count]) => {
    const key = sanitizePlayerId(playerId);
    const points = sanitizeCount(count);
    if (!key || points <= 0) return normalized;
    normalized[key] = points;
    return normalized;
  }, {});
}

function buildProfileOpenSourceBreakdown(value = {}) {
  const source = isPlainObject(value) ? value : {};

  return PROFILE_OPEN_SOURCE_KEYS.reduce((normalized, key) => {
    normalized[key] = sanitizeCount(source[key]);
    return normalized;
  }, {});
}

function normalizeProfileOpenSourceKey(value) {
  const normalized = sanitizeSingleLine(value, 40);
  return PROFILE_OPEN_SOURCE_KEYS.includes(normalized) ? normalized : "direct";
}

function parseStoredMetricsMap(raw) {
  if (typeof raw !== "string" || raw.length === 0) return {};

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function buildDefaultProfileMetricsRecord(playerId = "") {
  return {
    playerId: sanitizePlayerId(playerId),
    profileViewCount: 0,
    thoughtPostCount: 0,
    activityItemCount: 0,
    receivedReactionCount: 0,
    receivedCommentCount: 0,
    receivedShareCount: 0,
    mostPlayedGameSlug: "",
    mostPlayedWithPlayerId: "",
    friendCount: 0,
    friendPoints: {},
    totalPlaySessionCount: 0,
    totalPlayTimeMinutes: 0,
    uniqueGamesPlayedCount: 0,
    eventParticipationCount: 0,
    topThreeFinishCount: 0,
    mutualFriendCount: 0,
    sharedGameCount: 0,
    sharedSessionCount: 0,
    sharedEventCount: 0,
    resultsScreenProfileOpenCount: 0,
    resultsScreenAddFriendClickCount: 0,
    chatProfileOpenCount: 0,
    friendRequestSentCount: 0,
    friendRequestAcceptedCount: 0,
    thoughtImpressionCount: 0,
    profileOpenSourceBreakdown: buildProfileOpenSourceBreakdown(),
  };
}

export function normalizeProfileMetricsRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  const defaults = buildDefaultProfileMetricsRecord(source.playerId);

  return {
    ...defaults,
    playerId: sanitizePlayerId(source.playerId),
    profileViewCount: sanitizeCount(source.profileViewCount),
    thoughtPostCount: sanitizeCount(source.thoughtPostCount),
    activityItemCount: sanitizeCount(source.activityItemCount),
    receivedReactionCount: sanitizeCount(source.receivedReactionCount),
    receivedCommentCount: sanitizeCount(source.receivedCommentCount),
    receivedShareCount: sanitizeCount(source.receivedShareCount),
    mostPlayedGameSlug: sanitizeGameSlug(source.mostPlayedGameSlug),
    mostPlayedWithPlayerId: sanitizePlayerId(source.mostPlayedWithPlayerId),
    friendCount: sanitizeCount(source.friendCount),
    friendPoints: normalizeFriendPoints(source.friendPoints),
    totalPlaySessionCount: sanitizeCount(source.totalPlaySessionCount),
    totalPlayTimeMinutes: sanitizeCount(source.totalPlayTimeMinutes),
    uniqueGamesPlayedCount: sanitizeCount(source.uniqueGamesPlayedCount),
    eventParticipationCount: sanitizeCount(source.eventParticipationCount),
    topThreeFinishCount: sanitizeCount(source.topThreeFinishCount),
    mutualFriendCount: sanitizeCount(source.mutualFriendCount),
    sharedGameCount: sanitizeCount(source.sharedGameCount),
    sharedSessionCount: sanitizeCount(source.sharedSessionCount),
    sharedEventCount: sanitizeCount(source.sharedEventCount),
    resultsScreenProfileOpenCount: sanitizeCount(source.resultsScreenProfileOpenCount),
    resultsScreenAddFriendClickCount: sanitizeCount(source.resultsScreenAddFriendClickCount),
    chatProfileOpenCount: sanitizeCount(source.chatProfileOpenCount),
    friendRequestSentCount: sanitizeCount(source.friendRequestSentCount),
    friendRequestAcceptedCount: sanitizeCount(source.friendRequestAcceptedCount),
    thoughtImpressionCount: sanitizeCount(source.thoughtImpressionCount),
    profileOpenSourceBreakdown: buildProfileOpenSourceBreakdown(source.profileOpenSourceBreakdown),
  };
}

export function loadProfileMetricsRecord(playerId, storage = getDefaultPlatformStorage()) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  const storedMap = parseStoredMetricsMap(readStorageText(storage, PROFILE_METRICS_STORAGE_KEY));
  const storedRecord = normalizedPlayerId ? storedMap[normalizedPlayerId] : null;

  if (!normalizedPlayerId) {
    return buildDefaultProfileMetricsRecord("");
  }

  return normalizeProfileMetricsRecord({
    ...(isPlainObject(storedRecord) ? storedRecord : {}),
    playerId: normalizedPlayerId,
  });
}

export function saveProfileMetricsRecord(record, storage = getDefaultPlatformStorage()) {
  const normalized = normalizeProfileMetricsRecord(record);
  if (!normalized.playerId) return null;

  const storedMap = parseStoredMetricsMap(readStorageText(storage, PROFILE_METRICS_STORAGE_KEY));
  storedMap[normalized.playerId] = normalized;
  writeStorageText(storage, PROFILE_METRICS_STORAGE_KEY, JSON.stringify(storedMap));

  return normalized;
}

export function updateProfileMetricsRecord(playerId, updater, storage = getDefaultPlatformStorage()) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId || typeof updater !== "function") return null;

  const current = loadProfileMetricsRecord(normalizedPlayerId, storage);
  const nextPatch = updater(current);
  const merged = normalizeProfileMetricsRecord({
    ...current,
    ...(isPlainObject(nextPatch) ? nextPatch : {}),
    playerId: normalizedPlayerId,
  });

  return saveProfileMetricsRecord(merged, storage);
}

export function syncThoughtPostCount(playerId, thoughtPostCount, storage = getDefaultPlatformStorage()) {
  return updateProfileMetricsRecord(playerId, (current) => ({
    ...current,
    thoughtPostCount: sanitizeCount(thoughtPostCount),
  }), storage);
}

export function incrementProfileViewCount(playerId, options = {}, storage = getDefaultPlatformStorage()) {
  const sourceKey = normalizeProfileOpenSourceKey(options?.source);

  return updateProfileMetricsRecord(playerId, (current) => ({
    ...current,
    profileViewCount: current.profileViewCount + 1,
    profileOpenSourceBreakdown: {
      ...current.profileOpenSourceBreakdown,
      [sourceKey]: sanitizeCount(current.profileOpenSourceBreakdown[sourceKey]) + 1,
    },
  }), storage);
}
