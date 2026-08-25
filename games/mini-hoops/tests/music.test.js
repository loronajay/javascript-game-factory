import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { MUSIC_GAIN, TRACKS, trackById, trackIds, trackPath, trackPaths } from "../scripts/audio/music-catalog.js";
import { createPlaylist, shuffle } from "../scripts/audio/playlist.js";
import { createMusicPlayer } from "../scripts/audio/music-player.js";

// The soundtrack's two testable halves: the catalog says which files exist, and
// the playlist says what order they are heard in. The element that streams them
// needs a browser, but the rules it obeys — start once, wrap at the end, keep
// your place through a mute — are checked here against a fake element, because
// they are exactly the ones that are tedious to verify by listening.

suite("music — catalog and playlist");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

test("every declared track has a file on disk", () => {
  const missing = trackPaths().filter((relative) => !fs.existsSync(path.join(gameRoot, relative)));
  assertEqual(missing.join(", "), "", "declared tracks with no file");
});

test("every file in the soundtrack folder is declared", () => {
  // The one that matters: a track dropped in and never registered is completely
  // silent about being unused, because the playlist only ever plays the catalog.
  const onDisk = fs
    .readdirSync(path.join(gameRoot, "assets", "sounds", "soundtrack"))
    .filter((name) => name.endsWith(".mp3"));
  const declared = new Set(TRACKS.map((track) => track.file));
  const undeclared = onDisk.filter((name) => !declared.has(name));
  assertEqual(undeclared.join(", "), "", "track files with no catalog row");
});

test("ids and files are unique", () => {
  assertEqual(new Set(trackIds()).size, TRACKS.length, "duplicate track id");
  assertEqual(new Set(TRACKS.map((track) => track.file)).size, TRACKS.length, "duplicate track file");
});

test("every row carries a title, and the music sits under the court", () => {
  for (const track of TRACKS) assert(track.title.length > 0, `${track.id} has no title`);
  assert(MUSIC_GAIN > 0 && MUSIC_GAIN < 0.6, "music should be present but well under the effects");
});

test("an unknown track resolves to nothing rather than throwing", () => {
  assertEqual(trackById("no-such-track"), null);
  assertEqual(trackPath("no-such-track"), null);
});

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

/** A deterministic 0..1 source, so a shuffle can be asserted rather than sampled. */
function sequence(values) {
  let at = 0;
  return () => values[at++ % values.length];
}

test("a shuffle keeps every track exactly once", () => {
  const order = shuffle(trackIds(), sequence([0.7, 0.1, 0.9, 0.4, 0.25]));
  assertEqual(order.length, TRACKS.length);
  assertEqual([...order].sort().join(","), [...trackIds()].sort().join(","), "the shuffle lost or duplicated a track");
});

test("a shuffle does not mutate the order it was handed", () => {
  const ids = trackIds();
  const before = ids.join(",");
  shuffle(ids, sequence([0.5]));
  assertEqual(ids.join(","), before);
});

test("the shuffle can actually reorder", () => {
  // A shuffle that always returns the input is a shuffle with a broken index.
  const order = shuffle(["a", "b", "c", "d", "e"], sequence([0.99, 0.0, 0.99, 0.0]));
  assert(order.join(",") !== "a,b,c,d,e", "the shuffle left everything where it was");
});

test("the playlist wraps to the track it started on, not to a fresh shuffle", () => {
  // This is the whole ordering rule: one random album per boot, played on repeat.
  const playlist = createPlaylist({ ids: trackIds(), random: sequence([0.3, 0.8, 0.15, 0.6, 0.45]) });
  const order = playlist.order();

  const heard = [playlist.current()];
  for (let step = 1; step < order.length; step++) heard.push(playlist.advance());
  assertEqual(heard.join(","), order.join(","), "the first pass should follow the drawn order");

  assertEqual(playlist.advance(), order[0], "the end of the album should wrap to its own first track");
  assertEqual(playlist.advance(), order[1], "and carry on in the same order");
});

test("nothing in the first pass repeats", () => {
  const playlist = createPlaylist({ ids: trackIds(), random: sequence([0.9, 0.2, 0.55, 0.05, 0.7]) });
  const order = playlist.order();
  assertEqual(new Set(order).size, order.length, "a track was heard twice before every track was heard once");
});

test("an empty soundtrack is quiet rather than broken", () => {
  const playlist = createPlaylist({ ids: [] });
  assertEqual(playlist.current(), null);
  assertEqual(playlist.advance(), null);
});

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

suite("music — the player");

/** Just enough of an <audio> element to observe what the player asks of it. */
function fakeAudio() {
  const listeners = new Map();
  const node = {
    src: "",
    error: null,
    volume: 1,
    loop: true,
    preload: "",
    plays: 0,
    pauses: 0,
    addEventListener: (name, fn) => listeners.set(name, fn),
    play: () => {
      node.plays++;
      return Promise.resolve();
    },
    pause: () => {
      node.pauses++;
    },
    emit: (name) => listeners.get(name)?.(),
  };
  return node;
}

/** Install a fake `Audio` constructor for one test, and take it away again. */
function withFakeAudio(run) {
  const node = fakeAudio();
  const previous = globalThis.Audio;
  globalThis.Audio = function Audio() {
    return node;
  };
  try {
    run(node);
  } finally {
    if (previous === undefined) delete globalThis.Audio;
    else globalThis.Audio = previous;
  }
}

test("nothing is created or fetched before the first gesture", () => {
  withFakeAudio((node) => {
    createMusicPlayer();
    assertEqual(node.plays, 0, "music must not start before a gesture");
    assertEqual(node.src, "", "no track should be requested before a gesture");
  });
});

test("the first gesture cues the first track of the order", () => {
  withFakeAudio((node) => {
    const playlist = createPlaylist({ ids: trackIds(), random: sequence([0.4, 0.75, 0.2, 0.6, 0.1]) });
    const music = createMusicPlayer({ playlist });
    music.start();
    assertEqual(node.src, trackPath(playlist.order()[0]));
    assertEqual(node.plays, 1);
    assertEqual(music.currentTrack(), playlist.order()[0]);
  });
});

test("the element never loops itself — the playlist does", () => {
  withFakeAudio((node) => {
    createMusicPlayer().start();
    assertEqual(node.loop, false, "an element left looping would strand the cabinet on one track");
  });
});

test("a finished track hands over to the next one", () => {
  withFakeAudio((node) => {
    const playlist = createPlaylist({ ids: trackIds(), random: sequence([0.65, 0.3, 0.85, 0.5, 0.05]) });
    const music = createMusicPlayer({ playlist });
    music.start();
    node.emit("ended");
    assertEqual(node.src, trackPath(playlist.order()[1]));
    assertEqual(music.currentTrack(), playlist.order()[1]);
  });
});

test("a track that fails to load is skipped rather than sat on", () => {
  withFakeAudio((node) => {
    const playlist = createPlaylist({ ids: trackIds(), random: sequence([0.2, 0.9, 0.35, 0.7, 0.5]) });
    const music = createMusicPlayer({ playlist });
    music.start();
    node.error = { code: 4 };
    node.emit("error");
    assertEqual(music.currentTrack(), playlist.order()[1]);
  });
});

test("an error with no MediaError behind it is not a failed track", () => {
  // Abandoning a load by swapping `src` can raise one of these. Treating it as a
  // failure would quietly skip a track every single time one finished.
  withFakeAudio((node) => {
    const playlist = createPlaylist({ ids: trackIds(), random: sequence([0.45, 0.15, 0.6, 0.9, 0.3]) });
    const music = createMusicPlayer({ playlist });
    music.start();
    node.emit("error");
    assertEqual(music.currentTrack(), playlist.order()[0], "the album should not have moved on");
  });
});

test("muted at boot means no element, no download and no sound", () => {
  withFakeAudio((node) => {
    const music = createMusicPlayer({ muted: true });
    music.start();
    assertEqual(node.plays, 0);
    assertEqual(node.src, "");
    assertEqual(music.currentTrack(), null);
  });
});

test("mute pauses and unmute picks the same track back up", () => {
  withFakeAudio((node) => {
    const playlist = createPlaylist({ ids: trackIds(), random: sequence([0.5, 0.25, 0.8, 0.1, 0.95]) });
    const music = createMusicPlayer({ playlist });
    music.start();
    const cued = node.src;

    music.setMuted(true);
    assertEqual(node.pauses, 1);

    music.setMuted(false);
    assertEqual(node.src, cued, "unmuting must not restart the album");
    assertEqual(node.plays, 2, "unmuting should resume the same track");
  });
});

test("a later gesture resumes rather than restarting the track", () => {
  withFakeAudio((node) => {
    const music = createMusicPlayer();
    music.start();
    const cued = node.src;
    music.start();
    assertEqual(node.src, cued, "a second gesture must not re-cue the track");
    assertEqual(node.plays, 2, "but it should retry playback, in case the first was refused");
  });
});

test("a browser with no Audio constructor is silent, not broken", () => {
  const previous = globalThis.Audio;
  delete globalThis.Audio;
  try {
    const music = createMusicPlayer();
    music.start();
    music.setMuted(true);
    music.setMuted(false);
    assertEqual(music.currentTrack(), null);
  } finally {
    if (previous !== undefined) globalThis.Audio = previous;
  }
});

finish();
