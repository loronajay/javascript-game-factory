// The records' storage seam: the local best, and the global board behind it.
//
// The only module under `records/` that knows a server or `localStorage` exists
// — the same role `garage-store.js` plays for the garage and `radio/library.js`
// plays for the file system. `records.js` stays pure and `tests/modules.test.js`
// asserts it.
//
// ## Unlike the garage, this works signed out — and that asymmetry is the point
//
// A garage *requires* an account because a livery only means something if an
// opponent can see it: a paint that exists in one browser cannot be shown to
// anybody, so there is nothing to store. A lap time is the opposite. It is
// meaningful to the player alone, and telling somebody they may not keep their
// own personal best until they register would be gating the wrong thing.
//
// So there are two tiers, and the second is additive:
//
//   signed out  local bests only. Nothing is submitted, nothing is ranked, and
//               the cabinet says so rather than pretending to be offline.
//   signed in   the same local bests, plus submission to the global board and
//               a rank to go with them.
//
// The local copy is therefore **not** merely a cache the way the garage's is. It
// is the whole record signed out, and the fast path signed in. On sign-in the
// two are merged rather than one overwriting the other — see `load`.
//
// ## A failed submission must not lose a personal best
//
// `submit` writes locally and returns. The push is retried on a backoff driven
// from the game loop, the same place `garageStore.tick` and the stereo's `apply`
// run. A player who beats their own time on a dropped connection has still
// beaten it.

import {
  BOARD_ERROR,
  BOARD_IDLE,
  BOARD_LOADING,
  BOARD_OFFLINE,
  BOARD_READY,
  applyRun,
  boardDirection,
  createRecords,
  isBetter,
  recordFor,
} from "./records.js";
import { createPlatformApiClient } from "../../../../js/platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "../../../../js/platform/api/factory-account-gate.mjs";

export const GAME_SLUG = "speed-demon";

const CACHE_PREFIX = "speed-demon:records:";

/** Retry backoff for a failed submission, in seconds. Capped so it keeps trying. */
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

/**
 * Signed in, bests are keyed by player id for the same reason the garage's are:
 * a shared browser must never show one account the previous account's times.
 *
 * Signed out they go under a fixed `local` key, which is deliberately NOT merged
 * into whichever account signs in next. Two people sharing a machine would
 * otherwise donate each other's records, and there is no way to tell that from
 * one person signing in on their own laptop. `load` merges only the key that
 * belongs to the player already.
 */
function cacheKey(playerId) {
  return `${CACHE_PREFIX}${playerId || "local"}`;
}

function readCache(playerId) {
  const store = storage();
  if (!store) return {};
  try {
    return createRecords(JSON.parse(store.getItem(cacheKey(playerId)) ?? "null"));
  } catch {
    return {};
  }
}

function writeCache(playerId, records) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(cacheKey(playerId), JSON.stringify(records));
  } catch {
    // Full or blocked. The bests still stand for this session, and signed in the
    // server copy is the one that matters anyway.
  }
}

/**
 * Merges a server set over a local one, keeping whichever is genuinely better
 * per board.
 *
 * Neither side simply wins. The server is authoritative about *rank*, but it can
 * be behind on a run set while offline, and the local copy can be behind on a
 * run set from another machine. Comparing per board is the only answer that
 * cannot lose a real best, and it needs the direction — which is why this takes
 * a board's mode rather than assuming lower wins.
 */
function mergeRecords(local, remote) {
  const merged = { ...local };
  for (const [boardId, record] of Object.entries(remote)) {
    const mine = recordFor(merged, boardId);
    const direction = boardDirection(String(boardId).split(":")[0]);
    if (!mine || isBetter(direction, record.value, mine.value)) merged[boardId] = record;
  }
  return merged;
}

/**
 * Builds the store.
 *
 * Everything impure is injectable — the session reader, the API client — so the
 * whole thing is testable without a browser, a network or an account. Same
 * reason `radio/stereo.js` takes its element and `garage-store.js` takes its
 * session.
 */
export function createRecordsStore({ session = null, api = null, readSession = readFactoryAccountSession } = {}) {
  const account = session ?? readSession();
  // A client is built whether or not anybody is signed in, because the *reads*
  // are public: `GET /leaderboards/:slug/board/:id` is open by design — a
  // personal best is a boast, and the auth exists only so a submitted run is
  // attributable. Gating the client on sign-in would have made the global board
  // invisible to exactly the players most likely to want to look at it.
  const client = api ?? createPlatformApiClient();
  const playerId = account.authenticated ? account.playerId || "me" : "";

  let status = account.authenticated ? STATUS_IDLE : STATUS_LOCAL;
  let records = readCache(playerId);
  // Runs beaten but not yet submitted, keyed by board so a second best on the
  // same board replaces the first: an older pending submission has nothing left
  // to contribute once a better one exists on the same board.
  const pending = new Map();
  let inFlight = false;
  let retryIndex = 0;
  let retryTimer = 0;

  /**
   * Global boards the screen has asked for, keyed by board id:
   * `{ status, standings }`.
   *
   * Fetched lazily, one board at a time, and only when something asks — the
   * registry holds seven and a player looks at one. Kept for the life of the
   * session rather than re-read on every visit: a leaderboard is not live data
   * in any sense that matters over the couple of minutes a player spends on the
   * screen, and refetching on each tab press would make walking the strip
   * flicker through a loading state per board.
   */
  const boards = new Map();

  function boardEntry(boardId) {
    return boards.get(boardId) ?? { status: BOARD_IDLE, standings: null };
  }

  /**
   * Parks a run for submission. Keyed by board so a second best on the same
   * board replaces the first — an older pending run has nothing left to
   * contribute once a better one on the same board exists.
   */
  function queue(boardId, { value, modelId = "", trackId = "", inputLog = null } = {}) {
    pending.set(boardId, {
      boardId,
      value,
      modelId,
      trackId,
      // The log is what makes the record verifiable later: the sim is
      // deterministic, so replaying it either reproduces the time or proves it
      // was invented. Omitted rather than sent empty when there is none — a
      // missing log is honest, an empty one claims a run with no inputs.
      ...(inputLog ? { inputLog } : {}),
    });
  }

  function markFailed() {
    status = STATUS_ERROR;
    retryTimer = RETRY_SECONDS[Math.min(retryIndex, RETRY_SECONDS.length - 1)];
    retryIndex += 1;
  }

  async function flush() {
    if (!client || inFlight || pending.size === 0) return;
    const sending = [...pending.values()];
    inFlight = true;
    status = STATUS_SAVING;
    try {
      for (const run of sending) {
        const result = await client.post(`/leaderboards/${GAME_SLUG}/runs`, run);
        // The server is the authority on whether this beat the stored best: it
        // may hold a better run from another machine. Its answer is folded back
        // in so the results screen stops claiming a record the board rejected.
        const record = result?.record;
        if (record && Number.isFinite(Number(record.value))) {
          records = mergeRecords(records, createRecords({ [run.boardId]: record }));
          writeCache(playerId, records);
        }
        // Only drop the entry if nothing newer landed on that board mid-flight.
        if (pending.get(run.boardId) === run) pending.delete(run.boardId);
      }
      status = pending.size === 0 ? STATUS_IDLE : STATUS_SAVING;
      retryIndex = 0;
      retryTimer = 0;
    } catch {
      markFailed();
    } finally {
      inFlight = false;
    }

    // A better run arrived while that batch was in flight. Send it now: nothing
    // else would, because a successful push schedules no retry, and it would sit
    // pending until an unrelated run happened to flush it. Each pass sends
    // whatever is latest, so this settles rather than looping.
    if (pending.size > 0 && retryTimer <= 0) await flush();
  }

  return {
    /** Whether runs are submitted to the global board at all. */
    get ranked() {
      return account.authenticated;
    },
    get playerId() {
      return playerId;
    },
    get status() {
      return status;
    },
    get dirty() {
      return pending.size > 0;
    },
    /** The current set. Available immediately — the cache read is synchronous. */
    get records() {
      return records;
    },

    /** What the store knows about one global board, without asking for it. */
    boardStatus(boardId) {
      return boardEntry(boardId).status;
    },
    boardStandings(boardId) {
      return boardEntry(boardId).standings;
    },

    /**
     * Where this player sits on each board *that has already been fetched*.
     *
     * Deliberately derived from what is in hand rather than fanning out seven
     * requests to fill the personal view's rank column: a rank the player has
     * not looked the board up for is worth less than seven round trips on
     * opening a screen, and walking onto a board's tab fills its rank in.
     */
    boardRanks() {
      const ranks = {};
      for (const [boardId, entry] of boards) {
        const mine = entry.standings?.entries?.find((row) => row.playerId === playerId);
        if (playerId && mine && Number.isFinite(Number(mine.rank))) ranks[boardId] = Number(mine.rank);
      }
      return ranks;
    },

    /**
     * Asks for a global board, if it has not been asked for already. Returns
     * whether anything was actually started, so the caller can decide whether a
     * repaint is due — the fetch itself resolves into the map and the next frame
     * picks it up, the same shape the garage and the sheet images use.
     *
     * A board that failed is retried on the next ask rather than on a timer:
     * this is a screen the player is looking at, so their next tab press is a
     * better trigger than a clock nobody can see.
     */
    async requestBoard(boardId, { limit = 25 } = {}) {
      if (!boardId) return false;
      const entry = boardEntry(boardId);
      if (entry.status === BOARD_LOADING || entry.status === BOARD_READY) return false;
      if (!client?.isConfigured) {
        boards.set(boardId, { status: BOARD_OFFLINE, standings: null });
        return true;
      }
      boards.set(boardId, { ...entry, status: BOARD_LOADING });
      try {
        const payload = await client.get(
          `/leaderboards/${GAME_SLUG}/board/${encodeURIComponent(boardId)}?limit=${limit}`,
        );
        // `requestJson` swallows a failed response into null rather than
        // throwing, so a null payload is the error case and has to be handled
        // here — not doing so would cache an empty board as READY and print
        // "nobody has set a time yet" over a network fault.
        const board = payload?.board ?? null;
        boards.set(boardId, board
          ? { status: BOARD_READY, standings: board }
          : { status: BOARD_ERROR, standings: null });
      } catch {
        boards.set(boardId, { status: BOARD_ERROR, standings: null });
      }
      return true;
    },

    /**
     * Loads the server's copy and merges it over the local one.
     *
     * Signed out this is a no-op that returns what the cache already gave us at
     * construction, which is a complete answer rather than a degraded one.
     */
    async load() {
      if (!account.authenticated || !client) return records;
      try {
        const payload = await client.get(`/leaderboards/${GAME_SLUG}/records/${encodeURIComponent(playerId)}`);
        const remote = {};
        for (const record of payload?.records ?? []) {
          if (record?.boardId && Number.isFinite(Number(record.value))) remote[record.boardId] = record;
        }
        records = mergeRecords(records, createRecords(remote));
        writeCache(playerId, records);
        status = STATUS_IDLE;
        // A local best the server has never seen is submitted rather than left
        // behind — that is how a run set while signed out on this machine, or
        // during an outage, reaches the board at all.
        for (const [boardId, record] of Object.entries(records)) {
          if (!record.verified && !remote[boardId]) queue(boardId, record);
        }
        void flush();
      } catch {
        status = STATUS_ERROR;
      }
      return records;
    },

    /**
     * Records a finished run. Returns `{ improved, previous, record }` so the
     * results screen can say what happened without a second read.
     *
     * `improved: false` is a normal outcome, not a failure — most runs are not a
     * personal best.
     */
    submit({ boardId, modeId, value, modelId = "", trackId = "", inputLog = null }) {
      const direction = boardDirection(modeId);
      const applied = applyRun(records, {
        boardId,
        direction,
        value,
        modelId,
        trackId,
        recordedAt: new Date().toISOString(),
      });
      if (!applied.improved) {
        return { improved: false, previous: applied.previous, record: applied.previous };
      }

      records = applied.records;
      writeCache(playerId, records);

      if (account.authenticated) {
        queue(boardId, { value, modelId, trackId, inputLog });
        retryIndex = 0;
        retryTimer = 0;
        void flush();
      }

      return { improved: true, previous: applied.previous, record: records[boardId] };
    },

    /**
     * Drives the retry backoff, from the game loop — the same way the garage
     * store's does, so a failed submission keeps trying without a timer of its
     * own.
     */
    tick(dt) {
      if (pending.size === 0 || inFlight || retryTimer <= 0) return;
      retryTimer -= dt;
      if (retryTimer <= 0) void flush();
    },
  };
}
