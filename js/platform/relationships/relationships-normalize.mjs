const RELATIONSHIP_SLOT_MODES = new Set(["manual", "auto"]);
const FRIEND_RAIL_SLOT_COUNT = 4;

export function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizePlayerId(value) {
  return sanitizeSingleLine(value, 80);
}

export function sanitizeDisplayName(value) {
  return sanitizeSingleLine(value, 60);
}

export function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

export function sanitizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return sanitizeSingleLine(value, 80);
}

export function sanitizeGameSlug(value) {
  return sanitizeSingleLine(value, 80);
}

function normalizeRelationshipMode(value, fallback = "manual") {
  const normalized = sanitizeSingleLine(value, 24).toLowerCase();
  return RELATIONSHIP_SLOT_MODES.has(normalized) ? normalized : fallback;
}

export function normalizePlayerIdList(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const normalized = [];

  value.forEach((entry) => {
    const playerId = sanitizePlayerId(entry);
    if (!playerId || seen.has(playerId)) return;
    seen.add(playerId);
    normalized.push(playerId);
  });

  return normalized;
}

function normalizeManualFriendSlotPlayerIds(value) {
  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => sanitizePlayerId(value?.[index]));
}

function normalizePlayerCountMap(value) {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized, [playerId, count]) => {
    const key = sanitizePlayerId(playerId);
    const amount = sanitizeCount(count);
    if (!key || amount <= 0) return normalized;
    normalized[key] = amount;
    return normalized;
  }, {});
}

function normalizePlayerTimestampMap(value) {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized, [playerId, timestamp]) => {
    const key = sanitizePlayerId(playerId);
    const amount = sanitizeTimestamp(timestamp);
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
