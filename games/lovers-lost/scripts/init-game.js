import {
  createGameState, tickFrame, advancePhaseState,
} from './game-tick.js';
import { RUN_DISTANCE } from './player.js';
import { buildDebugCollisionSnapshot } from './collision.js';
import { buildLaneSnapshot } from './lane-snapshot.js';
import { createLaneInputHandler } from './lane-input.js';
import {
  sanitizeOnlineDisplayName, isValidOnlineDisplayName,
  buildOnlineIdentity, deriveOnlineRunOverrideName,
  attachOnlineResultIdentities,
} from './online-identity.js';
import { debugEnabledFromSearch, debugObstacleTypeFromSearch, DEBUG_OBSTACLE_LABELS } from './debug-flags.js';
import { loadGameAssets } from './game-assets.js';
import { createRenderer } from './renderer.js';
import { createInput } from './input.js';
import { createMobileNameInputBridge } from './mobile-name-input.js';
import { createSounds } from './sounds.js';
import { createOnlineClient, getCountdownSecondsRemaining, hasCountdownStarted } from './online.js';
import { updatePersonalBest } from './personal-best.js';
import { publishLoversLostRunActivity } from '../../../js/platform/activity/activity.mjs';
import { loadFactoryProfile } from '../../../js/platform/identity/factory-profile.mjs';
import { createOnlineIdentityPayload } from '../../../js/platform/identity/match-identity.mjs';
import { updateScoreOverlay } from './score-overlay.js';
import { wireOnlineClient } from './online-wiring.js';
import { createKeyboardRouter } from './keyboard-router.js';
import { createMenuInteraction } from './menu-interaction.js';
import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  removeStorageText,
} from '../../../js/platform/storage/storage.mjs';

const LEGACY_ONLINE_NAME_STORAGE_KEY = getPlatformStorageKey('loversLostLegacyOnlineName');

function initGame() {
  loadGameAssets((images, emoteImages) => _initWithAssets(images, emoteImages));
}

function _initWithAssets(images, emoteImages) {
  // ── Services ───────────────────────────────────────────────────────────────────
  const sounds       = createSounds();
  const onlineClient = createOnlineClient();
  const canvas       = document.getElementById('gameCanvas');
  const renderer     = createRenderer(canvas, images, emoteImages);
  const inp          = createInput();

  const search   = window.location && window.location.search;
  const debugObstacleType = debugObstacleTypeFromSearch(search);
  let   debugEnabled      = debugEnabledFromSearch(search);

  const storage            = getDefaultPlatformStorage(window);
  const legacyDisplayName  = sanitizeOnlineDisplayName(readStorageText(storage, LEGACY_ONLINE_NAME_STORAGE_KEY) || '');
  const factoryProfile     = loadFactoryProfile(storage, { seedProfileName: legacyDisplayName });
  if (legacyDisplayName) removeStorageText(storage, LEGACY_ONLINE_NAME_STORAGE_KEY);

  // ── Online session state ─────────────────────────────────────────────────────
  let onlineRemoteSide     = null;
  let onlineRemoteIdentity = null;
  let onlineCountdown      = null;
  let onlineQueueCounts    = null;
  let onlineSnapshotSeq    = 0;
  const remoteLaneSeq      = { boy: -1, girl: -1 };

  // ── Solo state ───────────────────────────────────────────────────────────────
  let soloMode          = false;
  let soloSide          = 'boy';
  let soloPbResult      = null;
  let soloCountdownTick = 0;
  let localCountdownTick = 0;
  const SOLO_COUNTDOWN_TICKS  = 180;
  const LOCAL_COUNTDOWN_TICKS = 180;

  // ── Online UI state ──────────────────────────────────────────────────────────
  let lastEmoteSentAt       = 0;
  let onlineSide            = 'boy';
  let onlineRunOverrideName = '';
  let onlineIdentity        = buildOnlineIdentity(factoryProfile, onlineRunOverrideName);
  let onlineNameInput       = onlineIdentity.displayName;
  let onlineNameError       = '';
  let onlineLobbyPhase      = 'main';
  let onlineCodeInput       = '';
  let onlineRoomCode        = '';
  let onlineSearchTick      = 0;

  // Pointer hover flags (written by menu-interaction, read by the renderer dispatch).
  const hover = {
    menu0: false, menu1: false, menu2: false, menu3: false,
    soloBoy: false, soloGirl: false,
    onlineBoy: false, onlineGirl: false,
    nameContinue: false,
    findMatch: false, playFriend: false, cancel: false,
    create: false, join: false, joinSubmit: false,
  };

  // ── Game state ───────────────────────────────────────────────────────────────
  let gs = createGameState('single', Date.now() >>> 0, { debugObstacleType });
  let prevPhase      = gs.phase;
  let lastMusicPhase = null;

  const TICK_MS = 1000 / 60;
  let loopLastTime    = null;
  let loopAccumulator = 0;

  let boyAnim  = { state: 'running', actionTick: 0 };
  let girlAnim = { state: 'running', actionTick: 0 };
  const handleSideInput = createLaneInputHandler(inp, renderer, sounds);

  // ── Online lobby actions ───────────────────────────────────────────────────────
  function _tryJoinRoom()  { if (onlineCodeInput.length > 0) onlineClient.joinRoom(onlineSide, onlineCodeInput); }
  function _cancelSearch() { onlineClient.cancelSearch(); }
  function _cancelRoom()   { onlineRoomCode = ''; onlineClient.cancelRoom(); }
  function _cancelNameEntry() { onlineNameError = ''; gs = { ...gs, phase: 'online_side_select' }; }
  function _enterOnlineNameEntry(side) {
    onlineSide = side;
    onlineNameError = '';
    gs = { ...gs, phase: 'online_name_entry' };
    mobileNameInput.show(onlineNameInput, { focus: true });
  }
  function _tryContinueNameEntry() {
    const displayName = sanitizeOnlineDisplayName(onlineNameInput);
    if (!isValidOnlineDisplayName(displayName)) { onlineNameError = 'NAME REQUIRED'; return; }
    onlineRunOverrideName = deriveOnlineRunOverrideName(factoryProfile, displayName);
    onlineIdentity   = buildOnlineIdentity(factoryProfile, onlineRunOverrideName);
    onlineNameInput  = onlineIdentity.displayName;
    onlineNameError  = '';
    onlineRemoteIdentity = null;
    onlineClient.setIdentity(createOnlineIdentityPayload(factoryProfile, onlineRunOverrideName));
    onlineClient.connect();
    onlineLobbyPhase = 'main';
    gs = { ...gs, phase: 'online_lobby' };
  }

  const mobileNameInput = createMobileNameInputBridge({
    onInput(value) {
      onlineNameInput = sanitizeOnlineDisplayName(value);
      onlineNameError = '';
      mobileNameInput.setValue(onlineNameInput);
    },
    onSubmit() { _tryContinueNameEntry(); },
    onCancel() { _cancelNameEntry(); },
  });

  // ── State machine transitions ──────────────────────────────────────────────────
  function startPlaying() {
    sounds.stop('run-success'); sounds.stop('run-failed');
    gs = { ...createGameState('local', Date.now() >>> 0, { debugObstacleType }), phase: 'playing' };
    boyAnim = { state: 'running', actionTick: 0 };
    girlAnim = { state: 'running', actionTick: 0 };
    inp.tick();
  }

  function startPlayingSolo(side) {
    sounds.stop('run-success'); sounds.stop('run-failed');
    soloPbResult = null;
    const newGs      = { ...createGameState('single', Date.now() >>> 0, { debugObstacleType }), phase: 'playing' };
    const partnerKey = side === 'boy' ? 'girl' : 'boy';
    const obsKey     = partnerKey === 'boy' ? 'boyObstacles' : 'girlObstacles';
    const boostKey   = partnerKey === 'boy' ? 'boyBoosts'    : 'girlBoosts';
    gs = {
      ...newGs,
      [partnerKey]: { ...newGs[partnerKey], distance: RUN_DISTANCE },
      [obsKey]:     [],
      [boostKey]:   [],
    };
    soloMode = true;
    soloSide = side;
    boyAnim  = { state: 'running', actionTick: 0 };
    girlAnim = { state: 'running', actionTick: 0 };
    inp.tick();
  }

  function startPlayingOnline(seed) {
    sounds.stop('run-success'); sounds.stop('run-failed');
    onlineCountdown = null; onlineSnapshotSeq = 0;
    remoteLaneSeq.boy = -1; remoteLaneSeq.girl = -1;
    gs = { ...createGameState('online', seed, { debugObstacleType }), phase: 'playing' };
    boyAnim = { state: 'running', actionTick: 0 };
    girlAnim = { state: 'running', actionTick: 0 };
    inp.tick();
  }

  function returnToMenu() {
    sounds.stop('run-success'); sounds.stop('run-failed');
    soloMode = false;
    soloPbResult = null;
    if (gs.mode === 'online' || gs.phase === 'online_countdown') {
      onlineClient.disconnect(); onlineClient.reset();
      onlineRemoteSide = null; onlineRemoteIdentity = null; onlineCountdown = null;
      onlineQueueCounts = null; onlineRoomCode = ''; onlineSnapshotSeq = 0;
      remoteLaneSeq.boy = -1; remoteLaneSeq.girl = -1;
    }
    gs = { ...createGameState('single', Date.now() >>> 0, { debugObstacleType }), phase: 'menu' };
    boyAnim = { state: 'running', actionTick: 0 };
    girlAnim = { state: 'running', actionTick: 0 };
    inp.tick();
  }

  // ── Shared accessor bridge for the extracted input/wiring modules ──────────────
  // The main loop below keeps using the local variables directly; the extracted
  // modules read and write the same state through these accessors so the hot
  // loop stays untouched.
  const host = {
    inp, renderer, sounds, onlineClient, mobileNameInput, remoteLaneSeq, hover,
    returnToMenu,
    cancelNameEntry:      _cancelNameEntry,
    tryContinueNameEntry: _tryContinueNameEntry,
    tryJoinRoom:          _tryJoinRoom,
    cancelSearch:         _cancelSearch,
    cancelRoom:           _cancelRoom,
    enterOnlineNameEntry: _enterOnlineNameEntry,
    get gs() { return gs; }, set gs(v) { gs = v; },
    get boyAnim() { return boyAnim; }, set boyAnim(v) { boyAnim = v; },
    get girlAnim() { return girlAnim; }, set girlAnim(v) { girlAnim = v; },
    get debugEnabled() { return debugEnabled; }, set debugEnabled(v) { debugEnabled = v; },
    get soloMode() { return soloMode; }, set soloMode(v) { soloMode = v; },
    get soloSide() { return soloSide; }, set soloSide(v) { soloSide = v; },
    get soloCountdownTick() { return soloCountdownTick; }, set soloCountdownTick(v) { soloCountdownTick = v; },
    get localCountdownTick() { return localCountdownTick; }, set localCountdownTick(v) { localCountdownTick = v; },
    get lastEmoteSentAt() { return lastEmoteSentAt; }, set lastEmoteSentAt(v) { lastEmoteSentAt = v; },
    get onlineSide() { return onlineSide; }, set onlineSide(v) { onlineSide = v; },
    get onlineIdentity() { return onlineIdentity; },
    get onlineRemoteSide() { return onlineRemoteSide; }, set onlineRemoteSide(v) { onlineRemoteSide = v; },
    get onlineRemoteIdentity() { return onlineRemoteIdentity; }, set onlineRemoteIdentity(v) { onlineRemoteIdentity = v; },
    get onlineCountdown() { return onlineCountdown; }, set onlineCountdown(v) { onlineCountdown = v; },
    get onlineQueueCounts() { return onlineQueueCounts; }, set onlineQueueCounts(v) { onlineQueueCounts = v; },
    get onlineRoomCode() { return onlineRoomCode; }, set onlineRoomCode(v) { onlineRoomCode = v; },
    get onlineLobbyPhase() { return onlineLobbyPhase; }, set onlineLobbyPhase(v) { onlineLobbyPhase = v; },
    get onlineCodeInput() { return onlineCodeInput; }, set onlineCodeInput(v) { onlineCodeInput = v; },
    get onlineNameInput() { return onlineNameInput; }, set onlineNameInput(v) { onlineNameInput = v; },
    get onlineNameError() { return onlineNameError; }, set onlineNameError(v) { onlineNameError = v; },
    get onlineSearchTick() { return onlineSearchTick; }, set onlineSearchTick(v) { onlineSearchTick = v; },
  };

  // ── Wire inputs and the online client through the shared bridge ────────────────
  wireOnlineClient(onlineClient, host);

  const keyboard = createKeyboardRouter(host);
  window.addEventListener('keydown', keyboard.onKeyDown);
  window.addEventListener('keyup', keyboard.onKeyUp);

  createMenuInteraction(canvas, host);

  // ── Main loop ────────────────────────────────────────────────────────────────
  function loop(timestamp) {
    if (loopLastTime === null) loopLastTime = timestamp ?? performance.now();
    if (timestamp == null) { requestAnimationFrame(loop); return; }
    const frameTime = Math.min(timestamp - loopLastTime, 100);
    loopLastTime = timestamp;
    loopAccumulator += frameTime;

    while (loopAccumulator >= TICK_MS) {
      loopAccumulator -= TICK_MS;

      const musicPhase = (gs.phase === 'menu_help' || gs.phase === 'solo_side_select' || gs.phase === 'solo_countdown' || gs.phase === 'local_countdown') ? 'menu' : gs.phase;
      if (musicPhase !== lastMusicPhase) {
        if (musicPhase === 'menu')                                    sounds.playMusic('bg-music-menu');
        else if (musicPhase === 'playing')                            sounds.playMusic('bg-music-game');
        else if (musicPhase === 'reunion' || musicPhase === 'gameover') sounds.stopMusic();
        lastMusicPhase = musicPhase;
      }

      if (gs.phase === 'solo_countdown') {
        soloCountdownTick++;
        if (soloCountdownTick >= SOLO_COUNTDOWN_TICKS) startPlayingSolo(soloSide);
      }

      if (gs.phase === 'local_countdown') {
        localCountdownTick++;
        if (localCountdownTick >= LOCAL_COUNTDOWN_TICKS) startPlaying();
      }

      if (gs.phase === 'online_countdown' && onlineCountdown &&
          hasCountdownStarted(onlineCountdown.startAt, onlineCountdown.clockOffsetMs)) {
        startPlayingOnline(onlineCountdown.seed);
      }

      if (gs.phase === 'playing') {
        let localResolvedForSnapshot = [];
        if (gs.mode === 'online') {
          ({ gs, boyAnim, girlAnim, frameResolved: localResolvedForSnapshot } = handleSideInput(onlineSide, gs, boyAnim, girlAnim));
        } else if (soloMode) {
          ({ gs, boyAnim, girlAnim } = handleSideInput(soloSide, gs, boyAnim, girlAnim));
        } else {
          ({ gs, boyAnim, girlAnim } = handleSideInput('boy',  gs, boyAnim, girlAnim));
          ({ gs, boyAnim, girlAnim } = handleSideInput('girl', gs, boyAnim, girlAnim));
        }

        const phaseBefore        = gs.phase;
        const boyFinishedBefore  = gs.boy.state  === 'finished';
        const girlFinishedBefore = gs.girl.state === 'finished';
        const simulatedSides     = gs.mode === 'online'
          ? { boy: onlineSide === 'boy', girl: onlineSide === 'girl' }
          : null;
        gs = tickFrame(gs, simulatedSides ? { simulatedSides } : undefined);
        if (gs.mode === 'online' && gs.runSummary) {
          gs = { ...gs, runSummary: attachOnlineResultIdentities(gs.runSummary, onlineSide, onlineIdentity, onlineRemoteSide, onlineRemoteIdentity) };
        }
        if (!boyFinishedBefore  && gs.boy.state  === 'finished') { boyAnim.state  = 'running'; boyAnim.actionTick  = 0; renderer.clearSideObstacleVisuals('boy'); }
        if (!girlFinishedBefore && gs.girl.state === 'finished') { girlAnim.state = 'running'; girlAnim.actionTick = 0; renderer.clearSideObstacleVisuals('girl'); }

        if (gs.phase !== phaseBefore) {
          if ((gs.phase === 'reunion' || gs.phase === 'gameover') && gs.runSummary) {
            publishLoversLostRunActivity(gs.runSummary, {
              storage,
              actorPlayerId:   factoryProfile.playerId,
              actorDisplayName: gs.mode === 'online' ? onlineIdentity.displayName : factoryProfile.profileName,
              sessionId: gs.mode === 'online' ? `lovers-lost:${onlineRoomCode || 'online'}:${gs.seed ?? 0}` : '',
            });
            if (soloMode) soloPbResult = updatePersonalBest(storage, soloSide, gs.runSummary);
          }
          if (gs.phase === 'reunion') sounds.play('run-success');
          if (gs.phase === 'gameover') sounds.play('run-failed');
        }

        for (const outcome of gs.boyResolved || []) {
          if (outcome.feedback) renderer.addOutcomeEffect('boy', outcome.feedback, outcome.effectType);
          if (outcome.linger)   renderer.addTrailObstacle('boy', outcome.obstacle);
          if (outcome.hit && boyAnim.state !== 'hit') { boyAnim.state = 'hit'; boyAnim.actionTick = 0; sounds.play('player-hit'); }
        }
        for (const outcome of gs.girlResolved || []) {
          if (outcome.feedback) renderer.addOutcomeEffect('girl', outcome.feedback, outcome.effectType);
          if (outcome.linger)   renderer.addTrailObstacle('girl', outcome.obstacle);
          if (outcome.hit && girlAnim.state !== 'hit') { girlAnim.state = 'hit'; girlAnim.actionTick = 0; sounds.play('player-hit'); }
        }

        if (gs.mode === 'online') {
          const snapshotSide      = onlineSide;
          const snapshotPlayer    = snapshotSide === 'boy' ? gs.boy    : gs.girl;
          const snapshotObstacles = snapshotSide === 'boy' ? gs.boyObstacles : gs.girlObstacles;
          const snapshotAnim      = snapshotSide === 'boy' ? boyAnim   : girlAnim;
          const autoResolved      = snapshotSide === 'boy' ? (gs.boyResolved || []) : (gs.girlResolved || []);
          onlineClient.sendSnapshot(buildLaneSnapshot(
            snapshotPlayer, snapshotObstacles, snapshotAnim,
            [...localResolvedForSnapshot, ...autoResolved],
            gs.elapsed, ++onlineSnapshotSeq
          ));
        }
      } else if (gs.phase === 'reunion' || gs.phase === 'gameover') {
        gs = advancePhaseState(gs);
      }

      renderer.tickMenuAnims();
      inp.tick();
    } // end fixed-timestep while loop

    const boyPlayer  = { ...gs.boy,  animState: boyAnim };
    const girlPlayer = { ...gs.girl, animState: girlAnim };
    const debugHint  = debugObstacleType
      ? `yellow=obstacle cyan=player green=perfect/shield magenta=sword only=${DEBUG_OBSTACLE_LABELS[debugObstacleType]}`
      : 'yellow=obstacle cyan=player green=perfect/shield magenta=sword';
    const debugState = debugEnabled ? {
      enabled: true, hint: debugHint,
      boy:  buildDebugCollisionSnapshot(boyPlayer,  gs.boyObstacles,  boyAnim),
      girl: buildDebugCollisionSnapshot(girlPlayer, gs.girlObstacles, girlAnim),
    } : null;

    const elapsed = gs.elapsed / 60;
    mobileNameInput.update({
      active: gs.phase === 'online_name_entry',
      value: onlineNameInput,
    });

    if      (gs.phase === 'menu')              renderer.renderMenu(debugState, hover.menu0, hover.menu1, hover.menu2, hover.menu3);
    else if (gs.phase === 'solo_side_select')  renderer.renderSoloSideSelect(hover.soloBoy, hover.soloGirl);
    else if (gs.phase === 'solo_countdown')    renderer.renderSoloCountdown(soloSide, Math.ceil((SOLO_COUNTDOWN_TICKS - soloCountdownTick) / 60));
    else if (gs.phase === 'local_countdown')   renderer.renderLocalCountdown(Math.ceil((LOCAL_COUNTDOWN_TICKS - localCountdownTick) / 60));
    else if (gs.phase === 'online_side_select') renderer.renderOnlineSideSelect(hover.onlineBoy, hover.onlineGirl, onlineSide);
    else if (gs.phase === 'online_name_entry')  renderer.renderOnlineNameEntry(onlineSide, onlineNameInput, onlineNameError, { continue: hover.nameContinue });
    else if (gs.phase === 'online_lobby') {
      onlineSearchTick++;
      renderer.renderOnlineLobby(onlineSide, onlineLobbyPhase, onlineRoomCode, onlineCodeInput, onlineSearchTick,
        { findMatch: hover.findMatch, playFriend: hover.playFriend, cancel: hover.cancel, create: hover.create, join: hover.join, joinSubmit: hover.joinSubmit },
        onlineQueueCounts, onlineIdentity, onlineRemoteIdentity);
    }
    else if (gs.phase === 'online_countdown') {
      const secondsRemaining = onlineCountdown
        ? getCountdownSecondsRemaining(onlineCountdown.startAt, onlineCountdown.clockOffsetMs) : 0;
      renderer.renderOnlineCountdown(onlineSide, onlineRemoteSide, secondsRemaining, onlineIdentity, onlineRemoteIdentity);
    }
    else if (gs.phase === 'menu_help')    renderer.renderMenuHelp(debugState);
    else if (gs.phase === 'playing') {
      renderer.renderPlay(boyPlayer, girlPlayer, gs.boyObstacles, gs.girlObstacles,
        gs.boyBoosts, gs.girlBoosts, elapsed, debugState,
        { online: gs.mode === 'online', soloSide: soloMode ? soloSide : null }, gs.elapsed);
    }
    else if (gs.phase === 'reunion')      renderer.renderReunion(boyPlayer, girlPlayer, gs.phaseFrames);
    else if (gs.phase === 'gameover')     renderer.renderGameOver(gs.boy, gs.girl, gs.runSummary, soloMode ? soloSide : null);
    else if (gs.phase === 'score_screen') renderer.renderScore(gs.boy, gs.girl, gs.runSummary, soloMode ? soloSide : null, soloPbResult);

    updateScoreOverlay(gs.phase, prevPhase, gs.runSummary, onlineSide);
    if (gs.phase !== prevPhase) prevPhase = gs.phase;

    requestAnimationFrame(loop);
  }

  loop();
}

export { initGame };
