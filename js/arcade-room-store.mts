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

import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "./platform/api/factory-account-gate.mjs";
import {
  ROOM_LAYOUT_STORAGE_KEY,
  createDefaultRoomLayout,
  normalizeRoomLayout,
  parseRoomLayout,
  type RoomLayout,
} from "./arcade-room-layout.mjs";

export const ARCADE_ROOM_GAME_SLUG = "arcade-room";

export type RoomStoreMode = "owner" | "visitor";
export type RoomLayoutSource = "account" | "device" | "starter";
export type RoomSaveTarget = "account" | "device";

export type RoomStoreOptions = Readonly<{
  /** The `?id=` on the URL, or empty for "my room". */
  visitPlayerId?: string;
  session?: Readonly<{ authenticated: boolean; playerId: string }> | null;
  api?: RoomStoreApi | null;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}>;

export type RoomStoreApi = Readonly<{
  isConfigured?: boolean;
  fetchGameGarage: (slug: string) => Promise<any>;
  saveGameGarage: (slug: string, garage: unknown) => Promise<any>;
  fetchGamePublicLoadout: (slug: string, playerId: string) => Promise<any>;
  loadPlayerProfile: (playerId: string) => Promise<any>;
}>;

export type RoomLoadResult = Readonly<{
  layout: RoomLayout;
  source: RoomLayoutSource;
  /** The visited player's public name, when the page is a visit. */
  ownerName: string;
}>;

export type RoomSaveResult = Readonly<{
  ok: boolean;
  target: RoomSaveTarget;
  /** Set when the account push failed and only the device cache holds the change. */
  error: string;
}>;

export type RoomLayoutStore = Readonly<{
  mode: RoomStoreMode;
  /** True when saves reach the account, i.e. signed in AND the API is configured. */
  accountBacked: boolean;
  /** Whose room this is: the visited player, or the signed-in player, or "" signed out. */
  ownerPlayerId: string;
  load: () => Promise<RoomLoadResult>;
  save: (layout: RoomLayout) => Promise<RoomSaveResult>;
}>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The cache key. KEYED BY PLAYER ID: a shared browser must never show one
 * account the previous account's room. The signed-out room is its own bucket.
 */
export function roomCacheKey(playerId: string): string {
  return `${ROOM_LAYOUT_STORAGE_KEY}:${cleanText(playerId) || "guest"}`;
}

function readCache(storage: RoomStoreOptions["storage"], playerId: string): RoomLayout | null {
  try {
    const raw = storage?.getItem(roomCacheKey(playerId)) ?? null;
    return raw ? parseRoomLayout(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(storage: RoomStoreOptions["storage"], playerId: string, layout: RoomLayout): boolean {
  try {
    storage?.setItem(roomCacheKey(playerId), JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}

function defaultStorage(): RoomStoreOptions["storage"] {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createRoomLayoutStore(options: RoomStoreOptions = {}): RoomLayoutStore {
  const session = options.session ?? readFactoryAccountSession();
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const signedIn = Boolean(session?.authenticated);
  const selfId = signedIn ? cleanText(session?.playerId) : "";
  const requested = cleanText(options.visitPlayerId);
  // A visit to your own id is just your room.
  const visiting = Boolean(requested) && requested !== selfId;
  const api = options.api === undefined
    ? (signedIn || visiting ? createPlatformApiClient() : null)
    : options.api;
  const configured = Boolean(api) && api?.isConfigured !== false;
  const accountBacked = !visiting && signedIn && configured;
  const ownerPlayerId = visiting ? requested : selfId;

  async function loadVisit(): Promise<RoomLoadResult> {
    const [loadout, profile] = await Promise.all([
      configured ? api!.fetchGamePublicLoadout(ARCADE_ROOM_GAME_SLUG, requested).catch(() => null) : Promise.resolve(null),
      configured ? api!.loadPlayerProfile(requested).catch(() => null) : Promise.resolve(null),
    ]);
    const ownerName = cleanText(profile?.profileName);
    // A visitor is never shown the local cache: it is this browser's room, not theirs.
    return loadout?.layout
      ? { layout: normalizeRoomLayout(loadout.layout), source: "account", ownerName }
      : { layout: createDefaultRoomLayout(), source: "starter", ownerName };
  }

  async function loadOwn(): Promise<RoomLoadResult> {
    if (accountBacked) {
      const garage = await api!.fetchGameGarage(ARCADE_ROOM_GAME_SLUG).catch(() => null);
      if (garage?.garage) {
        const layout = normalizeRoomLayout(garage.garage);
        // Refresh the cache so the next boot on a flaky connection still shows the real room.
        writeCache(storage, selfId, layout);
        return { layout, source: "account", ownerName: "" };
      }
      // The account read failed: fall through to the cache rather than showing the starter
      // room over a layout the player has already built and saved.
    }
    const cached = readCache(storage, selfId);
    return cached
      ? { layout: cached, source: "device", ownerName: "" }
      : { layout: createDefaultRoomLayout(), source: "starter", ownerName: "" };
  }

  async function save(layout: RoomLayout): Promise<RoomSaveResult> {
    if (visiting) return { ok: false, target: "device", error: "read_only" };
    // The cache is written first, synchronously: the layout is the player's the moment they press save.
    const cached = writeCache(storage, selfId, layout);
    if (!accountBacked) {
      return cached
        ? { ok: true, target: "device", error: "" }
        : { ok: false, target: "device", error: "device_storage_failed" };
    }
    const result = await api!.saveGameGarage(ARCADE_ROOM_GAME_SLUG, layout).catch(() => null);
    if (!result?.ok) return { ok: false, target: "account", error: cleanText(result?.error) || "save_failed" };
    return { ok: true, target: "account", error: "" };
  }

  return Object.freeze({
    mode: visiting ? "visitor" : "owner",
    accountBacked,
    ownerPlayerId,
    load: visiting ? loadVisit : loadOwn,
    save,
  });
}
