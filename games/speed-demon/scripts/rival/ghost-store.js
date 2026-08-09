// Where a ghost is kept.
//
// The only module under `rival/` that knows `localStorage` exists — the same
// role `records-store.js` plays for the bests themselves and `garage-store.js`
// plays for the garage. `tests/modules.test.js` asserts the split.
//
// ## Why this is not just a field on the record
//
// A personal best already travels: `records-store.js` merges the local set with
// the server's, submits runs, and hands the whole thing to the leaderboard
// screen. A ghost is the *input log* behind one of those runs, and it does not
// want any of that. It is several hundred bytes rather than several dozen, it is
// meaningless on another machine's copy of the board, and folding it into the
// record would put it through `createRecord` — which normalizes a record into a
// wire payload and would either drop the log or start sending it on every merge.
//
// So the record says what the time was, and this says how it was driven. They
// are written together and they can legitimately disagree: a best synced down
// from the server was set on another machine and has no ghost here, which is a
// normal state and reads as "no ghost for this board yet" rather than an error.
//
// ## Signed out, this still works
//
// The same argument `records-store.js` makes: a lap time is meaningful to the
// player alone, so keeping one — and racing it — needs no account. The player id
// is only used to keep two accounts on one machine apart, exactly as it is
// there, and signed out everything lands under the same fixed `local` key.

import { GHOST_EVENT_CEILING, createGhost } from "./ghost.js";

const CACHE_PREFIX = "speed-demon:ghosts:";

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
 * read again here, so the two cannot end up keyed differently and show a player
 * one account's times beside another account's ghosts.
 */
export function createGhostStore({ playerId = "" } = {}) {
  let ghosts = read();

  function read() {
    const store = storage();
    if (!store) return {};
    try {
      const saved = JSON.parse(store.getItem(cacheKey(playerId)) ?? "null");
      const byBoard = {};
      for (const [boardId, ghost] of Object.entries(saved ?? {})) {
        const normalized = createGhost({ ...ghost, boardId });
        if (normalized) byBoard[boardId] = normalized;
      }
      return byBoard;
    } catch {
      return {};
    }
  }

  function write() {
    const store = storage();
    if (!store) return;
    try {
      store.setItem(cacheKey(playerId), JSON.stringify(ghosts));
    } catch {
      // Full or blocked. The ghost still stands for this session, which is the
      // session the player just set it in and the one most likely to race it.
    }
  }

  return {
    get playerId() {
      return playerId;
    },
    /** The ghost for a board, or null. Synchronous — this is all local. */
    get(boardId) {
      return (boardId && ghosts[boardId]) || null;
    },
    get all() {
      return ghosts;
    },

    /**
     * Replaces the ghost for a board.
     *
     * Called only when a run actually improved the board, so this never has to
     * decide which of two runs was better — `records.js` already did, and having
     * a second copy of that comparison is how a ghost ends up being a slower run
     * than the time printed beside it.
     *
     * A log longer than the ceiling is refused rather than truncated: half a run
     * replays to a car that stops in the middle of the strip, which is worse
     * than having no ghost at all.
     */
    save(record) {
      const ghost = createGhost(record);
      if (!ghost || ghost.events.length > GHOST_EVENT_CEILING) return null;
      ghosts = { ...ghosts, [ghost.boardId]: ghost };
      write();
      return ghost;
    },

    /** Forgets every ghost. Here for the debug handle and for tests. */
    clear() {
      ghosts = {};
      write();
    },
  };
}
