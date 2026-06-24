import assert from 'node:assert/strict';
import { AudioManager, SOUND_ASSETS } from '../src/systems/audio.js';

class FakeAudio {
  static instances = [];

  constructor(src) {
    this.src = src;
    this.loop = false;
    this.volume = 1;
    this.currentTime = 0;
    this.paused = true;
    this.playCalls = 0;
    this.pauseCalls = 0;
    FakeAudio.instances.push(this);
  }

  play() {
    this.paused = false;
    this.playCalls += 1;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.pauseCalls += 1;
  }
}

let now = 1000;
const audio = new AudioManager({ AudioConstructor: FakeAudio, now: () => now });

assert.equal(SOUND_ASSETS['arrow-airborne'], './sounds/arrow-airborne.wav');
assert.equal(audio.play('attack-hit'), true, 'Known effects should play');
assert.equal(FakeAudio.instances.at(-1).src, SOUND_ASSETS['attack-hit']);
assert.equal(FakeAudio.instances.at(-1).playCalls, 1, 'Effects should start playback');

assert.equal(audio.play('attack-hit'), false, 'Rapid repeated melee hits should be throttled');
now += 100;
assert.equal(audio.play('attack-hit'), true, 'Effects should replay after their cooldown');
assert.equal(audio.play('missing-sound'), false, 'Unknown effects should be ignored safely');

assert.equal(audio.startBattleMusic(), true, 'Battle music should start when a mission begins');
const music = FakeAudio.instances.at(-1);
assert.equal(music.src, SOUND_ASSETS.battle);
assert.equal(music.loop, true, 'Battle music should loop');
assert.equal(music.playCalls, 1, 'Battle music should begin playback');

audio.pauseMusic();
assert.equal(music.pauseCalls, 1, 'Pausing should pause battle music');
assert.equal(audio.resumeMusic(), true, 'Music should resume after a temporary pause');
assert.equal(music.playCalls, 2, 'Resuming should replay the existing music element');

audio.stopMusic();
assert.equal(music.currentTime, 0, 'Stopping should rewind battle music');
assert.equal(audio.resumeMusic(), false, 'Stopped music should not resume outside a battle');

console.log('Audio checks passed.');
