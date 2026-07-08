import test from "node:test";
import assert from "node:assert/strict";

import { AudioManager, MUSIC_FILES } from "../src/audio/sounds.js";
import { SAMPLE_SOURCES, SOUND_CATALOG } from "../src/audio/soundCatalog.js";
import { syncScreenMusic } from "../src/ui/menuFlow.js";

test("UI sound catalog includes button click and unit selection cues", () => {
  const keys = new Set(SOUND_CATALOG.map((entry) => entry.key));

  assert.ok(keys.has("buttonClick"));
  assert.ok(keys.has("unitSelect"));
});

test("sample URLs resolve inside this game's local sounds directory", () => {
  const normalizedPaths = Object.values(SAMPLE_SOURCES).map((source) =>
    decodeURIComponent(new URL(source).pathname).replace(/\\/g, "/")
  );

  assert.ok(normalizedPaths.some((path) => path.endsWith("/tactical-arena/sounds/button-click.wav")));
  assert.ok(normalizedPaths.every((path) => path.includes("/tactical-arena/sounds/")));
});

test("music tracks include local battle and menu loops", () => {
  assert.equal(MUSIC_FILES.battle, "battle-2.mp3");
  assert.equal(MUSIC_FILES.menu, "menu.mp3");
});

test("starting the same music track is idempotent while switching tracks stops the previous loop", () => {
  const OriginalAudio = globalThis.Audio;
  const created = [];

  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.loop = false;
      this.preload = "";
      this.volume = 0;
      this.currentTime = 0;
      this.paused = true;
      this.playCount = 0;
      this.pauseCount = 0;
      created.push(this);
    }

    play() {
      this.paused = false;
      this.playCount += 1;
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
      this.pauseCount += 1;
    }
  }

  globalThis.Audio = FakeAudio;
  try {
    const audio = new AudioManager({ masterVolume: 1, musicVolume: 0.5 });

    audio.startMusic("menu");
    const menuTrack = created[0];
    menuTrack.currentTime = 12;

    audio.startMusic("menu");
    assert.equal(menuTrack.playCount, 1);
    assert.equal(menuTrack.currentTime, 12);

    audio.startMusic("battle");
    assert.equal(menuTrack.pauseCount, 1);
    assert.equal(menuTrack.currentTime, 0);
    assert.match(created[1].src, /battle-2\.mp3$/);
  } finally {
    globalThis.Audio = OriginalAudio;
  }
});

test("screen music sync starts menu music outside battle and stops it for match", () => {
  const calls = [];
  const audio = {
    startMusic: (key) => calls.push(["start", key]),
    stopMusic: () => calls.push(["stop"]),
  };

  syncScreenMusic(audio, "title");
  syncScreenMusic(audio, "mainMenu");
  syncScreenMusic(audio, "results");
  syncScreenMusic(audio, "match");

  assert.deepEqual(calls, [
    ["start", "menu"],
    ["start", "menu"],
    ["start", "menu"],
    ["stop"],
  ]);
});
