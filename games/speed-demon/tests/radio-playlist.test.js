import { suite, test, assert, assertEqual, assertDeepEqual, assertClose, finish } from "./harness.js";

import {
  DEFAULT_VOLUME,
  LOOP_ALL,
  LOOP_MODES,
  LOOP_OFF,
  LOOP_ONE,
  VOLUME_STEP,
  adjustVolume,
  createRadio,
  cycleLoop,
  moveCursor,
  nextTrack,
  nowPlaying,
  playCursor,
  playPause,
  previousTrack,
  restartTrack,
  selectTrack,
  setTracks,
  setVolume,
  stopPlayback,
  trackCount,
  trackEnded,
  trackFailed,
} from "../scripts/radio/playlist.js";

suite("radio playlist — the transport");

const listOf = (count) =>
  Array.from({ length: count }, (_, i) => ({ id: `t${i}`, title: `Track ${i}`, artist: null }));

const three = () => createRadio({ tracks: listOf(3) });

test("an empty folder loads nothing and stays silent", () => {
  const radio = createRadio();
  assertEqual(radio.index, -1);
  assertEqual(radio.playing, false);
  assertEqual(nowPlaying(radio), null);
  assertEqual(trackCount(radio), 0);
});

test("every transport button is inert with no tracks, rather than throwing", () => {
  const empty = createRadio();
  for (const operation of [playPause, nextTrack, previousTrack, restartTrack, trackEnded]) {
    assertEqual(operation(empty).index, -1, `${operation.name} moved an empty deck`);
  }
});

test("a folder loads on its first track, ready to go", () => {
  const radio = three();
  assertEqual(radio.index, 0);
  assertEqual(nowPlaying(radio).id, "t0");
});

test("play/pause toggles and nothing else", () => {
  const playing = playPause(three());
  assertEqual(playing.playing, true);
  assertEqual(playing.index, 0);
  assertEqual(playPause(playing).playing, false);
});

// --- skipping ---------------------------------------------------------------

test("skip walks the folder", () => {
  const radio = nextTrack(three());
  assertEqual(radio.index, 1);
  assertEqual(nextTrack(radio).index, 2);
});

test("a manual skip wraps in both directions whatever the repeat mode says", () => {
  // A car stereo's SKIP button wraps; the repeat mode governs what happens when
  // a track *ends*, which is a different question. Conflating them means the
  // last track in a folder swallows a button press.
  const off = createRadio({ tracks: listOf(3), loop: LOOP_OFF });
  assertEqual(nextTrack(nextTrack(nextTrack(off))).index, 0, "skip should have wrapped forward");
  assertEqual(previousTrack(off).index, 2, "skip should have wrapped backward");
});

test("skipping starts the track playing", () => {
  assertEqual(nextTrack(three()).playing, true);
  assertEqual(previousTrack(three()).playing, true);
});

test("restart asks the deck to seek without changing track", () => {
  const radio = nextTrack(three());
  const restarted = restartTrack(radio);
  assertEqual(restarted.index, radio.index, "restart changed track");
  assert(restarted.seekToken > radio.seekToken, "restart did not ask for a seek");
});

test("restart un-pauses, because RESTART is a play instruction", () => {
  const paused = { ...three(), playing: false };
  assertEqual(restartTrack(paused).playing, true);
});

test("re-selecting the track already playing restarts it", () => {
  // The same operation as RESTART, which is the point of carrying the seek as a
  // token rather than as a separate flag.
  const radio = three();
  const again = selectTrack(radio, 0);
  assertEqual(again.index, 0);
  assert(again.seekToken > radio.seekToken);
});

// --- repeat -----------------------------------------------------------------

test("the repeat button cycles the three modes and comes back round", () => {
  let radio = createRadio({ tracks: listOf(2), loop: LOOP_MODES[0] });
  const seen = [];
  for (let i = 0; i < LOOP_MODES.length; i += 1) {
    seen.push(radio.loop);
    radio = cycleLoop(radio);
  }
  assertDeepEqual(seen, LOOP_MODES);
  assertEqual(radio.loop, LOOP_MODES[0]);
});

test("repeat-one plays the same track again from the top", () => {
  const radio = { ...createRadio({ tracks: listOf(3), loop: LOOP_ONE }), index: 1, playing: true };
  const next = trackEnded(radio);
  assertEqual(next.index, 1);
  assertEqual(next.playing, true);
  assert(next.seekToken > radio.seekToken, "repeat-one did not rewind the track");
});

test("repeat-all wraps past the end of the folder", () => {
  const radio = { ...createRadio({ tracks: listOf(3), loop: LOOP_ALL }), index: 2, playing: true };
  const next = trackEnded(radio);
  assertEqual(next.index, 0);
  assertEqual(next.playing, true);
});

test("repeat-off stops at the end of the folder but not before it", () => {
  const radio = createRadio({ tracks: listOf(3), loop: LOOP_OFF });
  assertEqual(trackEnded({ ...radio, index: 0, playing: true }).index, 1, "stopped early");
  const done = trackEnded({ ...radio, index: 2, playing: true });
  assertEqual(done.playing, false);
  assertEqual(done.index, 2, "the deck should stay on the last track it played");
});

test("an unplayable track never repeats itself, whatever the repeat mode", () => {
  // Repeat-one on a file the browser cannot decode would spin on the same
  // failure forever.
  const radio = { ...createRadio({ tracks: listOf(3), loop: LOOP_ONE }), index: 1, playing: true };
  assertEqual(trackFailed(radio).index, 2);
});

test("an unplayable lone track stops rather than retrying", () => {
  const radio = { ...createRadio({ tracks: listOf(1) }), playing: true };
  assertEqual(trackFailed(radio).playing, false);
});

// --- volume -----------------------------------------------------------------

test("volume clamps at both ends", () => {
  const radio = three();
  assertEqual(setVolume(radio, 5).volume, 1);
  assertEqual(setVolume(radio, -5).volume, 0);
});

test("volume steps land on clean values however many times they are pressed", () => {
  // Floating-point drift here shows up as "37.00000000000001%" on the display.
  let radio = setVolume(three(), 0);
  for (let i = 0; i < 7; i += 1) {
    radio = adjustVolume(radio, VOLUME_STEP);
  }
  assertClose(radio.volume, 7 * VOLUME_STEP, 1e-9);
  assertEqual(Math.round(radio.volume * 100), 35);
  // Exactly, not approximately: this is the value that gets written to storage.
  assertEqual(JSON.stringify(radio.volume), "0.35");
});

test("no sequence of volume presses leaves a value storage would render ugly", () => {
  let radio = setVolume(three(), 0);
  for (let i = 0; i < 20; i += 1) {
    radio = adjustVolume(radio, VOLUME_STEP);
    assert(JSON.stringify(radio.volume).length <= 5, `volume serialised as ${JSON.stringify(radio.volume)}`);
  }
  for (let i = 0; i < 25; i += 1) {
    radio = adjustVolume(radio, -VOLUME_STEP);
    assert(JSON.stringify(radio.volume).length <= 5, `volume serialised as ${JSON.stringify(radio.volume)}`);
  }
  assertEqual(radio.volume, 0);
});

test("the default volume is somewhere you can hear the engine over", () => {
  assert(DEFAULT_VOLUME > 0 && DEFAULT_VOLUME < 1);
});

// --- the browse cursor ------------------------------------------------------

test("moving the cursor does not change what is playing", () => {
  // Movement selects, ENTER commits — the same separation the setup screen makes.
  const radio = moveCursor(moveCursor(three(), "down"), "down");
  assertEqual(radio.cursor, 2);
  assertEqual(radio.index, 0, "browsing changed the track in the deck");
});

test("the cursor stops at both ends rather than wrapping", () => {
  // With a folder of a few hundred tracks, a cursor that jumps end to end is a
  // cursor you have lost.
  const radio = three();
  assertEqual(moveCursor(radio, "up").cursor, 0);
  assertEqual(moveCursor({ ...radio, cursor: 2 }, "down").cursor, 2);
});

test("left and right jump ten, clamped to the folder", () => {
  const radio = createRadio({ tracks: listOf(40) });
  assertEqual(moveCursor(radio, "right").cursor, 10);
  assertEqual(moveCursor({ ...radio, cursor: 35 }, "right").cursor, 39);
  assertEqual(moveCursor({ ...radio, cursor: 4 }, "left").cursor, 0);
});

test("ENTER plays the row the cursor is on", () => {
  const radio = playCursor(moveCursor(three(), "down"));
  assertEqual(radio.index, 1);
  assertEqual(radio.playing, true);
});

test("selecting a track pulls the cursor with it, so the list follows the deck", () => {
  assertEqual(nextTrack(three()).cursor, 1);
});

// --- changing folder --------------------------------------------------------

test("a new folder resets the deck but keeps the stereo's own settings", () => {
  const radio = cycleLoop(setVolume({ ...nextTrack(three()) }, 0.3));
  const swapped = setTracks(radio, listOf(2));
  assertEqual(swapped.index, 0);
  assertEqual(swapped.cursor, 0);
  assertEqual(swapped.volume, 0.3, "volume is a setting about the stereo, not the folder");
  assertEqual(swapped.loop, radio.loop, "repeat mode is a setting about the stereo, not the folder");
});

test("an empty folder leaves the deck stopped with nothing loaded", () => {
  const swapped = setTracks(nextTrack(three()), []);
  assertEqual(swapped.index, -1);
  assertEqual(swapped.playing, false);
});

test("stopping silences the deck without moving it", () => {
  const radio = { ...nextTrack(three()) };
  const stopped = stopPlayback(radio);
  assertEqual(stopped.playing, false);
  assertEqual(stopped.index, radio.index);
});

test("every operation returns a new state rather than editing the old one", () => {
  const radio = three();
  const before = JSON.stringify(radio);
  nextTrack(radio);
  playPause(radio);
  cycleLoop(radio);
  moveCursor(radio, "down");
  assertEqual(JSON.stringify(radio), before, "an operation mutated the radio in place");
});

finish();
