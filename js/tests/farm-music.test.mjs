import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { FARM_MUSIC_TRACKS, createFarmMusic } from "../farm-music.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function fakeAudio() {
  const listeners = new Map();
  return {
    src: "",
    error: null,
    volume: 1,
    preload: "",
    plays: 0,
    pauses: 0,
    addEventListener(name, listener) { listeners.set(name, listener); },
    play() { this.plays += 1; return Promise.resolve(); },
    pause() { this.pauses += 1; },
    emit(name) { listeners.get(name)?.(); },
  };
}

test("the farm soundtrack declares every supplied track and every file exists", () => {
  const folder = path.join(root, "farm", "assets", "sounds", "soundtrack");
  const supplied = fs.readdirSync(folder).filter((name) => name.endsWith(".mp3")).sort();
  const declared = FARM_MUSIC_TRACKS.map((track) => path.basename(track.file)).sort();

  assert.deepEqual(declared, supplied);
  assert.equal(new Set(FARM_MUSIC_TRACKS.map((track) => track.id)).size, FARM_MUSIC_TRACKS.length);
  assert(FARM_MUSIC_TRACKS.every((track) => track.title && fs.existsSync(path.join(root, track.file))));
});

test("music stays unloaded until the player enters the farm", () => {
  let created = 0;
  const music = createFarmMusic({
    createAudio() { created += 1; return fakeAudio(); },
    random: () => 0,
  });

  assert.equal(created, 0);
  assert.equal(music.currentTrack(), null);
});

test("the first gesture starts a shuffled playlist that wraps in the same order", () => {
  const audio = fakeAudio();
  const music = createFarmMusic({ createAudio: () => audio, random: () => 0 });

  music.start();
  const first = music.currentTrack();
  audio.emit("ended");
  const second = music.currentTrack();
  audio.emit("ended");

  assert.notEqual(first, second);
  assert.equal(music.currentTrack(), first);
  assert.equal(audio.plays, 3);
  assert.equal(audio.volume, 0.24);
});

test("mute pauses and unmute resumes the current track", () => {
  const audio = fakeAudio();
  const music = createFarmMusic({ createAudio: () => audio, random: () => 0 });

  music.start();
  const current = music.currentTrack();
  assert.equal(music.setMuted(true), true);
  assert.equal(audio.pauses, 1);
  assert.equal(music.currentTrack(), current);

  assert.equal(music.setMuted(false), false);
  assert.equal(audio.plays, 2);
  assert.equal(music.currentTrack(), current);
});

test("starting while muted does not create or download audio", () => {
  let created = 0;
  const music = createFarmMusic({
    muted: true,
    createAudio() { created += 1; return fakeAudio(); },
  });

  music.start();
  assert.equal(created, 0);
  music.setMuted(false);
  assert.equal(created, 1);
});

test("a failed track advances to the other supplied track", () => {
  const audio = fakeAudio();
  const music = createFarmMusic({ createAudio: () => audio, random: () => 0 });

  music.start();
  const failed = music.currentTrack();
  audio.error = { code: 4 };
  audio.emit("error");

  assert.notEqual(music.currentTrack(), failed);
  assert.equal(audio.plays, 2);
});

test("a browser without an Audio constructor leaves the farm usable", () => {
  const music = createFarmMusic({ createAudio: () => null });

  assert.doesNotThrow(() => {
    music.start();
    music.setMuted(true);
    music.setMuted(false);
  });
  assert.equal(music.currentTrack(), null);
});
