import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import { createPlatformApiClient } from "../api/platform-api.mjs";

export const PROFILE_RELATIONSHIPS_STORAGE_KEY = getPlatformStorageKey("profileRelationships");
export const PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY = getPlatformStorageKey("profileRelationshipLedger");
export const FRIENDSHIP_CREATION_POINTS = 100;
export const SHARED_SESSION_POINTS = 10;
export const SHARED_EVENT_POINTS = 50;
export const DIRECT_INTERACTION_POINTS = 1;
export const DIRECT_INTERACTION_WINDOW_MS = 10 * 60 * 1000;
export const DIRECT_INTERACTION_WINDOW_LIMIT = 5;
const RELATIONSHIP_SLOT_MODES = new Set(["manual", "auto"]);
const FRIEND_RAIL_SLOT_COUNT = 4;
const RECENTLY_PLAYED_WITH_LIMIT = 8;

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

function sanitizeDisplayName(value) {
  return sanitizeSingleLine(value, 60);
}

function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

function sanitizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return sanitizeSingleLine(value, 80);
}

function sanitizeGameSlug(value) {
  return sanitizeSingleLine(value, 80);
}

function normalizeRelationshipMode(value, fallback = "manual") {
  const normalized = sanitizeSingleLine(value, 24).toLowerCase();
  return RELATIONSHIP_SLOT_MODES.has(normalized) ? normalized : fallback;
}

function normalizePlayerIdList(value) {
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

function normalizeStringMap(value) {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized, [key, entry]) => {
    const normalizedKey = sanitizeSingleLine(key, 160);
    const normalizedValue = sanitizeTimestamp(entry);
    if (!normalizedKey || !normalizedValue) return normalized;
    normalized[normalizedKey] = normalizedValue;
    return normalized;
  }, {});
}

function normalizeCountMap(value) {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized, [key, entry]) => {
    const normalizedKey = sanitizeSingleLine(key, 160);
    const normalizedValue = sanitizeCount(entry);
    if (!normalizedKey || normalizedValue <= 0) return normalized;
    normalized[normalizedKey] = normalizedValue;
    return normalized;
  }, {});
}

function parseStoredRelationshipsMap(raw) {
  if (typeof raw !== "string" || raw.length === 0) return {};

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildDefaultProfileRelationshipLedger() {
  return {
    friendshipCreatedAtByPairKey: {},
    sharedSessionAtByPairSessionKey: {},
    sharedEventAtByPairEventKey: {},
    sharedGameAtByPairGameKey: {},
    directInteractionCountByPairWindowKey: {},
  };
}

function normalizeProfileRelationshipLedger(ledger = {}) {
  const source = isPlainObject(ledger) ? ledger : {};
  const defaults = buildDefaultProfileRelationshipLedger();

  return {
    ...defaults,
    friendshipCreatedAtByPairKey: normalizeStringMap(source.friendshipCreatedAtByPairKey),
    sharedSessionAtByPairSessionKey: normalizeStringMap(source.sharedSessionAtByPairSessionKey),
    sharedEventAtByPairEventKey: normalizeStringMap(source.sharedEventAtByPairEventKey),
    sharedGameAtByPairGameKey: normalizeStringMap(source.sharedGameAtByPairGameKey),
    directInteractionCountByPairWindowKey: normalizeCountMap(source.directInteractionCountByPairWindowKey),
  };
}

function loadProfileRelationshipLedger(storage = getDefaultPlatformStorage()) {
  return normalizeProfileRelationshipLedger(parseStoredRelationshipsMap(
    readStorageText(storage, PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY),
  ));
}

function saveProfileRelationshipLedger(ledger, storage = getDefaultPlatformStorage()) {
  const normalized = normalizeProfileRelationshipLedger(ledger);
  writeStorageText(storage, PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
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

function normalizeFriendCandidate(entry = {}, originalIndex = 0, isMainSqueeze = false) {
  const source = isPlainObject(entry) ? entry : {};
  const playerId = sanitizePlayerId(source.playerId);
  const profileName = sanitizeDisplayName(source.profileName || source.displayName);

  if (!playerId && !profileName) return null;

  return {
    playerId,
    profileName: profileName || "Arcade Pilot",
    presence: sanitizeSingleLine(source.presence, 24).toLowerCase(),
    friendPoints: sanitizeCount(source.friendPoints),
    isMainSqueeze: !!isMainSqueeze || !!source.isMainSqueeze,
    originalIndex,
    avatarUrl: sanitizeSingleLine(source.avatarUrl || "", 500),
  };
}

function buildFriendCandidateState(profileView = {}) {
  const candidatesByKey = new Map();
  const candidatesByPlayerId = new Map();
  let insertionIndex = 0;

  function upsertCandidate(entry, isMainSqueeze = false) {
    const candidate = normalizeFriendCandidate(entry, insertionIndex, isMainSqueeze);
    if (!candidate) return;

    const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
    const existing = candidatesByKey.get(key);
    if (existing) {
      existing.isMainSqueeze = existing.isMainSqueeze || candidate.isMainSqueeze;
      existing.friendPoints = Math.max(existing.friendPoints, candidate.friendPoints);
      if (!existing.profileName && candidate.profileName) {
        existing.profileName = candidate.profileName;
      }
      if (!existing.presence && candidate.presence) {
        existing.presence = candidate.presence;
      }
      return;
    }

    candidatesByKey.set(key, candidate);
    if (candidate.playerId) {
      candidatesByPlayerId.set(candidate.playerId, candidate);
    }
    insertionIndex++;
  }

  upsertCandidate(profileView?.mainSqueeze, true);

  if (Array.isArray(profileView?.friendsPreview)) {
    profileView.friendsPreview.forEach((entry) => {
      upsertCandidate(entry, false);
    });
  }

  return {
    candidates: Array.from(candidatesByKey.values()),
    candidatesByPlayerId,
    preferredMainSqueezePlayerId: sanitizePlayerId(profileView?.mainSqueeze?.playerId),
  };
}

function getRelationshipOrderIndex(candidate, relationshipOrder = []) {
  if (!candidate?.playerId) return -1;
  return relationshipOrder.indexOf(candidate.playerId);
}

function buildResolvedFriendCandidate(candidate, relationshipPoints) {
  if (!candidate) return null;

  return {
    ...candidate,
    resolvedFriendPoints: candidate.playerId
      ? (relationshipPoints[candidate.playerId] ?? candidate.friendPoints)
      : candidate.friendPoints,
  };
}

function sortAutomaticFriendCandidates(candidates, normalizedRelationships) {
  const relationshipOrder = normalizedRelationships.friendPlayerIds;
  const relationshipPoints = normalizedRelationships.friendPointsByPlayerId;

  return [...candidates].sort((left, right) => {
    const leftRelationshipIndex = getRelationshipOrderIndex(left, relationshipOrder);
    const rightRelationshipIndex = getRelationshipOrderIndex(right, relationshipOrder);
    const leftHasRelationshipOrder = leftRelationshipIndex >= 0;
    const rightHasRelationshipOrder = rightRelationshipIndex >= 0;

    if (leftHasRelationshipOrder !== rightHasRelationshipOrder) {
      return leftHasRelationshipOrder ? -1 : 1;
    }
    if (leftHasRelationshipOrder && rightHasRelationshipOrder && leftRelationshipIndex !== rightRelationshipIndex) {
      return leftRelationshipIndex - rightRelationshipIndex;
    }

    const leftPoints = left.playerId ? (relationshipPoints[left.playerId] ?? left.friendPoints) : left.friendPoints;
    const rightPoints = right.playerId ? (relationshipPoints[right.playerId] ?? right.friendPoints) : right.friendPoints;
    if (leftPoints !== rightPoints) {
      return rightPoints - leftPoints;
    }
    if (left.originalIndex !== right.originalIndex) {
      return left.originalIndex - right.originalIndex;
    }
    return left.profileName.localeCompare(right.profileName);
  });
}

function takeFriendCandidateByPlayerId(candidatesByPlayerId, usedKeys, playerId, relationshipPoints) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const candidate = candidatesByPlayerId.get(normalizedPlayerId);
  if (!candidate) return null;

  const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
  if (usedKeys.has(key)) return null;

  usedKeys.add(key);
  return buildResolvedFriendCandidate(candidate, relationshipPoints);
}

function takeAutomaticFriendCandidate(candidates, usedKeys, relationshipPoints) {
  for (const candidate of candidates) {
    const key = candidate.playerId || `name:${candidate.profileName.toLowerCase()}`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    return buildResolvedFriendCandidate(candidate, relationshipPoints);
  }

  return null;
}

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
  ].slice(0, RECENTLY_PLAYED_WITH_LIMIT);
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

function mirrorPairRecordsToApi(leftRecord, rightRecord, options = {}) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  if (typeof apiClient?.savePlayerRelationships !== "function") {
    return null;
  }

  return Promise.resolve().then(() => Promise.allSettled([
    leftRecord?.playerId ? apiClient.savePlayerRelationships(leftRecord.playerId, leftRecord) : null,
    rightRecord?.playerId ? apiClient.savePlayerRelationships(rightRecord.playerId, rightRecord) : null,
  ]));
}

export function resolveProfileFriendSlots(profileView = {}, relationshipsRecord = {}) {
  const normalizedRelationships = normalizeProfileRelationshipsRecord({
    playerId: profileView?.playerId || relationshipsRecord?.playerId || "",
    ...relationshipsRecord,
  });
  const relationshipPoints = normalizedRelationships.friendPointsByPlayerId;
  const { candidates, candidatesByPlayerId, preferredMainSqueezePlayerId } = buildFriendCandidateState(profileView);
  const automaticCandidates = sortAutomaticFriendCandidates(candidates, normalizedRelationships);
  const usedKeys = new Set();

  let mainSqueeze = null;
  const hasManualMainSqueezeSelection = !!normalizedRelationships.mainSqueezePlayerId;
  if (normalizedRelationships.mainSqueezeMode === "manual" && hasManualMainSqueezeSelection) {
    mainSqueeze = takeFriendCandidateByPlayerId(
      candidatesByPlayerId,
      usedKeys,
      normalizedRelationships.mainSqueezePlayerId,
      relationshipPoints,
    );
  } else {
    mainSqueeze = takeFriendCandidateByPlayerId(
      candidatesByPlayerId,
      usedKeys,
      preferredMainSqueezePlayerId || normalizedRelationships.mostPlayedWithPlayerId || normalizedRelationships.lastPlayedWithPlayerId,
      relationshipPoints,
    ) || takeAutomaticFriendCandidate(automaticCandidates, usedKeys, relationshipPoints);
  }

  const friendSlots = [];
  if (normalizedRelationships.friendRailMode === "manual") {
    normalizedRelationships.manualFriendSlotPlayerIds.forEach((playerId) => {
      friendSlots.push(takeFriendCandidateByPlayerId(candidatesByPlayerId, usedKeys, playerId, relationshipPoints));
    });
  } else {
    while (friendSlots.length < FRIEND_RAIL_SLOT_COUNT) {
      friendSlots.push(takeAutomaticFriendCandidate(automaticCandidates, usedKeys, relationshipPoints));
    }
  }

  while (friendSlots.length < FRIEND_RAIL_SLOT_COUNT) {
    friendSlots.push(null);
  }

  return {
    mainSqueeze,
    friendSlots,
  };
}

export function createFriendshipBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);
  if (!pair) {
    return buildPairResult(
      buildDefaultProfileRelationshipsRecord(""),
      buildDefaultProfileRelationshipsRecord(""),
      false,
      0,
    );
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
  void mirrorPairRecordsToApi(saved.leftRecord, saved.rightRecord, options);

  return buildPairResult(saved.leftRecord, saved.rightRecord, !alreadyAwarded, alreadyAwarded ? 0 : FRIENDSHIP_CREATION_POINTS);
}

export function recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);
  if (!pair) {
    return buildPairResult(
      buildDefaultProfileRelationshipsRecord(""),
      buildDefaultProfileRelationshipsRecord(""),
      false,
      0,
    );
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
  void mirrorPairRecordsToApi(saved.leftRecord, saved.rightRecord, options);
  return buildPairResult(saved.leftRecord, saved.rightRecord, !alreadyAwarded, alreadyAwarded ? 0 : SHARED_SESSION_POINTS);
}

export function recordSharedEventBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);
  if (!pair) {
    return buildPairResult(
      buildDefaultProfileRelationshipsRecord(""),
      buildDefaultProfileRelationshipsRecord(""),
      false,
      0,
    );
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
  void mirrorPairRecordsToApi(saved.leftRecord, saved.rightRecord, options);
  return buildPairResult(saved.leftRecord, saved.rightRecord, !alreadyAwarded, alreadyAwarded ? 0 : SHARED_EVENT_POINTS);
}

export function recordDirectInteractionBetweenPlayers(leftPlayerId, rightPlayerId, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const pair = loadPairRecords(leftPlayerId, rightPlayerId, storage);
  if (!pair) {
    return buildPairResult(
      buildDefaultProfileRelationshipsRecord(""),
      buildDefaultProfileRelationshipsRecord(""),
      false,
      0,
    );
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
  void mirrorPairRecordsToApi(saved.leftRecord, saved.rightRecord, options);
  return buildPairResult(saved.leftRecord, saved.rightRecord, canAward, canAward ? DIRECT_INTERACTION_POINTS : 0);
}

export function loadProfileRelationshipsRecord(playerId, storage = getDefaultPlatformStorage()) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  const storedMap = parseStoredRelationshipsMap(readStorageText(storage, PROFILE_RELATIONSHIPS_STORAGE_KEY));
  const storedRecord = normalizedPlayerId ? storedMap[normalizedPlayerId] : null;

  if (!normalizedPlayerId) {
    return buildDefaultProfileRelationshipsRecord("");
  }

  return normalizeProfileRelationshipsRecord({
    ...(isPlainObject(storedRecord) ? storedRecord : {}),
    playerId: normalizedPlayerId,
  });
}

export function saveProfileRelationshipsRecord(record, storage = getDefaultPlatformStorage()) {
  const normalized = normalizeProfileRelationshipsRecord(record);
  if (!normalized.playerId) return null;

  const storedMap = parseStoredRelationshipsMap(readStorageText(storage, PROFILE_RELATIONSHIPS_STORAGE_KEY));
  storedMap[normalized.playerId] = normalized;
  writeStorageText(storage, PROFILE_RELATIONSHIPS_STORAGE_KEY, JSON.stringify(storedMap));

  return normalized;
}
