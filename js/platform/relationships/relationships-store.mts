import {
  getDefaultPlatformStorage,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import type { StorageLike } from "../storage/storage.mjs";
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
import type { ProfileRelationshipsRecord } from "./relationships-normalize.mjs";

type MaybeStorage = StorageLike | null;

export interface ProfileRelationshipLedger {
  friendshipCreatedAtByPairKey: Record<string, string>;
  sharedSessionAtByPairSessionKey: Record<string, string>;
  sharedEventAtByPairEventKey: Record<string, string>;
  sharedGameAtByPairGameKey: Record<string, string>;
  directInteractionCountByPairWindowKey: Record<string, number>;
}

function parseStoredRelationshipsMap(raw: string | null): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0) return {};

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized: Record<string, string>, [key, entry]) => {
    const normalizedKey = sanitizeSingleLine(key, 160);
    const normalizedValue = sanitizeTimestamp(entry);
    if (!normalizedKey || !normalizedValue) return normalized;
    normalized[normalizedKey] = normalizedValue;
    return normalized;
  }, {});
}

function normalizeCountMap(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized: Record<string, number>, [key, entry]) => {
    const normalizedKey = sanitizeSingleLine(key, 160);
    const normalizedValue = sanitizeCount(entry);
    if (!normalizedKey || normalizedValue <= 0) return normalized;
    normalized[normalizedKey] = normalizedValue;
    return normalized;
  }, {});
}

function buildDefaultProfileRelationshipLedger(): ProfileRelationshipLedger {
  return {
    friendshipCreatedAtByPairKey: {},
    sharedSessionAtByPairSessionKey: {},
    sharedEventAtByPairEventKey: {},
    sharedGameAtByPairGameKey: {},
    directInteractionCountByPairWindowKey: {},
  };
}

function normalizeProfileRelationshipLedger(ledger: unknown = {}): ProfileRelationshipLedger {
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

export function loadProfileRelationshipLedger(storage: MaybeStorage = getDefaultPlatformStorage()): ProfileRelationshipLedger {
  return normalizeProfileRelationshipLedger(parseStoredRelationshipsMap(
    readStorageText(storage, PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY),
  ));
}

export function saveProfileRelationshipLedger(ledger: unknown, storage: MaybeStorage = getDefaultPlatformStorage()): ProfileRelationshipLedger {
  const normalized = normalizeProfileRelationshipLedger(ledger);
  writeStorageText(storage, PROFILE_RELATIONSHIP_LEDGER_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadProfileRelationshipsRecord(playerId: unknown, storage: MaybeStorage = getDefaultPlatformStorage()): ProfileRelationshipsRecord {
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

export function saveProfileRelationshipsRecord(record: unknown, storage: MaybeStorage = getDefaultPlatformStorage()): ProfileRelationshipsRecord | null {
  const normalized = normalizeProfileRelationshipsRecord(record);
  if (!normalized.playerId) return null;

  const storedMap = parseStoredRelationshipsMap(readStorageText(storage, PROFILE_RELATIONSHIPS_STORAGE_KEY));
  storedMap[normalized.playerId] = normalized;
  writeStorageText(storage, PROFILE_RELATIONSHIPS_STORAGE_KEY, JSON.stringify(storedMap));

  return normalized;
}
