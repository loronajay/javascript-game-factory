import {
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITIES,
} from "./activity-schema.mjs";
import type { ActivityTypeValue, ActivityVisibility } from "./activity-schema.mjs";

export interface ActivityIdentity {
  playerId: string;
  displayName: string;
}

export interface ActivityItem {
  id: string;
  type: ActivityTypeValue;
  actorPlayerId: string;
  actorDisplayName: string;
  gameSlug: string;
  summary: string;
  visibility: ActivityVisibility;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeSingleLine(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeTextBlock(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export function createFallbackActivityId(): string {
  return `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStringList(value: unknown, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    const item = sanitizeSingleLine(entry, maxLength);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return null;
  if (typeof value === "string") return sanitizeSingleLine(value, 280);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return normalizeStringList(value, 120);
  if (!isPlainObject(value)) return null;

  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = sanitizeSingleLine(key, 80);
    if (!normalizedKey) continue;
    const normalizedValue = sanitizeMetadataValue(entry, depth + 1);
    if (normalizedValue == null) continue;
    next[normalizedKey] = normalizedValue;
  }
  return next;
}

export function normalizeIdentity(rawIdentity: unknown = {}): ActivityIdentity {
  const identity = rawIdentity as Record<string, unknown> | null | undefined;
  return {
    playerId: sanitizeSingleLine(identity?.playerId, 80),
    displayName: sanitizeSingleLine(identity?.displayName, 60),
  };
}

export function normalizeActivityItem(rawItem: unknown = {}, index = 0): ActivityItem {
  const item = rawItem as Record<string, any> | null | undefined;
  const id = sanitizeSingleLine(item?.id, 80) || createFallbackActivityId() || `activity-${index + 1}`;
  const type = sanitizeSingleLine(item?.type, 24).toLowerCase();
  const visibility = sanitizeSingleLine(item?.visibility, 24).toLowerCase();

  return {
    id,
    type: ACTIVITY_TYPES.has(type as ActivityTypeValue) ? (type as ActivityTypeValue) : "game-result",
    actorPlayerId: sanitizeSingleLine(item?.actorPlayerId, 80),
    actorDisplayName: sanitizeSingleLine(item?.actorDisplayName, 60),
    gameSlug: sanitizeSingleLine(item?.gameSlug, 80),
    summary: sanitizeTextBlock(item?.summary, 280),
    visibility: ACTIVITY_VISIBILITIES.has(visibility as ActivityVisibility) ? (visibility as ActivityVisibility) : "friends",
    createdAt: sanitizeSingleLine(item?.createdAt, 40) || new Date().toISOString(),
    metadata: (sanitizeMetadataValue(item?.metadata) as Record<string, unknown>) || {},
  };
}

export function buildDerivedSessionId(rawActivity: unknown): string {
  const activity = rawActivity as Record<string, any> | null | undefined;
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
