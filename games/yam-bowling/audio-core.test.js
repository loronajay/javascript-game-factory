const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  MUSIC_TRACKS,
  MUSIC_VOLUME,
  SFX_MASTER_VOLUME,
  EFFECTS,
  getOutcomeCue,
  createAudioDirector,
} = require("./audio-core.js");

function createFakeAudioFactory(log) {
  return (src) => {
    const listeners = {};
    return {
      src,
      volume: 1,
      preload: "",
      currentTime: 0,
      paused: true,
      addEventListener(name, callback) { listeners[name] = callback; },
      play() { this.paused = false; log.push(["play", src]); return Promise.resolve(); },
      pause() { this.paused = true; log.push(["pause", src]); },
      finish() { listeners.ended?.(); },
    };
  };
}

describe("Yam Bowling audio", () => {
  test("registers every supplied background theme", () => {
    assert.deepEqual(MUSIC_TRACKS, [
      "sounds/theme-1.mp3",
      "sounds/theme-2.mp3",
      "sounds/theme-3.mp3",
    ]);
  });

  test("defines distinct interaction, bowling, and celebration effects", () => {
    for (const effect of ["click", "select", "popup", "announce", "charge", "throw", "pin", "strike", "spare", "gutter", "win"]) {
      assert.ok(EFFECTS[effect], `${effect} should be a playable effect`);
    }
  });

  test("makes buttons audible and cues each new turn announcement", () => {
    assert.ok(EFFECTS.click.tones.length >= 2, "ordinary buttons should have a layered click");
    assert.ok(EFFECTS.click.noise, "ordinary buttons should have a percussive transient");
    assert.ok(EFFECTS.select.tones.length >= 2, "selection buttons should have a layered confirmation");
    assert.ok(EFFECTS.announce.tones.length >= 2, "announcements should use a recognizable stinger");

    const game = fs.readFileSync(require.resolve("./game.js"), "utf8");
    assert.match(game, /function prepareActivePlayer\(\)[\s\S]*?audio\.play\("announce"/);
  });

  test("keeps music at a steady volume while effects play", async () => {
    const scheduled = [];
    const director = createAudioDirector({
      audioFactory: createFakeAudioFactory([]),
      contextFactory: () => null,
      random: () => 0,
      storage: { getItem: () => null, setItem() {} },
      schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
      cancelSchedule() {},
    });

    await director.unlock();
    assert.equal(director.music.volume, MUSIC_VOLUME);
    assert.ok(SFX_MASTER_VOLUME > MUSIC_VOLUME);

    director.context = { currentTime: 1 };
    director.master = {};
    director.ensureContext = () => director.context;
    director.playTone = () => {};
    director.playNoise = () => {};
    director.play("click");

    assert.equal(director.music.volume, MUSIC_VOLUME);
    assert.deepEqual(scheduled, [], "effects should not schedule a music volume change");
  });

  test("layers the prototype crash underneath the current bright pin texture", () => {
    const played = { tones: [], noises: [] };
    const director = createAudioDirector({
      contextFactory: () => null,
      storage: { getItem: () => null, setItem() {} },
    });
    director.context = { currentTime: 1 };
    director.master = {};
    director.ensureContext = () => director.context;
    director.playTone = (tone) => played.tones.push(tone);
    director.playNoise = (noise) => played.noises.push(noise);

    assert.equal(director.play("pin"), true);
    assert.deepEqual(played.noises.map(([duration, frequency]) => [duration, frequency]), [
      [0.17, 1100],
      [0.1, 1350],
    ]);
    assert.deepEqual(played.tones.map(([frequency]) => frequency), [150, 240, 760, 1120]);
  });

  test("chooses outcome cues from the roll result", () => {
    assert.equal(getOutcomeCue(10, 10, true), "strike");
    assert.equal(getOutcomeCue(4, 4, false), "spare");
    assert.equal(getOutcomeCue(0, 10, true), "gutter");
    assert.equal(getOutcomeCue(8, 10, true), "popup");
  });

  test("waits for unlock, rotates songs, and persists mute", async () => {
    const log = [];
    const saved = [];
    const director = createAudioDirector({
      audioFactory: createFakeAudioFactory(log),
      contextFactory: () => null,
      random: () => 0,
      storage: {
        getItem: () => null,
        setItem: (key, value) => saved.push([key, value]),
      },
    });

    assert.equal(director.enabled, true);
    assert.equal(director.music, null);
    await director.unlock();
    assert.equal(director.music.src, MUSIC_TRACKS[0]);
    assert.deepEqual(log, [["play", MUSIC_TRACKS[0]]]);

    const firstTrack = director.music;
    firstTrack.finish();
    await Promise.resolve();
    assert.equal(director.music.src, MUSIC_TRACKS[1]);

    director.setEnabled(false);
    assert.deepEqual(saved.at(-1), ["yam-bowling-audio", "off"]);
    assert.equal(director.music.paused, true);
  });

  test("honors a previously saved mute before trying to play music", async () => {
    const log = [];
    const director = createAudioDirector({
      audioFactory: createFakeAudioFactory(log),
      contextFactory: () => null,
      storage: { getItem: () => "off", setItem() {} },
    });

    assert.equal(director.enabled, false);
    await director.unlock();
    assert.deepEqual(log, []);
  });
});
