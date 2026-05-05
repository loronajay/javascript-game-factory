import {
  AUDIO_ASSET_PATHS,
  createAudioController,
  getResolutionSoundId,
  LAUNCH_SOUND_ID,
} from '../scripts/audio.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\naudio');

test('launch sound points at launch.wav', () => {
  assertEqual(AUDIO_ASSET_PATHS[LAUNCH_SOUND_ID], 'sounds/launch.wav');
});

test('hit resolutions use the hit sound', () => {
  assertEqual(getResolutionSoundId(true), 'hit');
});

test('miss resolutions use the miss sound', () => {
  assertEqual(getResolutionSoundId(false), 'miss');
});

test('audio controller reuses prepared audio instances', () => {
  const created = [];
  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.currentTime = 99;
      this.preload = '';
      created.push(this);
    }

    play() {
      return Promise.resolve();
    }
  }

  const audio = createAudioController(FakeAudio);
  audio.play('hit');
  audio.play('hit');

  assertEqual(created.length, 1, 'Expected one cached Audio instance');
  assertEqual(created[0].currentTime, 0, 'Expected playback to restart from 0');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
