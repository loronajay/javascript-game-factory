import {
  getDefaultPlatformStorage,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import type { StorageLike } from "../storage/storage.mjs";
import {
  ACTIVITY_FEED_LIMIT,
  ACTIVITY_FEED_STORAGE_KEY,
} from "./activity-schema.mjs";
import { normalizeActivityItem } from "./activity-normalize.mjs";
import type { ActivityItem } from "./activity-normalize.mjs";

type MaybeStorage = StorageLike | null;

function parseStoredFeed(raw: string | null): unknown[] {
  if (typeof raw !== "string" || raw.length === 0) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compareActivityDesc(left: ActivityItem, right: ActivityItem): number {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.summary.localeCompare(right.summary);
}

export function parseNormalizedStoredFeed(storage: MaybeStorage = getDefaultPlatformStorage()): ActivityItem[] {
  return parseStoredFeed(readStorageText(storage, ACTIVITY_FEED_STORAGE_KEY))
    .map((entry, index) => normalizeActivityItem(entry, index));
}

export function writeActivityFeed(storage: MaybeStorage, activityFeed: unknown[] = []): ActivityItem[] {
  const normalized = Array.isArray(activityFeed)
    ? activityFeed.map((entry, index) => normalizeActivityItem(entry, index))
    : [];
  writeStorageText(storage, ACTIVITY_FEED_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadActivityFeed(storage: MaybeStorage = getDefaultPlatformStorage()): ActivityItem[] {
  return parseNormalizedStoredFeed(storage).sort(compareActivityDesc);
}

export function upsertActivityFeedItem(storage: MaybeStorage, item: unknown): ActivityItem {
  const normalized = normalizeActivityItem(item);
  const current = loadActivityFeed(storage).filter((entry) => entry.id !== normalized.id);
  writeActivityFeed(storage, [normalized, ...current].slice(0, ACTIVITY_FEED_LIMIT));
  return normalized;
}

export {
  ACTIVITY_FEED_LIMIT,
  ACTIVITY_FEED_STORAGE_KEY,
} from "./activity-schema.mjs";
