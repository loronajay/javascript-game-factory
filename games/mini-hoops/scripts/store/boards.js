// Leaderboard shaping. Pure — no storage, no DOM.
//
// A BOARD KEY IS `mode:duration`, and that is a deliberate, load-bearing choice.
// Those are the two things that change what a score means STRUCTURALLY. Neither
// the room nor the ball is in the key, but for two different reasons.
//
// The room is genuinely cosmetic and cannot change the shot — `location-catalog.js`
// is constrained to carry nothing but a name and a blurb, and a test says so.
//
// The BALL is not. Balls fly differently (see the `flight` block in
// `ball-catalog.js`), and choosing one is a real decision. That could have made
// the ball a fourth key; it deliberately did not, because splitting boards by
// ball would turn one contested board into four lonely ones, which is the worse
// failure for a local-only leaderboard. What keeps a mixed board honest instead
// is publication: the difference is stated on the setup screen BEFORE the run,
// as flight bars on the same picker the ball is chosen from, and every row on
// the board names the ball its run was set with.
//
// So a change of ball is a label here, never a key. A change to what MODE or
// DURATION mean would be a migration, because existing keys would no longer parse.

import { LEADERBOARD_SIZE } from "../sim/constants.js";

/** The key a run's result is filed under. */
export function boardKey(modeId, duration) {
  return `${modeId}:${duration}`;
}

/**
 * Rank order: score first, then the longer streak, then fewer shots to get there.
 *
 * The tiebreakers matter more than they look. Two 40s are common on a 30-second
 * board, and "same score, tighter run" is the ordering a player expects.
 */
export function compareEntries(left, right) {
  return (
    numeric(right.score) - numeric(left.score) ||
    numeric(right.bestStreak) - numeric(left.bestStreak) ||
    numeric(left.shots) - numeric(right.shots)
  );
}

/**
 * Add an entry to a board, returning a NEW sorted, capped board.
 *
 * The input board is not mutated, so a caller can compare before and after to
 * see whether the entry actually placed.
 */
export function addEntry(board, entry) {
  return [...asBoard(board), entry].sort(compareEntries).slice(0, LEADERBOARD_SIZE);
}

/**
 * Where an entry sits on a board, 1-based. Returns 0 if it did not place.
 *
 * Matched on `at` — the entry's timestamp — rather than by value, because two
 * identical runs are genuinely possible and finding "the first one that looks
 * like this" would report the wrong rank for the second.
 */
export function rankOf(board, entry) {
  const index = asBoard(board).findIndex((candidate) => candidate.at === entry.at);
  return index + 1;
}

/** The top score on a board, or 0 for an empty one. */
export function bestScore(board) {
  const entries = asBoard(board);
  return entries.length ? Math.max(0, numeric(entries[0].score)) : 0;
}

/**
 * Build a board entry from a finished run.
 *
 * `at` is both the tiebreaker-free identity of the entry and what `rankOf`
 * matches on, so it is supplied by the caller rather than read from a clock
 * here — that keeps this module pure and testable.
 */
export function entryFromRun(summary, at) {
  return {
    score: numeric(summary.score),
    shots: numeric(summary.shots),
    made: numeric(summary.made),
    accuracy: numeric(summary.accuracy),
    bestStreak: numeric(summary.bestStreak),
    // Kept for display even though they are not part of the key — a player likes
    // knowing which room and which ball a personal best happened with.
    locationId: summary.locationId,
    ballId: summary.ballId,
    at,
  };
}

/** Coerce whatever came back out of storage into a usable board. */
export function asBoard(board) {
  if (!Array.isArray(board)) return [];
  return board.filter((entry) => entry && typeof entry === "object");
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
