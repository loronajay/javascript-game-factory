// The registry of every sound the cabinet can make.
//
// Pure data plus resolvers. No AudioContext, no DOM, no fetch — which is what
// lets the whole mapping be tested under node while the engine that plays it
// cannot be.
//
// Three things live here that are easy to mistake for engine concerns:
//
// TRIM. Every source file carries a little silence before its transient. On a
// click or a bounce that lead is latency the player feels as sponginess, so each
// row declares the offset into the file where the sound actually starts and the
// engine plays from there. The numbers were measured off each file's amplitude
// envelope, not guessed; re-measure if a file is replaced.
//
// THROTTLE. `minInterval` is the shortest gap between two plays of the same id.
// The floor collider fires once per substep while a ball is rolling, so without
// this a settling ball machine-guns its own bounce sample.
//
// PER-BALL IMPACTS. A snowball must never make the basketball's bounce. Each
// ball owns the sound of its own body hitting things — and, where it has one, a
// release sound. The rim and the backboard are the *apparatus*, so balls ring
// the same metal by default; what changes is how hard and how bright, which is
// what `apparatusGain`/`apparatusRate` carry. A paper wad off the backboard is a
// quiet, higher tap; a snowball is a duller thud.
//
// THE APPARATUS CAN BE OVERRIDDEN, for one reason. A bowling ball hitting a rim
// is not the house rim sample played louder — it is a different event, and it
// has its own recording; so do the meatball and the rubber band ball. So a ball may name its own `rim`
// sample and the shared one steps aside. This is an escape hatch, not the
// pattern: prefer `apparatusGain`/`apparatusRate` unless there is genuinely a
// file. The board, the wall and the ceiling are never overridden — those are the
// ROOM rather than the ball, and every ball rings the same plaster.
//
// THIS FILE STILL CANNOT REACH THE SIM. How a ball SOUNDS lives here; how it
// FLIES lives in `assets/ball-catalog.js`. They are deliberately separate files
// even though a ball has both, because one needs a browser and the other does
// not — and the sim must stay silent and testable under node.

import { DEFAULT_BALL } from "../assets/ball-catalog.js";

/** Where the audio lives, relative to the cabinet root. */
const SOUND_ASSET_ROOT = "assets/sounds";

/**
 * @typedef {object} SoundRow
 * @property {string} id
 * @property {string} file          filename under `assets/sounds/`
 * @property {number} gain          baseline level, 0..1
 * @property {number} offset        seconds of leading silence to skip
 * @property {number} minInterval   seconds before this id may sound again
 * @property {boolean} [ui]         an interface sound rather than a court sound
 *
 * `ui` marks the sounds that silencing the court must NOT cut. Pausing and
 * quitting both stop everything that is ringing — and both are reached by
 * pressing a button, so without this the click of that very button is the first
 * casualty of its own effect.
 */
export const SOUNDS = Object.freeze([
  // --- the shot -----------------------------------------------------------
  Object.freeze({ id: "swish", file: "swish.wav", gain: 0.85, offset: 0, minInterval: 0.1 }),
  Object.freeze({ id: "miss", file: "miss-chime.wav", gain: 0.45, offset: 0, minInterval: 0.15 }),
  Object.freeze({ id: "rim", file: "rim-shake.wav", gain: 0.7, offset: 0, minInterval: 0.09 }),
  Object.freeze({ id: "backboard", file: "backboard-hit.wav", gain: 0.6, offset: 0.03, minInterval: 0.09 }),

  // --- per-ball bodies ----------------------------------------------------
  Object.freeze({ id: "bounce-basketball", file: "basketball-bounce.wav", gain: 0.55, offset: 0.05, minInterval: 0.08 }),
  Object.freeze({ id: "bounce-paper", file: "paper-ball-fall.wav", gain: 0.7, offset: 0.04, minInterval: 0.08 }),
  Object.freeze({ id: "bounce-snowball", file: "snowball-hit.wav", gain: 0.7, offset: 0.03, minInterval: 0.08 }),
  Object.freeze({ id: "bounce-bowling-ball", file: "bowling-ball-drop.wav", gain: 0.8, offset: 0.03, minInterval: 0.1 }),
  // The bowling ball's own rim hit, standing in for the shared `rim` sample
  // rather than colouring it. See the apparatus note at the top of the file.
  Object.freeze({ id: "rim-bowling-ball", file: "bowling-ball-hitting-rim.wav", gain: 0.8, offset: 0.02, minInterval: 0.09 }),
  // The meatball's body. ONE recording serves both its floor impact and its
  // burst, which is what its filename says and is honest rather than lazy: a
  // ball that comes apart on the floor and a ball that comes apart on the wall
  // make the same wet noise, and `splat()` plays the ball's floor sample anyway.
  Object.freeze({ id: "bounce-meatball", file: "meatball-floor-wall-splat.wav", gain: 0.75, offset: 0.08, minInterval: 0.08 }),
  // The meatball's own rim hit — the second ball to bring one. The trim is long
  // because the file opens with two hundred milliseconds of near-silent approach
  // before the contact; the impact is at 0.28s and this puts it 20ms in.
  Object.freeze({ id: "rim-meatball", file: "meatball-hit-rim.wav", gain: 0.85, offset: 0.26, minInterval: 0.09 }),
  // The rubber band ball, which is all contact and nothing else. Both files are
  // its own: a wound ball of elastic hitting anything is a slap and a squeak,
  // and there is no gain or rate that gets there from a leather bounce.
  Object.freeze({ id: "bounce-rubber-band-ball", file: "rubber-ball-bounce.wav", gain: 0.7, offset: 0.06, minInterval: 0.07 }),
  Object.freeze({ id: "rim-rubber-band-ball", file: "rubber-ball-hit-rim.wav", gain: 0.8, offset: 0.08, minInterval: 0.08 }),
  // The magma ball. `magma-ball-collisions.wav` is its BODY — the sound of it
  // arriving anywhere — and it goes through the shared apparatus samples on the
  // rim and the board like every ball that has no recording of its own.
  Object.freeze({ id: "bounce-magma-ball", file: "magma-ball-collisions.wav", gain: 0.75, offset: 0.06, minInterval: 0.09 }),
  Object.freeze({ id: "throw-magma-ball", file: "magma-ball-flight.wav", gain: 0.6, offset: 0.08, minInterval: 0.05 }),
  // The beach ball. Two hundred milliseconds of hollow vinyl, and no rim
  // recording of its own — it rings the shared apparatus quiet and bright,
  // which is what an inflated skin does to a steel hoop.
  Object.freeze({ id: "bounce-beach-ball", file: "beach-ball-collisions.wav", gain: 0.65, offset: 0.06, minInterval: 0.07 }),
  // The sizzle is not an impact. It is what the room hears AFTER one — the fire
  // the magma ball leaves burning where it landed — so it is throttled long,
  // fired by the effect rather than by the collider, and deliberately not the
  // ball's `floor` sound. See `effects/flame-trail.js` and `game-audio.sizzle`.
  Object.freeze({ id: "sizzle-magma-ball", file: "magma-ball-sizzle.wav", gain: 0.5, offset: 0.04, minInterval: 0.7 }),
  Object.freeze({ id: "throw-paper", file: "paper-ball-throw.wav", gain: 0.55, offset: 0.02, minInterval: 0.05 }),

  // --- the round ----------------------------------------------------------
  Object.freeze({ id: "start", file: "start-match.wav", gain: 0.7, offset: 0.06, minInterval: 0.5 }),
  Object.freeze({ id: "countdown", file: "countdown.wav", gain: 0.6, offset: 0, minInterval: 0 }),
  Object.freeze({ id: "buzzer", file: "buzzer.wav", gain: 0.65, offset: 0.04, minInterval: 1 }),

  // --- celebration --------------------------------------------------------
  Object.freeze({ id: "crowd-cheer", file: "crowd-cheer.wav", gain: 0.6, offset: 0.45, minInterval: 3 }),
  Object.freeze({ id: "player-cheer", file: "player-cheer.wav", gain: 0.7, offset: 0.1, minInterval: 3 }),

  // --- interface ----------------------------------------------------------
  Object.freeze({ id: "click", file: "button-click.wav", gain: 0.22, offset: 0.09, minInterval: 0.04, ui: true }),
]);

/**
 * The countdown sample's first beep marks this many seconds remaining, and its
 * beeps sit exactly one second apart, so the final ding lands on zero.
 *
 * This is a measured property of `countdown.wav` (beeps at 0.00 / 1.00 / 2.00 /
 * 3.00), which is why it lives beside the row rather than in `sim/constants.js`:
 * it describes the file, not the game. Replace the file and re-measure.
 */
export const COUNTDOWN_LEAD_SECONDS = 3;

/**
 * How each ball sounds.
 *
 * `floor` is its body hitting the ground, `release` the sound of it leaving the
 * hand (null for balls that do not have one). The apparatus modifiers colour the
 * shared rim/backboard samples; `rim`, where present, replaces the shared rim
 * sample outright for that ball.
 *
 * `land` is the odd one out and is deliberately NOT a contact: it is what the
 * ball leaves behind on a surface it landed on — the magma ball's fire — so it
 * is played by the effect that starts that fire rather than by the collider
 * that reported the bump. A ball with no fire has no `land`.
 */
const BALL_AUDIO = Object.freeze({
  basketball: Object.freeze({ floor: "bounce-basketball", release: null, apparatusGain: 1, apparatusRate: 1 }),
  paper: Object.freeze({ floor: "bounce-paper", release: "throw-paper", apparatusGain: 0.45, apparatusRate: 1.18 }),
  snowball: Object.freeze({ floor: "bounce-snowball", release: null, apparatusGain: 0.7, apparatusRate: 0.88 }),
  // Loud, dark and slow. It also brings its own rim recording — the only ball
  // that does — and rings the backboard hard and low through the shared sample.
  "bowling-ball": Object.freeze({
    floor: "bounce-bowling-ball",
    release: null,
    apparatusGain: 1,
    apparatusRate: 0.72,
    rim: "rim-bowling-ball",
  }),
  // Soft, wet and heavy. It brings its own rim recording for the same reason the
  // bowling ball does — a meatball hitting a hoop is not the steel sample played
  // quieter, it is a different event with a file of its own. On the board, the
  // wall and the ceiling it goes through the shared plaster sample, dulled and
  // pitched down, because those are the ROOM and the room does not change.
  meatball: Object.freeze({
    floor: "bounce-meatball",
    release: null,
    apparatusGain: 0.6,
    apparatusRate: 0.82,
    rim: "rim-meatball",
  }),
  // Elastic. The third and last ball with its own rim recording, and for the
  // same reason as the other two: a wound ball of rubber bands off a steel hoop
  // is a slap and a squeak, which is not the house ring at any gain or rate.
  // The board and the plaster it still shares, pitched up a little because it
  // is the lightest-sounding thing in the roster.
  "rubber-band-ball": Object.freeze({
    floor: "bounce-rubber-band-ball",
    release: null,
    apparatusGain: 0.65,
    apparatusRate: 1.12,
    rim: "rim-rubber-band-ball",
  }),
  // Molten. It has a release sound — the whoosh of something that light and
  // that hot leaving the hand — and it rings the apparatus through the shared
  // samples, because a rim is a rim. What is its own is `land`: the fire it
  // leaves behind, which is a sound the room keeps making after the ball has
  // stopped, and is the one field here that is not a contact.
  "magma-ball": Object.freeze({
    floor: "bounce-magma-ball",
    release: "throw-magma-ball",
    apparatusGain: 0.7,
    apparatusRate: 1.05,
    land: "sizzle-magma-ball",
  }),
  // Hollow and light. The quietest, brightest apparatus in the roster, which is
  // the whole of what an inflated skin does to a rim: it barely rings it.
  "beach-ball": Object.freeze({
    floor: "bounce-beach-ball",
    release: null,
    apparatusGain: 0.4,
    apparatusRate: 1.26,
  }),
});

export function soundIds() {
  return SOUNDS.map((sound) => sound.id);
}

/** Resolve a sound id. Returns null rather than throwing — a missing sound is silence, never a crash. */
export function soundById(id) {
  return SOUNDS.find((sound) => sound.id === id) || null;
}

/** The path a sound is fetched from. */
export function soundPath(id) {
  const sound = soundById(id);
  return sound ? `${SOUND_ASSET_ROOT}/${sound.file}` : null;
}

/** Every path, for warming the cache. */
export function soundPaths() {
  return SOUNDS.map((sound) => `${SOUND_ASSET_ROOT}/${sound.file}`);
}

/**
 * The audio profile for a ball, falling back to the default ball rather than
 * throwing — the same degrade-don't-break rule the ball catalog itself uses.
 */
export function ballAudio(ballId) {
  return BALL_AUDIO[ballId] || BALL_AUDIO[DEFAULT_BALL];
}
