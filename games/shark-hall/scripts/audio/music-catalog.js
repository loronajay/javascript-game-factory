// The soundtrack: which tracks exist, and how loud the music sits.
//
// Same shape as `sound-catalog.js`, and pure for the same reason — data plus
// resolvers, no element, no fetch — so the whole mapping is checked under node
// while the player that streams it cannot be.
//
// IT IS DELIBERATELY SEPARATE FROM THE SOUND CATALOG. An effect and a track are
// not the same kind of thing: an effect is a short WAV decoded whole into memory
// and fired dozens of times a rack, a track is a multi-megabyte MP3 streamed
// once and never overlapped. Sharing one registry would mean the engine's
// `warm()` pulling thirty-four megabytes of music down on the first click.
//
// THE FILENAMES ARE THE TRACK NAMES, and one of them carries an apostrophe.
// That is a legal character in a URL path and browsers fetch it as written, so
// the file is named honestly rather than sanitized — but it is the reason
// `trackPath` returns the raw path and nothing here builds one by hand.

/** Where the music lives, relative to the cabinet root. */
const MUSIC_ASSET_ROOT = "assets/sounds/soundtrack";

/**
 * Level the soundtrack plays at.
 *
 * One number rather than a per-row gain: the tracks were mastered together and
 * sit at the same level, and the only judgement being made here is how far the
 * music ducks under the table. Low, because the clack and the drop are the game
 * and the music is the room it happens in — and lower still than most cabinets
 * would set it, because this one also runs a continuous room tone underneath.
 */
export const MUSIC_GAIN = 0.3;

/**
 * @typedef {object} TrackRow
 * @property {string} id     stable id, used by the playlist
 * @property {string} title  what the track is called, for anything that shows it
 * @property {string} file   filename under `assets/sounds/soundtrack/`
 */
export const TRACKS = Object.freeze([
  Object.freeze({ id: "hustle", title: "Hustle", file: "hustle.mp3" }),
  Object.freeze({
    id: "playing-with-the-big-boys",
    title: "Playing with the Big Boys",
    file: "playing-with-the-big-boys.mp3",
  }),
  Object.freeze({ id: "smells-like-billiards", title: "Smells Like Billiards", file: "smells-like-billiards.mp3" }),
  Object.freeze({ id: "swimmer", title: "Swimmer", file: "swimmer.mp3" }),
  Object.freeze({ id: "unc-at-the-table", title: "Unc at the Table", file: "unc-at-the-table.mp3" }),
  Object.freeze({ id: "whats-clackin", title: "What's Clackin'", file: "what's-clackin.mp3" }),
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
