// The soundtrack: which tracks exist, and how loud the music sits.
//
// The same shape as `sound-catalog.js` and pure for the same reason — data plus
// resolvers, no element, no fetch — so the whole mapping is checked under node
// while the player that streams it cannot be.
//
// IT IS DELIBERATELY SEPARATE FROM THE SOUND CATALOG. A sound effect and a track
// are not the same kind of thing: an effect is a short WAV decoded whole into
// memory and fired dozens of times a run, a track is a multi-megabyte MP3 that is
// streamed once and never overlaps itself. Sharing one registry would mean the
// engine's `warm()` pulling five songs down on the first button press.

/** Where the music lives, relative to the cabinet root. */
const MUSIC_ASSET_ROOT = "assets/sounds/soundtrack";

/**
 * Level the soundtrack plays at.
 *
 * One number rather than a per-row gain: the five tracks were mastered together
 * and sit at the same level, and the only judgement being made here is how far
 * the music should duck under the court. Low — the ball, the rim and the buzzer
 * are the game, the music is the room it happens in.
 */
export const MUSIC_GAIN = 0.35;

/**
 * @typedef {object} TrackRow
 * @property {string} id     stable id, used by the playlist
 * @property {string} title  what the track is called, for anything that shows it
 * @property {string} file   filename under `assets/sounds/soundtrack/`
 */
export const TRACKS = Object.freeze([
  Object.freeze({ id: "two-fast-4-u", title: "2 Fast 4 U", file: "2-fast-4-u.mp3" }),
  Object.freeze({ id: "courtside-blues", title: "Courtside Blues", file: "courtside-blues.mp3" }),
  Object.freeze({ id: "flow-state", title: "Flow State", file: "flow-state.mp3" }),
  Object.freeze({ id: "hard-knocks", title: "Hard Knocks", file: "hard-knocks.mp3" }),
  Object.freeze({ id: "the-locker-room", title: "The Locker Room", file: "the-locker-room.mp3" }),
]);

export function trackIds() {
  return TRACKS.map((track) => track.id);
}

/** Resolve a track id. Null rather than a throw, like every other lookup in the audio layer. */
export function trackById(id) {
  return TRACKS.find((track) => track.id === id) || null;
}

/** The path a track is streamed from. */
export function trackPath(id) {
  const track = trackById(id);
  return track ? `${MUSIC_ASSET_ROOT}/${track.file}` : null;
}

/** Every path, for the on-disk check in the tests. */
export function trackPaths() {
  return TRACKS.map((track) => `${MUSIC_ASSET_ROOT}/${track.file}`);
}
