import {
  DIRECT_INTERACTION_POINTS,
  FRIENDSHIP_CREATION_POINTS,
  SHARED_EVENT_POINTS,
  SHARED_SESSION_POINTS,
  buildDefaultProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
} from "../normalize.mjs";

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

function sanitizeTimestamp(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function ensureJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function mapRowToRelationshipsRecord(row = {}, fallbackPlayerId = "") {
  return normalizeProfileRelationshipsRecord({
    playerId: row.player_id || fallbackPlayerId,
    mainSqueezeMode: row.main_squeeze_mode,
    mainSqueezePlayerId: row.main_squeeze_player_id,
    friendRailMode: row.friend_rail_mode,
    manualFriendSlotPlayerIds: ensureJsonArray(row.manual_friend_slot_player_ids),
    mostPlayedWithPlayerId: row.most_played_with_player_id,
    lastPlayedWithPlayerId: row.last_played_with_player_id,
    recentlyPlayedWithPlayerIds: ensureJsonArray(row.recently_played_with_player_ids),
    friendPlayerIds: ensureJsonArray(row.friend_player_ids),
    friendPointsByPlayerId: ensureJsonObject(row.friend_points_by_player_id),
    mutualFriendCountByPlayerId: ensureJsonObject(row.mutual_friend_count_by_player_id),
    sharedGameCountByPlayerId: ensureJsonObject(row.shared_game_count_by_player_id),
    sharedSessionCountByPlayerId: ensureJsonObject(row.shared_session_count_by_player_id),
    sharedEventCountByPlayerId: ensureJsonObject(row.shared_event_count_by_player_id),
    lastSharedSessionAtByPlayerId: ensureJsonObject(row.last_shared_session_at_by_player_id),
    lastSharedEventAtByPlayerId: ensureJsonObject(row.last_shared_event_at_by_player_id),
    lastInteractionAtByPlayerId: ensureJsonObject(row.last_interaction_at_by_player_id),
  });
}

export function buildRelationshipsParams(playerId, relationships) {
  return [
    playerId,
    relationships.mainSqueezeMode,
    relationships.mainSqueezePlayerId,
    relationships.friendRailMode,
    JSON.stringify(relationships.manualFriendSlotPlayerIds),
    relationships.mostPlayedWithPlayerId,
    relationships.lastPlayedWithPlayerId,
    JSON.stringify(relationships.recentlyPlayedWithPlayerIds),
    JSON.stringify(relationships.friendPlayerIds),
    JSON.stringify(relationships.friendPointsByPlayerId),
    JSON.stringify(relationships.mutualFriendCountByPlayerId),
    JSON.stringify(relationships.sharedGameCountByPlayerId),
    JSON.stringify(relationships.sharedSessionCountByPlayerId),
    JSON.stringify(relationships.sharedEventCountByPlayerId),
    JSON.stringify(relationships.lastSharedSessionAtByPlayerId),
    JSON.stringify(relationships.lastSharedEventAtByPlayerId),
    JSON.stringify(relationships.lastInteractionAtByPlayerId),
  ];
}

export function createTimestamp(value) {
  return sanitizeTimestamp(value) || new Date().toISOString();
}

export function buildRelationshipPairKey(leftPlayerId, rightPlayerId) {
  const left = sanitizePlayerId(leftPlayerId);
  const right = sanitizePlayerId(rightPlayerId);
  if (!left || !right || left === right) return "";
  return [left, right].sort((a, b) => a.localeCompare(b)).join("::");
}

function incrementRecordMapCount(record, field, playerId, amount) {
  const key = sanitizePlayerId(playerId);
  const increment = sanitizeCount(amount);
  if (!key || increment <= 0) return;

  const current = sanitizeCount(record[field]?.[key]);
  record[field] = {
    ...(record[field] || {}),
    [key]: current + increment,
  };
}

function setRecordMapTimestamp(record, field, playerId, timestamp) {
  const key = sanitizePlayerId(playerId);
  const value = sanitizeTimestamp(timestamp);
  if (!key || !value) return;

  record[field] = {
    ...(record[field] || {}),
    [key]: value,
  };
}

function parseTimestamp(value) {
  const parsed = Date.parse(sanitizeTimestamp(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pushRecentlyPlayedWith(record, playerId) {
  const key = sanitizePlayerId(playerId);
  if (!key) return;

  const current = Array.isArray(record.recentlyPlayedWithPlayerIds)
    ? record.recentlyPlayedWithPlayerIds
    : [];
  record.recentlyPlayedWithPlayerIds = [
    key,
    ...current.filter((entry) => entry !== key),
  ].slice(0, 8);
}

function compareRelationshipPriority(record, leftPlayerId, rightPlayerId) {
  const leftPoints = sanitizeCount(record.friendPointsByPlayerId?.[leftPlayerId]);
  const rightPoints = sanitizeCount(record.friendPointsByPlayerId?.[rightPlayerId]);
  if (leftPoints !== rightPoints) return rightPoints - leftPoints;

  const leftSessions = sanitizeCount(record.sharedSessionCountByPlayerId?.[leftPlayerId]);
  const rightSessions = sanitizeCount(record.sharedSessionCountByPlayerId?.[rightPlayerId]);
  if (leftSessions !== rightSessions) return rightSessions - leftSessions;

  const leftEvents = sanitizeCount(record.sharedEventCountByPlayerId?.[leftPlayerId]);
  const rightEvents = sanitizeCount(record.sharedEventCountByPlayerId?.[rightPlayerId]);
  if (leftEvents !== rightEvents) return rightEvents - leftEvents;

  const leftRecent = Math.max(
    parseTimestamp(record.lastSharedSessionAtByPlayerId?.[leftPlayerId]),
    parseTimestamp(record.lastSharedEventAtByPlayerId?.[leftPlayerId]),
    parseTimestamp(record.lastInteractionAtByPlayerId?.[leftPlayerId]),
  );
  const rightRecent = Math.max(
    parseTimestamp(record.lastSharedSessionAtByPlayerId?.[rightPlayerId]),
    parseTimestamp(record.lastSharedEventAtByPlayerId?.[rightPlayerId]),
    parseTimestamp(record.lastInteractionAtByPlayerId?.[rightPlayerId]),
  );
  if (leftRecent !== rightRecent) return rightRecent - leftRecent;

  return leftPlayerId.localeCompare(rightPlayerId);
}

function reorderFriendPlayerIds(record) {
  const current = Array.isArray(record.friendPlayerIds) ? record.friendPlayerIds : [];
  record.friendPlayerIds = [...current].sort((leftPlayerId, rightPlayerId) => (
    compareRelationshipPriority(record, leftPlayerId, rightPlayerId)
  ));
}

function deriveMostPlayedWithPlayerId(record) {
  return Object.keys(record.sharedSessionCountByPlayerId || {})
    .sort((leftPlayerId, rightPlayerId) => {
      const leftSessions = sanitizeCount(record.sharedSessionCountByPlayerId?.[leftPlayerId]);
      const rightSessions = sanitizeCount(record.sharedSessionCountByPlayerId?.[rightPlayerId]);
      if (leftSessions !== rightSessions) return rightSessions - leftSessions;

      const leftRecent = parseTimestamp(record.lastSharedSessionAtByPlayerId?.[leftPlayerId]);
      const rightRecent = parseTimestamp(record.lastSharedSessionAtByPlayerId?.[rightPlayerId]);
      if (leftRecent !== rightRecent) return rightRecent - leftRecent;

      return compareRelationshipPriority(record, leftPlayerId, rightPlayerId);
    })[0] || "";
}

function ensureFriendPlayer(record, otherPlayerId) {
  const key = sanitizePlayerId(otherPlayerId);
  if (!key) return;

  const current = Array.isArray(record.friendPlayerIds) ? record.friendPlayerIds : [];
  if (!current.includes(key)) {
    record.friendPlayerIds = [...current, key];
  }
  reorderFriendPlayerIds(record);
}

function awardFriendPoints(record, otherPlayerId, points) {
  incrementRecordMapCount(record, "friendPointsByPlayerId", otherPlayerId, points);
}

export function buildFriendshipResult(leftRecord, rightRecord, awarded, awardedPoints) {
  return {
    awarded,
    awardedPoints,
    leftRecord: normalizeProfileRelationshipsRecord(leftRecord),
    rightRecord: normalizeProfileRelationshipsRecord(rightRecord),
  };
}

export function createEmptyRelationshipResult(leftPlayerId = "", rightPlayerId = "") {
  return buildFriendshipResult(
    buildDefaultProfileRelationshipsRecord(leftPlayerId),
    buildDefaultProfileRelationshipsRecord(rightPlayerId),
    false,
    0,
  );
}

export function applyFriendshipState(leftRecord, rightRecord, options = {}) {
  const normalizedLeftRecord = normalizeProfileRelationshipsRecord(leftRecord);
  const normalizedRightRecord = normalizeProfileRelationshipsRecord(rightRecord);
  const leftPlayerId = sanitizePlayerId(options.leftPlayerId || normalizedLeftRecord.playerId);
  const rightPlayerId = sanitizePlayerId(options.rightPlayerId || normalizedRightRecord.playerId);
  const alreadyAwarded = !!options.alreadyAwarded;

  ensureFriendPlayer(normalizedLeftRecord, rightPlayerId);
  ensureFriendPlayer(normalizedRightRecord, leftPlayerId);

  if (!alreadyAwarded) {
    awardFriendPoints(normalizedLeftRecord, rightPlayerId, FRIENDSHIP_CREATION_POINTS);
    awardFriendPoints(normalizedRightRecord, leftPlayerId, FRIENDSHIP_CREATION_POINTS);
  }

  return buildFriendshipResult(
    normalizedLeftRecord,
    normalizedRightRecord,
    !alreadyAwarded,
    alreadyAwarded ? 0 : FRIENDSHIP_CREATION_POINTS,
  );
}

export function applySharedSessionState(leftRecord, rightRecord, options = {}) {
  const normalizedLeftRecord = normalizeProfileRelationshipsRecord(leftRecord);
  const normalizedRightRecord = normalizeProfileRelationshipsRecord(rightRecord);
  const leftPlayerId = sanitizePlayerId(options.leftPlayerId || normalizedLeftRecord.playerId);
  const rightPlayerId = sanitizePlayerId(options.rightPlayerId || normalizedRightRecord.playerId);
  const occurredAt = createTimestamp(options.occurredAt);
  const gameSlug = typeof options.gameSlug === "string" ? options.gameSlug.trim().slice(0, 80) : "";
  const alreadyAwarded = !!options.alreadyAwarded;
  const alreadyCountedGame = !!options.alreadyCountedGame;

  normalizedLeftRecord.lastPlayedWithPlayerId = rightPlayerId;
  normalizedRightRecord.lastPlayedWithPlayerId = leftPlayerId;
  pushRecentlyPlayedWith(normalizedLeftRecord, rightPlayerId);
  pushRecentlyPlayedWith(normalizedRightRecord, leftPlayerId);
  setRecordMapTimestamp(
    normalizedLeftRecord,
    "lastSharedSessionAtByPlayerId",
    rightPlayerId,
    occurredAt,
  );
  setRecordMapTimestamp(
    normalizedRightRecord,
    "lastSharedSessionAtByPlayerId",
    leftPlayerId,
    occurredAt,
  );

  if (!alreadyAwarded) {
    incrementRecordMapCount(normalizedLeftRecord, "sharedSessionCountByPlayerId", rightPlayerId, 1);
    incrementRecordMapCount(normalizedRightRecord, "sharedSessionCountByPlayerId", leftPlayerId, 1);
    awardFriendPoints(normalizedLeftRecord, rightPlayerId, SHARED_SESSION_POINTS);
    awardFriendPoints(normalizedRightRecord, leftPlayerId, SHARED_SESSION_POINTS);

    if (gameSlug && !alreadyCountedGame) {
      incrementRecordMapCount(normalizedLeftRecord, "sharedGameCountByPlayerId", rightPlayerId, 1);
      incrementRecordMapCount(normalizedRightRecord, "sharedGameCountByPlayerId", leftPlayerId, 1);
    }
  }

  normalizedLeftRecord.mostPlayedWithPlayerId = deriveMostPlayedWithPlayerId(normalizedLeftRecord);
  normalizedRightRecord.mostPlayedWithPlayerId = deriveMostPlayedWithPlayerId(normalizedRightRecord);
  reorderFriendPlayerIds(normalizedLeftRecord);
  reorderFriendPlayerIds(normalizedRightRecord);

  return buildFriendshipResult(
    normalizedLeftRecord,
    normalizedRightRecord,
    !alreadyAwarded,
    alreadyAwarded ? 0 : SHARED_SESSION_POINTS,
  );
}

export function applySharedEventState(leftRecord, rightRecord, options = {}) {
  const normalizedLeftRecord = normalizeProfileRelationshipsRecord(leftRecord);
  const normalizedRightRecord = normalizeProfileRelationshipsRecord(rightRecord);
  const leftPlayerId = sanitizePlayerId(options.leftPlayerId || normalizedLeftRecord.playerId);
  const rightPlayerId = sanitizePlayerId(options.rightPlayerId || normalizedRightRecord.playerId);
  const occurredAt = createTimestamp(options.occurredAt);
  const alreadyAwarded = !!options.alreadyAwarded;

  setRecordMapTimestamp(
    normalizedLeftRecord,
    "lastSharedEventAtByPlayerId",
    rightPlayerId,
    occurredAt,
  );
  setRecordMapTimestamp(
    normalizedRightRecord,
    "lastSharedEventAtByPlayerId",
    leftPlayerId,
    occurredAt,
  );

  if (!alreadyAwarded) {
    incrementRecordMapCount(normalizedLeftRecord, "sharedEventCountByPlayerId", rightPlayerId, 1);
    incrementRecordMapCount(normalizedRightRecord, "sharedEventCountByPlayerId", leftPlayerId, 1);
    awardFriendPoints(normalizedLeftRecord, rightPlayerId, SHARED_EVENT_POINTS);
    awardFriendPoints(normalizedRightRecord, leftPlayerId, SHARED_EVENT_POINTS);
  }

  reorderFriendPlayerIds(normalizedLeftRecord);
  reorderFriendPlayerIds(normalizedRightRecord);

  return buildFriendshipResult(
    normalizedLeftRecord,
    normalizedRightRecord,
    !alreadyAwarded,
    alreadyAwarded ? 0 : SHARED_EVENT_POINTS,
  );
}

export function applyFriendRemovalState(leftRecord, rightRecord, options = {}) {
  const normalizedLeftRecord = normalizeProfileRelationshipsRecord(leftRecord);
  const normalizedRightRecord = normalizeProfileRelationshipsRecord(rightRecord);
  const leftPlayerId = sanitizePlayerId(options.leftPlayerId || normalizedLeftRecord.playerId);
  const rightPlayerId = sanitizePlayerId(options.rightPlayerId || normalizedRightRecord.playerId);

  normalizedLeftRecord.friendPlayerIds = (normalizedLeftRecord.friendPlayerIds || [])
    .filter((playerId) => playerId !== rightPlayerId);
  normalizedRightRecord.friendPlayerIds = (normalizedRightRecord.friendPlayerIds || [])
    .filter((playerId) => playerId !== leftPlayerId);

  if (normalizedLeftRecord.mainSqueezePlayerId === rightPlayerId) {
    normalizedLeftRecord.mainSqueezePlayerId = "";
  }
  if (normalizedRightRecord.mainSqueezePlayerId === leftPlayerId) {
    normalizedRightRecord.mainSqueezePlayerId = "";
  }

  normalizedLeftRecord.manualFriendSlotPlayerIds = (normalizedLeftRecord.manualFriendSlotPlayerIds || [])
    .filter((playerId) => playerId !== rightPlayerId);
  normalizedRightRecord.manualFriendSlotPlayerIds = (normalizedRightRecord.manualFriendSlotPlayerIds || [])
    .filter((playerId) => playerId !== leftPlayerId);

  return {
    removed: true,
    leftRecord: normalizeProfileRelationshipsRecord(normalizedLeftRecord),
    rightRecord: normalizeProfileRelationshipsRecord(normalizedRightRecord),
  };
}

export function applyDirectInteractionState(leftRecord, rightRecord, options = {}) {
  const normalizedLeftRecord = normalizeProfileRelationshipsRecord(leftRecord);
  const normalizedRightRecord = normalizeProfileRelationshipsRecord(rightRecord);
  const leftPlayerId = sanitizePlayerId(options.leftPlayerId || normalizedLeftRecord.playerId);
  const rightPlayerId = sanitizePlayerId(options.rightPlayerId || normalizedRightRecord.playerId);
  const occurredAt = createTimestamp(options.occurredAt);
  const canAward = !!options.canAward;

  setRecordMapTimestamp(
    normalizedLeftRecord,
    "lastInteractionAtByPlayerId",
    rightPlayerId,
    occurredAt,
  );
  setRecordMapTimestamp(
    normalizedRightRecord,
    "lastInteractionAtByPlayerId",
    leftPlayerId,
    occurredAt,
  );

  if (canAward) {
    awardFriendPoints(normalizedLeftRecord, rightPlayerId, DIRECT_INTERACTION_POINTS);
    awardFriendPoints(normalizedRightRecord, leftPlayerId, DIRECT_INTERACTION_POINTS);
  }

  reorderFriendPlayerIds(normalizedLeftRecord);
  reorderFriendPlayerIds(normalizedRightRecord);

  return buildFriendshipResult(
    normalizedLeftRecord,
    normalizedRightRecord,
    canAward,
    canAward ? DIRECT_INTERACTION_POINTS : 0,
  );
}
