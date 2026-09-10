const test = require('node:test');
const assert = require('node:assert/strict');

const { createAudioSettings, DEFAULT_SETTINGS, normalizeAudioSettings, normalizeVolume, readAudioSettings, writeAudioSettings } = require('../modules/music.js');

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

function fakeMixer() {
  return { level: null, setVolume(value) { this.level = value; return value; } };
}

test('volumes are clamped to the slider range and survive nonsense', () => {
  assert.equal(normalizeVolume(0.5), 0.5);
  assert.equal(normalizeVolume(4), 1);
  assert.equal(normalizeVolume(-2), 0);
  assert.equal(normalizeVolume('nope', 0.3), 0.3);
});

test('settings round-trip through storage and fall back to the shipped mix', () => {
  const storage = fakeStorage();
  assert.deepEqual(readAudioSettings(storage), normalizeAudioSettings(DEFAULT_SETTINGS));
  writeAudioSettings(storage, { music: 0.1, effects: 2, muted: true });
  assert.deepEqual(readAudioSettings(storage), { music: 0.1, effects: 1, muted: true });
});

test('unreadable storage is a session-only mix, never a crash', () => {
  const broken = { getItem() { throw new Error('site data blocked'); }, setItem() { throw new Error('site data blocked'); } };
  assert.deepEqual(readAudioSettings(broken), normalizeAudioSettings(DEFAULT_SETTINGS));
  assert.deepEqual(writeAudioSettings(broken, { music: 0.2 }), normalizeAudioSettings({ ...DEFAULT_SETTINGS, music: 0.2 }));
});

test('the controller applies the stored mix to both channels on boot', () => {
  const soundtrack = fakeMixer();
  const effects = fakeMixer();
  const storage = fakeStorage({ 'hotel:audio-settings': JSON.stringify({ music: 0.15, effects: 0.9, muted: false }) });
  createAudioSettings({ soundtrack, effects, document: null, storage });
  assert.equal(soundtrack.level, 0.15);
  assert.equal(effects.level, 0.9);
});

test('mute silences both channels but keeps the levels for unmuting', () => {
  const soundtrack = fakeMixer();
  const effects = fakeMixer();
  const storage = fakeStorage();
  const audio = createAudioSettings({ soundtrack, effects, document: null, storage });

  audio.setMusic(0.3);
  audio.setMuted(true);
  assert.equal(soundtrack.level, 0);
  assert.equal(effects.level, 0);
  assert.equal(audio.get().music, 0.3, 'the level is remembered while muted');

  audio.setMuted(false);
  assert.equal(soundtrack.level, 0.3);
  assert.equal(effects.level, DEFAULT_SETTINGS.effects);
  assert.equal(readAudioSettings(storage).music, 0.3, 'the mix is remembered for next time');
});

test('a mixer created with a volume can still be turned down afterwards', () => {
  const { createSoundtrack } = require('../modules/music.js');
  const built = [];
  const soundtrack = createSoundtrack({
    eventTarget: { addEventListener() {} },
    createAudio: () => { const audio = { volume: 0, loop: false, paused: true, play: () => Promise.resolve(), pause() {} }; built.push(audio); return audio; },
  });
  assert.equal(soundtrack.getVolume(), DEFAULT_SETTINGS.music);
  soundtrack.setVolume(0.2);
  assert.equal(soundtrack.getVolume(), 0.2);
  for (const track of built) assert.equal(track.volume, 0.2);
});
