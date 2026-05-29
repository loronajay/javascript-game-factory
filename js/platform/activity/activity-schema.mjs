import { getPlatformStorageKey } from "../storage/storage.mjs";
export const ACTIVITY_FEED_STORAGE_KEY = getPlatformStorageKey("activityFeed");
export const ACTIVITY_FEED_LIMIT = 40;
export const ACTIVITY_TYPE_VALUES = ["game-result"];
export const ACTIVITY_TYPES = new Set(ACTIVITY_TYPE_VALUES);
export const ACTIVITY_VISIBILITY_VALUES = ["public", "friends", "private"];
export const ACTIVITY_VISIBILITIES = new Set(ACTIVITY_VISIBILITY_VALUES);
