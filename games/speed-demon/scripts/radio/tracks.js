// Turning files on disk into playlist entries.
//
// PURE. No DOM, no File objects, no browser APIs — this takes plain records
// (`{ name, path, size }`) and returns plain records, which is what lets the
// whole naming/ordering layer be tested without a folder to point at. The
// browser half — actually opening a directory and reading bytes out of it —
// lives in `library.js` and calls into here.
//
// The split matters because "which files count as music" and "what does this
// file want to be called on the display" are rules, and rules belong somewhere
// a test can reach.

/**
 * What the cabinet will try to play. Kept deliberately wide: the player chose
 * this folder, so the honest failure is a track that skips itself when the
 * browser cannot decode it, not a track hidden from the list because the
 * container was unfashionable.
 *
 * `mp4` is here because the brief asked for it — an .mp4 with only an audio
 * stream plays through an <audio> element exactly like an .m4a does.
 */
export const AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "mp4",
  "m4a",
  "m4b",
  "aac",
  "ogg",
  "oga",
  "opus",
  "flac",
  "webm",
  "weba",
  "mka",
];

const EXTENSIONS = new Set(AUDIO_EXTENSIONS);

/** Lowercase extension without the dot, or "" for a name that has none. */
export function fileExtension(name) {
  const dot = String(name ?? "").lastIndexOf(".");
  return dot <= 0 ? "" : String(name).slice(dot + 1).toLowerCase();
}

export function isPlayableAudio(name) {
  return EXTENSIONS.has(fileExtension(name));
}

/**
 * Leading track numbers, as they actually turn up in ripped folders:
 * `01 Song`, `01. Song`, `01 - Song`, `01_Song`, `1) Song`.
 *
 * Bounded to three digits so a song genuinely called "1979" keeps its name.
 */
const LEADING_TRACK_NUMBER = /^\d{1,3}\s*[-._)\]]?\s+|^\d{1,3}[-._)\]]\s*/;

/**
 * The name to put on the display. Falls back to the bare filename rather than
 * to an empty string: a track called "01.mp3" should read as "01", not as a
 * blank row the player cannot tell apart from the next blank row.
 */
export function trackTitle(name) {
  const raw = String(name ?? "");
  const dot = raw.lastIndexOf(".");
  const stem = dot > 0 ? raw.slice(0, dot) : raw;

  const cleaned = stem
    .replace(LEADING_TRACK_NUMBER, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || stem.trim() || raw;
}

/**
 * "Artist - Title" split, when the filename offers one. Only the *first*
 * separator counts, so "Band - Song - Live" keeps "Song - Live" as the title
 * rather than losing the suffix.
 */
export function splitArtist(title) {
  const match = /^(.{1,60}?)\s+[-–—]\s+(.+)$/.exec(title);
  if (!match) {
    return { artist: null, title };
  }
  return { artist: match[1].trim(), title: match[2].trim() };
}

/** Everything left of the last slash — the sub-folder a track came from. */
export function folderOf(path) {
  const slash = String(path ?? "").lastIndexOf("/");
  return slash <= 0 ? "" : String(path).slice(0, slash);
}

/**
 * One playlist entry.
 *
 * `id` is the path, because the path is what identifies a file across a
 * re-scan of the same folder — which is what a "resume where I was" would key
 * off, and what stops two songs with the same filename in different albums
 * from colliding.
 */
export function makeTrack({ name, path, size = 0 }) {
  const fileName = String(name ?? "");
  const fullPath = String(path ?? fileName);
  const { artist, title } = splitArtist(trackTitle(fileName));
  return {
    id: fullPath,
    name: fileName,
    path: fullPath,
    folder: folderOf(fullPath),
    extension: fileExtension(fileName),
    size,
    artist,
    title,
  };
}

const chunks = (value) => String(value).toLowerCase().match(/\d+|\D+/g) ?? [];

/**
 * Natural ordering, so `track2` sorts before `track10`. A plain string sort
 * puts an album's tenth song second, which reads as a bug in the folder rather
 * than in the sort.
 */
export function compareNatural(a, b) {
  const left = chunks(a);
  const right = chunks(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const x = left[i];
    const y = right[i];
    if (x === y) {
      continue;
    }
    const bothNumeric = /^\d/.test(x) && /^\d/.test(y);
    if (bothNumeric) {
      const difference = Number(x) - Number(y);
      if (difference !== 0) {
        return difference;
      }
      continue;
    }
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

/** Folder first, then filename — so albums stay together and in order. */
export function compareTracks(a, b) {
  const byFolder = compareNatural(a.folder, b.folder);
  return byFolder !== 0 ? byFolder : compareNatural(a.name, b.name);
}

/**
 * The playlist a folder scan produces: non-audio dropped, duplicates by path
 * dropped, everything else sorted into listening order.
 */
export function buildPlaylist(files) {
  const seen = new Set();
  const tracks = [];
  for (const file of files ?? []) {
    if (!file || !isPlayableAudio(file.name)) {
      continue;
    }
    const track = makeTrack(file);
    if (seen.has(track.id)) {
      continue;
    }
    seen.add(track.id);
    tracks.push(track);
  }
  return tracks.sort(compareTracks);
}
