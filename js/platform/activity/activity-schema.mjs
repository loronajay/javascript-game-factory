import { getPlatformStorageKey } from "../storage/storage.mjs";

export const ACTIVITY_FEED_STORAGE_KEY = getPlatformStorageKey("activityFeed");
export const ACTIVITY_FEED_LIMIT = 40;

export const ACTIVITY_TYPES = new Set([
  "game-result",
]);

export const ACTIVITY_VISIBILITIES = new Set([
  "public",
  "friends",
  "private",
]);
