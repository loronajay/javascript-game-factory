// The driver profile's storage seam: the database, and a local cache in front.
//
// The only module under `profile/` that knows a server or `localStorage` exists
// — the role `garage-store.js` plays for the garage, `records-store.js` for the
// bests and `radio/library.js` for the file system. `profile.js` and
// `avatars.js` stay pure and `tests/modules.test.js` asserts it.
//
// ## Server-backed, and signed out it still works
//
// The row lives in `game_driver_profiles` (migration 037), reached through
// `/games/speed-demon/driver` — a real table on the platform's Postgres, not a
// browser-only convenience. That matters because the whole point of a driver is
// to be shown to somebody: the VS card, and later a board row or an online
// lobby, all want a name and a face that follow the account between machines.
//
// But it is **not** gated on sign-in the way the garage is, and the asymmetry is
// the same one the records make:
//
//   garage    requires an account, because a livery only means something if an
//             opponent can read it, and a paint in one browser cannot be shown.
//   records   work signed out, because a personal best is meaningful to the
//             player alone.
//   driver    both. Signed out you still get a name and a face on your own VS
//             card — there is a rival in the other lane and it costs nobody
//             anything — and signing in is what makes it *yours*, on the server,
//             visible to other people and present on the next machine.
//
// So the local copy is the whole truth signed out and a cache signed in.
//
// ## Signing in does not adopt the signed-out driver
//
// Signed-out profiles live under a fixed `local` key and are never merged into
// whichever account signs in next — the records' rule, for the records' reason:
// two people sharing a machine would otherwise donate each other's identity, and
// nothing distinguishes that from one person signing in on their own laptop.
// There is no loss worth mourning here either, because the account brings a
// better default with it: the factory profile's name.
//
// ## The name is defaulted from the shell, never written back to it
//
// Canonical identity belongs to the factory profile. This store *reads* it once,
// to seed a driver who has never been named, and no path in this cabinet writes
// to it — the repo rule `onlineIdentity()` already follows.

import { createProfile, profileEquals } from "./profile.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "../../../../js/platform/api/factory-account-gate.mjs";
import { loadFactoryProfile } from "../../../../js/platform/identity/factory-profile.mjs";

export const GAME_SLUG = "speed-demon";

const CACHE_PREFIX = "speed-demon:driver:";

/** Retry backoff for a failed push, in seconds. Capped so it keeps trying. */
const RETRY_SECONDS = [2, 5, 15, 30, 60];

export const STATUS_LOCAL = "local";
export const STATUS_IDLE = "idle";
export const STATUS_SAVING = "saving";
export const STATUS_ERROR = "error";

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access itself throws when storage is blocked
  }
}

/** Keyed by player id signed in, under a fixed key signed out. See the header. */
function cacheKey(playerId) {
  return `${CACHE_PREFIX}${playerId || "local"}`;
}

function readCache(playerId) {
  const store = storage();
  if (!store) return null;
  try {
    const saved = JSON.parse(store.getItem(cacheKey(playerId)) ?? "null");
    return saved ? createProfile(saved) : null;
  } catch {
    return null;
  }
}

function writeCache(playerId, profile) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(cacheKey(playerId), JSON.stringify(profile));
  } catch {
    // Full or blocked. The driver still stands for this session, and signed in
    // the server copy is the one that matters anyway.
  }
}

/**
 * The name a driver starts with: the factory profile's, so a player who has
 * never opened this screen is already called something they recognise.
 *
 * Read through a function that swallows its own failure, because the shell's
 * profile lives in the same storage this store may have just found blocked, and
 * a nameless driver is a fine outcome where a thrown error is not.
 */
function factoryName(read) {
  try {
    return read()?.profileName ?? "";
  } catch {
    return "";
  }
}

/**
 * Builds the store.
 *
 * Everything impure is injectable — the session reader, the API client, the
 * factory-profile reader — so the whole thing is testable without a browser, a
 * network or an account, which is the reason `radio/stereo.js` takes its element
 * and `garage-store.js` takes its session.
 */
export function createProfileStore({
  session = null,
  api = null,
  readSession = readFactoryAccountSession,
  readFactoryProfile = loadFactoryProfile,
} = {}) {
  const account = session ?? readSession();
  // A client is built either way, because there is a public read here: another
  // player's driver is fetchable by id, and a spectator or a results screen
  // naming a stranger should not need an account of its own. Signed in it also
  // carries the token that makes a *write* possible.
  const client = api ?? createPlatformApiClient();
  const configured = !!client && client.isConfigured !== false;
  const playerId = account.authenticated ? account.playerId || "me" : "";

  // Signed in *and* somewhere to send: both halves, for the reason
  // `garage-store.js` spells out — a store gated on the account alone reports
  // every push as a success against an unconfigured client, and the player's
  // driver looks saved while never leaving the browser.
  const syncs = account.authenticated && configured;

  let status = syncs ? STATUS_IDLE : STATUS_LOCAL;
  // The cache is a complete answer immediately, which is what lets the first
  // frame draw a named driver rather than a placeholder that swaps a moment
  // later. Signed in, `load()` replaces it with the server's copy.
  let profile = readCache(playerId) ?? createProfile({ name: factoryName(readFactoryProfile) });
  // The document waiting to be pushed, or null. The *latest* rather than a
  // queue: a profile is a whole document, so an older pending write has nothing
  // left to contribute once a newer one exists — `garage-store.js`'s rule.
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
    if (!syncs || inFlight || !pending) return;
    const sending = pending;
    inFlight = true;
    status = STATUS_SAVING;
    try {
      await client.put(`/games/${GAME_SLUG}/driver`, { profile: sending });
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

    // A newer edit landed mid-flight. Send it now: a successful push schedules
    // no retry, so nothing else would, and it would sit pending until some
    // unrelated save happened to flush it. Each pass sends whatever is latest,
    // so this settles rather than looping.
    if (pending && retryTimer <= 0) await flush();
  }

  return {
    /** Whether edits reach the server at all. False is a normal state. */
    get synced() {
      return syncs;
    },
    get playerId() {
      return playerId;
    },
    get status() {
      return status;
    },
    get dirty() {
      return pending !== null;
    },
    /** The driver. Available immediately — the cache read is synchronous. */
    get profile() {
      return profile;
    },

    /**
     * Fetches the server's copy and adopts it.
     *
     * The server wins outright where it has one, rather than being merged: a
     * profile is a whole document that the player edits in one place, so there
     * is no per-field question to answer the way there is for a set of bests —
     * and the last screen they used it on is the one that pushed it.
     *
     * Where the server has *nothing* — a fresh account — the local copy is
     * pushed up instead, so a driver set up before the row existed is not
     * quietly discarded on the next load.
     */
    async load() {
      if (!syncs) return profile;
      try {
        const payload = await client.get(`/games/${GAME_SLUG}/driver`);
        const remote = payload?.profile ? createProfile(payload.profile) : null;
        // A row that exists but has never been named is indistinguishable from
        // no row at all, which is exactly right: both mean "this account has not
        // set a driver up", and both should take whatever this machine has.
        const named = remote && (remote.name || remote.favourites.length > 0);
        if (named) {
          profile = remote;
          writeCache(playerId, profile);
        } else if (!profile.name) {
          // Nothing anywhere. Seed from the shell rather than leaving the card
          // reading DRIVER for somebody who already has a name on the platform.
          profile = createProfile({ ...profile, name: factoryName(readFactoryProfile) });
          writeCache(playerId, profile);
          pending = profile;
          void flush();
        } else {
          pending = profile;
          void flush();
        }
        if (status === STATUS_ERROR) status = STATUS_IDLE;
      } catch {
        // Offline or refused. The cache is the best available answer and a
        // correct one — the player still has a driver.
        status = STATUS_ERROR;
      }
      return profile;
    },

    /**
     * Records a change. Returns immediately: the cache write is synchronous, so
     * the player's driver is theirs before the network is involved at all, and
     * an unchanged document costs nothing.
     */
    save(next) {
      const normalized = createProfile(next);
      if (profileEquals(normalized, profile)) return profile;
      profile = normalized;
      writeCache(playerId, profile);
      if (syncs) {
        pending = profile;
        retryIndex = 0;
        retryTimer = 0;
        void flush();
      }
      return profile;
    },

    /**
     * Another player's driver, for a card that names somebody else. Public by
     * design — see the header — and null on any failure, which every caller has
     * to treat as "draw the default", never as an error.
     */
    async fetchDriver(otherPlayerId) {
      if (!configured || !otherPlayerId) return null;
      try {
        const payload = await client.get(
          `/games/${GAME_SLUG}/driver/${encodeURIComponent(otherPlayerId)}`,
        );
        return payload?.profile ? createProfile(payload.profile) : null;
      } catch {
        return null;
      }
    },

    /**
     * Drives the retry backoff from the game loop, the way the garage's and the
     * records' do, so a failed save keeps trying without a timer of its own.
     */
    tick(dt) {
      if (!pending || inFlight || retryTimer <= 0) return;
      retryTimer -= dt;
      if (retryTimer <= 0) void flush();
    },
  };
}
