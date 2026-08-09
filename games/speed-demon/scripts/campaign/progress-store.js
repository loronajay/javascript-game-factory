// Where a career is kept.
//
// The only module under `campaign/` that knows `localStorage` exists — the
// fifth instance of the split the radio, the garage, online and the records
// boards all make, and `tests/modules.test.js` asserts it.
//
// **A career works signed out**, and that is the records rule rather than the
// garage rule. A garage needs an account because a livery only means something
// if an opponent can see it; a career is meaningful to the player alone, so it
// is kept locally and an account only decides which drawer it goes in. The key
// carries the player id for exactly one reason: two people sharing a browser
// must not inherit each other's progress.
//
// **Server sync is deferred and additive.** `game_progress` exists on the
// platform, and unlike an entitlement claim a plain progress write does not go
// through the Tactical Arena claim validator — nothing here unlocks a car,
// because every car is already free. So this stays local until there is a
// reason for it not to be, and the seam is this file.

import { createProgress } from "./progress.js";

const CACHE_PREFIX = "speed-demon:campaign:";

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // access itself throws when storage is blocked
  }
}

function cacheKey(playerId) {
  return `${CACHE_PREFIX}${playerId || "local"}`;
}

/**
 * Builds the store. `playerId` comes from the records store rather than being
 * read again here, so a player's times, ghosts and career cannot end up keyed
 * three different ways.
 */
export function createCampaignStore({ playerId = "" } = {}) {
  let progress = read();

  function read() {
    const store = storage();
    if (!store) return createProgress();
    try {
      return createProgress(JSON.parse(store.getItem(cacheKey(playerId)) ?? "null"));
    } catch {
      return createProgress();
    }
  }

  function write() {
    const store = storage();
    if (!store) return;
    try {
      store.setItem(cacheKey(playerId), JSON.stringify(progress));
    } catch {
      // Full or blocked. The career still stands for this session, which is the
      // one the player is actually playing.
    }
  }

  return {
    get playerId() {
      return playerId;
    },
    get progress() {
      return progress;
    },

    /** Replaces the career with one `completeEvent` produced. */
    commit(next) {
      if (!next) return progress;
      progress = next;
      write();
      return progress;
    },

    /** Back to a blank career. Here for the debug handle and for tests. */
    reset() {
      progress = createProgress();
      write();
      return progress;
    },
  };
}
