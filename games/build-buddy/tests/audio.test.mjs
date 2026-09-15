import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioDirector,
  GAMEPLAY_MUSIC,
  shuffledPlaylist,
  springPlaybackRate,
} from '../js/audio.js';

class FakeAudio {
  static instances = [];
  constructor(src = '') {
    this.src = src;
    this.loop = false;
    this.paused = true;
    this.currentTime = 0;
    this.playbackRate = 1;
    this.volume = 1;
    this.listeners = new Map();
    FakeAudio.instances.push(this);
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  cloneNode() { return new FakeAudio(this.src); }
  end() { this.listeners.get('ended')?.(); }
}

test('gameplay soundtrack is shuffled once into a complete playlist', () => {
  const values = [.9, .1, .7, .2];
  const shuffled = shuffledPlaylist(GAMEPLAY_MUSIC, () => values.shift() ?? .5);
  assert.equal(shuffled.length, GAMEPLAY_MUSIC.length);
  assert.deepEqual(new Set(shuffled), new Set(GAMEPLAY_MUSIC));
  assert.notDeepEqual(shuffled, GAMEPLAY_MUSIC);
});

test('stronger springs play at a higher pitch', () => {
  assert.ok(springPlaybackRate(-920) < springPlaybackRate(-1130));
  assert.ok(springPlaybackRate(-1130) < springPlaybackRate(-1360));
});

test('audio director keeps menu and gameplay music exclusive and advances the playlist', async () => {
  FakeAudio.instances.length = 0;
  const director = new AudioDirector({ AudioCtor: FakeAudio, random: () => .4 });
  director.unlock();
  director.setScreen('main_menu');
  assert.equal(director.menuTrack.paused, false);
  assert.equal(director.musicTrack.paused, true);
  director.setScreen('gameplay');
  assert.equal(director.menuTrack.paused, true);
  assert.equal(director.musicTrack.paused, false);
  const first = director.musicTrack.src;
  director.musicTrack.end();
  assert.notEqual(director.musicTrack.src, first);
});

test('the current run track continues through result screens', () => {
  const director = new AudioDirector({ AudioCtor: FakeAudio, random: () => .4 });
  director.unlock();
  director.setScreen('gameplay');
  const track = director.musicTrack.src;
  director.musicTrack.currentTime = 42;

  director.setScreen('stage_result');
  assert.equal(director.musicTrack.paused, false);
  assert.equal(director.musicTrack.src, track);
  assert.equal(director.musicTrack.currentTime, 42);
  assert.equal(director.menuTrack.paused, true);

  director.setScreen('run_result');
  assert.equal(director.musicTrack.paused, false);
  assert.equal(director.musicTrack.src, track);
});

test('menu music continues through the pre-game menus', () => {
  const director = new AudioDirector({ AudioCtor: FakeAudio, random: () => .4 });
  director.unlock();
  director.setScreen('main_menu');
  assert.equal(director.menuTrack.paused, false);

  director.setScreen('mode_select');
  assert.equal(director.menuTrack.paused, false);
  director.setScreen('local_setup');
  assert.equal(director.menuTrack.paused, false);
  director.setScreen('online_menu');
  assert.equal(director.menuTrack.paused, false);
  director.setScreen('online_lobby');
  assert.equal(director.menuTrack.paused, false);
  director.setScreen('practice_select');
  assert.equal(director.menuTrack.paused, false);

  director.setScreen('gameplay');
  assert.equal(director.menuTrack.paused, true);
  assert.equal(director.musicTrack.paused, false);
});

test('the first menu interaction can unlock music before navigating', () => {
  const director = new AudioDirector({ AudioCtor: FakeAudio, random: () => .4 });
  director.setScreen('main_menu');
  director.unlock();
  director.setScreen('mode_select');
  assert.equal(director.menuTrack.paused, false);
  assert.equal(director.musicTrack.paused, true);
});

test('climbing loops only while the runner is moving along a wall', () => {
  const director = new AudioDirector({ AudioCtor: FakeAudio, random: () => .5 });
  director.unlock();
  director.setScreen('gameplay');
  director.syncGameplay({ climbing: true, climbVelocity: -220 });
  assert.equal(director.climbingTrack.loop, true);
  assert.equal(director.climbingTrack.paused, false);
  director.syncGameplay({ climbing: true, climbVelocity: 0 });
  assert.equal(director.climbingTrack.paused, true);
  assert.equal(director.climbingTrack.currentTime, 0);
});

test('spring events apply bounce-based playback rate', () => {
  FakeAudio.instances.length = 0;
  const director = new AudioDirector({ AudioCtor: FakeAudio, random: () => .5 });
  director.unlock();
  director.handleGameEvents([{ type: 'spring', bounceVy: -1360 }]);
  const played = FakeAudio.instances.at(-1);
  assert.match(played.src, /spring-bounce\.wav$/);
  assert.equal(played.playbackRate, springPlaybackRate(-1360));
  assert.equal(played.paused, false);
});

test('tool action events play the place-tool sound', () => {
  FakeAudio.instances.length = 0;
  const director = new AudioDirector({ AudioCtor: FakeAudio, random: () => .5 });
  director.unlock();

  director.handleGameEvents([{ type: 'toolAction' }]);

  const played = FakeAudio.instances.at(-1);
  assert.match(played.src, /place-tool\.mp3$/);
  assert.equal(played.paused, false);
});
