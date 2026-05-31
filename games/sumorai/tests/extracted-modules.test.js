import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAudioController } from '../scripts/audio.js';
import { swapBindingForSide } from '../scripts/controls-screen.js';
import { spawnBloodEffect, spawnChingEffect, tickEffects } from '../scripts/effects.js';
import { createLobbyUi, queueHintText, sideLockedText } from '../scripts/lobby-ui.js';
import { createInitialGameState, prepareRoundState, resetMatchProgress } from '../scripts/match-state.js';
import { getHumanInputBindings, isMobileControllerMounted } from '../scripts/mobile-input-routing.js';
import {
  buildOnlineStagePlan,
  drawOnlineCountdown,
  EMPTY_INPUT,
  getOnlineStageForRound,
  inputsDiffer,
  normalizeOnlineStagePlan,
  pickOnlineStage,
} from '../scripts/online-match-view.js';
import { startOnlineMatchSession } from '../scripts/online-match-start.js';
import { wireOnlineLobbyEvents } from '../scripts/online-lobby-events.js';
import { maybeAwardForfeitWin, wireOnlineCallbacks } from '../scripts/online-callbacks.js';
import { publishOnlineMatchResult, renderOnlineResultRating, renderRankedProfile } from '../scripts/online-results.js';
import {
  formatRankedRecord,
  formatRankedWinRate,
  renderRankedProfileDefault,
  renderRankedProfileError,
  renderRankedProfileLoading,
  renderRankedProfileRating,
  renderRankedProfileSignedOut,
  renderRankedResultRating,
} from '../scripts/ranked-ui.js';
import { loadGameState, saveGameState } from '../scripts/rollback-state.js';
import { tickRoundEndState, tickRoundStartState, triggerRoundEndState } from '../scripts/round-lifecycle.js';
import { tickSimulationStep } from '../scripts/simulation-step.js';
import { wireSetupEvents } from '../scripts/setup-events.js';
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

test('online stage plan pins every round to the authority layout list', () => {
  const plan = buildOnlineStagePlan(0, 5);

  assert.deepEqual(plan, {
    seed: 0,
    stages: ['battlefield', 'none', 'battlefield', 'moving', 'single'],
  });
  assert.equal(getOnlineStageForRound(plan, 0.99, 1), 'battlefield');
  assert.equal(getOnlineStageForRound(plan, 0.99, 4), 'moving');
  assert.equal(getOnlineStageForRound(null, 0.42, 2), 'single');
  assert.deepEqual(normalizeOnlineStagePlan({
    seed: 7,
    stagePlan: ['battlefield', 'bogus', 'none'],
  }), {
    seed: 7,
    stages: ['battlefield', 'none'],
  });
  assert.equal(normalizeOnlineStagePlan({ stagePlan: ['bogus'] }), null);
});

test('drawOnlineCountdown preserves the original draw sequence', () => {
  const calls = [];
  const sounds = [];
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

test('match state helpers create and reset the serializable match shell', () => {
  const state = createInitialGameState({
    createPlayer: side => ({ side, wins: 3 }),
    createPlatforms: layout => [{ layout }],
    defaultLayout: 'single',
  });

  assert.equal(state.phase, 'menu');
  assert.equal(state.roundTarget, 2);
  assert.equal(state.p1.side, 'p1');
  assert.equal(state.p2.side, 'p2');
  assert.deepEqual(state.platforms, [{ layout: 'single' }]);

  state.roundNum = 4;
  state.roundEnd = { winner: 'p2' };
  resetMatchProgress(state);

  assert.equal(state.p1.wins, 0);
  assert.equal(state.p2.wins, 0);
  assert.equal(state.roundNum, 0);
  assert.equal(state.roundEnd, null);
});

test('prepareRoundState resets transient round objects and picks the correct stage source', () => {
  const camera = { reset: false };
  const p1 = { side: 'p1', wins: 1, inputsLocked: false };
  const p2 = { side: 'p2', wins: 0, inputsLocked: false };
  const state = {
    phase: 'active',
    roundNum: 2,
    roundStartTick: 99,
    p1,
    p2,
    p1Projectile: { active: true },
    p2Projectile: { active: true },
    gridlock: { timer: 1 },
    effects: [{ type: 'spark' }],
    clashFlash: 1,
    deathFlash: 1,
    platforms: [],
  };

  prepareRoundState(state, {
    camera,
    createPlatforms: layout => [{ layout }],
    isOnline: true,
    onlineMatchSeed: 0.25,
    pickOnlineStage: () => 'moving',
    resetCamera: cam => { cam.reset = true; },
    resetPlayer: player => { player.reset = true; },
    selectedLayout: 'battlefield',
  });

  assert.equal(state.phase, 'round_start');
  assert.equal(state.roundStartTick, 0);
  assert.deepEqual(state.platforms, [{ layout: 'moving' }]);
  assert.equal(state.p1Projectile, null);
  assert.equal(state.p2Projectile, null);
  assert.equal(state.gridlock, null);
  assert.deepEqual(state.effects, []);
  assert.equal(state.clashFlash, 0);
  assert.equal(state.deathFlash, 0);
  assert.equal(state.p1.inputsLocked, true);
  assert.equal(state.p2.inputsLocked, true);
  assert.equal(state.p1.reset, true);
  assert.equal(state.p2.reset, true);
  assert.equal(camera.reset, true);
});

test('ranked UI helpers preserve rating display formatting', () => {
  const rating = { rating: 1268, wins: 7, losses: 2, draws: 1 };

  assert.equal(formatRankedRecord(rating), '7W / 2L / 1D');
  assert.equal(formatRankedRecord({}), '0W / 0L / 0D');
  assert.equal(formatRankedWinRate(rating), '70% win rate');
  assert.equal(formatRankedWinRate({ wins: 0, losses: 0, draws: 0 }), '');
});

test('ranked result renderer updates the result screen only when all nodes exist', () => {
  const doc = makeDocument([
    ['ranked-result-rating', { hidden: true }],
    ['ranked-result-value', { textContent: '' }],
    ['ranked-result-record', { textContent: '' }],
  ]);

  assert.equal(renderRankedResultRating(doc, { rating: 1300, wins: 3, losses: 4, draws: 0 }), true);
  assert.equal(doc.getElementById('ranked-result-rating').hidden, false);
  assert.equal(doc.getElementById('ranked-result-value').textContent, 'Rating: 1300');
  assert.equal(doc.getElementById('ranked-result-record').textContent, '3W / 4L / 0D');

  assert.equal(renderRankedResultRating(makeDocument([]), { rating: 1300 }), false);
});

test('ranked profile renderers preserve signed-out, loading, loaded, default, and error states', () => {
  const doc = makeDocument([
    ['ranked-rating-num', { textContent: '' }],
    ['ranked-record', { textContent: '' }],
    ['ranked-winrate', { textContent: '' }],
  ]);

  renderRankedProfileSignedOut(doc);
  assert.equal(doc.getElementById('ranked-rating-num').textContent, '\u2014');
  assert.equal(doc.getElementById('ranked-record').textContent, 'Sign in to track your rating.');
  assert.equal(doc.getElementById('ranked-winrate').textContent, '');

  renderRankedProfileLoading(doc);
  assert.equal(doc.getElementById('ranked-rating-num').textContent, '\u2026');
  assert.equal(doc.getElementById('ranked-record').textContent, '');
  assert.equal(doc.getElementById('ranked-winrate').textContent, '');

  renderRankedProfileRating(doc, { rating: 1444, wins: 5, losses: 5, draws: 0 });
  assert.equal(doc.getElementById('ranked-rating-num').textContent, '1444');
  assert.equal(doc.getElementById('ranked-record').textContent, '5W / 5L / 0D');
  assert.equal(doc.getElementById('ranked-winrate').textContent, '50% win rate');

  renderRankedProfileDefault(doc);
  assert.equal(doc.getElementById('ranked-rating-num').textContent, '1200');
  assert.equal(doc.getElementById('ranked-record').textContent, '0W / 0L / 0D');
  assert.equal(doc.getElementById('ranked-winrate').textContent, '');

  renderRankedProfileError(doc);
  assert.equal(doc.getElementById('ranked-rating-num').textContent, '\u2014');
  assert.equal(doc.getElementById('ranked-record').textContent, 'Could not load rating.');
  assert.equal(doc.getElementById('ranked-winrate').textContent, '');
});

test('online lobby event wiring preserves side, matchmaking, room, and menu actions', () => {
  const sideCards = [
    makeElement({ dataset: { side: 'p1' }, classList: makeClassList(['side-card--selected']) }),
    makeElement({ dataset: { side: 'p2' }, classList: makeClassList([]) }),
  ];
  const elements = new Map([
    ['side-conflict-error', makeElement({ hidden: false })],
    ['room-code-input', makeElement({ value: ' abcd ' })],
    ['searching-label', makeElement({ textContent: '' })],
    ...[
      'btn-side-confirm',
      'btn-online-side-back',
      'btn-ranked-match',
      'btn-find-match',
      'btn-play-friend',
      'btn-lobby-main-back',
      'btn-cancel-search',
      'btn-create-room',
      'btn-join-room-option',
      'btn-friend-options-back',
      'btn-cancel-room',
      'btn-join-submit',
      'btn-join-back',
      'btn-online-rematch',
      'btn-online-result-menu',
      'btn-ranked-back',
      'btn-disconnected-menu',
    ].map(id => [id, makeElement()]),
  ]);
  const documentLike = {
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    querySelectorAll(selector) {
      return selector === '.side-card' ? sideCards : [];
    },
  };
  const calls = [];
  const sounds = [];
  const client = {
    cancelRoom: () => calls.push(['cancelRoom']),
    cancelSearch: () => calls.push(['cancelSearch']),
    createRoom: side => calls.push(['createRoom', side]),
    disconnect: () => calls.push(['disconnect']),
    findMatch: (side, ranked) => calls.push(['findMatch', side, ranked]),
    joinRoom: (side, code) => calls.push(['joinRoom', side, code]),
  };
  let onlineClient = client;
  let onlineSide = 'p1';
  let onlineIsRanked = false;
  let onlineQueueCounts = { p1: 1 };
  let isOnline = true;
  const gameState = { p1: { wins: 2 }, p2: { wins: 1 } };

  wireOnlineLobbyEvents({
    document: documentLike,
    gameState,
    getOnlineClient: () => onlineClient,
    getOnlineSide: () => onlineSide,
    setIsOnline: value => { isOnline = value; },
    setOnlineClient: value => { onlineClient = value; },
    setOnlineIsRanked: value => { onlineIsRanked = value; },
    setOnlineQueueCounts: value => { onlineQueueCounts = value; },
    setOnlineSide: value => { onlineSide = value; },
    setSideLocked: id => calls.push(['setSideLocked', id]),
    showLobbyPhase: phase => calls.push(['showLobbyPhase', phase]),
    showScreen: screen => calls.push(['showScreen', screen]),
    stopAmbient: () => calls.push(['stopAmbient']),
    stopSearchDots: () => calls.push(['stopSearchDots']),
    stopWaitingDots: () => calls.push(['stopWaitingDots']),
    updateQueueHint: () => calls.push(['updateQueueHint']),
    playSound: sound => sounds.push(sound),
  });

  sideCards[1].click();
  assert.equal(onlineSide, 'p2');
  assert.equal(sideCards[0].classList.contains('side-card--selected'), false);
  assert.equal(sideCards[1].classList.contains('side-card--selected'), true);
  assert.equal(elements.get('side-conflict-error').hidden, true);

  elements.get('btn-ranked-match').click();
  assert.equal(onlineIsRanked, true);
  assert.deepEqual(calls.at(-1), ['findMatch', 'p2', true]);

  elements.get('btn-find-match').click();
  assert.equal(onlineIsRanked, false);
  assert.deepEqual(calls.at(-1), ['findMatch', 'p2', false]);

  elements.get('btn-join-submit').click();
  assert.equal(elements.get('searching-label').textContent, 'Joining room\u2026');
  assert.deepEqual(calls.slice(-3), [
    ['setSideLocked', 'searching-side-locked'],
    ['showLobbyPhase', 'searching'],
    ['joinRoom', 'p2', 'ABCD'],
  ]);

  elements.get('btn-online-side-back').click();
  assert.equal(onlineClient, null);
  assert.equal(onlineQueueCounts, null);
  assert.deepEqual(calls.slice(-4), [
    ['stopSearchDots'],
    ['stopWaitingDots'],
    ['disconnect'],
    ['showScreen', 'screen-menu'],
  ]);

  onlineClient = client;
  elements.get('btn-online-rematch').click();
  assert.equal(isOnline, false);
  assert.equal(gameState.p1.wins, 0);
  assert.equal(gameState.p2.wins, 0);
  assert.deepEqual(calls.slice(-5), [
    ['stopAmbient'],
    ['setSideLocked', 'online-side-locked'],
    ['updateQueueHint'],
    ['showScreen', 'screen-online-lobby'],
    ['showLobbyPhase', 'main'],
  ]);
  assert.deepEqual(sounds, ['ching', 'ching', 'ching', 'ching', 'swing', 'ching']);
});

test('setup event wiring preserves local, CPU, setup, and result menu actions', () => {
  const elements = new Map([
    ...[
      'btn-local',
      'btn-cpu',
      'btn-online',
      'btn-ranked',
      'btn-start-cpu',
      'btn-cpu-back',
      'btn-start-match',
      'btn-setup-back',
      'btn-rematch',
      'btn-result-menu',
    ].map(id => [id, makeElement()]),
  ]);
  const groups = new Map([
    ['.side-btn', [
      makeElement({ dataset: { side: 'p1' }, classList: makeClassList(['side-btn--active']) }),
      makeElement({ dataset: { side: 'p2' }, classList: makeClassList([]) }),
    ]],
    ['.diff-btn', [
      makeElement({ dataset: { difficulty: 'easy' }, classList: makeClassList([]) }),
      makeElement({ dataset: { difficulty: 'hard' }, classList: makeClassList(['diff-btn--active']) }),
    ]],
    ['.cpu-round-btn', [
      makeElement({ dataset: { rounds: '3' }, classList: makeClassList(['cpu-round-btn--active']) }),
      makeElement({ dataset: { rounds: '5' }, classList: makeClassList([]) }),
    ]],
    ['.cpu-layout-btn', [
      makeElement({ dataset: { layout: 'single' }, classList: makeClassList(['cpu-layout-btn--active']) }),
      makeElement({ dataset: { layout: 'moving' }, classList: makeClassList([]) }),
    ]],
    ['.round-btn', [
      makeElement({ dataset: { rounds: '3' }, classList: makeClassList(['round-btn--active']) }),
      makeElement({ dataset: { rounds: '5' }, classList: makeClassList([]) }),
    ]],
    ['.layout-btn', [
      makeElement({ dataset: { layout: 'single' }, classList: makeClassList(['layout-btn--active']) }),
      makeElement({ dataset: { layout: 'battlefield' }, classList: makeClassList([]) }),
    ]],
  ]);
  const documentLike = {
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    querySelectorAll(selector) {
      return groups.get(selector) ?? [];
    },
  };
  const calls = [];
  const sounds = [];
  const gameState = { p1: { wins: 2 }, p2: { wins: 1 }, roundTarget: 0 };
  let botConfig = { enabled: false, side: 'p2', difficulty: 'hard' };
  let selectedRounds = 3;
  let selectedLayout = 'single';
  let p1Label = '';
  let p2Label = '';

  wireSetupEvents({
    document: documentLike,
    gameState,
    factoryName: 'Akira',
    enterOnlineFlow: () => calls.push(['enterOnlineFlow']),
    getBotConfig: () => botConfig,
    getSelectedRounds: () => selectedRounds,
    setBotConfig: value => { botConfig = value; },
    setP1Label: value => { p1Label = value; },
    setP2Label: value => { p2Label = value; },
    setSelectedLayout: value => { selectedLayout = value; },
    setSelectedRounds: value => { selectedRounds = value; },
    showRankedProfile: () => calls.push(['showRankedProfile']),
    showScreen: screen => calls.push(['showScreen', screen]),
    startMatch: () => calls.push(['startMatch']),
    stopAmbient: () => calls.push(['stopAmbient']),
    playSound: sound => sounds.push(sound),
  });

  elements.get('btn-local').click();
  assert.equal(botConfig.enabled, false);
  assert.equal(p1Label, 'Akira');
  assert.equal(p2Label, 'Player 2');
  assert.deepEqual(calls.at(-1), ['showScreen', 'screen-setup']);

  elements.get('btn-online').click();
  elements.get('btn-ranked').click();
  assert.deepEqual(calls.slice(-2), [['enterOnlineFlow'], ['showRankedProfile']]);

  groups.get('.side-btn')[1].click();
  groups.get('.diff-btn')[0].click();
  groups.get('.cpu-round-btn')[1].click();
  groups.get('.cpu-layout-btn')[1].click();
  assert.equal(botConfig.side, 'p1');
  assert.equal(botConfig.difficulty, 'easy');
  assert.equal(selectedRounds, 5);
  assert.equal(selectedLayout, 'moving');

  elements.get('btn-start-cpu').click();
  assert.equal(botConfig.enabled, true);
  assert.equal(p1Label, 'CPU');
  assert.equal(p2Label, 'Akira');
  assert.equal(gameState.roundTarget, 3);
  assert.deepEqual(calls.at(-1), ['startMatch']);

  groups.get('.round-btn')[0].click();
  groups.get('.layout-btn')[1].click();
  assert.equal(selectedRounds, 3);
  assert.equal(selectedLayout, 'battlefield');

  elements.get('btn-start-match').click();
  assert.equal(gameState.roundTarget, 2);
  assert.deepEqual(calls.at(-1), ['startMatch']);

  elements.get('btn-result-menu').click();
  assert.equal(gameState.p1.wins, 0);
  assert.equal(gameState.p2.wins, 0);
  assert.deepEqual(calls.slice(-2), [['stopAmbient'], ['showScreen', 'screen-menu']]);
  assert.deepEqual(sounds, [
    'ching',
    'ching',
    'ching',
    'ching',
    'ching',
    'ching',
    'ching',
    'ching',
    'ching',
    'ching',
    'ching',
    'swing',
  ]);
});

test('online callbacks preserve queue, match-ready, remote input, and disconnect behavior', () => {
  const sideCards = [
    makeElement({ classList: makeClassList(['side-card--selected']) }),
    makeElement({ classList: makeClassList(['side-card--selected']) }),
  ];
  const documentLike = {
    getElementById(id) {
      if (id === 'room-code-display') return roomCode;
      if (id === 'side-conflict-error') return sideConflict;
      return null;
    },
    querySelectorAll(selector) {
      return selector === '.side-card' ? sideCards : [];
    },
  };
  const roomCode = makeElement({ textContent: '' });
  const sideConflict = makeElement({ hidden: true });
  const calls = [];
  const onlineClient = {
    cb: {},
    requestQueueStatus: () => calls.push(['requestQueueStatus']),
    stopPinging: () => calls.push(['stopPinging']),
  };
  const gameState = { phase: 'active' };
  let queueCounts = null;
  let matchSeed = 0;
  let clockOffset = 0;
  let startAt = 0;
  let remoteProfile = null;
  let remoteInput = null;
  let partnerEnd = null;
  let stagePlan = null;
  let isOnline = true;
  const predicted = [];
  predicted[5] = { seq: 5, left: false };

  wireOnlineCallbacks({
    ROLLBACK_WINDOW: 12,
    buildForfeitSessionId: seed => `sumorai:${seed}:forfeit`,
    createPlatformApiClient: () => ({ updateGameRating: () => Promise.resolve() }),
    document: documentLike,
    gameState,
    getOnlineIdentity: () => ({ playerId: 'local' }),
    getOnlineIsRanked: () => true,
    getOnlineMatchSeed: () => matchSeed,
    getOnlineRemoteIdentity: () => ({ playerId: 'remote' }),
    getRollbackFrame: () => 8,
    inputsDiffer: (a, b) => a.left !== b.left,
    normalizeOnlineStagePlan,
    onlineClient,
    resimulate: frame => calls.push(['resimulate', frame]),
    setIsOnline: value => { isOnline = value; },
    setOnlineClockOffset: value => { clockOffset = value; },
    setOnlineMatchSeed: value => { matchSeed = value; },
    setOnlinePartnerEnd: value => { partnerEnd = value; },
    setOnlineQueueCounts: value => { queueCounts = value; },
    setOnlineRemoteIdentity: value => { remoteProfile = value; },
    setOnlineRemoteLastInput: value => { remoteInput = value; },
    setOnlineStagePlan: value => { stagePlan = value; },
    setOnlineStartAt: value => { startAt = value; },
    showLobbyPhase: phase => calls.push(['showLobbyPhase', phase]),
    showScreen: screen => calls.push(['showScreen', screen]),
    startOnlineMatch: () => calls.push(['startOnlineMatch']),
    startSearchDots: label => calls.push(['startSearchDots', label]),
    startWaitingDots: () => calls.push(['startWaitingDots']),
    stopAmbient: () => calls.push(['stopAmbient']),
    stopSearchDots: () => calls.push(['stopSearchDots']),
    stopWaitingDots: () => calls.push(['stopWaitingDots']),
    updatePredictedInput: (slot, snap, differs) => {
      const changed = differs(predicted[slot], snap);
      if (changed) predicted[slot] = { ...snap };
      return changed;
    },
    updateQueueHint: () => calls.push(['updateQueueHint']),
    setSideLocked: id => calls.push(['setSideLocked', id]),
  });

  onlineClient.cb.onConnected();
  onlineClient.cb.onQueueCounts({ p2: 1 });
  assert.deepEqual(calls.slice(0, 2), [['requestQueueStatus'], ['updateQueueHint']]);
  assert.deepEqual(queueCounts, { p2: 1 });

  onlineClient.cb.onSearching();
  assert.deepEqual(calls.slice(-3), [
    ['setSideLocked', 'searching-side-locked'],
    ['startSearchDots', 'Searching Ranked'],
    ['showLobbyPhase', 'searching'],
  ]);

  onlineClient.cb.onRoomCreated('ROOM');
  assert.equal(roomCode.textContent, 'ROOM');
  assert.deepEqual(calls.slice(-2), [['startWaitingDots'], ['showLobbyPhase', 'create']]);

  onlineClient.cb.onMatchReady({
    seed: 0.5,
    matchSettings: { seed: 12345, stagePlan: ['battlefield', 'none'] },
    serverNow: Date.now() + 20,
    startAt: 1234,
  });
  assert.equal(matchSeed, 12345);
  assert.deepEqual(stagePlan, { seed: 12345, stages: ['battlefield', 'none'] });
  assert.equal(clockOffset >= 0, true);
  assert.equal(startAt, 1234);
  assert.deepEqual(calls.slice(-3), [['stopSearchDots'], ['stopWaitingDots'], ['startOnlineMatch']]);

  const callCountAfterReady = calls.length;
  onlineClient.cb.onMatchReady({ seed: 0.5, matchSettings: null, serverNow: Date.now(), startAt: 9999 });
  assert.equal(calls.length, callCountAfterReady);
  assert.equal(startAt, 1234);

  onlineClient.cb.onRemoteProfile({ playerId: 'remote' });
  assert.deepEqual(remoteProfile, { playerId: 'remote' });

  onlineClient.cb.onRemoteInput({ seq: 5, left: true });
  assert.deepEqual(remoteInput, { seq: 5, left: true });
  assert.deepEqual(calls.at(-1), ['resimulate', 5]);

  onlineClient.cb.onRemoteRoundEnd({ winner: 'p2' });
  assert.deepEqual(partnerEnd, { winner: 'p2' });

  onlineClient.cb.onSideConflict();
  assert.equal(sideConflict.hidden, false);
  assert.equal(sideCards[0].classList.contains('side-card--selected'), false);
  assert.deepEqual(calls.slice(-4), [
    ['stopSearchDots'],
    ['stopWaitingDots'],
    ['showScreen', 'screen-online-lobby'],
    ['showLobbyPhase', 'side_select'],
  ]);

  onlineClient.cb.onPartnerLeft();
  assert.equal(isOnline, false);
  assert.equal(remoteProfile, null);
  assert.equal(gameState.phase, 'menu');
  assert.deepEqual(calls.slice(-4), [
    ['stopWaitingDots'],
    ['stopPinging'],
    ['stopAmbient'],
    ['showScreen', 'screen-online-disconnected'],
  ]);
});

test('forfeit rating update only applies during active ranked matches with both profiles', () => {
  const calls = [];
  const updated = maybeAwardForfeitWin({
    buildForfeitSessionId: seed => `sumorai:${seed}:forfeit`,
    createPlatformApiClient: () => ({
      updateGameRating(gameId, payload) {
        calls.push([gameId, payload]);
        return Promise.resolve();
      },
    }),
    gameState: { phase: 'round_start' },
    getOnlineIdentity: () => ({ playerId: 'local' }),
    getOnlineIsRanked: () => true,
    getOnlineMatchSeed: () => 0.25,
    getOnlineRemoteIdentity: () => ({ playerId: 'remote' }),
  });

  assert.equal(updated, true);
  assert.deepEqual(calls, [[
    'sumorai-ranked',
    {
      opponentPlayerId: 'remote',
      outcome: 'win',
      sessionId: 'sumorai:0.25:forfeit',
    },
  ]]);

  assert.equal(maybeAwardForfeitWin({
    buildForfeitSessionId: seed => `sumorai:${seed}:forfeit`,
    createPlatformApiClient: () => ({ updateGameRating: () => Promise.resolve() }),
    gameState: { phase: 'menu' },
    getOnlineIdentity: () => ({ playerId: 'local' }),
    getOnlineIsRanked: () => true,
    getOnlineMatchSeed: () => 0.25,
    getOnlineRemoteIdentity: () => ({ playerId: 'remote' }),
  }), false);
});

test('online result helpers publish activity, ranked ratings, and profile states', async () => {
  const calls = [];
  publishOnlineMatchResult({
    createPlatformApiClient: () => ({
      updateGameRating(gameId, payload) {
        calls.push(['rating', gameId, payload]);
        return Promise.resolve();
      },
    }),
    gameState: { p1: { wins: 2 }, p2: { wins: 1 } },
    onlineIdentity: { playerId: 'local' },
    onlineIsRanked: true,
    onlineMatchSeed: 0.75,
    onlineRemoteIdentity: { playerId: 'remote' },
    onlineSide: 'p1',
    publishMatchActivity(payload) {
      calls.push(['activity', payload]);
      return Promise.resolve();
    },
    winner: 'p1',
  });

  assert.deepEqual(calls, [
    ['activity', {
      result: 'win',
      mySide: 'p1',
      p1Wins: 2,
      p2Wins: 1,
      myProfile: { playerId: 'local' },
      opponentProfile: { playerId: 'remote' },
      sessionId: 'sumorai:0.75',
    }],
    ['rating', 'sumorai-ranked', {
      opponentPlayerId: 'remote',
      outcome: 'win',
      sessionId: 'sumorai:0.75',
    }],
  ]);

  const doc = makeDocument([]);
  const didRender = await renderOnlineResultRating({
    createPlatformApiClient: () => ({
      getGameRating: async () => ({ rating: 1220 }),
    }),
    document: doc,
    onlineIdentity: { playerId: 'local' },
    renderRating(documentRef, rating) {
      calls.push(['resultRating', documentRef, rating]);
      return true;
    },
  });
  assert.equal(didRender, true);
  assert.equal(calls.at(-1)[0], 'resultRating');

  await renderRankedProfile({
    buildOnlineIdentity: () => ({ playerId: 'fallback' }),
    createPlatformApiClient: () => ({ getGameRating: async () => null }),
    document: doc,
    factoryProfile: {},
    onlineIdentity: null,
    renderDefault: documentRef => calls.push(['default', documentRef]),
    renderError: documentRef => calls.push(['error', documentRef]),
    renderLoading: documentRef => calls.push(['loading', documentRef]),
    renderRating: (documentRef, rating) => calls.push(['profileRating', documentRef, rating]),
    renderSignedOut: documentRef => calls.push(['signedOut', documentRef]),
    showScreen: screen => calls.push(['showScreen', screen]),
  });
  assert.deepEqual(calls.slice(-3).map(call => call[0]), ['showScreen', 'loading', 'default']);
});

test('online match start helper resets labels and rollback session state', () => {
  const calls = [];
  const gameState = { phase: 'menu', roundTarget: 0 };
  let labels = null;
  let isOnline = false;
  let remoteLastInput = {};
  let partnerEnd = {};
  let partnerGraceTicks = 4;
  let rollbackState = null;
  let resimulating = true;
  let rollbackCounters = null;

  startOnlineMatchSession({
    ROLLBACK_WINDOW: 12,
    factoryName: 'Akira',
    gameState,
    onlineClient: { startPinging: () => calls.push(['startPinging']) },
    onlineIdentity: { displayName: 'Akira Online' },
    onlineRemoteIdentity: { displayName: 'Remote' },
    onlineSide: 'p2',
    setIsOnline: value => { isOnline = value; },
    setLabels: value => { labels = value; },
    setOnlinePartnerEnd: value => { partnerEnd = value; },
    setOnlinePartnerGraceTicks: value => { partnerGraceTicks = value; },
    setOnlineRemoteLastInput: value => { remoteLastInput = value; },
    setResimulating: value => { resimulating = value; },
    setRollbackCounters: value => { rollbackCounters = value; },
    setRollbackState: value => { rollbackState = value; },
    showScreen: screen => calls.push(['showScreen', screen]),
    startAmbient: () => calls.push(['startAmbient']),
  });

  assert.deepEqual(labels, { p1: 'Remote', p2: 'Akira Online' });
  assert.equal(gameState.roundTarget, 3);
  assert.equal(gameState.phase, 'online_countdown');
  assert.equal(isOnline, true);
  assert.equal(remoteLastInput, null);
  assert.equal(partnerEnd, null);
  assert.equal(partnerGraceTicks, 0);
  assert.equal(rollbackState.localFrame, 0);
  assert.equal(rollbackState.stateBuffer.length, 12);
  assert.equal(rollbackState.localInputs.length, 12);
  assert.equal(rollbackState.predicted.length, 12);
  assert.equal(resimulating, false);
  assert.deepEqual(rollbackCounters, {
    rollbacksThisSec: 0,
    displayRollbacks: 0,
    secStartFrame: 0,
  });
  assert.deepEqual(calls, [
    ['startPinging'],
    ['showScreen', 'screen-game'],
    ['startAmbient'],
  ]);
});

test('round lifecycle trigger locks players and records draw or winner state', () => {
  const sounds = [];
  const blood = [];
  const state = {
    phase: 'active',
    deathFlash: 0,
    p1Projectile: { active: true },
    p2Projectile: { active: true },
    p1: makeLifecyclePlayer('p1', { x: 20, y: 40, facing: 1 }),
    p2: makeLifecyclePlayer('p2', { x: 70, y: 40, facing: -1 }),
    roundEnd: null,
  };

  triggerRoundEndState(state, 'p1', {
    playSound: sound => sounds.push(sound),
    spawnBlood: (...args) => blood.push(args),
  });

  assert.equal(state.phase, 'round_end');
  assert.equal(state.deathFlash, 1);
  assert.equal(state.p1Projectile, null);
  assert.equal(state.p2Projectile, null);
  assert.deepEqual(sounds, ['death']);
  assert.deepEqual(blood, [[80, 26, true]]);
  assert.equal(state.p1.inputsLocked, true);
  assert.equal(state.p1.throwing, false);
  assert.equal(state.p1.speedX, 0);
  assert.deepEqual(state.roundEnd, {
    winner: 'p1',
    loser: 'p2',
    tick: 0,
    triggered: false,
    fadingIn: false,
    isBlastKill: false,
  });

  triggerRoundEndState(state, 'draw', {
    isBlastKill: true,
    playSound: sound => sounds.push(sound),
    spawnBlood: (...args) => blood.push(args),
  });
  assert.equal(sounds.at(-1), 'explosion');
  assert.equal(blood.length, 1);
  assert.equal(state.roundEnd.winner, 'draw');
  assert.equal(state.roundEnd.loser, null);
});

test('round start lifecycle plays cues and unlocks players on the active tick', () => {
  const calls = [];
  const state = {
    phase: 'round_start',
    roundStartTick: 0,
    platforms: [],
    p1: { inputsLocked: true },
    p2: { inputsLocked: true },
  };

  for (let i = 0; i < 150; i++) {
    tickRoundStartState({
      camera: {},
      gameState: state,
      playSound: sound => calls.push(['sound', sound]),
      stepAnimation: player => calls.push(['step', player]),
      updateCamera: () => calls.push(['camera']),
      updatePlatforms: () => calls.push(['platforms']),
    });
  }

  assert.equal(state.phase, 'active');
  assert.equal(state.p1.inputsLocked, false);
  assert.equal(state.p2.inputsLocked, false);
  assert.deepEqual(calls.filter(call => call[0] === 'sound'), [
    ['sound', 'are_you_ready'],
    ['sound', 'fight'],
  ]);
});

test('round end lifecycle awards wins and advances to local result or next round fade', () => {
  const resultWinner = makeElement({ textContent: '' });
  const doc = makeDocument([['result-winner', resultWinner]]);
  const state = {
    phase: 'round_end',
    roundTarget: 1,
    roundNum: 1,
    platforms: [{ old: true }],
    p1: makeLifecyclePlayer('p1', { wins: 0 }),
    p2: makeLifecyclePlayer('p2', { wins: 0 }),
    roundEnd: { winner: 'p1', loser: 'p2', tick: 179, triggered: false, fadingIn: false },
  };
  const calls = [];

  tickRoundEndState({
    applyPhysics: (...args) => calls.push(['physics', ...args]),
    camera: {},
    createPlatforms: layout => [{ layout }],
    document: doc,
    gameState: state,
    isOnline: false,
    onlineIsRanked: false,
    onlineMatchSeed: 0,
    onlineRemoteIdentity: null,
    p1Label: 'Akira',
    p2Label: 'CPU',
    pickOnlineStage: () => 'moving',
    publishOnlineMatchResult: () => calls.push(['publish']),
    resetCamera: () => calls.push(['resetCamera']),
    resetPlayer: player => { player.reset = true; },
    selectedLayout: 'single',
    setTimeout: callback => callback(),
    showOnlineResultRating: () => calls.push(['rating']),
    showScreen: screen => calls.push(['screen', screen]),
    stepAnimation: player => calls.push(['step', player.side]),
    tickVisualEffects: () => calls.push(['effects']),
    updateCamera: () => calls.push(['camera']),
    updatePlatforms: () => calls.push(['platforms']),
  });

  assert.equal(state.phase, 'match_end');
  assert.equal(state.p1.wins, 1);
  assert.equal(resultWinner.textContent, 'Akira Wins!');
  assert.deepEqual(calls.at(-1), ['screen', 'screen-result']);

  state.roundTarget = 2;
  state.phase = 'round_end';
  state.p1.wins = 0;
  state.roundEnd = { winner: 'p1', loser: 'p2', tick: 179, triggered: false, fadingIn: false };

  tickRoundEndState({
    applyPhysics: () => {},
    camera: {},
    createPlatforms: layout => [{ layout }],
    document: doc,
    gameState: state,
    isOnline: true,
    onlineIsRanked: false,
    onlineMatchSeed: 0.4,
    onlineRemoteIdentity: null,
    p1Label: 'Akira',
    p2Label: 'CPU',
    pickOnlineStage: () => 'moving',
    publishOnlineMatchResult: () => {},
    resetCamera: () => {},
    resetPlayer: player => { player.reset = true; },
    selectedLayout: 'single',
    setTimeout: callback => callback(),
    showOnlineResultRating: () => {},
    showScreen: () => {},
    stepAnimation: () => {},
    tickVisualEffects: () => {},
    updateCamera: () => {},
    updatePlatforms: () => {},
  });

  assert.equal(state.phase, 'round_end');
  assert.equal(state.roundNum, 2);
  assert.deepEqual(state.platforms, [{ layout: 'moving' }]);
  assert.equal(state.roundEnd.fadingIn, true);

  state.roundEnd.tick = 240;
  tickRoundEndState({
    applyPhysics: () => {},
    camera: {},
    createPlatforms: layout => [{ layout }],
    document: doc,
    gameState: state,
    isOnline: true,
    onlineIsRanked: false,
    onlineMatchSeed: 0.4,
    onlineRemoteIdentity: null,
    p1Label: 'Akira',
    p2Label: 'CPU',
    pickOnlineStage: () => 'moving',
    publishOnlineMatchResult: () => {},
    resetCamera: () => {},
    resetPlayer: () => {},
    selectedLayout: 'single',
    setTimeout: callback => callback(),
    showOnlineResultRating: () => {},
    showScreen: () => {},
    stepAnimation: () => {},
    tickVisualEffects: () => {},
    updateCamera: () => {},
    updatePlatforms: () => {},
  });
  assert.equal(state.phase, 'round_start');
  assert.equal(state.roundStartTick, 0);
  assert.equal(state.roundEnd, null);
});

test('simulation step resolves gridlock without running normal combat', () => {
  const sounds = [];
  const state = {
    gridlock: { timer: 1 },
    p1: { inGridlock: true, inputsLocked: true },
    p2: { inGridlock: true, inputsLocked: true },
  };

  tickSimulationStep({
    ...makeSimulationDeps(state),
    playSound: sound => sounds.push(sound),
    tickGridlock: () => ({ resolved: true }),
  });

  assert.equal(state.gridlock, null);
  assert.equal(state.p1.inGridlock, false);
  assert.equal(state.p2.inGridlock, false);
  assert.equal(state.p1.inputsLocked, false);
  assert.equal(state.p2.inputsLocked, false);
  assert.deepEqual(sounds, ['gridlock_end']);
});

test('simulation step handles projectile clash and remote round-end grace', () => {
  const chings = [];
  const roundEnds = [];
  let partnerEnd = { winner: 'p2' };
  let partnerGrace = 7;
  const state = {
    gridlock: null,
    platforms: [],
    p1: makeSimulationPlayer('p1', { x: 10, y: 10 }),
    p2: makeSimulationPlayer('p2', { x: 30, y: 10 }),
    p1Projectile: { active: true, x: 8, y: 6, facing: 1 },
    p2Projectile: { active: true, x: 12, y: 10, facing: -1 },
  };

  tickSimulationStep({
    ...makeSimulationDeps(state),
    checkProjectileClash: () => true,
    isOnline: true,
    onlineClient: { sendRoundEnd: winner => roundEnds.push(winner) },
    onlinePartnerEnd: partnerEnd,
    onlinePartnerGraceTicks: partnerGrace,
    setOnlinePartnerEnd: value => { partnerEnd = value; },
    setOnlinePartnerGraceTicks: value => { partnerGrace = value; },
    spawnChing: (...args) => chings.push(args),
    triggerRoundEnd: (...args) => roundEnds.push(args),
  });

  assert.equal(state.p1Projectile, null);
  assert.equal(state.p2Projectile, null);
  assert.deepEqual(chings, [[10, 8]]);
  assert.deepEqual(roundEnds, ['p2', ['p2', false]]);
  assert.equal(partnerEnd, null);
  assert.equal(partnerGrace, 0);
});

test('simulation step sends local round end when physics kills a player online', () => {
  const sent = [];
  const triggered = [];
  const state = {
    gridlock: null,
    platforms: [],
    p1: makeSimulationPlayer('p1'),
    p2: makeSimulationPlayer('p2'),
    p1Projectile: null,
    p2Projectile: null,
  };

  tickSimulationStep({
    ...makeSimulationDeps(state),
    applyPhysics: player => (player.side === 'p2' ? 'dead' : null),
    isOnline: true,
    onlineClient: { sendRoundEnd: winner => sent.push(winner) },
    triggerRoundEnd: (...args) => triggered.push(args),
  });

  assert.deepEqual(sent, ['p1']);
  assert.deepEqual(triggered, [['p1', true]]);
  assert.equal(state.p2.dead, true);
  assert.equal(state.p2.inputsLocked, true);
});


function makeClassList(initial) {
  const classes = new Set(initial);
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); },
  };
}

function makeLifecyclePlayer(side, overrides = {}) {
  return {
    side,
    wins: 0,
    x: 0,
    y: 0,
    facing: 1,
    dead: false,
    dying: false,
    inputsLocked: false,
    attackTimer: 10,
    throwing: true,
    dashBursting: true,
    dashBurstTimer: 10,
    dashRecovering: true,
    dashRecoveryTimer: 10,
    speedX: 4,
    ...overrides,
  };
}

function makeSimulationPlayer(side, overrides = {}) {
  return {
    side,
    x: 0,
    y: 0,
    facing: 1,
    dashCharge: 0,
    blocking: false,
    attackTimer: 0,
    throwing: false,
    dashBursting: false,
    dashBurstTimer: 0,
    dashRecovering: false,
    dashRecoveryTimer: 0,
    wantsProjectile: false,
    stamina: 10,
    speedX: 0,
    inputsLocked: false,
    ...overrides,
  };
}

function makeSimulationDeps(gameState) {
  return {
    PROJ_SHIELD_KNOCKBACK: 6,
    applyPhysics: () => null,
    camera: {},
    checkHitboxVsProjectile: () => false,
    checkProjectileClash: () => false,
    checkProjectileVsPlayer: () => null,
    createGridlockState: () => ({ created: true }),
    createProjectile: (side, x, y, facing) => ({ active: true, side, x, y, facing }),
    gameState,
    getAttackHitbox: () => ({}),
    getDashHitbox: () => ({}),
    isAttackActive: () => false,
    isDashAttackActive: () => false,
    isOnline: false,
    onlineClient: { sendRoundEnd: () => {} },
    onlinePartnerEnd: null,
    onlinePartnerGraceTicks: 0,
    p1In: {},
    p2In: {},
    playSound: () => {},
    resolveHits: () => null,
    resimulating: false,
    setOnlinePartnerEnd: () => {},
    setOnlinePartnerGraceTicks: () => {},
    spawnChing: () => {},
    stepAnimation: () => {},
    tickGridlock: () => null,
    tickProjectile: () => {},
    tickVisualEffects: () => {},
    triggerRoundEnd: () => {},
    updateCamera: () => {},
    updatePlatforms: () => {},
  };
}

function makeDocument(entries) {
  const byId = new Map(entries);
  return {
    getElementById(id) {
      return byId.get(id) ?? null;
    },
  };
}

function makeElement(initial = {}) {
  const listeners = {};
  return {
    classList: makeClassList([]),
    dataset: {},
    hidden: false,
    textContent: '',
    value: '',
    ...initial,
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    click() {
      listeners.click?.();
    },
    dispatch(type, event = {}) {
      listeners[type]?.(event);
    },
  };
}
