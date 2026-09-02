// The player's preferences, and what happens to a bad one.
//
// Pure except for the two calls into `local-storage.js`. Every field is
// normalized on the way out, which is the whole job: a value read back from
// storage is UNTRUSTED — it may be from an older build that offered a camera
// this one does not, or from a hand-edited devtools session — and a cabinet that
// boots into an undefined camera mode is a cabinet that does not boot.

import { readJson, writeJson } from "./local-storage.js";
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from "../sim/cpu.js";

const KEY = "settings";

/** Aim assistance. `full` draws the ghost ball and the object line; `line` only the cue path. */
export const GUIDE_MODES = Object.freeze(["full", "line", "off"]);
export const CAMERA_MODES = Object.freeze(["aim", "over"]);

export const DEFAULT_SETTINGS = Object.freeze({
  guide: "full",
  camera: "aim",
  difficulty: DEFAULT_DIFFICULTY,
  muted: false,
});

const oneOf = (allowed, value, fallback) => (allowed.includes(value) ? value : fallback);

/** Coerce anything into a usable settings object. Never returns a partial one. */
export function normalizeSettings(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  return {
    guide: oneOf(GUIDE_MODES, input.guide, DEFAULT_SETTINGS.guide),
    camera: oneOf(CAMERA_MODES, input.camera, DEFAULT_SETTINGS.camera),
    difficulty: oneOf(
      DIFFICULTIES.map((rung) => rung.id),
      input.difficulty,
      DEFAULT_SETTINGS.difficulty,
    ),
    muted: Boolean(input.muted),
  };
}

export function loadSettings() {
  return normalizeSettings(readJson(KEY, DEFAULT_SETTINGS));
}

/** Merge a patch over what is stored and persist the result. Returns the new settings. */
export function saveSettings(patch) {
  const next = normalizeSettings({ ...loadSettings(), ...patch });
  writeJson(KEY, next);
  return next;
}
