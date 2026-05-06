import {
  isPlainObject,
  sanitizeCount,
  sanitizePlayerId,
  sanitizeSingleLine,
  sanitizeTimestamp,
} from "./normalize-shared.mjs";

export const FRIENDSHIP_CREATION_POINTS = 100;
export const SHARED_SESSION_POINTS = 10;
export const SHARED_EVENT_POINTS = 50;
export const DIRECT_INTERACTION_POINTS = 1;
export const DIRECT_INTERACTION_WINDOW_MS = 10 * 60 * 1000;
export const DIRECT_INTERACTION_WINDOW_LIMIT = 5;

const RELATIONSHIP_SLOT_MODES = new Set(["manual", "auto"]);
const FRIEND_RAIL_SLOT_COUNT = 4;

function normalizeRelationshipMode(value, fallback = "manual") {
  const normalized = sanitizeSingleLine(value, 24).toLowerCase();
  return RELATIONSHIP_SLOT_MODES.has(normalized) ? normalized : fallback;
}

function normalizePlayerIdList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  value.forEach((entry) => {
    const id = sanitizePlayerId(entry);
    if (!id || seen.has(id)) return;
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
}

function normalizeManualFriendSlotPlayerIds(value) {
  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => sanitizePlayerId(value?.[index]));
}

function normalizePlayerCountMap(value) {
  if (!isPlainObject(value)) return {};
  return Object.entries(value).reduce((normalized, [id, count]) => {
    const key = sanitizePlayerId(id);
    const amount = sanitizeCount(count);
    if (!key || amount <= 0) return normalized;
    normalized[key] = amount;
    return normalized;
  }, {});
}

function normalizePlayerTimestampMap(value) {
  if (!isPlainObject(value)) return {};
  return Object.entries(value).reduce((normalized, [id, ts]) => {
    const key = sanitizePlayerId(id);
    const amount = sanitizeTimestamp(ts);
    if (!key || !amount) return normalized;
    normalized[key] = amount;
    return normalized;
  }, {});
}

export function buildDefaultProfileRelationshipsRecord(playerId = "") {
  return {
    playerId: sanitizePlayerId(playerId),
    mainSqueezeMode: "manual",
    mainSqueezePlayerId: "",
    friendRailMode: "auto",
    manualFriendSlotPlayerIds: Array(FRIEND_RAIL_SLOT_COUNT).fill(""),
    mostPlayedWithPlayerId: "",
    lastPlayedWithPlayerId: "",
    recentlyPlayedWithPlayerIds: [],
    friendPlayerIds: [],
    friendPointsByPlayerId: {},
    mutualFriendCountByPlayerId: {},
    sharedGameCountByPlayerId: {},
    sharedSessionCountByPlayerId: {},
    sharedEventCountByPlayerId: {},
    lastSharedSessionAtByPlayerId: {},
    lastSharedEventAtByPlayerId: {},
    lastInteractionAtByPlayerId: {},
  };
}

export function normalizeProfileRelationshipsRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  const defaults = buildDefaultProfileRelationshipsRecord(source.playerId);
  return {
    ...defaults,
    playerId: sanitizePlayerId(source.playerId),
    mainSqueezeMode: normalizeRelationshipMode(source.mainSqueezeMode, defaults.mainSqueezeMode),
    mainSqueezePlayerId: sanitizePlayerId(source.mainSqueezePlayerId),
    friendRailMode: normalizeRelationshipMode(source.friendRailMode, defaults.friendRailMode),
    manualFriendSlotPlayerIds: normalizeManualFriendSlotPlayerIds(source.manualFriendSlotPlayerIds),
    mostPlayedWithPlayerId: sanitizePlayerId(source.mostPlayedWithPlayerId),
    lastPlayedWithPlayerId: sanitizePlayerId(source.lastPlayedWithPlayerId),
    recentlyPlayedWithPlayerIds: normalizePlayerIdList(source.recentlyPlayedWithPlayerIds),
    friendPlayerIds: normalizePlayerIdList(source.friendPlayerIds),
    friendPointsByPlayerId: normalizePlayerCountMap(source.friendPointsByPlayerId),
    mutualFriendCountByPlayerId: normalizePlayerCountMap(source.mutualFriendCountByPlayerId),
    sharedGameCountByPlayerId: normalizePlayerCountMap(source.sharedGameCountByPlayerId),
    sharedSessionCountByPlayerId: normalizePlayerCountMap(source.sharedSessionCountByPlayerId),
    sharedEventCountByPlayerId: normalizePlayerCountMap(source.sharedEventCountByPlayerId),
    lastSharedSessionAtByPlayerId: normalizePlayerTimestampMap(source.lastSharedSessionAtByPlayerId),
    lastSharedEventAtByPlayerId: normalizePlayerTimestampMap(source.lastSharedEventAtByPlayerId),
    lastInteractionAtByPlayerId: normalizePlayerTimestampMap(source.lastInteractionAtByPlayerId),
  };
}
