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
import { DEFAULT_THEME, themeById } from "../assets/theme-catalog.js";
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

/**
 * How much the cabinet moves on its own.
 *
 * `full` is the title screen drifting and leaning toward the pointer, the
 * marquee bulbs flickering, and the streak card licking. `calm` stops all of it.
 *
 * This is a SECOND route to the same place `prefers-reduced-motion` reaches, not
 * an override of it: the OS setting still wins outright, because a player who
 * has asked their whole machine to stop moving has already answered. What this
 * adds is the player who has not set that flag and still does not want a menu
 * that breathes — see the note in `styles/menu.css`.
 *
 * PRESENTATION ONLY, like the hand. Nothing under `sim/` is told, and it is
 * absent from `snapshot()`.
 */
export const MOTION_LEVELS = ["full", "calm"];
export const DEFAULT_MOTION = "full";

/** Coerce a duration to one the game actually offers. */
export function normalizeDuration(value) {
  const number = Number(value);
  return ROUND_DURATIONS.includes(number) ? number : DEFAULT_DURATION;
}

/** Coerce a stored hand to one of the two the layout knows how to draw. */
export function normalizeHand(value) {
  return SHOOTING_HANDS.includes(value) ? value : DEFAULT_SHOOTING_HAND;
}

/** Coerce a stored motion level to one the stylesheet has a rule for. */
export function normalizeMotion(value) {
  return MOTION_LEVELS.includes(value) ? value : DEFAULT_MOTION;
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
    // Resolved through the catalog like the room and the ball, so a theme that
    // has since been renamed or dropped degrades to the default rather than
    // leaving the cabinet dressed in nothing at all.
    themeId: themeById(saved.themeId).id,
    motion: normalizeMotion(saved.motion),
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
    /** How the cabinet is dressed. Chrome only — deliberately absent from `snapshot()`. */
    get themeId() {
      return state.themeId;
    },
    /** How much the cabinet moves on its own. Chrome only, and absent from `snapshot()`. */
    get motion() {
      return state.motion;
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
    setTheme(themeId) {
      state.themeId = themeById(themeId).id;
      persist();
      return state.themeId;
    },
    setMotion(motion) {
      state.motion = normalizeMotion(motion);
      persist();
      return state.motion;
    },
    /** Set the round length for the mode currently selected. */
    setDuration(duration) {
      state.durationByMode[state.modeId] = normalizeDuration(duration);
      persist();
      return state.durationByMode[state.modeId];
    },

    /**
     * Everything a run needs to be created from.
     *
     * The cosmetic settings — mute, hand, theme, motion — are all deliberately
     * missing from here. A run set in Arcade with the court on the left is the
     * same run as one set in Hardwood with it on the right, and one board has to
     * keep meaning one thing. `tests/store.test.js` walks this shape.
     */
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

export { DEFAULT_BALL, DEFAULT_HOOP_MODE, DEFAULT_LOCATION, DEFAULT_THEME };
