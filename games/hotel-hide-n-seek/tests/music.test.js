const test = require('node:test');
const assert = require('node:assert/strict');

const { createSoundEffects, createSoundtrack } = require('../modules/music.js');

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }

  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }

  dispatch(name, detail = {}) {
    for (const listener of this.listeners.get(name) || []) listener({ detail });
  }
}

function createAudioHarness() {
  const tracks = new Map();
  return {
    tracks,
    createAudio(src) {
      const audio = {
        src,
        currentTime: 12,
        loop: false,
        paused: true,
        playCalls: 0,
        pauseCalls: 0,
        play() { this.paused = false; this.playCalls += 1; return Promise.resolve(); },
        pause() { this.paused = true; this.pauseCalls += 1; },
      };
      tracks.set(src, audio);
      return audio;
    },
  };
}

test('soundtrack starts the looping chill theme after player interaction', () => {
  const target = new FakeEventTarget();
  const harness = createAudioHarness();
  createSoundtrack({ eventTarget: target, createAudio: harness.createAudio });

  const chill = harness.tracks.get('assets/sounds/bg-themes/empty-halls.mp3');
  const chase = harness.tracks.get('assets/sounds/bg-themes/the-chase.mp3');
  assert.equal(chill.loop, true);
  assert.equal(chase.loop, true);
  assert.equal(chill.playCalls, 0);

  target.dispatch('pointerdown');

  assert.equal(chill.currentTime, 0);
  assert.equal(chill.playCalls, 1);
  assert.equal(chase.playCalls, 0);
});

test('chase changes cut off and reset the outgoing theme before restarting the other theme', () => {
  const target = new FakeEventTarget();
  const harness = createAudioHarness();
  const soundtrack = createSoundtrack({ eventTarget: target, createAudio: harness.createAudio });
  const chill = harness.tracks.get('assets/sounds/bg-themes/empty-halls.mp3');
  const chase = harness.tracks.get('assets/sounds/bg-themes/the-chase.mp3');

  soundtrack.start();
  chill.currentTime = 31;
  target.dispatch('hotel:monster-state', { state: 'chase' });

  assert.equal(chill.pauseCalls, 1);
  assert.equal(chill.currentTime, 0);
  assert.equal(chase.currentTime, 0);
  assert.equal(chase.playCalls, 1);

  chase.currentTime = 9;
  target.dispatch('hotel:monster-state', { state: 'search' });

  assert.equal(chase.pauseCalls, 1);
  assert.equal(chase.currentTime, 0);
  assert.equal(chill.currentTime, 0);
  assert.equal(chill.playCalls, 2);
});

test('the latest monster state chooses the first theme when audio unlocks', () => {
  const target = new FakeEventTarget();
  const harness = createAudioHarness();
  createSoundtrack({ eventTarget: target, createAudio: harness.createAudio });
  const chill = harness.tracks.get('assets/sounds/bg-themes/empty-halls.mp3');
  const chase = harness.tracks.get('assets/sounds/bg-themes/the-chase.mp3');

  target.dispatch('hotel:monster-state', { state: 'chase' });
  target.dispatch('keydown');

  assert.equal(chill.playCalls, 0);
  assert.equal(chase.playCalls, 1);
});

test('a late rejection from the old theme does not clear the new active theme', async () => {
  const target = new FakeEventTarget();
  const harness = createAudioHarness();
  let rejectChill;
  const createAudio = (src) => {
    const audio = harness.createAudio(src);
    if (src.includes('empty-halls')) {
      audio.play = function play() {
        this.paused = false;
        this.playCalls += 1;
        return new Promise((_resolve, reject) => { rejectChill = reject; });
      };
    }
    return audio;
  };
  const soundtrack = createSoundtrack({ eventTarget: target, createAudio });

  soundtrack.start();
  target.dispatch('hotel:monster-state', { state: 'chase' });
  rejectChill(new Error('play interrupted by pause'));
  await Promise.resolve();

  assert.equal(soundtrack.getActiveTrack(), 'chase');
});

test('being caught plays the impact and scream together', () => {
  const target = new FakeEventTarget();
  const harness = createAudioHarness();
  createSoundEffects({ eventTarget: target, createAudio: harness.createAudio });
  const impact = harness.tracks.get('assets/sounds/sfx/caught.wav');
  const scream = harness.tracks.get('assets/sounds/sfx/caught-scream.wav');

  target.dispatch('hotel:caught');

  assert.equal(impact.currentTime, 0);
  assert.equal(impact.playCalls, 1);
  assert.equal(scream.currentTime, 0);
  assert.equal(scream.playCalls, 1);
});

test('elevator travel uses the ride sound for passengers and arriving sound for calls', () => {
  const target = new FakeEventTarget();
  const harness = createAudioHarness();
  createSoundEffects({ eventTarget: target, createAudio: harness.createAudio });
  const ride = harness.tracks.get('assets/sounds/sfx/elevator-ride.wav');
  const arriving = harness.tracks.get('assets/sounds/sfx/elevator-arriving.mp3');

  target.dispatch('hotel:elevator-start', { passenger: true });
  assert.equal(ride.loop, true);
  assert.equal(ride.playCalls, 1);
  assert.equal(arriving.playCalls, 0);

  target.dispatch('hotel:elevator-arrive');
  target.dispatch('hotel:elevator-start', { passenger: false });
  assert.equal(ride.pauseCalls, 1);
  assert.equal(ride.currentTime, 0);
  assert.equal(arriving.playCalls, 1);
});

test('elevator arrival stops movement audio and plays the ding', () => {
  const target = new FakeEventTarget();
  const harness = createAudioHarness();
  createSoundEffects({ eventTarget: target, createAudio: harness.createAudio });
  const arriving = harness.tracks.get('assets/sounds/sfx/elevator-arriving.mp3');
  const ding = harness.tracks.get('assets/sounds/sfx/elevator-ding.wav');

  target.dispatch('hotel:elevator-start', { passenger: false });
  arriving.currentTime = 3;
  target.dispatch('hotel:elevator-arrive');

  assert.equal(arriving.pauseCalls, 1);
  assert.equal(arriving.currentTime, 0);
  assert.equal(ding.currentTime, 0);
  assert.equal(ding.playCalls, 1);
});

test('sound effects ignore rejected browser playback promises', async () => {
  const target = new FakeEventTarget();
  const harness = createAudioHarness();
  const createAudio = (src) => {
    const audio = harness.createAudio(src);
    audio.play = function play() {
      this.playCalls += 1;
      return Promise.reject(new Error('autoplay blocked'));
    };
    return audio;
  };
  createSoundEffects({ eventTarget: target, createAudio });

  target.dispatch('hotel:elevator-arrive');
  await Promise.resolve();

  assert.equal(harness.tracks.get('assets/sounds/sfx/elevator-ding.wav').playCalls, 1);
});
