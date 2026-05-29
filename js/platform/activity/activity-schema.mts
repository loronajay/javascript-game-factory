import { getPlatformStorageKey } from "../storage/storage.mjs";

export const ACTIVITY_FEED_STORAGE_KEY = getPlatformStorageKey("activityFeed");
export const ACTIVITY_FEED_LIMIT = 40;

export const ACTIVITY_TYPE_VALUES = ["game-result"] as const;
export type ActivityTypeValue = (typeof ACTIVITY_TYPE_VALUES)[number];
export const ACTIVITY_TYPES: ReadonlySet<ActivityTypeValue> = new Set(ACTIVITY_TYPE_VALUES);

export const ACTIVITY_VISIBILITY_VALUES = ["public", "friends", "private"] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITY_VALUES)[number];
export const ACTIVITY_VISIBILITIES: ReadonlySet<ActivityVisibility> = new Set(ACTIVITY_VISIBILITY_VALUES);
