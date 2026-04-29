import { getDefaultPlatformStorage } from "../storage/storage.mjs";
import {
  DIRECT_INTERACTION_POINTS,
  DIRECT_INTERACTION_WINDOW_LIMIT,
  DIRECT_INTERACTION_WINDOW_MS,
  FRIENDSHIP_CREATION_POINTS,
  SHARED_EVENT_POINTS,
  SHARED_SESSION_POINTS,
} from "./relationships-schema.mjs";
import {
  buildDefaultProfileRelationshipsRecord,
  normalizePlayerIdList,
  normalizeProfileRelationshipsRecord,
  sanitizeCount,
  sanitizeGameSlug,
  sanitizePlayerId,
  sanitizeSingleLine,
  sanitizeTimestamp,
} from "./relationships-normalize.mjs";
import {
  loadProfileRelationshipLedger,
  loadProfileRelationshipsRecord,
  saveProfileRelationshipLedger,
  saveProfileRelationshipsRecord,
} from "./relationships-store.mjs";

function sortPlayerIds(leftPlayerId, rightPlayerId) {
  const left = sanitizePlayerId(leftPlayerId);
  const right = sanitizePlayerId(rightPlayerId);
  return [left, right].sort((a, b) => a.localeCompare(b));
}

function buildRelationshipPairKey(leftPlayerId, rightPlayerId) {
  const [left, right] = sortPlayerIds(leftPlayerId, rightPlayerId);
  if (!left || !right || left === right) return "";
  return `${left}::${right}`;
}

function createTimestamp(value) {
  return sanitizeTimestamp(value) || new Date().toISOString();
}

function parseTimestamp(value) {
  const parsed = Date.parse(sanitizeTimestamp(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function incrementRecordMapCount(record, field, playerId, amount) {
  const key = sanitizePlayerId(playerId);
  if (!key || amount <= 0) return;
  const current = sanitizeCount(record[field]?.[key]);
  record[field] = {
    ...(record[field] || {}),
    [key]: current + amount,
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

function pushRecentlyPlayedWith(record, playerId) {
  const key = sanitizePlayerId(playerId);
  if (!key) return;

  record.recentlyPlayedWithPlayerIds = [
    key,
    ...normalizePlayerIdList(record.recentlyPlayedWithPlayerIds).filter((entry) => entry !== key),
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
  record.friendPlayerIds = normalizePlayerIdList(record.friendPlayerIds)
    .sort((leftPlayerId, rightPlayerId) => compareRelationshipPriority(record, leftPlayerId, rightPlayerId));
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

function awardFriendPoints(record, otherPlayerId, points) {
  incrementRecordMapCount(record, "friendPointsByPlayerId", otherPlayerId, points);
}

function ensureFriendPlayer(record, otherPlayerId) {
  const key = sanitizePlayerId(otherPlayerId);
  if (!key) return;
  if (!record.friendPlayerIds.includes(key)) {
    record.friendPlayerIds = [...record.friendPlayerIds, key];
  }
  reorderFriendPlayerIds(record);
}

function buildPairResult(leftRecord, rightRecord, awarded, awardedPoints) {
  return {
    awarded,
    awardedPoints,
    leftRecord: normalizeProfileRelationshipsRecord(leftRecord),
    rightRecord: normalizeProfileRelationshipsRecord(rightRecord),
  };
}

function buildEmptyPairResult() {
  return buildPairResult(
    buildDefaultProfileRelationshipsRecord(""),
    buildDefaultProfileRelationshipsRecord(""),
    false,
    0,
  );
}

function loadPairRecords(leftPlayerId, rightPlayerId, storage) {
  const left = sanitizePlayerId(leftPlayerId);
  const right = sanitizePlayerId(rightPlayerId);
  if (!left || !right || left === right) {
    return null;
  }

  return {
    leftPlayerId: left,
    rightPlayerId: right,
    leftRecord: loadProfileRelationshipsRecord(left, storage),
    rightRecord: loadProfileRelationshipsRecord(right, storage),
  };
}

function savePairRecords(leftRecord, rightRecord, storage) {
  const savedLeft = saveProfileRelationshipsRecord(leftRecord, storage);
  const savedRight = saveProfileRelationshipsRecord(rightRecord, storage);
  return {
    leftRecord: savedLeft,
    rightRecord: savedRight,
  };
}

function applyRemoveFriendLocalMutations(pair) {
  pair.leftRecord.friendPlayerIds = (pair.leftRecord.friendPlayerIds || []).filter((id) => id !== pair.rightPlayerId);
  pair.rightRecord.friendPlayerIds = (pair.rightRecord.friendPlayerIds || []).filter((id) => id !== pair.leftPlayerId);
  if (pair.leftRecord.mainSqueezePlayerId === pair.rightPlayerId) pair.leftRecord.mainSqueezePlayerId = "";
  if (pair.rightRecord.mainSqueezePlayerId === pair.leftPlayerId) pair.rightRecord.mainSqueezePlayerId = "";
  pair.leftRecord.manualFriendSlotPlayerIds = (pair.leftRecord.manualFriendSlotPlayerIds || []).filter((id) => id !== pair.rightPlayerId);
  pair.rightRecord.manualFriendSlotPlayerIds = (pair.rightRecord.manualFriendSlotPlayerIds || []).filter((id) => id !== pair.leftPlayerId);
}

export async function createFriendshipBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options?.apiClient;

  if (typeof apiClient?.createFriendshipBetweenPlayers === "function") {
    const result = await apiClient.createFriendshipBetweenPlayers(leftPlayerId, rightPlayerId).catch(() => null);
    if (!result) {
      return buildEmptyPairResult();
    }
    if (result.leftRecord?.playerId) saveProfileRelationshipsRecord(result.leftRecord, storage);
    if (result.rightRecord?.playerId) saveProfileRelationshipsRecord(result.rightRecord, storage);
    return result;
  }

  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);
  if (!pair) {
    return buildEmptyPairResult();
  }

  const ledger = loadProfileRelationshipLedger(storage);
  const pairKey = buildRelationshipPairKey(pair.leftPlayerId, pair.rightPlayerId);
  const createdAt = createTimestamp(options.createdAt);
  const alreadyAwarded = !!ledger.friendshipCreatedAtByPairKey[pairKey];

  ensureFriendPlayer(pair.leftRecord, pair.rightPlayerId);
  ensureFriendPlayer(pair.rightRecord, pair.leftPlayerId);

  if (!alreadyAwarded) {
    awardFriendPoints(pair.leftRecord, pair.rightPlayerId, FRIENDSHIP_CREATION_POINTS);
    awardFriendPoints(pair.rightRecord, pair.leftPlayerId, FRIENDSHIP_CREATION_POINTS);
    ledger.friendshipCreatedAtByPairKey[pairKey] = createdAt;
  }

  const saved = savePairRecords(pair.leftRecord, pair.rightRecord, storage);
  saveProfileRelationshipLedger(ledger, storage);
  return buildPairResult(saved.leftRecord, saved.rightRecord, !alreadyAwarded, alreadyAwarded ? 0 : FRIENDSHIP_CREATION_POINTS);
}

export async function removeFriendBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options?.apiClient;
  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);

  if (!pair) {
    return { removed: false, leftRecord: null, rightRecord: null };
  }

  const ledger = loadProfileRelationshipLedger(storage);
  const pairKey = buildRelationshipPairKey(pair.leftPlayerId, pair.rightPlayerId);

  if (typeof apiClient?.removeFriend === "function") {
    const removed = await apiClient.removeFriend(pair.leftPlayerId, pair.rightPlayerId).catch(() => null);
    if (!removed) {
      return { removed: false, leftRecord: pair.leftRecord, rightRecord: pair.rightRecord };
    }
    applyRemoveFriendLocalMutations(pair);
    delete ledger.friendshipCreatedAtByPairKey[pairKey];
    const saved = savePairRecords(pair.leftRecord, pair.rightRecord, storage);
    saveProfileRelationshipLedger(ledger, storage);
    return { removed: true, leftRecord: saved.leftRecord, rightRecord: saved.rightRecord };
  }

  applyRemoveFriendLocalMutations(pair);
  delete ledger.friendshipCreatedAtByPairKey[pairKey];
  const saved = savePairRecords(pair.leftRecord, pair.rightRecord, storage);
  saveProfileRelationshipLedger(ledger, storage);
  return { removed: true, leftRecord: saved.leftRecord, rightRecord: saved.rightRecord };
}

export async function recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options?.apiClient;

  if (typeof apiClient?.recordSharedSessionBetweenPlayers === "function") {
    const result = await apiClient.recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, {
      sessionId: options.sessionId,
      gameSlug: options.gameSlug,
      startedTogether: options.startedTogether,
      reachedResults: options.reachedResults,
      occurredAt: options.occurredAt,
    }).catch(() => null);
    if (!result) {
      return buildEmptyPairResult();
    }
    if (result.leftRecord?.playerId) saveProfileRelationshipsRecord(result.leftRecord, storage);
    if (result.rightRecord?.playerId) saveProfileRelationshipsRecord(result.rightRecord, storage);
    return result;
  }

  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);
  if (!pair) {
    return buildEmptyPairResult();
  }

  const sessionId = sanitizeSingleLine(options.sessionId, 120);
  const gameSlug = sanitizeGameSlug(options.gameSlug);
  const startedTogether = !!options.startedTogether;
  const reachedResults = !!options.reachedResults;
  const occurredAt = createTimestamp(options.occurredAt);

  if (!sessionId || !startedTogether || !reachedResults) {
    return buildPairResult(pair.leftRecord, pair.rightRecord, false, 0);
  }

  const ledger = loadProfileRelationshipLedger(storage);
  const pairKey = buildRelationshipPairKey(pair.leftPlayerId, pair.rightPlayerId);
  const pairSessionKey = `${pairKey}::${sessionId}`;
  const alreadyAwarded = !!ledger.sharedSessionAtByPairSessionKey[pairSessionKey];

  pair.leftRecord.lastPlayedWithPlayerId = pair.rightPlayerId;
  pair.rightRecord.lastPlayedWithPlayerId = pair.leftPlayerId;
  pushRecentlyPlayedWith(pair.leftRecord, pair.rightPlayerId);
  pushRecentlyPlayedWith(pair.rightRecord, pair.leftPlayerId);
  setRecordMapTimestamp(pair.leftRecord, "lastSharedSessionAtByPlayerId", pair.rightPlayerId, occurredAt);
  setRecordMapTimestamp(pair.rightRecord, "lastSharedSessionAtByPlayerId", pair.leftPlayerId, occurredAt);

  if (!alreadyAwarded) {
    incrementRecordMapCount(pair.leftRecord, "sharedSessionCountByPlayerId", pair.rightPlayerId, 1);
    incrementRecordMapCount(pair.rightRecord, "sharedSessionCountByPlayerId", pair.leftPlayerId, 1);
    awardFriendPoints(pair.leftRecord, pair.rightPlayerId, SHARED_SESSION_POINTS);
    awardFriendPoints(pair.rightRecord, pair.leftPlayerId, SHARED_SESSION_POINTS);
    ledger.sharedSessionAtByPairSessionKey[pairSessionKey] = occurredAt;

    if (gameSlug) {
      const pairGameKey = `${pairKey}::${gameSlug}`;
      if (!ledger.sharedGameAtByPairGameKey[pairGameKey]) {
        incrementRecordMapCount(pair.leftRecord, "sharedGameCountByPlayerId", pair.rightPlayerId, 1);
        incrementRecordMapCount(pair.rightRecord, "sharedGameCountByPlayerId", pair.leftPlayerId, 1);
        ledger.sharedGameAtByPairGameKey[pairGameKey] = occurredAt;
      }
    }
  }

  pair.leftRecord.mostPlayedWithPlayerId = deriveMostPlayedWithPlayerId(pair.leftRecord);
  pair.rightRecord.mostPlayedWithPlayerId = deriveMostPlayedWithPlayerId(pair.rightRecord);
  reorderFriendPlayerIds(pair.leftRecord);
  reorderFriendPlayerIds(pair.rightRecord);

  const saved = savePairRecords(pair.leftRecord, pair.rightRecord, storage);
  saveProfileRelationshipLedger(ledger, storage);
  return buildPairResult(saved.leftRecord, saved.rightRecord, !alreadyAwarded, alreadyAwarded ? 0 : SHARED_SESSION_POINTS);
}

export async function recordSharedEventBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options?.apiClient;

  if (typeof apiClient?.recordSharedEventBetweenPlayers === "function") {
    const result = await apiClient.recordSharedEventBetweenPlayers(leftPlayerId, rightPlayerId, {
      eventId: options.eventId,
      isLinkedEntry: options.isLinkedEntry,
      occurredAt: options.occurredAt,
    }).catch(() => null);
    if (result) {
      if (result.leftRecord?.playerId) saveProfileRelationshipsRecord(result.leftRecord, storage);
      if (result.rightRecord?.playerId) saveProfileRelationshipsRecord(result.rightRecord, storage);
      return result;
    }
  }

  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);
  if (!pair) {
    return buildEmptyPairResult();
  }

  const eventId = sanitizeSingleLine(options.eventId, 120);
  const isLinkedEntry = !!options.isLinkedEntry;
  const occurredAt = createTimestamp(options.occurredAt);
  if (!eventId || !isLinkedEntry) {
    return buildPairResult(pair.leftRecord, pair.rightRecord, false, 0);
  }

  const ledger = loadProfileRelationshipLedger(storage);
  const pairKey = buildRelationshipPairKey(pair.leftPlayerId, pair.rightPlayerId);
  const pairEventKey = `${pairKey}::${eventId}`;
  const alreadyAwarded = !!ledger.sharedEventAtByPairEventKey[pairEventKey];

  setRecordMapTimestamp(pair.leftRecord, "lastSharedEventAtByPlayerId", pair.rightPlayerId, occurredAt);
  setRecordMapTimestamp(pair.rightRecord, "lastSharedEventAtByPlayerId", pair.leftPlayerId, occurredAt);

  if (!alreadyAwarded) {
    incrementRecordMapCount(pair.leftRecord, "sharedEventCountByPlayerId", pair.rightPlayerId, 1);
    incrementRecordMapCount(pair.rightRecord, "sharedEventCountByPlayerId", pair.leftPlayerId, 1);
    awardFriendPoints(pair.leftRecord, pair.rightPlayerId, SHARED_EVENT_POINTS);
    awardFriendPoints(pair.rightRecord, pair.leftPlayerId, SHARED_EVENT_POINTS);
    ledger.sharedEventAtByPairEventKey[pairEventKey] = occurredAt;
  }

  reorderFriendPlayerIds(pair.leftRecord);
  reorderFriendPlayerIds(pair.rightRecord);

  const saved = savePairRecords(pair.leftRecord, pair.rightRecord, storage);
  saveProfileRelationshipLedger(ledger, storage);
  return buildPairResult(saved.leftRecord, saved.rightRecord, !alreadyAwarded, alreadyAwarded ? 0 : SHARED_EVENT_POINTS);
}

export async function recordDirectInteractionBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options?.apiClient;

  if (typeof apiClient?.recordDirectInteractionBetweenPlayers === "function") {
    const result = await apiClient.recordDirectInteractionBetweenPlayers(leftPlayerId, rightPlayerId, {
      occurredAt: options.occurredAt,
      source: options.source,
      thoughtId: options.thoughtId,
      commentId: options.commentId,
    }).catch(() => null);
    if (!result) {
      return buildEmptyPairResult();
    }
    if (result.leftRecord?.playerId) saveProfileRelationshipsRecord(result.leftRecord, storage);
    if (result.rightRecord?.playerId) saveProfileRelationshipsRecord(result.rightRecord, storage);
    return result;
  }

  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);
  if (!pair) {
    return buildEmptyPairResult();
  }

  const occurredAt = createTimestamp(options.occurredAt);
  const pairKey = buildRelationshipPairKey(pair.leftPlayerId, pair.rightPlayerId);
  const ledger = loadProfileRelationshipLedger(storage);
  const windowMs = Math.max(1, sanitizeCount(options.windowMs) || DIRECT_INTERACTION_WINDOW_MS);
  const windowLimit = Math.max(1, sanitizeCount(options.windowLimit) || DIRECT_INTERACTION_WINDOW_LIMIT);
  const bucket = Math.floor((parseTimestamp(occurredAt) || 0) / windowMs);
  const pairWindowKey = `${pairKey}::${bucket}`;
  const windowCount = sanitizeCount(ledger.directInteractionCountByPairWindowKey[pairWindowKey]);
  const canAward = windowCount < windowLimit;

  setRecordMapTimestamp(pair.leftRecord, "lastInteractionAtByPlayerId", pair.rightPlayerId, occurredAt);
  setRecordMapTimestamp(pair.rightRecord, "lastInteractionAtByPlayerId", pair.leftPlayerId, occurredAt);

  if (canAward) {
    awardFriendPoints(pair.leftRecord, pair.rightPlayerId, DIRECT_INTERACTION_POINTS);
    awardFriendPoints(pair.rightRecord, pair.leftPlayerId, DIRECT_INTERACTION_POINTS);
    ledger.directInteractionCountByPairWindowKey[pairWindowKey] = windowCount + 1;
  }

  reorderFriendPlayerIds(pair.leftRecord);
  reorderFriendPlayerIds(pair.rightRecord);

  const saved = savePairRecords(pair.leftRecord, pair.rightRecord, storage);
  saveProfileRelationshipLedger(ledger, storage);
  return buildPairResult(saved.leftRecord, saved.rightRecord, canAward, canAward ? DIRECT_INTERACTION_POINTS : 0);
}
