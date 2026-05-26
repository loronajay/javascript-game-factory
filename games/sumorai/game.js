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
import { buildOnlineIdentity } from './scripts/online-identity.js';
import { startOnlineMatchSession } from './scripts/online-match-start.js';
import { drawOnlineCountdown, EMPTY_INPUT, inputsDiffer, pickOnlineStage } from './scripts/online-match-view.js';
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
import { tickRoundEndState, tickRoundStartState, triggerRoundEndState } from './scripts/round-lifecycle.js';
import { tickSimulationStep } from './scripts/simulation-step.js';
import { wireSetupEvents } from './scripts/setup-events.js';
import { publishSumoraiMatchActivity } from '../../js/platform/activity/activity.mjs';
import { createPlatformApiClient } from '../../js/platform/api/platform-api.mjs';

const TICK_MS        = 1000 / 60;
const ROLLBACK_WINDOW = 12;   // frames of rollback history (~200 ms at 60 hz)

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
  let onlineClockOffset    = 0;
  let onlineStartAt        = 0;
  let onlineRemoteIdentity = null;
  let onlineQueueCounts    = null;
  let isOnline             = false;
  // Input sync buffers (wired in next phase with full game loop integration)
  let onlineRemoteLastInput = null;
  let onlinePartnerEnd        = null;
  let onlinePartnerGraceTicks = 0;

  let rbLocalFrame  = 0;
  let rbStateBuffer = new Array(ROLLBACK_WINDOW);   // gameState snapshot before frame F
  let rbLocalInputs = new Array(ROLLBACK_WINDOW);   // local input used at frame F
  let rbPredicted   = new Array(ROLLBACK_WINDOW);   // remote input used (predicted or confirmed)
  let resimulating  = false;
  const { playSound, startAmbient, stopAmbient } = createAudioController(getSound, {
    isMuted: () => resimulating,
  });

  let rbRollbacksThisSec  = 0;   // incremented each resimulate() call
  let rbDisplayRollbacks  = 0;   // snapshot shown in HUD (updated each second)
  let rbSecStartFrame     = 0;   // rbLocalFrame value at last second boundary

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

  function resimulate(fromFrame) {
    rbRollbacksThisSec++;
    loadGameState(gameState, rbStateBuffer[fromFrame % ROLLBACK_WINDOW]);
    resimulating = true;
    for (let f = fromFrame; f < rbLocalFrame; f++) {
      if (gameState.phase !== 'active') break;
      rbStateBuffer[f % ROLLBACK_WINDOW] = saveGameState(gameState);
      const localIn  = rbLocalInputs[f % ROLLBACK_WINDOW] ?? EMPTY_INPUT;
      const remoteIn = rbPredicted[f  % ROLLBACK_WINDOW]  ?? onlineRemoteLastInput ?? EMPTY_INPUT;
      _tickSim(
        onlineSide === 'p1' ? localIn : remoteIn,
        onlineSide === 'p2' ? localIn : remoteIn,
      );
    }
    resimulating = false;
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
    onlineSide = 'p1';
    document.querySelectorAll('.side-card').forEach(c => c.classList.remove('side-card--selected'));
    document.getElementById('online-side-p1').classList.add('side-card--selected');
    document.getElementById('side-conflict-error').hidden = true;
    onlineQueueCounts = null;
    document.getElementById('queue-hint').textContent = '';

    if (onlineClient) { onlineClient.disconnect(); onlineClient = null; }
    onlineIdentity   = buildOnlineIdentity(factoryProfile);
    onlineClient     = createOnlineClient();
    onlineClient.setIdentity(onlineIdentity);
    _wireOnlineCallbacks();
    onlineClient.connect();

    showScreen('screen-online-lobby');
    showLobbyPhase('side_select');
  }

  function _wireOnlineCallbacks() {
    wireOnlineCallbacks({
      ROLLBACK_WINDOW,
      buildForfeitSessionId: seed => `sumorai:${seed}:forfeit`,
      createPlatformApiClient,
      document,
      gameState,
      getOnlineIdentity: () => onlineIdentity,
      getOnlineIsRanked: () => onlineIsRanked,
      getOnlineMatchSeed: () => onlineMatchSeed,
      getOnlineRemoteIdentity: () => onlineRemoteIdentity,
      getRollbackFrame: () => rbLocalFrame,
      inputsDiffer,
      onlineClient,
      resimulate,
      setIsOnline: value => { isOnline = value; },
      setOnlineClockOffset: value => { onlineClockOffset = value; },
      setOnlineMatchSeed: value => { onlineMatchSeed = value; },
      setOnlinePartnerEnd: value => { onlinePartnerEnd = value; },
      setOnlineQueueCounts: value => { onlineQueueCounts = value; },
      setOnlineRemoteIdentity: value => { onlineRemoteIdentity = value; },
      setOnlineRemoteLastInput: value => { onlineRemoteLastInput = value; },
      setOnlineStartAt: value => { onlineStartAt = value; },
      showLobbyPhase,
      showScreen,
      startOnlineMatch: _startOnlineMatch,
      startSearchDots: _startSearchDots,
      startWaitingDots: _startWaitingDots,
      stopAmbient,
      stopSearchDots: _stopSearchDots,
      stopWaitingDots: _stopWaitingDots,
      updatePredictedInput: (slot, snap, differs) => {
        const predicted = rbPredicted[slot];
        if (!predicted || !differs(predicted, snap)) return false;
        rbPredicted[slot] = { ...snap };
        return true;
      },
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
    startOnlineMatchSession({
      ROLLBACK_WINDOW,
      factoryName,
      gameState,
      onlineClient,
      onlineIdentity,
      onlineRemoteIdentity,
      onlineSide,
      setIsOnline: value => { isOnline = value; },
      setLabels: labels => { p1Label = labels.p1; p2Label = labels.p2; },
      setOnlinePartnerEnd: value => { onlinePartnerEnd = value; },
      setOnlinePartnerGraceTicks: value => { onlinePartnerGraceTicks = value; },
      setOnlineRemoteLastInput: value => { onlineRemoteLastInput = value; },
      setResimulating: value => { resimulating = value; },
      setRollbackCounters: counters => {
        rbRollbacksThisSec = counters.rollbacksThisSec;
        rbDisplayRollbacks = counters.displayRollbacks;
        rbSecStartFrame = counters.secStartFrame;
      },
      setRollbackState: rollbackState => {
        rbLocalFrame = rollbackState.localFrame;
        rbStateBuffer = rollbackState.stateBuffer;
        rbLocalInputs = rollbackState.localInputs;
        rbPredicted = rollbackState.predicted;
      },
      showScreen,
      startAmbient,
    });
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
    prepareRoundState(gameState, {
      camera,
      createPlatforms,
      isOnline,
      onlineMatchSeed,
      pickOnlineStage,
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
    tickRoundEndState({
      applyPhysics,
      camera,
      createPlatforms,
      document,
      gameState,
      isOnline,
      onlineIsRanked,
      onlineMatchSeed,
      onlineRemoteIdentity,
      p1Label,
      p2Label,
      pickOnlineStage,
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
    if      (gameState.phase === 'active')           tickActive();
    else if (gameState.phase === 'round_end')        tickRoundEnd();
    else if (gameState.phase === 'round_start')      tickRoundStart();
    else if (gameState.phase === 'online_countdown') tickOnlineCountdown();
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
      onlineClient,
      onlinePartnerEnd,
      onlinePartnerGraceTicks,
      p1In,
      p2In,
      playSound,
      resolveHits,
      resimulating,
      setOnlinePartnerEnd: value => { onlinePartnerEnd = value; },
      setOnlinePartnerGraceTicks: value => { onlinePartnerGraceTicks = value; },
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

    const localIn = input.getSnapshot(getHumanInputBindings(onlineSide, bindings, {
      mobileControlsActive,
      defaultMobileBindings: DEFAULT_P1,
    }));
    input.flush();

    const slot = rbLocalFrame % ROLLBACK_WINDOW;
    rbStateBuffer[slot] = saveGameState(gameState);
    rbLocalInputs[slot] = { ...localIn };
    rbPredicted[slot]   = { ...(onlineRemoteLastInput ?? EMPTY_INPUT) };

    onlineClient.sendInput(rbLocalFrame, localIn);

    _tickSim(
      onlineSide === 'p1' ? localIn         : rbPredicted[slot],
      onlineSide === 'p2' ? localIn         : rbPredicted[slot],
    );

    rbLocalFrame++;

    // Snapshot rollback counter once per second (60 frames)
    if (rbLocalFrame - rbSecStartFrame >= 60) {
      rbDisplayRollbacks = rbRollbacksThisSec;
      rbRollbacksThisSec = 0;
      rbSecStartFrame    = rbLocalFrame;
    }
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
        rollbacksPerSec: rbDisplayRollbacks,
      } : null;
      render(ctx, canvas, gameState, camera, netInfo);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

export { initGame };
