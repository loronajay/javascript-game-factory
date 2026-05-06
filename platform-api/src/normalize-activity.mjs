import {
  isPlainObject,
  normalizeTimestampField,
  sanitizeSingleLine,
  sanitizeTextBlock,
} from "./normalize-shared.mjs";

export const ACTIVITY_FEED_LIMIT = 40;

const ACTIVITY_TYPES = new Set(["game-result"]);
const ACTIVITY_VISIBILITIES = new Set(["public", "friends", "private"]);

function createFallbackActivityId() {
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
    createdAt: normalizeTimestampField(item?.createdAt) || new Date().toISOString(),
    metadata: sanitizeMetadataValue(item?.metadata) || {},
  };
}
