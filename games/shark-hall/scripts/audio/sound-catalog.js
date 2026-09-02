// The registry of every sound the hall can make.
//
// Pure data plus resolvers. No AudioContext, no DOM, no fetch — which is what
// lets the whole mapping be checked under node while the engine that plays it
// cannot be.
//
// THREE THINGS LIVE HERE that look like engine concerns and are not:
//
// TRIM. Every file carries some silence before its transient, and on a clack or
// a click that lead is latency the player feels as sponginess. Each row declares
// the offset where the sound actually starts and the engine plays from there.
// The numbers below were MEASURED off each file's amplitude envelope at an 8%
// -of-peak threshold, not guessed. Re-measure if a file is replaced.
//
// LEVEL. The source files are not mastered to a common level — `stick-hit` peaks
// at 0.44 and `button-click` at 0.10 — so the gains are not a taste judgement
// alone, they are also normalization. A row's gain is the level the sound sits
// at in the mix AFTER that correction.
//
// THROTTLE. `minInterval` is the shortest gap between two plays of one id. A
// settling cluster reports a contact per substep, and without this a rack coming
// to rest machine-guns its own clack.
//
// THE ROOM IS NOT A SOUND EFFECT. `hall-ambience.mp3` is four hundred kilobytes
// of continuous room tone, so it is streamed by `ambience.js` rather than
// decoded into memory here — the same split, and for the same reason, as the
// soundtrack in `music-catalog.js`.

/** Where the effects live, relative to the cabinet root. */
const SOUND_ASSET_ROOT = "assets/sounds/sfx";

/**
 * @typedef {object} SoundRow
 * @property {string} id
 * @property {string} file          filename under `assets/sounds/sfx/`
 * @property {number} gain          level in the mix, after normalization
 * @property {number} offset        seconds of leading silence to skip
 * @property {number} minInterval   seconds before this id may sound again
 * @property {boolean} [ui]         an interface sound rather than a table sound
 *
 * `ui` marks the sounds that silencing the table must NOT cut. Pausing and
 * quitting both stop everything that is ringing, and both are reached by
 * pressing a button — so without this the click of that very button is the first
 * casualty of its own effect.
 */
export const SOUNDS = Object.freeze([
  // --- the stroke ---------------------------------------------------------
  // The loudest file in the set (peak 0.44) and the one event the player caused
  // directly, so it sits at the top of the mix at unity.
  Object.freeze({ id: "stick-hit", file: "stick-hit.wav", gain: 1, offset: 0.04, minInterval: 0.06 }),

  // --- the table ----------------------------------------------------------
  // One recording serves both ball-on-ball and ball-on-cushion. That is a
  // deliberate reuse, not a gap: a cushion is played back quieter and pitched
  // down (see `game-audio.js`), which is most of what a rail does to a clack,
  // and inventing a second sample by filtering this one in the browser would
  // cost more than it bought. Replace it the day a rail recording exists.
  Object.freeze({ id: "clack", file: "ball-clack.wav", gain: 1, offset: 0.001, minInterval: 0.035 }),

  // --- the pocket ---------------------------------------------------------
  // Two takes, alternated so consecutive pots do not sound like a loop. Their
  // trims differ a lot — 145ms against 66ms — because one file opens with the
  // ball still travelling and the other does not.
  Object.freeze({ id: "hole-fall-1", file: "hole-fall-1.wav", gain: 1, offset: 0.145, minInterval: 0.05 }),
  Object.freeze({ id: "hole-fall-2", file: "hole-fall-2.wav", gain: 0.95, offset: 0.066, minInterval: 0.05 }),

  // --- interface ----------------------------------------------------------
  Object.freeze({ id: "click", file: "button-click.wav", gain: 1.15, offset: 0.004, minInterval: 0.04, ui: true }),
  // The negative. Fouls, scratches and illegal placements — the sound of the
  // table saying no. Marked `ui` because an illegal placement is answered while
  // the player is pressing, and cutting the answer with the press is a bug.
  Object.freeze({ id: "cancel", file: "cancel.wav", gain: 1.6, offset: 0.013, minInterval: 0.2, ui: true }),
]);

/** The two pocket takes, in the order `game-audio.js` alternates them. */
export const POCKET_SOUNDS = Object.freeze(["hole-fall-1", "hole-fall-2"]);

export function soundIds() {
  return SOUNDS.map((sound) => sound.id);
}

/** Resolve a sound id. Null rather than a throw — a missing sound is silence, never a crash. */
export function soundById(id) {
  return SOUNDS.find((sound) => sound.id === id) || null;
}

/** The path a sound is fetched from. */
export function soundPath(id) {
  const sound = soundById(id);
  return sound ? `${SOUND_ASSET_ROOT}/${sound.file}` : null;
}

/** Every path, for warming the cache and for the on-disk check in the tests. */
export function soundPaths() {
  return SOUNDS.map((sound) => `${SOUND_ASSET_ROOT}/${sound.file}`);
}
