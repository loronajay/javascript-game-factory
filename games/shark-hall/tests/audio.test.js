// The audio registries, and the one thing about them that actually breaks:
// a row that names a file which is not there.
//
// The engine and the players cannot be tested under node — there is no Web Audio
// and no <audio> — which is exactly why the catalogs were split out as pure data
// in the first place. What CAN be checked is every mapping, and the on-disk
// check below is the one that catches the real-world failure: a renamed asset
// silently becoming a sound that never plays.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, assertEqual, finish, suite, test } from "./harness.js";
import { POCKET_SOUNDS, SOUNDS, soundById, soundIds, soundPath, soundPaths } from "../scripts/audio/sound-catalog.js";
import { MUSIC_GAIN, TRACKS, trackById, trackIds, trackPath, trackPaths } from "../scripts/audio/music-catalog.js";
import { AMBIENCE_GAIN } from "../scripts/audio/ambience.js";
import { createPlaylist, shuffle } from "../scripts/audio/playlist.js";

suite("audio — catalogs and the playlist");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const onDisk = (relative) => fs.existsSync(path.join(gameRoot, relative));

// --- sound effects ---------------------------------------------------------

test("every sound file named in the catalog is on disk", () => {
  for (const relative of soundPaths()) assert(onDisk(relative), `missing sound file: ${relative}`);
});

test("sound ids are unique", () => {
  assertEqual(new Set(soundIds()).size, SOUNDS.length);
});

test("every row carries a level, a trim and a throttle", () => {
  for (const sound of SOUNDS) {
    assert(sound.gain > 0, `${sound.id} would be silent`);
    assert(sound.offset >= 0, `${sound.id} has a negative trim`);
    assert(sound.minInterval >= 0, `${sound.id} has a negative throttle`);
  }
});

test("an unknown sound resolves to null rather than throwing", () => {
  assertEqual(soundById("no-such-sound"), null);
  assertEqual(soundPath("no-such-sound"), null);
});

test("both pocket takes exist in the catalog", () => {
  for (const id of POCKET_SOUNDS) assert(soundById(id), `pocket take ${id} is not a real sound`);
  assert(POCKET_SOUNDS.length >= 2, "alternating needs at least two takes");
});

test("the interface sounds are the ones marked ui", () => {
  // The `ui` flag is what spares a sound from `stopAll`. Getting it wrong on a
  // table sound means a pause that leaves a clack ringing; getting it wrong on a
  // button means the button silences its own click.
  const ui = SOUNDS.filter((sound) => sound.ui).map((sound) => sound.id).sort();
  assertEqual(ui.join(","), "cancel,click");
});

test("the room tone is streamed, not decoded — it is not in the effects catalog", () => {
  assertEqual(soundById("hall-ambience"), null, "a 400KB loop must not go through the buffer engine");
  assert(onDisk("assets/sounds/sfx/hall-ambience.mp3"), "but the file itself must exist");
});

// --- music -----------------------------------------------------------------

test("every track named in the catalog is on disk", () => {
  for (const relative of trackPaths()) assert(onDisk(relative), `missing track: ${relative}`);
});

test("track ids are unique and every track has a title", () => {
  assertEqual(new Set(trackIds()).size, TRACKS.length);
  for (const track of TRACKS) assert(track.title && track.title.length > 0, `${track.id} has no title`);
});

test("an unknown track resolves to null", () => {
  assertEqual(trackById("no-such-track"), null);
  assertEqual(trackPath("no-such-track"), null);
});

test("the music and the room both duck under the table", () => {
  assert(MUSIC_GAIN > 0 && MUSIC_GAIN < 0.5, `music at ${MUSIC_GAIN} would sit over the game`);
  assert(AMBIENCE_GAIN > 0 && AMBIENCE_GAIN < MUSIC_GAIN, "room tone belongs under the music, not beside it");
});

// --- the playlist ----------------------------------------------------------

test("a shuffle keeps every track and loses none", () => {
  const order = shuffle(trackIds(), () => 0.5);
  assertEqual(order.length, TRACKS.length);
  assertEqual(new Set(order).size, TRACKS.length);
  for (const id of trackIds()) assert(order.includes(id), `${id} fell out of the shuffle`);
});

test("a shuffle does not mutate the list it was given", () => {
  const source = trackIds();
  const before = source.join(",");
  shuffle(source, () => 0.5);
  assertEqual(source.join(","), before);
});

test("the playlist wraps to the top of the same order, not a fresh shuffle", () => {
  const playlist = createPlaylist({ ids: ["a", "b", "c"], random: () => 0 });
  const order = playlist.order();
  const heard = [playlist.current()];
  for (let i = 0; i < order.length; i++) heard.push(playlist.advance());

  assertEqual(heard[0], order[0]);
  assertEqual(heard[order.length], order[0], "the wrap returns to the first track of the same order");
  assertEqual(new Set(heard.slice(0, order.length)).size, order.length, "nothing repeats before everything plays");
});

test("an empty playlist is quiet, not broken", () => {
  const playlist = createPlaylist({ ids: [] });
  assertEqual(playlist.current(), null);
  assertEqual(playlist.advance(), null);
});

finish();
