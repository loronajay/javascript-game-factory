// Where a player's arcade room lives: the Factory, with a local cache in front.
//
// THE FACTORY IS THE STORE. `localStorage` is a write-through cache and never
// the truth for a signed-in player — the same contract every other
// account-owned document on the platform follows. A room has to follow the
// player to another browser, and it has to be readable when somebody else
// visits it; a layout that only exists in one tab is a room nobody can walk
// through.
//
// It rides on `game_loadouts` under the `arcade-room` slug, validated
// server-side by `platform-api/src/services/arcade-room-loadout-catalog.mts`.
// No new table, no new route: `GET`/`PUT /games/arcade-room/garage` for the
// owner, `GET /games/arcade-room/loadout/:playerId` for a visitor.
//
// TWO MODES, DECIDED ONCE. With no `?id=` the page is the signed-in player's
// own room (or, signed out, a local-only room — a normal state, not a failure,
// and the page says so rather than pretending a save happened). With `?id=`
// naming another player, the page is a VISIT: the layout comes from the public
// read, nothing here can write, and the editor is never offered. `?id=` naming
// yourself collapses to owner mode so a shared link to your own room still
// lets you build.
//
// Everything impure is injectable — session, API client, storage — so the
// whole thing is testable under node with no browser, no network, no account.
//
// THE STORE IS GENERIC OVER THE DOCUMENT (2026-09-20). The farm (`/farm/`)
// keeps its layout the same way under the `farm` slug, so the owner/visitor
// decision, the cache-in-front contract and the save target live once in
// `createLayoutStore(spec, options)` and a surface passes a `LayoutDocumentSpec`
// — its slug, cache key, normalizer and starter document. `createRoomLayoutStore`
// is that call with the room's spec plus the one room-specific read
// (`loadSelfAvatarId`), and its behaviour did not change.
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "./platform/api/factory-account-gate.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { ROOM_LAYOUT_STORAGE_KEY, createDefaultRoomLayout, normalizeRoomLayout, } from "./arcade-room-layout.mjs";
export const ARCADE_ROOM_GAME_SLUG = "arcade-room";
function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}
/**
 * The cache key. KEYED BY PLAYER ID: a shared browser must never show one
 * account the previous account's room. The signed-out room is its own bucket.
 */
export function roomCacheKey(playerId) {
    return `${ROOM_LAYOUT_STORAGE_KEY}:${cleanText(playerId) || "guest"}`;
}
function readCache(spec, storage, playerId) {
    try {
        const raw = storage?.getItem(spec.cacheKey(playerId)) ?? null;
        return raw ? spec.normalize(JSON.parse(raw)) : null;
    }
    catch {
        return null;
    }
}
function writeCache(spec, storage, playerId, layout) {
    try {
        storage?.setItem(spec.cacheKey(playerId), JSON.stringify(layout));
        return true;
    }
    catch {
        return false;
    }
}
/** The arcade room's document: the spec `createRoomLayoutStore` uses. */
export const ROOM_LAYOUT_SPEC = Object.freeze({
    slug: ARCADE_ROOM_GAME_SLUG,
    cacheKey: roomCacheKey,
    normalize: normalizeRoomLayout,
    createDefault: createDefaultRoomLayout,
});
function defaultStorage() {
    try {
        return globalThis.localStorage ?? null;
    }
    catch {
        return null;
    }
}
export function createLayoutStore(spec, options = {}) {
    const session = options.session ?? readFactoryAccountSession();
    const storage = options.storage === undefined ? defaultStorage() : options.storage;
    const signedIn = Boolean(session?.authenticated);
    const selfId = signedIn
        ? cleanText(session?.playerId) || cleanText(options.selfPlayerId ?? loadFactoryProfile().playerId)
        : "";
    const requested = cleanText(options.visitPlayerId);
    // A visit to your own id is just your room.
    const visiting = Boolean(requested) && requested !== selfId;
    const api = options.api === undefined
        ? (signedIn || visiting ? createPlatformApiClient() : null)
        : options.api;
    const configured = Boolean(api) && api?.isConfigured !== false;
    const accountBacked = !visiting && signedIn && configured;
    const ownerPlayerId = visiting ? requested : selfId;
    async function loadVisit() {
        const [loadout, profile] = await Promise.all([
            configured ? api.fetchGamePublicLoadout(spec.slug, requested).catch(() => null) : Promise.resolve(null),
            configured ? api.loadPlayerProfile(requested).catch(() => null) : Promise.resolve(null),
        ]);
        const ownerName = cleanText(profile?.profileName);
        // A visitor is never shown the local cache: it is this browser's room, not theirs.
        return loadout?.layout
            ? { layout: spec.normalize(loadout.layout), source: "account", ownerName }
            : { layout: spec.createDefault(), source: "starter", ownerName };
    }
    async function loadOwn() {
        if (accountBacked) {
            const garage = await api.fetchGameGarage(spec.slug).catch(() => null);
            if (garage?.garage) {
                const layout = spec.normalize(garage.garage);
                // Refresh the cache so the next boot on a flaky connection still shows the real room.
                writeCache(spec, storage, selfId, layout);
                return { layout, source: "account", ownerName: "" };
            }
            // The account read failed: fall through to the cache rather than showing the starter
            // room over a layout the player has already built and saved.
        }
        const cached = readCache(spec, storage, selfId);
        return cached
            ? { layout: cached, source: "device", ownerName: "" }
            : { layout: spec.createDefault(), source: "starter", ownerName: "" };
    }
    async function save(layout) {
        if (visiting)
            return { ok: false, target: "device", error: "read_only" };
        // The cache is written first, synchronously: the layout is the player's the moment they press save.
        const cached = writeCache(spec, storage, selfId, layout);
        if (!accountBacked) {
            return cached
                ? { ok: true, target: "device", error: "" }
                : { ok: false, target: "device", error: "device_storage_failed" };
        }
        const result = await api.saveGameGarage(spec.slug, layout).catch(() => null);
        if (!result?.ok)
            return { ok: false, target: "account", error: cleanText(result?.error) || "save_failed" };
        return { ok: true, target: "account", error: "" };
    }
    async function uploadPicture(file) {
        const failed = (error) => ({ ok: false, url: "", width: 0, height: 0, error });
        if (!accountBacked || typeof api?.uploadRoomPoster !== "function")
            return failed("sign_in_required");
        const result = await api.uploadRoomPoster(file).catch(() => null);
        if (!result || typeof result.url !== "string" || !result.url)
            return failed(cleanText(result?.uploadError) || "upload_failed");
        return {
            ok: true,
            url: result.url,
            width: Number.isFinite(result.width) ? Number(result.width) : 0,
            height: Number.isFinite(result.height) ? Number(result.height) : 0,
            error: "",
        };
    }
    return Object.freeze({
        mode: visiting ? "visitor" : "owner",
        accountBacked,
        ownerPlayerId,
        load: visiting ? loadVisit : loadOwn,
        save,
        uploadPicture,
    });
}
export function createRoomLayoutStore(options = {}) {
    const store = createLayoutStore(ROOM_LAYOUT_SPEC, options);
    // Mirrors the decision the generic store made, for the one read that needs the account
    // even on a visit: a guest's own body is in THEIR room's document, not the one on show.
    const session = options.session ?? readFactoryAccountSession();
    const storage = options.storage === undefined ? defaultStorage() : options.storage;
    const signedIn = Boolean(session?.authenticated);
    const selfId = signedIn
        ? cleanText(session?.playerId) || cleanText(options.selfPlayerId ?? loadFactoryProfile().playerId)
        : "";
    const api = options.api === undefined
        ? (signedIn ? createPlatformApiClient() : null)
        : options.api;
    const configured = Boolean(api) && api?.isConfigured !== false;
    async function loadSelfAvatarId() {
        if (signedIn && configured) {
            const garage = await api.fetchGameGarage(ARCADE_ROOM_GAME_SLUG).catch(() => null);
            if (garage?.garage)
                return normalizeRoomLayout(garage.garage).avatarId;
        }
        return readCache(ROOM_LAYOUT_SPEC, storage, selfId)?.avatarId ?? createDefaultRoomLayout().avatarId;
    }
    return Object.freeze({ ...store, loadSelfAvatarId });
}
