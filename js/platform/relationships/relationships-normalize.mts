const RELATIONSHIP_SLOT_MODES = new Set<string>(["manual", "auto"]);
const FRIEND_RAIL_SLOT_COUNT = 4;

export type RelationshipSlotMode = "manual" | "auto";

export interface ProfileRelationshipsRecord {
  playerId: string;
  mainSqueezeMode: RelationshipSlotMode;
  mainSqueezePlayerId: string;
  friendRailMode: RelationshipSlotMode;
  manualFriendSlotPlayerIds: string[];
  mostPlayedWithPlayerId: string;
  lastPlayedWithPlayerId: string;
  recentlyPlayedWithPlayerIds: string[];
  friendPlayerIds: string[];
  friendPointsByPlayerId: Record<string, number>;
  mutualFriendCountByPlayerId: Record<string, number>;
  sharedGameCountByPlayerId: Record<string, number>;
  sharedSessionCountByPlayerId: Record<string, number>;
  sharedEventCountByPlayerId: Record<string, number>;
  lastSharedSessionAtByPlayerId: Record<string, string>;
  lastSharedEventAtByPlayerId: Record<string, string>;
  lastInteractionAtByPlayerId: Record<string, string>;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeSingleLine(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizePlayerId(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

export function sanitizeDisplayName(value: unknown): string {
  return sanitizeSingleLine(value, 60);
}

export function sanitizeCount(value: unknown): number {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

export function sanitizeTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return sanitizeSingleLine(value, 80);
}

export function sanitizeGameSlug(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

function normalizeRelationshipMode(value: unknown, fallback: RelationshipSlotMode = "manual"): RelationshipSlotMode {
  const normalized = sanitizeSingleLine(value, 24).toLowerCase();
  return RELATIONSHIP_SLOT_MODES.has(normalized) ? (normalized as RelationshipSlotMode) : fallback;
}

export function normalizePlayerIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  value.forEach((entry) => {
    const playerId = sanitizePlayerId(entry);
    if (!playerId || seen.has(playerId)) return;
    seen.add(playerId);
    normalized.push(playerId);
  });

  return normalized;
}

function normalizeManualFriendSlotPlayerIds(value: unknown): string[] {
  const source = value as Record<number, unknown> | null | undefined;
  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => sanitizePlayerId(source?.[index]));
}

function normalizePlayerCountMap(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized: Record<string, number>, [playerId, count]) => {
    const key = sanitizePlayerId(playerId);
    const amount = sanitizeCount(count);
    if (!key || amount <= 0) return normalized;
    normalized[key] = amount;
    return normalized;
  }, {});
}

function normalizePlayerTimestampMap(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};

  return Object.entries(value).reduce((normalized: Record<string, string>, [playerId, timestamp]) => {
    const key = sanitizePlayerId(playerId);
    const amount = sanitizeTimestamp(timestamp);
    if (!key || !amount) return normalized;
    normalized[key] = amount;
    return normalized;
  }, {});
}

export function buildDefaultProfileRelationshipsRecord(playerId: unknown = ""): ProfileRelationshipsRecord {
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

export function normalizeProfileRelationshipsRecord(record: unknown = {}): ProfileRelationshipsRecord {
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
