// The garage's storage seam: the server, and a local cache in front of it.
//
// The only module in the garage that knows a server or `localStorage` exists —
// the same role `radio/library.js` plays for the file system. `garage.js` and
// `livery.js` stay pure and `tests/modules.test.js` asserts it, so everything
// about *what a saved config is* remains testable without a network.
//
// **Customization requires a signed-in account, by decision.** A garage is
// server-owned: it has to be, because an opponent must be able to read the car
// you are driving during an online race, and a config that only exists in one
// browser cannot be shown to anyone. Signed out, `available` is false and the
// cabinet races on Factory paint — which is why nothing in the game may treat a
// missing garage as an error. It is a normal state, not a failure.
//
// **The local copy is a cache, never the truth.** It exists so a reload does not
// stare at an empty garage while the network answers, and so a save survives a
// dropped connection long enough to be retried. It is keyed by player id: a
// shared browser must never show one account the previous account's paints, and
// a single global key is exactly how that happens.
//
// **A failed save must not lose work.** `save` writes the cache synchronously
// and returns; the push to the server is retried on a backoff until it lands.
// The player's config is theirs the moment they press the button, whatever the
// network is doing.

import { createGarage, serializeGarage } from "./garage.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "../../../../js/platform/api/factory-account-gate.mjs";

export const GAME_SLUG = "speed-demon";

const CACHE_PREFIX = "speed-demon:garage:";

/** Retry backoff for a failed push, in seconds. Capped so it keeps trying. */
const RETRY_SECONDS = [2, 5, 15, 30, 60];

export const STATUS_OFFLINE = "offline";
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

function cacheKey(playerId) {
  return `${CACHE_PREFIX}${playerId}`;
}

/** The cached garage for one player, or null. Never throws. */
function readCache(playerId, isKnownModel) {
  const store = storage();
  if (!store || !playerId) return null;
  try {
    const saved = JSON.parse(store.getItem(cacheKey(playerId)) ?? "null");
    return saved ? createGarage(saved, { isKnownModel }) : null;
  } catch {
    return null;
  }
}

function writeCache(playerId, garage) {
  const store = storage();
  if (!store || !playerId) return;
  try {
    store.setItem(cacheKey(playerId), JSON.stringify(serializeGarage(garage)));
  } catch {
    // Full or blocked. The garage still applies for this session, and the
    // server copy is the one that matters anyway.
  }
}

/**
 * Builds the store.
 *
 * Everything impure is injectable — the session reader, the API client, the
 * clock — so the whole thing is testable without a browser, a network or a
 * signed-in account. That is the same reason `radio/stereo.js` takes its element.
 */
export function createGarageStore({
  isKnownModel = () => true,
  session = null,
  api = null,
  readSession = readFactoryAccountSession,
} = {}) {
  const account = session ?? readSession();
  const client = api ?? (account.authenticated ? createPlatformApiClient() : null);
  const playerId = account.playerId || (account.authenticated ? "me" : "");

  let status = account.authenticated ? STATUS_IDLE : STATUS_OFFLINE;
  // The garage waiting to be pushed. Null when the server is up to date. Holding
  // the *latest* rather than a queue is deliberate: a garage is a whole document,
  // so an older pending write has nothing left to contribute once a newer one
  // exists.
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
      await client.put(`/games/${GAME_SLUG}/garage`, { garage: serializeGarage(sending) });
      // Only clear the pending write if nothing newer arrived while it was in
      // flight — otherwise the newer edit would be silently dropped.
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

    // A newer edit arrived while that one was in flight. Send it straight away:
    // nothing else would, because a successful push leaves no retry scheduled,
    // and the edit would sit pending until the next unrelated save. Each pass
    // sends whatever is latest, so this settles rather than looping.
    if (pending && retryTimer <= 0) await flush();
  }

  return {
    /** Whether a garage can exist at all — i.e. whether anyone is signed in. */
    get available() {
      return account.authenticated;
    },
    get playerId() {
      return playerId;
    },
    get status() {
      return status;
    },
    /** True when there is an edit the server has not acknowledged. */
    get dirty() {
      return pending !== null;
    },

    /**
     * The player's garage. Reads the cache first so the picker has something to
     * draw immediately, then replaces it with the server's copy — which is the
     * source of truth — when that arrives.
     *
     * Signed out this is an empty garage, not an error.
     */
    async load() {
      if (!account.authenticated || !client) return createGarage(null, { isKnownModel });

      const cached = readCache(playerId, isKnownModel);
      try {
        const payload = await client.get(`/games/${GAME_SLUG}/garage`);
        const garage = createGarage(payload?.garage ?? null, { isKnownModel });
        writeCache(playerId, garage);
        status = STATUS_IDLE;
        return garage;
      } catch {
        // Offline or refused. The cache is the best available answer, and an
        // empty garage is a correct one when there is no cache either.
        status = STATUS_ERROR;
        return cached ?? createGarage(null, { isKnownModel });
      }
    },

    /**
     * Records a change. Returns immediately — the cache write is synchronous, so
     * the player's work is safe before the network is involved at all.
     */
    save(garage) {
      if (!account.authenticated) return;
      writeCache(playerId, garage);
      pending = garage;
      retryIndex = 0;
      retryTimer = 0;
      void flush();
    },

    /**
     * Drives the retry backoff. Called from the game loop the way the stereo's
     * `apply` is, so a failed save keeps trying without a timer of its own.
     */
    tick(dt) {
      if (!pending || inFlight || retryTimer <= 0) return;
      retryTimer -= dt;
      if (retryTimer <= 0) void flush();
    },
  };
}
