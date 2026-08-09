// What a personal best is, and what makes one run better than another.
//
// PURE. No DOM, no storage, no network — `records-store.js` is the only module
// in here allowed any of that, exactly as `garage-store.js` is for the garage.
// That split is what lets every rule below be tested without a browser.
//
// ## A board is a mode and an objective, and nothing else
//
// `distance:quarter`, `time-attack:sprint`. Deliberately **not** per track and
// deliberately **not** per car:
//
//   - The five tracks are the same road. `ui/track-layout.js` keeps the painted
//     geometry in one shared `ROAD` — lane centres, edges, the divider — and
//     only the dash rhythm and the scenery differ. Nothing about a track reaches
//     the sim, so a quarter mile on the coast and one in the desert are the same
//     run in different weather. Splitting them would be five boards competing
//     for one time.
//   - The roster is cosmetic-only, so every model performs identically. Per-car
//     boards today would be 24 copies of one ladder. If real stat differences
//     ever land, the board id gains a class segment and every existing id keeps
//     meaning exactly what it meant.
//
// The track and the model are still *recorded* on a run, because a board row
// saying which car set the time is worth having even when it does not divide the
// competition. They are metadata, not identity.
//
// ## The board ids here and the server's registry are one list
//
// `platform-api/src/services/leaderboard-catalog.mts` holds the same seven ids,
// their directions and their plausibility bounds. The two are duplicated across
// a repo boundary rather than shared for the same reason `speed-demon-catalog`
// duplicates the livery limits: the projects do not import from each other. A
// board id is stored on every record row on every account — **renaming one
// orphans every time set on it**, the same rule the model ids follow.

import { MODE_DISTANCE, MODE_RIVAL, MODE_TIME_ATTACK, OBJECTIVE_TIME, boardModeId, modeById, objectiveOption } from "../sim/modes.js";

/**
 * The states a global board's data can be in.
 *
 * They live here, in the pure rules module, for the reason
 * `radio/library-status.js` holds the library's five: the fetch layer sets them
 * and the screen reads them, and a second copy on either side is how a status
 * the display cannot name gets returned. `records-store.js` and `ui/boards.js`
 * both import from here.
 *
 * `BOARD_OFFLINE` is *not* "signed out" — the board reads are public, so a
 * signed-out player still sees the global board. It means the platform API is
 * not configured or not reachable at all, which is a different sentence.
 */
export const BOARD_IDLE = "idle";
export const BOARD_LOADING = "loading";
export const BOARD_READY = "ready";
export const BOARD_EMPTY = "empty";
export const BOARD_ERROR = "error";
export const BOARD_OFFLINE = "offline";

/** Lower is better (a time); higher is better (a distance). */
export const BETTER_LOWER = "lower";
export const BETTER_HIGHER = "higher";

/**
 * The unit a value is stored in. Integers, so two equal runs compare equal — a
 * leaderboard tiebreak on a float is a coin toss.
 */
export const UNIT_MS = "ms";
export const UNIT_CM = "cm";

/**
 * Modes that keep records. Online is absent by design: an online race belongs to
 * the room — its distance and its strip are the host's choice, and its result is
 * a match rather than a time. Ranked will have its own ladder (ELO), not a board
 * here.
 */
const RECORDED_MODES = new Set([MODE_DISTANCE, MODE_TIME_ATTACK, MODE_RIVAL]);

/**
 * The board a mode + objective pair records to, or null when the pair keeps no
 * record. Returning null rather than throwing is deliberate: the composition
 * root asks this on every finished run, including online ones, and "this run
 * does not go on a board" is a normal answer.
 *
 * **The id is built from the board's mode, not the run's.** Rival Race files to
 * the distance boards because it is a distance race with company — the other car
 * is in the other lane and there is no lateral axis in the sim for it to reach
 * across. So a quarter mile driven against Redline lands on `distance:quarter`,
 * the id it has always had, and no stored row anywhere changes meaning.
 */
export function boardIdFor(modeId, objectiveId) {
  if (!RECORDED_MODES.has(modeId)) return null;
  const mode = modeById(modeId);
  if (!mode) return null;
  // Resolved through the catalog rather than trusting the id, so a stale
  // selection lands on the mode's default instead of inventing a board.
  return `${boardModeId(modeId)}:${objectiveOption(mode, objectiveId).id}`;
}

/** Whether a board is measured in time or in distance. */
export function boardDirection(modeId) {
  const mode = modeById(modeId);
  return mode?.objective.kind === OBJECTIVE_TIME ? BETTER_HIGHER : BETTER_LOWER;
}

export function boardUnit(modeId) {
  const mode = modeById(modeId);
  return mode?.objective.kind === OBJECTIVE_TIME ? UNIT_CM : UNIT_MS;
}

/**
 * A finite number, or NaN. `Number()` alone is not enough anywhere in this file:
 * `Number(null)` is 0 and `Number("")` is 0, and 0 is a *legal* value on a time
 * attack board — a run that never moved covered no distance. So an unset field
 * coerced through `Number` reads as a real, achievable result rather than as
 * missing data. That is how an unfinished race gets a record, an empty saved
 * field survives normalization, and "no best yet" prints as `0.000s`.
 */
function toNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  return Number(value);
}

/**
 * What a finished race scored, in its board's integer unit — or null if the run
 * did not produce a result.
 *
 * A distance race reports `finishTime`, which is interpolated across the tick
 * that crossed the line rather than snapped to a tick boundary; rounding to the
 * millisecond keeps that precision while making the value exactly comparable. A
 * time attack reports how far it got, to the centimetre.
 *
 * A run abandoned before the line has no `finishTime` and scores nothing. A
 * *fouled* run does score: a red light is a slow run, not a void one, and the
 * bog is already the whole penalty.
 */
export function runValue(race) {
  if (!race) return null;
  if (race.timeLimitSeconds !== null) {
    const metres = toNumber(race.vehicle?.distance);
    return Number.isFinite(metres) ? Math.round(metres * 100) : null;
  }
  const seconds = toNumber(race.finishTime);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

/**
 * Whether `candidate` beats `current` on a board with this direction. A tie is
 * NOT an improvement — equal runs keep the earlier one, which is what makes the
 * date on a record mean "when this was achieved" rather than "when it was last
 * re-driven". The server holds the same rule; both have to, because either can
 * be the one deciding.
 */
export function isBetter(direction, candidate, current) {
  if (!Number.isFinite(candidate)) return false;
  if (!Number.isFinite(current)) return true; // nothing to beat
  return direction === BETTER_LOWER ? candidate < current : candidate > current;
}

/** A record, normalized. Unknown or malformed fields fall back rather than throw. */
export function createRecord(saved = {}) {
  const value = toNumber(saved.value);
  return {
    boardId: typeof saved.boardId === "string" ? saved.boardId : "",
    value: Number.isFinite(value) ? Math.round(value) : null,
    modelId: typeof saved.modelId === "string" ? saved.modelId : "",
    trackId: typeof saved.trackId === "string" ? saved.trackId : "",
    // False until the server's replay pass has reproduced the value from the
    // run's input log. A locally-held record is never verified — it has not
    // been anywhere that could check it.
    verified: saved.verified === true,
    recordedAt: typeof saved.recordedAt === "string" ? saved.recordedAt : "",
  };
}

/**
 * The whole set of a player's bests, keyed by board. A plain object rather than
 * a Map so it serializes straight into the cache and the wire payload.
 */
export function createRecords(saved = null) {
  const source = saved && typeof saved === "object" ? saved : {};
  const byBoard = {};
  for (const [boardId, record] of Object.entries(source)) {
    const normalized = createRecord({ ...record, boardId });
    if (normalized.value !== null) byBoard[boardId] = normalized;
  }
  return byBoard;
}

export function recordFor(records, boardId) {
  return (boardId && records?.[boardId]) || null;
}

/**
 * Applies a run to the set, keeping it only if it beats what is there.
 *
 * Returns `{ records, improved, previous }` — the *previous* record travels back
 * because the results screen wants to say what was beaten, and after the write
 * there is no way to ask. `improved: false` returns the same object identity, so
 * a caller can skip a save without comparing contents.
 */
export function applyRun(records, { boardId, direction, value, modelId = "", trackId = "", recordedAt = "" }) {
  const previous = recordFor(records, boardId);
  if (!boardId || !Number.isFinite(value)) return { records, improved: false, previous };
  if (!isBetter(direction, value, previous ? previous.value : NaN)) {
    return { records, improved: false, previous };
  }
  return {
    records: {
      ...records,
      [boardId]: createRecord({ boardId, value, modelId, trackId, recordedAt, verified: false }),
    },
    improved: true,
    previous,
  };
}

/**
 * A value as it reads on screen, in its board's own unit. The one formatter, so
 * the results panel, the setup screen's target and any later board view cannot
 * disagree about what 11924 means.
 */
export function formatValue(unit, value) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return "—";
  return unit === UNIT_CM ? `${(number / 100).toFixed(1)} m` : `${(number / 1000).toFixed(3)}s`;
}

/**
 * The gap between a run and the record it was measured against, already signed
 * for reading: negative is an improvement whichever way the board runs, because
 * "-0.34s" and "-12.0 m" both have to mean "better than before". Null when there
 * was nothing to compare against.
 */
export function formatDelta(unit, direction, value, previousValue) {
  if (!Number.isFinite(value) || !Number.isFinite(previousValue)) return null;
  const raw = direction === BETTER_LOWER ? value - previousValue : previousValue - value;
  const sign = raw > 0 ? "+" : raw < 0 ? "-" : "";
  return `${sign}${formatValue(unit, Math.abs(raw))}`;
}

/** Tones a results line can carry. The renderer maps these to colours. */
export const TONE_RECORD = "record";
export const TONE_NEUTRAL = "neutral";

/**
 * The one line the results panel prints about a run, or null when there is
 * nothing to say — an online race, or a run that never reached the line.
 *
 * Shaped here rather than in the renderer for the same reason `setupView` shapes
 * the setup screen: deciding what a run *was* is a rule, and a rule belongs
 * somewhere a test can reach without a canvas.
 *
 * `ranked` is the sign-in state, and it only ever adds a suffix. A player who is
 * signed out still beat their own time, and saying so is the truth; what they
 * did not do is put it on a board, which is a different sentence.
 */
export function runSummary({ modeId, result, ranked = false } = {}) {
  if (!result || !result.record) return null;
  const unit = boardUnit(modeId);
  const direction = boardDirection(modeId);
  const previous = result.previous ? result.previous.value : NaN;

  if (result.improved) {
    const delta = formatDelta(unit, direction, result.record.value, previous);
    return {
      // A first-ever run on a board is not "an improvement of nothing" — there
      // was no record, so the honest word is that one now exists.
      label: Number.isFinite(previous) ? "NEW PERSONAL BEST" : "FIRST RECORD SET",
      detail: delta ?? formatValue(unit, result.record.value),
      tone: TONE_RECORD,
      // Not "unranked" — the run is kept either way. This is the *board* half.
      note: ranked ? "" : "SIGN IN TO RANK IT",
    };
  }

  return {
    label: "PERSONAL BEST",
    detail: formatValue(unit, result.record.value),
    tone: TONE_NEUTRAL,
    note: "",
  };
}

export { MODE_DISTANCE, MODE_TIME_ATTACK };
