import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import {
  AUDIO_EXTENSIONS,
  buildPlaylist,
  compareNatural,
  fileExtension,
  folderOf,
  isPlayableAudio,
  makeTrack,
  splitArtist,
  trackTitle,
} from "../scripts/radio/tracks.js";

suite("radio tracks — what counts as music and what it is called");

test("the formats the brief asked for are all playable", () => {
  for (const name of ["song.mp3", "song.wav", "clip.mp4", "clip.m4a", "clip.aac"]) {
    assert(isPlayableAudio(name), `${name} should be playable`);
  }
});

test("non-audio files are left out of the playlist", () => {
  for (const name of ["cover.jpg", "notes.txt", "album.nfo", "video.mkv", "README"]) {
    assert(!isPlayableAudio(name), `${name} should not be playable`);
  }
});

test("the extension check ignores case, which is how Windows writes them", () => {
  assert(isPlayableAudio("SONG.MP3"));
  assertEqual(fileExtension("SONG.MP3"), "mp3");
});

test("a leading dot is a hidden file, not an extension", () => {
  assertEqual(fileExtension(".hidden"), "");
  assert(!isPlayableAudio(".mp3"));
});

test("every listed extension is distinct", () => {
  assertEqual(new Set(AUDIO_EXTENSIONS).size, AUDIO_EXTENSIONS.length);
});

test("track numbers are stripped from the display name in every common shape", () => {
  assertEqual(trackTitle("01 Highway Star.mp3"), "Highway Star");
  assertEqual(trackTitle("01. Highway Star.mp3"), "Highway Star");
  assertEqual(trackTitle("01 - Highway Star.mp3"), "Highway Star");
  assertEqual(trackTitle("01_Highway_Star.mp3"), "Highway Star");
  assertEqual(trackTitle("7) Highway Star.flac"), "Highway Star");
});

test("a title that is itself a number keeps its name", () => {
  // Four digits is longer than any track number, so it survives the strip.
  assertEqual(trackTitle("1979.mp3"), "1979");
});

test("a filename that is only a track number still reads as something", () => {
  // Better a row that says "01" than a row indistinguishable from the next one.
  assertEqual(trackTitle("01.mp3"), "01");
});

test("an artist is taken from the filename only when it offers one", () => {
  assertDeepEqual(splitArtist("Deep Purple - Highway Star"), {
    artist: "Deep Purple",
    title: "Highway Star",
  });
  assertDeepEqual(splitArtist("Highway Star"), { artist: null, title: "Highway Star" });
});

test("only the first separator splits, so a suffixed title keeps its suffix", () => {
  assertDeepEqual(splitArtist("Deep Purple - Highway Star - Live"), {
    artist: "Deep Purple",
    title: "Highway Star - Live",
  });
});

test("a track's folder is everything left of the last slash", () => {
  assertEqual(folderOf("Machine Head/01 Highway Star.mp3"), "Machine Head");
  assertEqual(folderOf("loose.mp3"), "");
});

test("a track's id is its path, so two files with one name do not collide", () => {
  const a = makeTrack({ name: "intro.mp3", path: "album-a/intro.mp3" });
  const b = makeTrack({ name: "intro.mp3", path: "album-b/intro.mp3" });
  assert(a.id !== b.id, "same filename in two albums produced one id");
});

test("ten sorts after two", () => {
  // A plain string sort puts an album's tenth song second, which reads as a bug
  // in the folder rather than as a bug in the sort.
  assert(compareNatural("track2.mp3", "track10.mp3") < 0);
  assert(compareNatural("track10.mp3", "track9.mp3") > 0);
});

test("a folder scan keeps albums together and in order", () => {
  const playlist = buildPlaylist([
    { name: "10 Ten.mp3", path: "b-album/10 Ten.mp3" },
    { name: "02 Two.mp3", path: "b-album/02 Two.mp3" },
    { name: "01 One.mp3", path: "a-album/01 One.mp3" },
    { name: "cover.jpg", path: "a-album/cover.jpg" },
  ]);
  assertDeepEqual(
    playlist.map((track) => track.path),
    ["a-album/01 One.mp3", "b-album/02 Two.mp3", "b-album/10 Ten.mp3"],
  );
});

test("the same file listed twice appears once", () => {
  const playlist = buildPlaylist([
    { name: "one.mp3", path: "one.mp3" },
    { name: "one.mp3", path: "one.mp3" },
  ]);
  assertEqual(playlist.length, 1);
});

test("an empty or junk-only folder produces an empty playlist rather than throwing", () => {
  assertEqual(buildPlaylist([]).length, 0);
  assertEqual(buildPlaylist(undefined).length, 0);
  assertEqual(buildPlaylist([{ name: "cover.jpg", path: "cover.jpg" }, null]).length, 0);
});

finish();
