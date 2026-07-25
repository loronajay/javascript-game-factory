import { getDefaultPlatformStorage } from "../storage/storage.mjs";
import { createPlatformApiClient } from "../api/platform-api.mjs";
import { recordSharedSessionBetweenPlayers } from "../relationships/relationships.mjs";
import { buildDerivedSessionId, normalizeActivityItem, normalizeIdentity, sanitizeSingleLine, toActivityApiPayload, } from "./activity-normalize.mjs";
import { loadActivityFeed, replaceActivityFeed, upsertActivityFeedItem, } from "./activity-store.mjs";
import { buildBattleshitsMatchActivity, buildCreatureBattlerMatchActivity, buildLoversLostRunActivity, buildSumoraiMatchActivity, buildTacticalArenaMatchActivity, } from "./activity-builders.mjs";
function queueSharedSessionRelationshipUpdate(leftPlayerId, rightPlayerId, options = {}) {
    void recordSharedSessionBetweenPlayers(leftPlayerId, rightPlayerId, options);
}
function maybeRecordSharedSessionFromActivity(activity, storage, options = {}) {
    const item = normalizeActivityItem(activity);
    if (item.type !== "game-result")
        return;
    if (item.gameSlug === "lovers-lost") {
        const boyIdentity = normalizeIdentity(item.metadata?.boyIdentity);
        const girlIdentity = normalizeIdentity(item.metadata?.girlIdentity);
        if (!boyIdentity.playerId || !girlIdentity.playerId || item.metadata?.disconnectNote)
            return;
        const sessionOptions = {
            storage,
            apiClient: options?.apiClient,
            sessionId: sanitizeSingleLine(item.metadata?.sessionId, 120) || buildDerivedSessionId(item),
            gameSlug: item.gameSlug,
            startedTogether: true,
            reachedResults: true,
            occurredAt: item.createdAt,
        };
        queueSharedSessionRelationshipUpdate(boyIdentity.playerId, girlIdentity.playerId, sessionOptions);
        return;
    }
    if (item.gameSlug === "battleshits") {
        const myProfile = normalizeIdentity(item.metadata?.myProfile);
        const opponentProfile = normalizeIdentity(item.metadata?.opponentProfile);
        const matchResult = sanitizeSingleLine(item.metadata?.matchResult, 24).toLowerCase();
        if (!myProfile.playerId || !opponentProfile.playerId || matchResult === "forfeit_win")
            return;
        const sessionOptions = {
            storage,
            apiClient: options?.apiClient,
            sessionId: sanitizeSingleLine(item.metadata?.sessionId, 120) || buildDerivedSessionId(item),
            gameSlug: item.gameSlug,
            startedTogether: true,
            reachedResults: true,
            occurredAt: item.createdAt,
        };
        queueSharedSessionRelationshipUpdate(myProfile.playerId, opponentProfile.playerId, sessionOptions);
        return;
    }
    if (item.gameSlug === "sumorai") {
        const myProfile = normalizeIdentity(item.metadata?.myProfile);
        const opponentProfile = normalizeIdentity(item.metadata?.opponentProfile);
        const matchResult = sanitizeSingleLine(item.metadata?.matchResult, 24).toLowerCase();
        if (!myProfile.playerId || !opponentProfile.playerId || matchResult === "forfeit_win")
            return;
        const sessionOptions = {
            storage,
            apiClient: options?.apiClient,
            sessionId: sanitizeSingleLine(item.metadata?.sessionId, 120) || buildDerivedSessionId(item),
            gameSlug: item.gameSlug,
            startedTogether: true,
            reachedResults: true,
            occurredAt: item.createdAt,
        };
        queueSharedSessionRelationshipUpdate(myProfile.playerId, opponentProfile.playerId, sessionOptions);
        return;
    }
    if (item.gameSlug === "tactical-arena") {
        const myProfile = normalizeIdentity(item.metadata?.myProfile);
        const opponentProfile = normalizeIdentity(item.metadata?.opponentProfile);
        if (!myProfile.playerId || !opponentProfile.playerId)
            return;
        const sessionOptions = {
            storage,
            apiClient: options?.apiClient,
            sessionId: sanitizeSingleLine(item.metadata?.sessionId, 120) || buildDerivedSessionId(item),
            gameSlug: item.gameSlug,
            startedTogether: true,
            reachedResults: true,
            occurredAt: item.createdAt,
        };
        queueSharedSessionRelationshipUpdate(myProfile.playerId, opponentProfile.playerId, sessionOptions);
    }
}
export function publishActivityItem(item, storage = getDefaultPlatformStorage(), options = {}) {
    const normalized = upsertActivityFeedItem(storage, item);
    maybeRecordSharedSessionFromActivity(normalized, storage, options);
    return normalized;
}
export function publishLoversLostRunActivity(runSummary, options = {}) {
    const storage = options.storage || getDefaultPlatformStorage();
    const item = buildLoversLostRunActivity(runSummary, options);
    return publishActivityItemWithApi(item, storage, options);
}
export function publishCreatureBattlerMatchActivity(match, options = {}) {
    const storage = options.storage || getDefaultPlatformStorage();
    const item = buildCreatureBattlerMatchActivity(match, options);
    return publishActivityItemWithApi(item, storage, options);
}
export function publishBattleshitsMatchActivity(match, options = {}) {
    const storage = options.storage || getDefaultPlatformStorage();
    const item = buildBattleshitsMatchActivity(match, options);
    return publishActivityItemWithApi(item, storage, options);
}
export function publishSumoraiMatchActivity(match, options = {}) {
    const storage = options.storage || getDefaultPlatformStorage();
    const item = buildSumoraiMatchActivity(match, options);
    return publishActivityItemWithApi(item, storage, options);
}
export function publishTacticalArenaMatchActivity(match, options = {}) {
    const storage = options.storage || getDefaultPlatformStorage();
    const item = buildTacticalArenaMatchActivity(match, options);
    return publishActivityItemWithApi(item, storage, options);
}
function countPendingItems(items) {
    return items.filter((item) => item.pendingSync).length;
}
function buildOfflineSyncResult(storage) {
    const items = loadActivityFeed(storage);
    return { items, status: "offline", pendingCount: countPendingItems(items) };
}
// Retries anything that was saved locally while the API was unreachable or the
// player was signed out. Stops at the first failure so an offline device does
// not fire one doomed request per queued item.
async function flushPendingActivityItems(storage, apiClient) {
    if (typeof apiClient?.saveActivityItem !== "function")
        return;
    const pending = loadActivityFeed(storage).filter((item) => item.pendingSync);
    for (const item of pending) {
        const remoteItem = await apiClient.saveActivityItem(toActivityApiPayload(item)).catch(() => null);
        if (!remoteItem)
            return;
        upsertActivityFeedItem(storage, normalizeActivityItem(remoteItem));
    }
}
export async function syncActivityFeed(storage = getDefaultPlatformStorage(), apiClient = createPlatformApiClient()) {
    const canLoad = apiClient && typeof apiClient.listActivityItems === "function";
    if (!canLoad) {
        return buildOfflineSyncResult(storage);
    }
    await flushPendingActivityItems(storage, apiClient);
    const remoteFeed = await apiClient.listActivityItems().catch(() => null);
    if (!Array.isArray(remoteFeed)) {
        return buildOfflineSyncResult(storage);
    }
    const remoteItems = remoteFeed.map((entry, index) => normalizeActivityItem(entry, index));
    const remoteIds = new Set(remoteItems.map((item) => item.id));
    // The API is the source of truth for everything it knows about, but items it
    // has never accepted must survive the replace instead of being wiped.
    const stillPending = loadActivityFeed(storage)
        .filter((item) => item.pendingSync && !remoteIds.has(item.id));
    const items = replaceActivityFeed(storage, [...remoteItems, ...stillPending]);
    return { items, status: "synced", pendingCount: stillPending.length };
}
export async function syncActivityFeedFromApi(storage = getDefaultPlatformStorage(), apiClient = createPlatformApiClient()) {
    const result = await syncActivityFeed(storage, apiClient);
    return result.items;
}
export async function publishActivityItemWithApi(item, storage = getDefaultPlatformStorage(), options = {}) {
    const apiClient = options?.apiClient || createPlatformApiClient(options);
    const normalized = normalizeActivityItem(item);
    if (!normalized.type)
        return null;
    if (typeof apiClient?.saveActivityItem !== "function") {
        return publishActivityItem({ ...normalized, pendingSync: true }, storage, options);
    }
    const remoteItem = await apiClient.saveActivityItem(toActivityApiPayload(normalized)).catch(() => null);
    if (!remoteItem) {
        // Signed out, offline, or the API rejected the write. Keep the result on
        // this device and flag it for retry rather than dropping it silently.
        return publishActivityItem({ ...normalized, pendingSync: true }, storage, options);
    }
    const saved = normalizeActivityItem(remoteItem);
    upsertActivityFeedItem(storage, saved);
    maybeRecordSharedSessionFromActivity(saved, storage, options);
    return saved;
}
export { parseNormalizedStoredFeed } from "./activity-store.mjs";
