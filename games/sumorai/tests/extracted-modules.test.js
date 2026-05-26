import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAudioController } from '../scripts/audio.js';
import { swapBindingForSide } from '../scripts/controls-screen.js';
import { spawnBloodEffect, spawnChingEffect, tickEffects } from '../scripts/effects.js';
import { createLobbyUi, queueHintText, sideLockedText } from '../scripts/lobby-ui.js';
import { getHumanInputBindings, isMobileControllerMounted } from '../scripts/mobile-input-routing.js';
import { drawOnlineCountdown, EMPTY_INPUT, inputsDiffer, pickOnlineStage } from '../scripts/online-match-view.js';
import { loadGameState, saveGameState } from '../scripts/rollback-state.js';
import { setupCanvasViewport } from '../scripts/viewport.js';

test('setupCanvasViewport sizes the canvas and reports the viewport scale', () => {
  const canvas = { width: 0, height: 0 };
  const listeners = [];
  const windowLike = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener(type, handler) {
      listeners.push({ type, handler });
    },
  };
  const scales = [];

  setupCanvasViewport({
    canvas,
    window: windowLike,
    viewportWidth: 640,
    viewportHeight: 360,
    setScaleFactor: scale => scales.push(scale),
  });

  assert.equal(canvas.width, 1280);
  assert.equal(canvas.height, 720);
  assert.deepEqual(scales, [2]);
  assert.equal(listeners[0].type, 'resize');

  windowLike.innerWidth = 960;
  windowLike.innerHeight = 720;
  listeners[0].handler();

  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 720);
  assert.deepEqual(scales, [2, 1.5]);
});

test('audio controller clones one-shot sounds and suppresses them while resimulating', () => {
  const played = [];
  const sounds = {
    hit: {
      cloneNode() {
        return {
          volume: 0,
          play() {
            played.push(this.volume);
            return Promise.resolve();
          },
        };
      },
    },
  };
  const audio = createAudioController(name => sounds[name], { isMuted: () => false });

  audio.playSound('hit');
  assert.deepEqual(played, [0.4]);

  audio.setMutedPredicate(() => true);
  audio.playSound('hit');
  assert.deepEqual(played, [0.4]);
});

test('audio controller starts and stops ambient music without duplicating it', () => {
  const events = [];
  const bg = {
    loop: false,
    volume: 0,
    currentTime: 4,
    play() {
      events.push('play');
      return Promise.resolve();
    },
    pause() {
      events.push('pause');
    },
  };
  const audio = createAudioController(name => (name === 'bg_music' ? bg : null));

  audio.startAmbient();
  audio.startAmbient();
  assert.deepEqual(events, ['play']);
  assert.equal(bg.loop, true);
  assert.equal(bg.volume, 0.35);
  assert.equal(bg.currentTime, 0);

  audio.stopAmbient();
  assert.deepEqual(events, ['play', 'pause']);
  assert.equal(bg.currentTime, 0);
});

test('effect helpers preserve clash, blood, and frame ticking behavior', () => {
  const state = {
    clashFlash: 0,
    deathFlash: 0.2,
    effects: [],
  };

  spawnChingEffect(state, 10, 20);
  spawnBloodEffect(state, 30, 40, true);

  assert.equal(state.clashFlash, 1);
  assert.deepEqual(state.effects[0], {
    type: 'ching',
    x: 10,
    y: 20,
    frame: 0,
    timer: 0,
    maxFrames: 5,
    ticksPerFrame: 1,
  });
  assert.deepEqual(state.effects[1], {
    type: 'blood',
    x: 30,
    y: 40,
    frame: 0,
    timer: 0,
    maxFrames: 8,
    flip: true,
  });

  tickEffects(state);
  assert.equal(state.clashFlash, 0.86);
  assert.equal(state.deathFlash, 0.14);
  assert.equal(state.effects[0].frame, 1);
  assert.equal(state.effects[1].frame, 0);
});

test('online helper stage picking and input comparison stay deterministic', () => {
  assert.deepEqual(EMPTY_INPUT, {
    left: false,
    right: false,
    up: false,
    down: false,
    attack: false,
    dash: false,
    projectile: false,
    attackJustPressed: false,
  });
  assert.equal(pickOnlineStage(0, 1), 'battlefield');
  assert.equal(pickOnlineStage(0.42, 2), 'single');
  assert.equal(inputsDiffer(EMPTY_INPUT, { ...EMPTY_INPUT }), false);
  assert.equal(inputsDiffer(EMPTY_INPUT, { ...EMPTY_INPUT, attackJustPressed: true }), true);
});

test('drawOnlineCountdown preserves the original draw sequence', () => {
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    fillText: (...args) => calls.push(['fillText', ...args]),
    set fillStyle(value) { calls.push(['fillStyle', value]); },
    set textAlign(value) { calls.push(['textAlign', value]); },
    set textBaseline(value) { calls.push(['textBaseline', value]); },
    set font(value) { calls.push(['font', value]); },
  };

  drawOnlineCountdown({
    ctx,
    canvas: { width: 1280, height: 720 },
    viewportWidth: 640,
    viewportHeight: 360,
    labels: { p1: 'Akira', p2: 'Bot' },
    secondsRemaining: 3,
  });

  assert.deepEqual(calls, [
    ['fillStyle', '#0a0608'],
    ['fillRect', 0, 0, 1280, 720],
    ['save'],
    ['textAlign', 'center'],
    ['textBaseline', 'middle'],
    ['fillStyle', 'rgba(255,255,255,0.38)'],
    ['font', "30px 'Segoe UI', system-ui, sans-serif"],
    ['fillText', 'Akira  vs  Bot', 640, 224],
    ['fillStyle', '#e05a50'],
    ['font', "bold 176px 'Segoe UI', system-ui, sans-serif"],
    ['fillText', '3', 640, 360],
    ['fillStyle', 'rgba(255,255,255,0.42)'],
    ['font', "26px 'Segoe UI', system-ui, sans-serif"],
    ['fillText', 'Get Ready', 640, 476],
    ['restore'],
  ]);
});

test('rollback state snapshots and restores mutable match state without retaining references', () => {
  const platform = { id: 'platform-1', x: 10 };
  const state = {
    phase: 'active',
    roundNum: 2,
    roundStartTick: 45,
    clashFlash: 0.5,
    deathFlash: 0.25,
    platforms: [platform],
    p1Projectile: { x: 1 },
    p2Projectile: null,
    gridlock: { timer: 7 },
    effects: [{ type: 'spark', frame: 1 }],
    roundEnd: { winner: 'p1' },
    p1: { side: 'p1', x: 12, platformRef: platform },
    p2: { side: 'p2', x: 24, platformRef: null },
  };

  const snap = saveGameState(state);
  state.phase = 'mutated';
  state.platforms[0].x = 999;
  state.p1.x = 999;
  state.effects[0].frame = 99;

  loadGameState(state, snap);

  assert.equal(state.phase, 'active');
  assert.equal(state.platforms[0].x, 10);
  assert.equal(state.p1.x, 12);
  assert.equal(state.p1.platformRef, state.platforms[0]);
  assert.equal(state.p2.platformRef, null);
  assert.equal(state.effects[0].frame, 1);
  assert.notEqual(state.platforms[0], platform);
});

test('lobby UI text helpers preserve queue and side wording', () => {
  assert.equal(queueHintText(null, 'p1'), '');
  assert.equal(queueHintText({ p1: 0, p2: 0 }, 'p1'), 'No opponents searching yet');
  assert.equal(queueHintText({ p1: 0, p2: 1 }, 'p1'), '1 player searching');
  assert.equal(queueHintText({ p1: 0, p2: 2 }, 'p1'), '2 players searching');
  assert.equal(queueHintText({ p1: Number.NaN, p2: 1 }, 'p2'), '');
  assert.equal(sideLockedText('p1'), 'Playing as P1 (Left)');
  assert.equal(sideLockedText('p2'), 'Playing as P2 (Right)');
});

test('createLobbyUi centralizes screen and phase DOM mutations', () => {
  const screens = [
    { id: 'screen-menu', classList: makeClassList(['screen--active']) },
    { id: 'screen-game', classList: makeClassList([]) },
  ];
  const phases = [
    { id: 'lobby-phase-side-select', hidden: false },
    { id: 'lobby-phase-main', hidden: true },
  ];
  const byId = new Map([...screens, ...phases].map(el => [el.id, el]));
  byId.set('queue-hint', { textContent: 'stale' });
  byId.set('online-side-locked', { textContent: '' });
  const documentLike = {
    querySelectorAll(selector) {
      if (selector === '.screen') return screens;
      if (selector === '.lobby-phase') return phases;
      return [];
    },
    getElementById(id) {
      return byId.get(id) ?? null;
    },
  };
  let phase = null;
  const ui = createLobbyUi({
    document: documentLike,
    getOnlineSide: () => 'p1',
    getQueueCounts: () => ({ p2: 2 }),
    setLobbyPhase: next => { phase = next; },
  });

  ui.showScreen('screen-game');
  assert.equal(screens[0].classList.contains('screen--active'), false);
  assert.equal(screens[1].classList.contains('screen--active'), true);

  ui.showLobbyPhase('main');
  assert.equal(phases[0].hidden, true);
  assert.equal(phases[1].hidden, false);
  assert.equal(phase, 'main');

  ui.updateQueueHint();
  ui.setSideLocked('online-side-locked');
  assert.equal(byId.get('queue-hint').textContent, '2 players searching');
  assert.equal(byId.get('online-side-locked').textContent, 'Playing as P1 (Left)');
});

test('swapBindingForSide preserves the controls screen auto-swap behavior', () => {
  const bindings = {
    left: 'KeyA',
    right: 'KeyD',
    up: 'KeyW',
  };

  swapBindingForSide(bindings, ['left', 'right', 'up'], 'left', 'KeyD');

  assert.deepEqual(bindings, {
    left: 'KeyD',
    right: 'KeyA',
    up: 'KeyW',
  });

  swapBindingForSide(bindings, ['left', 'right', 'up'], 'up', 'KeyS');

  assert.deepEqual(bindings, {
    left: 'KeyD',
    right: 'KeyA',
    up: 'KeyS',
  });
});

test('mobile input routing uses the default mobile key profile for either human side', () => {
  const bindings = {
    p1: { left: 'KeyA' },
    p2: { left: 'KeyM' },
  };
  const defaultMobileBindings = { left: 'KeyA' };

  assert.deepEqual(
    getHumanInputBindings('p2', bindings, { mobileControlsActive: true, defaultMobileBindings }),
    defaultMobileBindings,
  );
  assert.equal(
    getHumanInputBindings('p2', bindings, { mobileControlsActive: false, defaultMobileBindings }),
    bindings.p2,
  );
});

test('mobile input routing detects the mounted Sumorai shared controller', () => {
  const doc = {
    querySelector(selector) {
      return selector === '[data-mobile-controller-root="sumorai-touch"]' ? {} : null;
    },
  };

  assert.equal(isMobileControllerMounted(doc), true);
  assert.equal(isMobileControllerMounted({ querySelector: () => null }), false);
});


function makeClassList(initial) {
  const classes = new Set(initial);
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); },
  };
}
