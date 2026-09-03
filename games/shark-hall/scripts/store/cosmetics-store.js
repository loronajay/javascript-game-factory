// Where a player's tables live: the Factory, with a local cache in front of it.
//
// THE FACTORY IS THE STORE. `localStorage` here is a write-through cache and
// never the truth — the same contract the platform states for every other
// account-owned document. That is not ceremony: a table is an identity, it has
// to follow the player to another browser and another machine, and it has to be
// readable by the cabinet when somebody else's table needs drawing. A loadout
// that only exists in one browser is a loadout nobody can be shown.
//
// It rides on `game_loadouts` — the same generic per-game row Speed Demon's
// garage and Yam Bowling's presentation loadout use, keyed by `game_slug`, and
// validated server-side by `services/shark-hall-loadout-catalog.mts`. No new
// table, no new route: `GET`/`PUT /games/shark-hall/garage`.
//
// SIGNED OUT IS A NORMAL STATE, NOT A FAILURE. The cabinet must rack and play
// with no account, so `load` returns the house garage and `available` is false.
// The editor reads that flag and says the true thing — "sign in to save your
// table" — rather than pretending a save happened. That honesty is the whole
// reason `available` also requires a CONFIGURED client: a page that forgot to
// load the platform config resolves an empty base URL, every request returns
// null instead of throwing, and a store gated on the account alone would report
// every push as a success while the player's work never left the tab.
//
// A FAILED SAVE MUST NOT LOSE WORK. `save` writes the cache synchronously and
// returns; the push is retried on a backoff driven by the frame loop. The
// player's table is theirs the moment they press the button.

import { normalizeGarage, defaultGarage, serializeGarage } from "../cosmetics/loadout.js";
import { readJson, writeJson } from "./local-storage.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "../../../../js/platform/api/factory-account-gate.mjs";

export const GAME_SLUG = "shark-hall";

/** Retry backoff for a failed push, in seconds. Capped, and it keeps trying. */
const RETRY_SECONDS = [2, 5, 15, 30, 60];

export const STATUS_SIGNED_OUT = "signed-out";
export const STATUS_IDLE = "idle";
export const STATUS_SAVING = "saving";
export const STATUS_ERROR = "error";

/**
 * The cache key.
 *
 * KEYED BY PLAYER ID, always. A shared browser must never show one account the
 * previous account's tables, and a single global key is exactly how that
 * happens. The signed-out key is its own bucket for the same reason.
 */
const cacheKey = (playerId) => `garage:${playerId || "guest"}`;

function readCache(playerId, options) {
  const raw = readJson(cacheKey(playerId), null);
  return raw ? normalizeGarage(raw, options) : null;
}

function writeCache(playerId, garage, options) {
  writeJson(cacheKey(playerId), serializeGarage(garage, options));
}

/**
 * Build the store.
 *
 * Everything impure is injectable — the session reader, the API client — so the
 * whole thing is testable under node with no browser, no network and no account.
 */
export function createCosmeticsStore({ session = null, api = null, readSession = readFactoryAccountSession, normalizeOptions = {} } = {}) {
  const account = session ?? readSession();
  const client = api ?? (account?.authenticated ? createPlatformApiClient() : null);
  const playerId = account?.playerId || (account?.authenticated ? "me" : "");
  const configured = Boolean(client) && client.isConfigured !== false;
  const available = Boolean(account?.authenticated) && configured;

  let status = available ? STATUS_IDLE : STATUS_SIGNED_OUT;
  // The garage waiting to be pushed, or null. The LATEST one rather than a
  // queue: a garage is a whole document, so an older pending write has nothing
  // left to contribute once a newer one exists.
  let pending = null;
  let inFlight = false;
  let retryIndex = 0;
  let retryTimer = 0;

  function markFailed() {
    status = STATUS_ERROR;
    retryTimer = RETRY_SECONDS[Math.min(retryIndex, RETRY_SECONDS.length - 1)];
    retryIndex += 1;
  }

  async function flush() {
    if (!client || inFlight || !pending) return;
    const sending = pending;
    inFlight = true;
    status = STATUS_SAVING;
    try {
      await client.put(`/games/${GAME_SLUG}/garage`, { garage: serializeGarage(sending, normalizeOptions) });
      // Only clear the pending write if nothing newer arrived while it was in
      // flight — otherwise the newer edit is silently dropped.
      if (pending === sending) {
        pending = null;
        status = STATUS_IDLE;
      }
      retryIndex = 0;
      retryTimer = 0;
    } catch {
      markFailed();
    } finally {
      inFlight = false;
    }
    // A newer edit arrived mid-flight. Send it now: a successful push leaves no
    // retry scheduled, so nothing else would, and it would sit until the next
    // unrelated save. Each pass sends the latest, so this settles.
    if (pending && retryTimer <= 0) await flush();
  }

  return {
    /** Whether a table can be SAVED at all: somebody signed in, and a server to keep it on. */
    get available() {
      return available;
    },
    get playerId() {
      return playerId;
    },
    get status() {
      return status;
    },
    /** True while an edit the server has not acknowledged is outstanding. */
    get syncing() {
      return pending !== null;
    },

    /**
     * The player's garage.
     *
     * Signed in: the server's copy, which is the truth, with the cache as the
     * answer when the network is not there. Signed out: the cached guest garage
     * if there is one, otherwise the house table. Never an error, and never a
     * blank screen.
     */
    async load() {
      const cached = readCache(playerId, normalizeOptions);
      if (!available) {
        status = STATUS_SIGNED_OUT;
        return cached ?? defaultGarage();
      }
      try {
        const payload = await client.get(`/games/${GAME_SLUG}/garage`);
        const garage = normalizeGarage(payload?.garage ?? null, normalizeOptions);
        writeCache(playerId, garage, normalizeOptions);
        status = STATUS_IDLE;
        return garage;
      } catch {
        status = STATUS_ERROR;
        return cached ?? defaultGarage();
      }
    },

    /**
     * Record a change. Returns immediately — the cache write is synchronous, so
     * the work is safe before the network is involved at all.
     *
     * Signed out this still caches, so a guest's table survives a reload and is
     * there to be pushed the moment they sign in. It just never leaves the tab,
     * and the editor says so.
     */
    save(garage) {
      const normalized = normalizeGarage(garage, normalizeOptions);
      writeCache(playerId, normalized, normalizeOptions);
      if (!available) return;
      pending = normalized;
      retryIndex = 0;
      retryTimer = 0;
      void flush();
    },

    /** Drives the retry backoff from the frame loop, so a failed save keeps trying. */
    tick(dt) {
      if (!pending || inFlight || retryTimer <= 0) return;
      retryTimer -= dt;
      if (retryTimer <= 0) void flush();
    },
  };
}
