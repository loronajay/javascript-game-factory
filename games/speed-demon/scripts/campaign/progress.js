// What a career is, and what finishing an event does to one — pure.
//
// A save is three things: which events have been cleared, what the best attempt
// at each was, and which are open. Nothing here knows about storage; that is
// `progress-store.js`, the same split the radio, the garage, online and the
// records boards all make.
//
// **Losing does not block the campaign, it just does not open the next node.**
// An event can be retried as many times as the player likes, and a career that
// hard-gates on a driver somebody cannot beat is a wall rather than a
// difficulty curve. That is the only progression rule in here.

import { EVENTS, FIRST_EVENT_ID, eventById } from "./events.js";

export const PROGRESS_VERSION = 1;

export const STATUS_LOCKED = "locked";
export const STATUS_OPEN = "open";
export const STATUS_CLEARED = "cleared";

/**
 * A fresh career: the first event open and nothing else.
 *
 * The opening event is named rather than derived from "has no requirements", so
 * a later chapter that opens two doors at once cannot accidentally unlock its
 * own second node from a blank save.
 */
export function createProgress(saved = null) {
  const completed = {};
  const source = saved && typeof saved === "object" ? saved : {};
  const savedCompleted = source.completed && typeof source.completed === "object" ? source.completed : {};

  for (const [id, entry] of Object.entries(savedCompleted)) {
    // A row for an event that no longer exists is dropped rather than kept: it
    // can never be shown and it would ride along in every save from now on.
    if (!eventById(id) || !entry || typeof entry !== "object") continue;
    completed[id] = {
      wins: toCount(entry.wins),
      attempts: toCount(entry.attempts),
      bestValue: Number.isFinite(entry.bestValue) ? entry.bestValue : null,
      at: Number.isFinite(entry.at) ? entry.at : 0,
    };
  }

  const unlocked = new Set([FIRST_EVENT_ID]);
  for (const id of Array.isArray(source.unlocked) ? source.unlocked : []) {
    if (eventById(id)) unlocked.add(id);
  }
  // Anything a *won* event opens is open, whatever the saved list said. That is
  // what repairs a save written before an event gained a second unlock — and it
  // reads `wins` rather than presence, because a row can be a pile of losses.
  for (const [id, entry] of Object.entries(completed)) {
    if (entry.wins <= 0) continue;
    for (const next of eventById(id)?.unlocks ?? []) {
      if (eventById(next)) unlocked.add(next);
    }
  }

  return { version: PROGRESS_VERSION, completed, unlocked: [...unlocked] };
}

/**
 * `Number()` is not safe here, for the reason `records.js` keeps `toNumber`:
 * `Number(null)` is 0, and 0 is a legal attempt count. A malformed row must
 * normalize to zero rather than survive as one.
 */
function toCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function isUnlocked(progress, eventId) {
  return progress.unlocked.includes(eventId);
}

/**
 * Cleared is **won at least once**, not "has a row".
 *
 * A losing attempt is recorded too — the attempt count and the run's own number
 * are the player's whatever the other lane did — so presence in the map is not
 * the question. Reading it that way would clear a node by losing on it.
 */
export function isCleared(progress, eventId) {
  return (progress.completed[eventId]?.wins ?? 0) > 0;
}

export function eventStatus(progress, eventId) {
  if (isCleared(progress, eventId)) return STATUS_CLEARED;
  return isUnlocked(progress, eventId) ? STATUS_OPEN : STATUS_LOCKED;
}

/** What the hub prints along the top: cleared out of the whole campaign. */
export function progressSummary(progress) {
  const cleared = EVENTS.filter((event) => isCleared(progress, event.id)).length;
  return { cleared, total: EVENTS.length };
}

/**
 * Files an attempt.
 *
 * Returns a **new** progress and what changed, because the result screen wants
 * to say "this opened something" and deriving that by diffing two saves would
 * be a second copy of the unlock rule.
 *
 * An attempt is always counted; a win is what clears the node and opens what it
 * leads to. `bestValue` tracks the run itself and is deliberately kept for a
 * losing attempt too — the number is the player's, whatever the other lane did.
 */
export function completeEvent(progress, eventId, { won, value = null, at = 0, better = null } = {}) {
  const event = eventById(eventId);
  if (!event) return { progress, unlocked: [], cleared: false, firstClear: false };

  const previous = progress.completed[eventId] ?? null;
  const firstClear = won && (previous?.wins ?? 0) === 0;
  const attempts = (previous?.attempts ?? 0) + 1;
  const wins = (previous?.wins ?? 0) + (won ? 1 : 0);

  // Which of two run values is better belongs to the board the run filed
  // against, not here — a distance race wants the lower number and a time
  // attack the higher — so the caller passes the comparison in. Without one,
  // the first value recorded stands.
  const bestValue = pickBest(previous?.bestValue ?? null, value, better);

  const completed = {
    ...progress.completed,
    [eventId]: { wins, attempts, bestValue, at: at || previous?.at || 0 },
  };

  const unlocked = new Set(progress.unlocked);
  const opened = [];
  if (won) {
    for (const next of event.unlocks) {
      if (!eventById(next) || unlocked.has(next)) continue;
      unlocked.add(next);
      opened.push(next);
    }
  }

  return {
    progress: { ...progress, completed, unlocked: [...unlocked] },
    unlocked: opened,
    cleared: won,
    firstClear,
  };
}

function pickBest(previous, value, better) {
  if (!Number.isFinite(value)) return previous;
  if (!Number.isFinite(previous)) return value;
  if (typeof better !== "function") return previous;
  return better(value, previous) ? value : previous;
}
