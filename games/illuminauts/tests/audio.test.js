import assert from 'node:assert/strict';

import { BASE_LIGHT_RADIUS } from '../scripts/config.js';
import {
  captureLaserShotEvents,
  consumeSoundEvents,
  createAudioController,
  createAudioState,
  getMusicTrackForPhase
} from '../scripts/audio.js';
import { updatePlayer } from '../scripts/player.js';
import { createGameState } from '../scripts/state.js';

function createMapEntry({ hazards = null } = {}) {
  return {
    id: 'audio-test',
    raw: [
      '#########',
      '#S.D...T#',
      '#.......#',
      '#..BBBBB#',
      '#..BBBBB#',
      '#..BBBBB#',
      '#..BBBBB#',
      '#..BBBBB#',
      '#########'
    ],
    hazards: hazards ?? {
      aliens: [],
      laserGates: [],
      turrets: []
    }
  };
}

function createState(options = {}) {
  const state = createGameState(0, 'A', createMapEntry(options));
  state.audio = createAudioState();
  state.gameStartAt = 0;
  return state;
}

class FakeAudio {
  static instances = [];

  constructor(src = '') {
    this.src = src;
    this.loop = false;
    this.preload = 'auto';
    this.currentTime = 0;
    this.volume = 1;
    this.paused = true;
    this.playCount = 0;
    this.pauseCount = 0;
    FakeAudio.instances.push(this);
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

function getAudioBySuffix(suffix) {
  const match = FakeAudio.instances.find((instance) => instance.src.endsWith(suffix));
  assert.ok(match, `expected audio instance for ${suffix}`);
  return match;
}

function testMusicTrackSelection() {
  assert.equal(getMusicTrackForPhase('menu'), 'menu');
  assert.equal(getMusicTrackForPhase('lobby'), 'menu');
  assert.equal(getMusicTrackForPhase('countdown'), 'menu');
  assert.equal(getMusicTrackForPhase('win'), 'menu');
  assert.equal(getMusicTrackForPhase('playing'), 'game');
}

function testDoorUnlockQueuesSound() {
  const state = createState();
  state.player.tx = 2;
  state.player.ty = 1;
  state.player.prevTx = 2;
  state.player.prevTy = 1;
  state.player.px = 2.5;
  state.player.py = 1.5;
  state.player.chips = 1;
  state.input.held.add('ArrowRight');

  updatePlayer(state, 1000, 1000 / 60);

  assert.equal(state.map.doors[0].open, true);
  assert.equal(state.player.chips, 0);
  assert.deepEqual(
    consumeSoundEvents(state).map((event) => event.cue),
    ['door-unlock']
  );
}

function testChipPickupQueuesCollectSound() {
  const state = createState({
    hazards: {
      aliens: [],
      laserGates: [],
      turrets: []
    }
  });

  state.map.pickups.push({ id: 'chip-test', x: 1, y: 1, type: 'chip', active: true });

  updatePlayer(state, 1000, 1000 / 60);

  assert.equal(state.player.chips, 1);
  assert.deepEqual(
    consumeSoundEvents(state).map((event) => event.cue),
    ['collect']
  );
}

function testPowerCellPickupQueuesCollectAndPowerUpSounds() {
  const state = createState({
    hazards: {
      aliens: [],
      laserGates: [],
      turrets: []
    }
  });

  state.map.pickups.push({ id: 'power-test', x: 1, y: 1, type: 'powerCell', active: true });

  updatePlayer(state, 1000, 1000 / 60);

  assert.equal(state.player.powerUntil, 1000 + 15000);
  assert.deepEqual(
    consumeSoundEvents(state).map((event) => event.cue),
    ['collect', 'power-up']
  );
}

function testDamageQueuesBothHitSounds() {
  const state = createState({
    hazards: {
      aliens: [],
      laserGates: [
        {
          id: 'gate-danger',
          tiles: [{ x: 1, y: 1 }],
          cycleMs: 1000,
          warningMs: 100,
          activeMs: 200,
          offsetMs: 0
        }
      ],
      turrets: []
    }
  });

  updatePlayer(state, 150, 1000 / 60);

  assert.equal(state.player.hearts, 2);
  assert.deepEqual(
    consumeSoundEvents(state).map((event) => event.cue),
    ['grunt', 'hit']
  );
}

function testLaserFiresOnlyForVisibleNewlyActiveSources() {
  const state = createState({
    hazards: {
      aliens: [],
      laserGates: [
        {
          id: 'gate-visible',
          tiles: [{ x: 3, y: 1 }],
          cycleMs: 1000,
          warningMs: 100,
          activeMs: 200,
          offsetMs: 0
        }
      ],
      turrets: [
        {
          id: 'turret-hidden',
          x: Math.ceil(1.5 + BASE_LIGHT_RADIUS + 2),
          y: 1,
          dx: 1,
          dy: 0,
          range: 3,
          beamTiles: [{ x: 8, y: 1 }, { x: 9, y: 1 }, { x: 10, y: 1 }],
          cycleMs: 1000,
          warningMs: 100,
          activeMs: 200,
          offsetMs: 0
        }
      ]
    }
  });

  assert.deepEqual(
    captureLaserShotEvents(state, 150).map((event) => event.sourceId),
    ['gate:gate-visible']
  );
  assert.deepEqual(captureLaserShotEvents(state, 160), []);
  assert.deepEqual(captureLaserShotEvents(state, 350), []);
  assert.deepEqual(
    captureLaserShotEvents(state, 1150).map((event) => event.sourceId),
    ['gate:gate-visible']
  );
}

async function testControllerSwitchesLoopingMusic() {
  FakeAudio.instances.length = 0;
  const controller = createAudioController({ AudioCtor: FakeAudio });
  controller.unlock();
  await controller.sync({ audio: createAudioState(), player: { powerUntil: 0 }, hazards: { laserGates: [], turrets: [] }, gameStartAt: 0 }, 'menu', 0);
  await controller.sync({ audio: createAudioState(), player: { powerUntil: 0 }, hazards: { laserGates: [], turrets: [] }, gameStartAt: 0 }, 'playing', 50);

  const menu = getAudioBySuffix('/menu.mp3');
  const game = getAudioBySuffix('/game.mp3');

  assert.equal(menu.loop, true);
  assert.equal(game.loop, true);
  assert.ok(menu.playCount >= 1);
  assert.ok(menu.pauseCount >= 1);
  assert.ok(game.playCount >= 1);
}

async function run() {
  testMusicTrackSelection();
  testDoorUnlockQueuesSound();
  testChipPickupQueuesCollectSound();
  testPowerCellPickupQueuesCollectAndPowerUpSounds();
  testDamageQueuesBothHitSounds();
  testLaserFiresOnlyForVisibleNewlyActiveSources();
  await testControllerSwitchesLoopingMusic();
  console.log('Illuminauts audio tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
