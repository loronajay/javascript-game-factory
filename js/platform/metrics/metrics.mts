import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import type { StorageLike } from "../storage/storage.mjs";
import { createPlatformApiClient } from "../api/platform-api.mjs";

export const PROFILE_METRICS_STORAGE_KEY = getPlatformStorageKey("profileMetrics");
export const PUBLIC_PROFILE_SUPPORT_METRIC_KEYS = Object.freeze([
  "profileViewCount",
  "thoughtPostCount",
  "activityItemCount",
  "receivedReactionCount",
  "receivedCommentCount",
  "receivedShareCount",
  "mostPlayedGameSlug",
  "mostPlayedWithPlayerId",
  "friendCount",
  "friendPoints",
  "totalPlaySessionCount",
  "totalPlayTimeMinutes",
  "uniqueGamesPlayedCount",
  "eventParticipationCount",
  "topThreeFinishCount",
] as const);
export const RELATIONSHIP_DISCOVERY_METRIC_KEYS = Object.freeze([
  "mutualFriendCount",
  "sharedGameCount",
  "sharedSessionCount",
  "sharedEventCount",
] as const);
export const BACKEND_ANALYTICS_METRIC_KEYS = Object.freeze([
  "resultsScreenProfileOpenCount",
  "resultsScreenAddFriendClickCount",
  "chatProfileOpenCount",
  "friendRequestSentCount",
  "friendRequestAcceptedCount",
  "thoughtImpressionCount",
  "profileOpenSourceBreakdown",
] as const);

const PROFILE_OPEN_SOURCE_KEYS = Object.freeze([
  "direct",
  "resultsScreen",
  "chatLobby",
  "event",
  "activity",
  "thoughtFeed",
  "bulletin",
] as const);

export type ProfileOpenSource = (typeof PROFILE_OPEN_SOURCE_KEYS)[number];
export type ProfileOpenSourceBreakdown = Record<ProfileOpenSource, number>;

export interface ProfileMetricsRecord {
  playerId: string;
  profileViewCount: number;
  thoughtPostCount: number;
  activityItemCount: number;
  receivedReactionCount: number;
  receivedCommentCount: number;
  receivedShareCount: number;
  mostPlayedGameSlug: string;
  mostPlayedWithPlayerId: string;
  friendCount: number;
  friendPoints: Record<string, number>;
  totalPlaySessionCount: number;
  totalPlayTimeMinutes: number;
  uniqueGamesPlayedCount: number;
  eventParticipationCount: number;
  topThreeFinishCount: number;
  mutualFriendCount: number;
  sharedGameCount: number;
  sharedSessionCount: number;
  sharedEventCount: number;
  resultsScreenProfileOpenCount: number;
  resultsScreenAddFriendClickCount: number;
  chatProfileOpenCount: number;
  friendRequestSentCount: number;
  friendRequestAcceptedCount: number;
  thoughtImpressionCount: number;
  profileOpenSourceBreakdown: ProfileOpenSourceBreakdown;
}

/** Minimal API surface metrics sync relies on; the full client type is owned by Phase 4. */
interface MetricsApiClient {
  loadPlayerMetrics?: (playerId: string) => Promise<Partial<ProfileMetricsRecord> | null>;
  savePlayerMetrics?: (playerId: string, patch: Record<string, unknown>) => Promise<Partial<ProfileMetricsRecord> | null>;
}

type MaybeStorage = StorageLike | null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleLine(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizePlayerId(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

function sanitizeGameSlug(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

function sanitizeCount(value: unknown): number {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

function normalizeFriendPoints(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized: Record<string, number>, [playerId, count]) => {
    const key = sanitizePlayerId(playerId);
    const points = sanitizeCount(count);
    if (!key || points <= 0) return normalized;
    normalized[key] = points;
    return normalized;
  }, {});
}

function buildProfileOpenSourceBreakdown(value: unknown = {}): ProfileOpenSourceBreakdown {
  const source = isPlainObject(value) ? value : {};

  return PROFILE_OPEN_SOURCE_KEYS.reduce((normalized, key) => {
    normalized[key] = sanitizeCount(source[key]);
    return normalized;
  }, {} as ProfileOpenSourceBreakdown);
}

function normalizeProfileOpenSourceKey(value: unknown): ProfileOpenSource {
  const normalized = sanitizeSingleLine(value, 40);
  return (PROFILE_OPEN_SOURCE_KEYS as readonly string[]).includes(normalized)
    ? (normalized as ProfileOpenSource)
    : "direct";
}

function parseStoredMetricsMap(raw: string | null): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0) return {};

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pickMetricSubset(metrics: unknown, keys: readonly string[] = []): Partial<ProfileMetricsRecord> {
  const normalizedMetrics = normalizeProfileMetricsRecord(metrics);

  return keys.reduce((subset: Record<string, unknown>, key) => {
    subset[key] = (normalizedMetrics as unknown as Record<string, unknown>)[key];
    return subset;
  }, {});
}

export function buildDefaultProfileMetricsRecord(playerId: unknown = ""): ProfileMetricsRecord {
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

export function normalizeProfileMetricsRecord(record: unknown = {}): ProfileMetricsRecord {
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

export function loadProfileMetricsRecord(
  playerId: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
): ProfileMetricsRecord {
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

export function saveProfileMetricsRecord(
  record: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
): ProfileMetricsRecord | null {
  const normalized = normalizeProfileMetricsRecord(record);
  if (!normalized.playerId) return null;

  const storedMap = parseStoredMetricsMap(readStorageText(storage, PROFILE_METRICS_STORAGE_KEY));
  storedMap[normalized.playerId] = normalized;
  writeStorageText(storage, PROFILE_METRICS_STORAGE_KEY, JSON.stringify(storedMap));

  return normalized;
}

export function pickPublicProfileSupportMetrics(record: unknown = {}): Partial<ProfileMetricsRecord> {
  return pickMetricSubset(record, PUBLIC_PROFILE_SUPPORT_METRIC_KEYS);
}

export function pickRelationshipDiscoveryMetrics(record: unknown = {}): Partial<ProfileMetricsRecord> {
  return pickMetricSubset(record, RELATIONSHIP_DISCOVERY_METRIC_KEYS);
}

export function pickBackendAnalyticsMetrics(record: unknown = {}): Partial<ProfileMetricsRecord> {
  return pickMetricSubset(record, BACKEND_ANALYTICS_METRIC_KEYS);
}

export function updateProfileMetricsRecord(
  playerId: unknown,
  updater: (current: ProfileMetricsRecord) => unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
): ProfileMetricsRecord | null {
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

export function syncThoughtPostCount(
  playerId: unknown,
  thoughtPostCount: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
): ProfileMetricsRecord | null {
  return updateProfileMetricsRecord(playerId, (current) => ({
    ...current,
    thoughtPostCount: sanitizeCount(thoughtPostCount),
  }), storage);
}

function computeIncrementedViewRecord(
  current: ProfileMetricsRecord,
  options: { source?: unknown } = {},
): ProfileMetricsRecord {
  const sourceKey = normalizeProfileOpenSourceKey(options?.source);
  return {
    ...current,
    profileViewCount: current.profileViewCount + 1,
    profileOpenSourceBreakdown: {
      ...current.profileOpenSourceBreakdown,
      [sourceKey]: sanitizeCount(current.profileOpenSourceBreakdown[sourceKey]) + 1,
    },
  };
}

export function incrementProfileViewCount(
  playerId: unknown,
  options: { source?: unknown } = {},
  storage: MaybeStorage = getDefaultPlatformStorage(),
): ProfileMetricsRecord | null {
  return updateProfileMetricsRecord(playerId, (current) => computeIncrementedViewRecord(current, options), storage);
}

export async function syncProfileMetricsFromApi(
  playerId: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
  apiClient: MetricsApiClient = createPlatformApiClient(),
): Promise<ProfileMetricsRecord | null> {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId || typeof apiClient?.loadPlayerMetrics !== "function") {
    return loadProfileMetricsRecord(normalizedPlayerId, storage);
  }

  const remoteMetrics = await apiClient.loadPlayerMetrics(normalizedPlayerId).catch(() => null);
  if (!remoteMetrics?.playerId) return null;

  return saveProfileMetricsRecord({ ...remoteMetrics, playerId: normalizedPlayerId }, storage);
}

export async function syncThoughtPostCountWithApi(
  playerId: unknown,
  thoughtPostCount: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
  apiClient: MetricsApiClient = createPlatformApiClient(),
): Promise<ProfileMetricsRecord | null> {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const isAuth = typeof apiClient?.savePlayerMetrics === "function";

  if (!isAuth) {
    return syncThoughtPostCount(normalizedPlayerId, thoughtPostCount, storage);
  }

  const saved = await apiClient.savePlayerMetrics!(normalizedPlayerId, {
    thoughtPostCount: sanitizeCount(thoughtPostCount),
  });
  if (!saved?.playerId) return null;

  return saveProfileMetricsRecord(saved, storage);
}

export async function incrementProfileViewCountWithApi(
  playerId: unknown,
  options: { source?: unknown } = {},
  storage: MaybeStorage = getDefaultPlatformStorage(),
  apiClient: MetricsApiClient = createPlatformApiClient(),
): Promise<ProfileMetricsRecord | null> {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const isAuth = typeof apiClient?.savePlayerMetrics === "function";

  if (!isAuth) {
    return incrementProfileViewCount(normalizedPlayerId, options, storage);
  }

  const current = loadProfileMetricsRecord(normalizedPlayerId, storage);
  const incremented = normalizeProfileMetricsRecord(computeIncrementedViewRecord(current, options));
  const saved = await apiClient.savePlayerMetrics!(normalizedPlayerId, {
    profileViewCount: incremented.profileViewCount,
    profileOpenSourceBreakdown: incremented.profileOpenSourceBreakdown,
  });
  if (!saved?.playerId) return null;

  return saveProfileMetricsRecord(saved, storage);
}
