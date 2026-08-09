// What a ghost is: a personal best, plus the log of how it was driven.
//
// PURE. `ghost-store.js` is the only module under `rival/` allowed storage, and
// this holds the shape it reads and writes.
//
// A ghost is normalized on the way in for exactly the reason a livery is: it
// comes off disk, written by some older build of the cabinet, and nothing that
// arrives from there may be able to produce a rival that cannot be raced. A
// malformed ghost is `null` — no ghost — never an exception mid-setup.

import { EVENT_GATE, EVENT_START, EVENT_THROTTLE, EVENT_CLUTCH } from "../sim/input-log.js";

/**
 * The longest log a ghost may carry. Two minutes of Time Attack driven badly is
 * a few hundred events — the throttle is recorded as edges and the gate as the
 * handful of directions actually pressed — so this is four orders of magnitude
 * of headroom, and it is a guard against a corrupted file rather than a budget.
 */
export const GHOST_EVENT_CEILING = 20000;

const KINDS = new Set([EVENT_START, EVENT_THROTTLE, EVENT_CLUTCH, EVENT_GATE]);

const asString = (value) => (typeof value === "string" ? value : "");

/**
 * Normalizes a saved ghost, or returns null when there is not enough of one to
 * race.
 *
 * The bar is deliberately low — a board, a value and at least one event — and
 * everything else falls back. A ghost with no model id still races; it is drawn
 * on the default car, which is a worse ghost rather than a broken one.
 */
export function createGhost(saved = {}) {
  const boardId = asString(saved?.boardId);
  const value = Number(saved?.value);
  if (!boardId || !Number.isFinite(value)) return null;

  const events = [];
  for (const event of Array.isArray(saved?.events) ? saved.events : []) {
    const t = Math.trunc(Number(event?.t));
    if (!Number.isFinite(t) || t < 0) continue;
    if (!KINDS.has(event?.k)) continue;
    const v = Number(event?.v);
    events.push({ t, k: event.k, v: Number.isFinite(v) ? v : 0 });
  }
  if (events.length === 0) return null;

  return {
    boardId,
    value: Math.round(value),
    modelId: asString(saved?.modelId),
    trackId: asString(saved?.trackId),
    // Kept so the ghost is drawn in the car that set the time rather than in
    // whatever the player happens to be driving now. It is a handful of numbers,
    // and a ghost wearing your current paint would read as a second copy of you
    // rather than as the run you are chasing.
    livery: saved?.livery ?? null,
    recordedAt: asString(saved?.recordedAt),
    events,
  };
}
