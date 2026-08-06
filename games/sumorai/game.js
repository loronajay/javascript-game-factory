import { loadAssets, getSound }      from './scripts/assets.js';
import { createBotState, tickBot }  from './scripts/bot.js';
import { loadFactoryProfile }       from '../../js/platform/identity/factory-profile.mjs';
import { createAudioController }    from './scripts/audio.js';
import { createControlsScreen }     from './scripts/controls-screen.js';
import { createInput }              from './scripts/input.js';
import { createLobbyUi }            from './scripts/lobby-ui.js';
import { createInitialGameState, prepareRoundState, resetMatchProgress } from './scripts/match-state.js';
import { getHumanInputBindings, isMobileControllerMounted } from './scripts/mobile-input-routing.js';
import {
  ACTIONS, ACTION_LABELS, DEFAULT_P1, DEFAULT_P2,
  formatKeyCode, loadBindings, saveBindings,
} from './scripts/controls.js';
import { createPlayer, resetPlayer, stepAnimation } from './scripts/player.js';
import { spawnBloodEffect, spawnChingEffect, tickEffects as tickVisualEffects } from './scripts/effects.js';
import { applyPhysics }            from './scripts/physics.js';
import { resolveHits, getAttackHitbox, getDashHitbox, isAttackActive, isDashAttackActive } from './scripts/combat.js';
import { createGridlockState, tickGridlock } from './scripts/gridlock.js';
import { createProjectile, tickProjectile, checkProjectileVsPlayer, checkProjectileClash, checkHitboxVsProjectile, PROJ_SHIELD_KNOCKBACK } from './scripts/projectile.js';
import { createCamera, updateCamera, resetCamera } from './scripts/camera.js';
import { render, setScaleFactor }  from './scripts/renderer.js';
import { VIEWPORT_W, VIEWPORT_H }  from './scripts/stage.js';
import { setupCanvasViewport }     from './scripts/viewport.js';
import { createPlatforms, updatePlatforms } from './scripts/platforms.js';
import { createOnlineClient, getCountdownSecondsRemaining } from './scripts/online.js';
import { wireOnlineCallbacks } from './scripts/online-callbacks.js';
import { createOnlineInputRouter } from './scripts/online-input-router.js';
import { createRematchFlow, rematchSeed } from './scripts/online-rematch.js';
import { buildOnlineIdentity } from './scripts/online-identity.js';
import { startOnlineMatchSession } from './scripts/online-match-start.js';
import {
  drawOnlineCountdown,
  EMPTY_INPUT,
  buildOnlineStagePlan,
  getOnlineStageForRound,
  inputsDiffer,
  normalizeOnlineStagePlan,
} from './scripts/online-match-view.js';
import { publishOnlineMatchResult, renderOnlineResultRating, renderRankedProfile } from './scripts/online-results.js';
import {
  renderRankedProfileDefault,
  renderRankedProfileError,
  renderRankedProfileLoading,
  renderRankedProfileRating,
  renderRankedProfileSignedOut,
  renderRankedResultRating,
} from './scripts/ranked-ui.js';
import { wireOnlineLobbyEvents } from './scripts/online-lobby-events.js';
import { loadGameState, saveGameState } from './scripts/rollback-state.js';
import { createRollbackSession } from './scripts/rollback-session.js';
import { tickRoundEndState, tickRoundStartState, triggerRoundEndState } from './scripts/round-lifecycle.js';
import { tickSimulationStep } from './scripts/simulation-step.js';
import { wireSetupEvents } from './scripts/setup-events.js';
import { publishSumoraiMatchActivity } from '../../js/platform/activity/activity.mjs';
import { createPlatformApiClient } from '../../js/platform/api/platform-api.mjs';

const TICK_MS        = 1000 / 60;
const ROLLBACK_WINDOW = 60;   // frames of rollback history (~1 second at 60 hz)

function initGame() {
  loadAssets(({ sprites, sounds }) => _boot(sounds));
}

function _boot(sounds) {
  const canvas = document.getElementById('game-canvas');
  const ctx    = canvas.getContext('2d');

  setupCanvasViewport({
    canvas,
    window,
    viewportWidth: VIEWPORT_W,
    viewportHeight: VIEWPORT_H,
    setScaleFactor,
  });

  // Warn before leaving the page during an active online match (forfeit guard)
  window.addEventListener('beforeunload', (e) => {
    if (!isOnline) return;
    const activePhase = gameState.phase === 'active'      ||
                        gameState.phase === 'round_end'   ||
                        gameState.phase === 'round_start' ||
                        gameState.phase === 'online_countdown';
    if (!activePhase) return;
    e.preventDefault();
    e.returnValue = '';  // triggers browser's native "Leave site?" dialog
  });

  const input  = createInput();
  const camera = createCamera();

  const gameState = createInitialGameState({
    createPlayer,
    createPlatforms,
    defaultLayout: 'single',
  });

  const factoryProfile = loadFactoryProfile();
  const factoryName    = factoryProfile.profileName || 'Player 1';

  // Display name on menu
  const nameEl = document.getElementById('menu-player-name');
  if (nameEl) nameEl.textContent = factoryName;

  // Match display labels — set when match mode is chosen
  let p1Label = factoryName;
  let p2Label = 'Player 2';

  let bindings = loadBindings();
  let selectedRounds = 3;
  let selectedLayout = 'single';

  // CPU config — set before startMatch, read during tick
  let botConfig = { enabled: false, side: 'p2', difficulty: 'hard' };
  let botState  = createBotState();

  let onlineClient         = null;
  let onlineIdentity       = null;
  let onlineSide           = 'p1';
  let onlineIsRanked       = false;
  let onlineLobbyPhase     = 'side_select';
  let onlineMatchSeed      = 0;
  let onlineStagePlan      = null;
  let onlineClockOffset    = 0;
  let onlineStartAt        = 0;
  let onlineRemoteIdentity = null;
  let onlineQueueCounts    = null;
  let onlineRematch        = null;
  let onlineRematchBaseSeed = 0;
  let onlineRematchRound   = 0;
  let isOnline             = false;

  // Rollback session — owns frame counter, snapshot buffers, prediction, resimulation, and
  // peer time-synchronization. Recreated each round (see _ensureOnlineSession). All the rb*
  // bookkeeping that used to live inline here now lives in scripts/rollback-session.js, which
  // is exercised headlessly by tests/online-sync.test.js.
  let onlineSession = null;
  const onlineInputRouter = createOnlineInputRouter({ getSession: () => onlineSession });

  const { playSound, startAmbient, stopAmbient } = createAudioController(getSound, {
    isMuted: () => !!onlineSession && onlineSession.isResimulating(),
  });

  const {
    showScreen,
    showLobbyPhase,
    stopSearchDots: _stopSearchDots,
    startSearchDots: _startSearchDots,
    stopWaitingDots: _stopWaitingDots,
    startWaitingDots: _startWaitingDots,
    updateQueueHint: _updateQueueHint,
    setSideLocked: _setSideLocked,
  } = createLobbyUi({
    document,
    getOnlineSide: () => onlineSide,
    getQueueCounts: () => onlineQueueCounts,
    setLobbyPhase: phase => { onlineLobbyPhase = phase; },
  });

  // Online game helpers

  // A fresh rollback session for the current round. Both peers tag inputs with the round
  // number (epoch) so a late input from the previous round can never be misread as a
  // confirmed input for this one.
  function _createOnlineSession() {
    return createRollbackSession({
      localSide: onlineSide,
      gameState,
      epoch: gameState.roundNum,
      rollbackWindow: ROLLBACK_WINDOW,
      tickSim: (p1In, p2In) => _tickSim(p1In, p2In),
      saveState: () => saveGameState(gameState, camera),
      loadState: (snap) => loadGameState(gameState, snap, camera),
      inputsDiffer,
      emptyInput: EMPTY_INPUT,
      send: (frame, snap, advantage, epoch) => onlineClient.sendInput(frame, snap, advantage, epoch),
      commitRoundEnd: (pending) => {
        triggerRoundEnd(pending.winner, pending.isBlastKill);
        gameState.pendingRoundEnd = null;
      },
    });
  }

  // Ensure the session matches the current round. Called from round_start (so it exists
  // before active begins and can buffer the peer's early inputs) and defensively from active.
  function _ensureOnlineSession() {
    if (!onlineSession || onlineSession.epoch !== gameState.roundNum) {
      onlineSession = _createOnlineSession();
      onlineInputRouter.activate(onlineSession);
    }
  }

  wireSetupEvents({
    document,
    gameState,
    factoryName,
    enterOnlineFlow,
    getBotConfig: () => botConfig,
    getSelectedRounds: () => selectedRounds,
    setBotConfig: next => { botConfig = next; },
    setP1Label: next => { p1Label = next; },
    setP2Label: next => { p2Label = next; },
    setSelectedLayout: next => { selectedLayout = next; },
    setSelectedRounds: next => { selectedRounds = next; },
    showRankedProfile: _showRankedProfile,
    showScreen,
    startMatch,
    stopAmbient,
    playSound,
  });

  createControlsScreen({
    document,
    window,
    actions: ACTIONS,
    actionLabels: ACTION_LABELS,
    defaultP1: DEFAULT_P1,
    defaultP2: DEFAULT_P2,
    formatKeyCode,
    getBindings: () => bindings,
    setBindings: next => { bindings = next; },
    saveBindings,
    showScreen,
    playSound,
  }).wire();

  // Online lobby wiring

  function enterOnlineFlow() {
    onlineSession = null;
    onlineInputRouter.reset();
    onlineRematch = null;
    onlineRematchRound = 0;
    onlineSide = 'p1';
    onlineStagePlan = null;
    document.querySelectorAll('.side-card').forEach(c => c.classList.remove('side-card--selected'));
    document.getElementById('online-side-p1').classList.add('side-card--selected');
    document.getElementById('side-conflict-error').hidden = true;
    onlineQueueCounts = null;
    document.getElementById('queue-hint').textContent = '';

    if (onlineClient) { onlineClient.disconnect(); onlineClient = null; }
    onlineIdentity   = buildOnlineIdentity(factoryProfile);
    onlineClient     = createOnlineClient();
    onlineClient.setIdentity(onlineIdentity);
    onlineRematch = createRematchFlow({
      sendState: state => onlineClient.sendRematch(state),
      sendStart: start => onlineClient.sendRematchStart(start),
      isCoordinator: () => onlineClient.isCoordinator(),
      buildStart: round => ({
        round,
        seed: rematchSeed(onlineRematchBaseSeed, round),
        startAt: Date.now() + onlineClockOffset + 4000,
      }),
      onState: syncOnlineRematchUi,
      onAccepted: startOnlineRematch,
    });
    _wireOnlineCallbacks();
    onlineClient.connect();

    showScreen('screen-online-lobby');
    showLobbyPhase('side_select');
  }

  function _wireOnlineCallbacks() {
    wireOnlineCallbacks({
      buildForfeitSessionId: seed => `sumorai:${seed}:forfeit`,
      createPlatformApiClient,
      document,
      gameState,
      getOnlineIdentity: () => onlineIdentity,
      getOnlineIsRanked: () => onlineIsRanked,
      getOnlineMatchSeed: () => onlineMatchSeed,
      getOnlineRemoteIdentity: () => onlineRemoteIdentity,
      routeRemoteInput: snap => onlineInputRouter.route(snap),
      normalizeOnlineStagePlan,
      onOpponentLeftResults: () => onlineRematch?.receiveState({
        round: onlineRematchRound,
        available: false,
        requested: false,
      }),
      onlineClient,
      receiveRematchStart: start => onlineRematch?.receiveStart(start),
      receiveRematchState: state => onlineRematch?.receiveState(state),
      setIsOnline: value => { isOnline = value; },
      setOnlineClockOffset: value => { onlineClockOffset = value; },
      setOnlineMatchSeed: value => {
        onlineMatchSeed = value;
        onlineRematchBaseSeed = value;
      },
      setOnlineQueueCounts: value => { onlineQueueCounts = value; },
      setOnlineRemoteIdentity: value => { onlineRemoteIdentity = value; },
      setOnlineStagePlan: value => { onlineStagePlan = value; },
      setOnlineStartAt: value => { onlineStartAt = value; },
      showLobbyPhase,
      showScreen,
      startOnlineMatch: _startOnlineMatch,
      startSearchDots: _startSearchDots,
      startWaitingDots: _startWaitingDots,
      stopAmbient,
      stopSearchDots: _stopSearchDots,
      stopWaitingDots: _stopWaitingDots,
      updateQueueHint: _updateQueueHint,
      setSideLocked: _setSideLocked,
    });
  }
  function _publishOnlineMatchResult(matchWinner) {
    publishOnlineMatchResult({
      createPlatformApiClient,
      gameState,
      onlineIdentity,
      onlineIsRanked,
      onlineMatchSeed,
      onlineRemoteIdentity,
      onlineSide,
      publishMatchActivity: publishSumoraiMatchActivity,
      winner: matchWinner,
    });
  }

  async function _showOnlineResultRating() {
    await renderOnlineResultRating({
      createPlatformApiClient,
      document,
      onlineIdentity,
      renderRating: renderRankedResultRating,
    });
  }

  async function _showRankedProfile() {
    await renderRankedProfile({
      buildOnlineIdentity,
      createPlatformApiClient,
      document,
      factoryProfile,
      onlineIdentity,
      renderDefault: renderRankedProfileDefault,
      renderError: renderRankedProfileError,
      renderLoading: renderRankedProfileLoading,
      renderRating: renderRankedProfileRating,
      renderSignedOut: renderRankedProfileSignedOut,
      showScreen,
    });
  }
  function _startOnlineMatch() {
    onlineSession = null;   // a fresh per-round session is armed when round_start begins
    onlineInputRouter.reset();
    startOnlineMatchSession({
      factoryName,
      gameState,
      onlineClient,
      onlineIdentity,
      onlineRemoteIdentity,
      onlineSide,
      setIsOnline: value => { isOnline = value; },
      setLabels: labels => { p1Label = labels.p1; p2Label = labels.p2; },
      showScreen,
      startAmbient,
    });
  }

  function startOnlineRematch({ round, seed, startAt }) {
    onlineRematchRound = round;
    onlineMatchSeed = seed;
    onlineStagePlan = buildOnlineStagePlan(seed);
    onlineStartAt = startAt;
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    onlineSession = null;
    onlineInputRouter.reset();
    _startOnlineMatch();
  }

  function enterOnlineResults() {
    onlineRematch?.enterResults({
      round: onlineRematchRound,
      enabled: !onlineIsRanked,
    });
  }

  function syncOnlineRematchUi({
    available = false,
    localRequested = false,
    opponentRequested = false,
    declined = false,
    opponentUnavailable = false,
    starting = false,
    disabled = false,
  } = {}) {
    const button = document.getElementById('btn-online-rematch');
    const status = document.getElementById('online-rematch-status');
    if (!button || !status) return;
    if (disabled) {
      button.disabled = true;
      button.textContent = 'Rematch Unavailable';
      status.textContent = 'Rematches are disabled in Ranked.';
    } else if (declined || opponentUnavailable) {
      button.disabled = true;
      button.textContent = declined ? 'Rematch Declined' : 'Rematch Unavailable';
      status.textContent = declined
        ? 'Your opponent declined the rematch.'
        : 'Your opponent left the results screen.';
    } else if (starting) {
      button.disabled = true;
      button.textContent = 'Starting Rematch';
      status.textContent = 'Synchronizing the next match...';
    } else if (localRequested) {
      button.disabled = true;
      button.textContent = 'Rematch Requested';
      status.textContent = 'Waiting for your opponent to accept...';
    } else if (available) {
      button.disabled = false;
      button.textContent = opponentRequested ? 'Accept Rematch' : 'Rematch';
      status.textContent = opponentRequested ? 'Your opponent wants a rematch.' : '';
    } else {
      button.disabled = true;
      button.textContent = 'Rematch';
      status.textContent = 'Waiting for your opponent to reach results...';
    }
  }


  wireOnlineLobbyEvents({
    document,
    gameState,
    getOnlineClient: () => onlineClient,
    getOnlineSide: () => onlineSide,
    setIsOnline: value => { isOnline = value; },
    setOnlineClient: value => { onlineClient = value; },
    setOnlineIsRanked: value => { onlineIsRanked = value; },
    setOnlineQueueCounts: value => { onlineQueueCounts = value; },
    setOnlineSide: value => { onlineSide = value; },
    setSideLocked: _setSideLocked,
    showLobbyPhase,
    showScreen,
    stopAmbient,
    stopSearchDots: _stopSearchDots,
    stopWaitingDots: _stopWaitingDots,
    updateQueueHint: _updateQueueHint,
    playSound,
    leaveOnlineResults: () => onlineRematch?.leaveResults(),
    requestOnlineRematch: () => onlineRematch?.request(),
  });


  function spawnChing(x, y) {
    spawnChingEffect(gameState, x, y);
    playSound('ching');
  }

  function spawnBlood(x, y, flip) {
    spawnBloodEffect(gameState, x, y, flip);
  }

  function startMatch() {
    resetMatchProgress(gameState);
    botState = createBotState();
    startAmbient();
    startRound();
  }

  function startRound() {
    gameState.roundNum++;
    const onlineStagePicker = (seed, roundNum) => getOnlineStageForRound(onlineStagePlan, seed, roundNum);
    prepareRoundState(gameState, {
      camera,
      createPlatforms,
      isOnline,
      onlineMatchSeed,
      pickOnlineStage: onlineStagePicker,
      resetCamera,
      resetPlayer,
      selectedLayout,
    });
    showScreen('screen-game');
  }


  function triggerRoundEnd(winner, isBlastKill = false) {
    triggerRoundEndState(gameState, winner, { isBlastKill, playSound, spawnBlood });
  }

  function tickRoundEnd() {
    const onlineStagePicker = (seed, roundNum) => getOnlineStageForRound(onlineStagePlan, seed, roundNum);
    tickRoundEndState({
      applyPhysics,
      camera,
      createPlatforms,
      document,
      enterOnlineResults,
      gameState,
      isOnline,
      onlineIsRanked,
      onlineMatchSeed,
      onlineRemoteIdentity,
      p1Label,
      p2Label,
      pickOnlineStage: onlineStagePicker,
      publishOnlineMatchResult: _publishOnlineMatchResult,
      resetCamera,
      resetPlayer,
      selectedLayout,
      setTimeout,
      showOnlineResultRating: _showOnlineResultRating,
      showScreen,
      stepAnimation,
      tickVisualEffects,
      updateCamera,
      updatePlatforms,
    });
  }


  function tickRoundStart() {
    if (isOnline) _ensureOnlineSession();   // arm this round's session before play begins
    tickRoundStartState({
      camera,
      gameState,
      playSound,
      stepAnimation,
      updateCamera,
      updatePlatforms,
    });
  }
  function tickOnlineCountdown() {
    const secsLeft = getCountdownSecondsRemaining(onlineStartAt, onlineClockOffset);
    if (secsLeft <= 0) {
      resetMatchProgress(gameState);
      botState = createBotState();
      startRound();
    }
  }

  let lastTime = null;
  let accum    = 0;

  function tick() {
    const phaseAtStart = gameState.phase;
    if      (phaseAtStart === 'active')           tickActive();
    else if (phaseAtStart === 'round_end')        tickRoundEnd();
    else if (phaseAtStart === 'round_start')      tickRoundStart();
    else if (phaseAtStart === 'online_countdown') tickOnlineCountdown();

    // Do not carry menu/countdown/round-transition taps into the first active frame. Active
    // online input is flushed lazily by the rollback session only when a frame really advances.
    if (phaseAtStart !== 'active') input.flush();
  }


  function _tickSim(p1In, p2In) {
    tickSimulationStep({
      PROJ_SHIELD_KNOCKBACK,
      applyPhysics,
      camera,
      checkHitboxVsProjectile,
      checkProjectileClash,
      checkProjectileVsPlayer,
      createGridlockState,
      createProjectile,
      gameState,
      getAttackHitbox,
      getDashHitbox,
      isAttackActive,
      isDashAttackActive,
      isOnline,
      p1In,
      p2In,
      playSound,
      resolveHits,
      spawnChing,
      stepAnimation,
      tickGridlock,
      tickProjectile,
      tickVisualEffects,
      triggerRoundEnd,
      updateCamera,
      updatePlatforms,
    });
  }
  function tickActive() {
    const mobileControlsActive = isMobileControllerMounted(document);
    if (!isOnline) {
      const p1In = (botConfig.enabled && botConfig.side === 'p1')
        ? tickBot(botState, gameState, 'p1', botConfig.difficulty)
        : input.getSnapshot(getHumanInputBindings('p1', bindings, {
            mobileControlsActive,
            defaultMobileBindings: DEFAULT_P1,
          }));
      const p2In = (botConfig.enabled && botConfig.side === 'p2')
        ? tickBot(botState, gameState, 'p2', botConfig.difficulty)
        : input.getSnapshot(getHumanInputBindings('p2', bindings, {
            mobileControlsActive,
            defaultMobileBindings: DEFAULT_P1,
          }));
      input.flush();
      _tickSim(p1In, p2In);
      return;
    }

    _ensureOnlineSession();

    // The session decides whether this frame advances before invoking the input reader. That
    // preserves one-shot taps through stalls and lets its smoothing stall cap do its job.
    onlineSession.tick(() => {
      const localIn = input.getSnapshot(getHumanInputBindings(onlineSide, bindings, {
        mobileControlsActive,
        defaultMobileBindings: DEFAULT_P1,
      }));
      input.flush();
      return localIn;
    });
  }

  function loop(ts) {
    if (lastTime !== null) {
      accum += Math.min(ts - lastTime, 100);
      while (accum >= TICK_MS) {
        tick();
        accum -= TICK_MS;
      }
    }
    lastTime = ts;

    if (gameState.phase === 'online_countdown') {
      drawOnlineCountdown({
        ctx,
        canvas,
        viewportWidth: VIEWPORT_W,
        viewportHeight: VIEWPORT_H,
        labels: { p1: p1Label, p2: p2Label },
        secondsRemaining: getCountdownSecondsRemaining(onlineStartAt, onlineClockOffset),
      });
    } else if (gameState.phase === 'active'      ||
               gameState.phase === 'round_end'   ||
               gameState.phase === 'round_start' ||
               gameState.phase === 'match_end') {
      const netInfo = isOnline ? {
        latencyMs:       onlineClient.getLatencyMs(),
        rollbacksPerSec: onlineSession ? onlineSession.getRollbacksPerSecond() : 0,
      } : null;
      render(ctx, canvas, gameState, camera, netInfo);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

export { initGame };
