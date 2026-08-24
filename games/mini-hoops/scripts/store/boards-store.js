// Persistence for the leaderboards.
//
// This is the seam that a global, server-backed board would replace. Everything
// above it works in terms of `readBoard` / `submitRun` / `clearBoard`, so the
// day these boards move to `platform-api`'s per-game leaderboard tables, this
// file gains an async twin and nothing else in the cabinet has to know — the
// shaping rules stay in `boards.js`, which is already storage-free.
//
// Until then: local only, and local means local. A cleared browser clears the
// boards, and that is stated in the UI rather than pretended away.

import { addEntry, asBoard, bestScore, boardKey, entryFromRun, rankOf } from "./boards.js";
import { readJSON, resolveStorage, writeJSON } from "./local-storage.js";

const STORAGE_KEY = "miniHoops.boards.v1";

export function createBoardsStore({ storage, now = () => Date.now() } = {}) {
  const backing = resolveStorage(storage);
  // Held in memory and written through, so a read is never a parse and a
  // storage failure costs persistence but not the current session.
  let boards = readJSON(backing, STORAGE_KEY, {});

  function persist() {
    writeJSON(backing, STORAGE_KEY, boards);
  }

  return {
    /** The board for a mode and duration. Always an array. */
    readBoard(modeId, duration) {
      return asBoard(boards[boardKey(modeId, duration)]);
    },

    /** The top score for a mode and duration, or 0. */
    bestScore(modeId, duration) {
      return bestScore(this.readBoard(modeId, duration));
    },

    /**
     * File a finished run.
     *
     * A scoreless run is not filed — an empty board reading "no scores yet" is
     * more useful than one full of zeroes.
     *
     * @returns `{ rank, previousBest, placed }` — `rank` is 0 if it did not place.
     */
    submitRun(summary) {
      const key = boardKey(summary.modeId, summary.duration);
      const previousBest = bestScore(asBoard(boards[key]));

      if (!summary.score) {
        return { rank: 0, previousBest, placed: false };
      }

      const entry = entryFromRun(summary, now());
      const next = addEntry(boards[key], entry);
      boards = { ...boards, [key]: next };
      persist();

      const rank = rankOf(next, entry);
      return { rank, previousBest, placed: rank > 0 };
    },

    /** Wipe one board, leaving the others alone. */
    clearBoard(modeId, duration) {
      const key = boardKey(modeId, duration);
      if (!(key in boards)) return false;
      const next = { ...boards };
      delete next[key];
      boards = next;
      persist();
      return true;
    },
  };
}
