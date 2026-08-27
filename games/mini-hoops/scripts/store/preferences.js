// What the player picked last time.
//
// Every preference is validated against its catalog on the way OUT, not on the
// way in. Storage is user-writable and survives across versions, so a value that
// was valid when it was written may not name anything that still exists — a
// removed room, a renamed ball. Resolving through the catalogs means a stale
// preference degrades to the default instead of rendering a broken picker.
//
// The timer is remembered PER MODE. Players tend to want 30 seconds on the still
// rim and a minute on the moving ones, and re-picking it every time is friction.

import { DEFAULT_BALL, ballById } from "../assets/ball-catalog.js";
import { DEFAULT_LOCATION, locationById } from "../assets/location-catalog.js";
import { DEFAULT_DURATION, ROUND_DURATIONS } from "../sim/constants.js";
import { DEFAULT_HOOP_MODE, hoopModeById, hoopModeIds } from "../sim/hoop.js";
import { readJSON, resolveStorage, writeJSON } from "./local-storage.js";

const STORAGE_KEY = "miniHoops.preferences.v1";

/**
 * Which thumb shoots.
 *
 * Sideways, the court and the shot panel sit beside each other, so the court
 * cannot be centred and the ball lands about 104px to one side of the screen —
 * which is a whole thumb's worth of reach on a phone. Right-handed is the
 * default because most hands are, and the setting exists because the layout has
 * to pick a side and the wrong side is genuinely uncomfortable to play.
 *
 * It is PRESENTATION ONLY. Nothing under `sim/` reads it, the canvas is drawn
 * identically either way, and a run set left-handed is the same run — which is
 * what keeps one board meaning one thing.
 */
export const SHOOTING_HANDS = ["right", "left"];
export const DEFAULT_SHOOTING_HAND = "right";

/** Coerce a duration to one the game actually offers. */
export function normalizeDuration(value) {
  const number = Number(value);
  return ROUND_DURATIONS.includes(number) ? number : DEFAULT_DURATION;
}

/** Coerce a stored hand to one of the two the layout knows how to draw. */
export function normalizeHand(value) {
  return SHOOTING_HANDS.includes(value) ? value : DEFAULT_SHOOTING_HAND;
}

export function createPreferencesStore({ storage } = {}) {
  const backing = resolveStorage(storage);
  const saved = readJSON(backing, STORAGE_KEY, {});

  // Resolved once through the catalogs, so nothing downstream ever sees a value
  // that does not name a real mode, ball or room.
  const state = {
    modeId: hoopModeById(saved.modeId).id,
    locationId: locationById(saved.locationId).id,
    ballId: ballById(saved.ballId).id,
    durationByMode: normalizeDurationMap(saved.durationByMode),
    // Sound is off only if it was explicitly turned off. A preferences blob
    // written before sound existed has no key here, and must not read as muted.
    muted: saved.muted === true,
    hand: normalizeHand(saved.hand),
  };

  function persist() {
    writeJSON(backing, STORAGE_KEY, state);
  }

  return {
    get modeId() {
      return state.modeId;
    },
    get locationId() {
      return state.locationId;
    },
    get ballId() {
      return state.ballId;
    },
    /** The remembered round length for the current mode. */
    get duration() {
      return state.durationByMode[state.modeId];
    },
    /** Whether the player has silenced the cabinet. Not part of `snapshot()` — a run's sound is not part of its result. */
    get muted() {
      return state.muted;
    },
    /** Which thumb shoots. Layout only — deliberately absent from `snapshot()`. */
    get hand() {
      return state.hand;
    },

    setMode(modeId) {
      state.modeId = hoopModeById(modeId).id;
      persist();
      return state.modeId;
    },
    setLocation(locationId) {
      state.locationId = locationById(locationId).id;
      persist();
      return state.locationId;
    },
    setBall(ballId) {
      state.ballId = ballById(ballId).id;
      persist();
      return state.ballId;
    },
    setMuted(muted) {
      state.muted = Boolean(muted);
      persist();
      return state.muted;
    },
    setHand(hand) {
      state.hand = normalizeHand(hand);
      persist();
      return state.hand;
    },
    /** Set the round length for the mode currently selected. */
    setDuration(duration) {
      state.durationByMode[state.modeId] = normalizeDuration(duration);
      persist();
      return state.durationByMode[state.modeId];
    },

    /** Everything a run needs to be created from. */
    snapshot() {
      return {
        modeId: state.modeId,
        locationId: state.locationId,
        ballId: state.ballId,
        duration: state.durationByMode[state.modeId],
      };
    },
  };
}

/** One validated duration per mode, defaulting anything missing or bogus. */
function normalizeDurationMap(saved) {
  const source = saved && typeof saved === "object" ? saved : {};
  const map = {};
  for (const modeId of hoopModeIds()) {
    map[modeId] = normalizeDuration(source[modeId]);
  }
  return map;
}

export { DEFAULT_BALL, DEFAULT_HOOP_MODE, DEFAULT_LOCATION };
