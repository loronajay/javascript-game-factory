import { getDefaultPlatformStorage, readStorageText, writeStorageText, } from "../storage/storage.mjs";
import { ACTIVITY_FEED_LIMIT, ACTIVITY_FEED_STORAGE_KEY, } from "./activity-schema.mjs";
import { normalizeActivityItem } from "./activity-normalize.mjs";
function parseStoredFeed(raw) {
    if (typeof raw !== "string" || raw.length === 0)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function compareActivityDesc(left, right) {
    const leftTime = Date.parse(left.createdAt || "") || 0;
    const rightTime = Date.parse(right.createdAt || "") || 0;
    if (leftTime !== rightTime) {
        return rightTime - leftTime;
    }
    return left.summary.localeCompare(right.summary);
}
export function parseNormalizedStoredFeed(storage = getDefaultPlatformStorage()) {
    return parseStoredFeed(readStorageText(storage, ACTIVITY_FEED_STORAGE_KEY))
        .map((entry, index) => normalizeActivityItem(entry, index));
}
export function writeActivityFeed(storage, activityFeed = []) {
    const normalized = Array.isArray(activityFeed)
        ? activityFeed.map((entry, index) => normalizeActivityItem(entry, index))
        : [];
    writeStorageText(storage, ACTIVITY_FEED_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
}
// Like writeActivityFeed, but keeps the stored feed newest-first and inside the
// feed limit. Used when the API response replaces the cache and locally pending
// items have to be folded back in.
export function replaceActivityFeed(storage, activityFeed = []) {
    const normalized = (Array.isArray(activityFeed) ? activityFeed : [])
        .map((entry, index) => normalizeActivityItem(entry, index))
        .sort(compareActivityDesc)
        .slice(0, ACTIVITY_FEED_LIMIT);
    writeActivityFeed(storage, normalized);
    return normalized;
}
export function loadActivityFeed(storage = getDefaultPlatformStorage()) {
    return parseNormalizedStoredFeed(storage).sort(compareActivityDesc);
}
export function upsertActivityFeedItem(storage, item) {
    const normalized = normalizeActivityItem(item);
    const current = loadActivityFeed(storage).filter((entry) => entry.id !== normalized.id);
    writeActivityFeed(storage, [normalized, ...current].slice(0, ACTIVITY_FEED_LIMIT));
    return normalized;
}
export { ACTIVITY_FEED_LIMIT, ACTIVITY_FEED_STORAGE_KEY, } from "./activity-schema.mjs";
