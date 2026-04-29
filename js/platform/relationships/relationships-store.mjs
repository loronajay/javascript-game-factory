import {
  getDefaultPlatformStorage,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import {
  PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY,
  PROFILE_RELATIONSHIPS_STORAGE_KEY,
} from "./relationships-schema.mjs";
import {
  buildDefaultProfileRelationshipsRecord,
  isPlainObject,
  normalizeProfileRelationshipsRecord,
  sanitizeCount,
  sanitizePlayerId,
  sanitizeSingleLine,
  sanitizeTimestamp,
} from "./relationships-normalize.mjs";

function parseStoredRelationshipsMap(raw) {
  if (typeof raw !== "string" || raw.length === 0) return {};

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
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

export function loadProfileRelationshipLedger(storage = getDefaultPlatformStorage()) {
  return normalizeProfileRelationshipLedger(parseStoredRelationshipsMap(
    readStorageText(storage, PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY),
  ));
}

export function saveProfileRelationshipLedger(ledger, storage = getDefaultPlatformStorage()) {
  const normalized = normalizeProfileRelationshipLedger(ledger);
  writeStorageText(storage, PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
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
