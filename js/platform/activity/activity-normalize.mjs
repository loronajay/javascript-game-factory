import {
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITIES,
} from "./activity-schema.mjs";

export function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export function createFallbackActivityId() {
  return `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStringList(value, maxLength = 120) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    const item = sanitizeSingleLine(entry, maxLength);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 3) return null;
  if (typeof value === "string") return sanitizeSingleLine(value, 280);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return normalizeStringList(value, 120);
  if (!isPlainObject(value)) return null;

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = sanitizeSingleLine(key, 80);
    if (!normalizedKey) continue;
    const normalizedValue = sanitizeMetadataValue(entry, depth + 1);
    if (normalizedValue == null) continue;
    next[normalizedKey] = normalizedValue;
  }
  return next;
}

export function normalizeIdentity(identity = {}) {
  return {
    playerId: sanitizeSingleLine(identity?.playerId, 80),
    displayName: sanitizeSingleLine(identity?.displayName, 60),
  };
}

export function normalizeActivityItem(item = {}, index = 0) {
  const id = sanitizeSingleLine(item?.id, 80) || createFallbackActivityId() || `activity-${index + 1}`;
  const type = sanitizeSingleLine(item?.type, 24).toLowerCase();
  const visibility = sanitizeSingleLine(item?.visibility, 24).toLowerCase();

  return {
    id,
    type: ACTIVITY_TYPES.has(type) ? type : "game-result",
    actorPlayerId: sanitizeSingleLine(item?.actorPlayerId, 80),
    actorDisplayName: sanitizeSingleLine(item?.actorDisplayName, 60),
    gameSlug: sanitizeSingleLine(item?.gameSlug, 80),
    summary: sanitizeTextBlock(item?.summary, 280),
    visibility: ACTIVITY_VISIBILITIES.has(visibility) ? visibility : "friends",
    createdAt: sanitizeSingleLine(item?.createdAt, 40) || new Date().toISOString(),
    metadata: sanitizeMetadataValue(item?.metadata) || {},
  };
}

export function buildDerivedSessionId(activity) {
  const gameSlug = sanitizeSingleLine(activity?.gameSlug, 80);
  const createdAt = sanitizeSingleLine(activity?.createdAt, 40);
  const leftPlayerId = sanitizeSingleLine(activity?.actorPlayerId, 80);
  const opponentProfile = normalizeIdentity(activity?.metadata?.opponentProfile);
  const boyIdentity = normalizeIdentity(activity?.metadata?.boyIdentity);
  const girlIdentity = normalizeIdentity(activity?.metadata?.girlIdentity);
  const rightPlayerId = opponentProfile.playerId || girlIdentity.playerId || boyIdentity.playerId;
  if (!gameSlug || !createdAt || !leftPlayerId || !rightPlayerId) return "";
  return `${gameSlug}:${leftPlayerId}:${rightPlayerId}:${createdAt}`;
}
