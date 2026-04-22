import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";

export const PROFILE_RELATIONSHIPS_STORAGE_KEY = getPlatformStorageKey("profileRelationships");
const RELATIONSHIP_SLOT_MODES = new Set(["manual", "auto"]);
const FRIEND_RAIL_SLOT_COUNT = 4;

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

function parseStoredRelationshipsMap(raw) {
  if (typeof raw !== "string" || raw.length === 0) return {};

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
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
