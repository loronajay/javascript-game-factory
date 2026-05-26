import { loadAssets, getSound }      from './scripts/assets.js';
import { createBotState, tickBot }  from './scripts/bot.js';
import { loadFactoryProfile }       from '../../js/platform/identity/factory-profile.mjs';
import { createAudioController }    from './scripts/audio.js';
import { createControlsScreen }     from './scripts/controls-screen.js';
import { createInput }              from './scripts/input.js';
import { createLobbyUi }            from './scripts/lobby-ui.js';
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
import { buildOnlineIdentity } from './scripts/online-identity.js';
import { drawOnlineCountdown, EMPTY_INPUT, inputsDiffer, pickOnlineStage } from './scripts/online-match-view.js';
import { loadGameState, saveGameState } from './scripts/rollback-state.js';
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

  const gameState = {
    phase:      'menu',
    roundTarget: 2,      // wins needed (BO3 = 2, BO5 = 3)
    roundNum:    0,
    p1: createPlayer('p1'),
    p2: createPlayer('p2'),
    p1Projectile: null,
    p2Projectile: null,
    gridlock:    null,
    effects:     [],
    clashFlash:      0,   // 0–1 white flash intensity, decays each tick
    deathFlash:      0,   // 0–1 red flash intensity on kill, decays each tick
    roundStartTick:  0,   // ticks into the round-start banner sequence
    roundEnd:    null,
    platforms:   createPlatforms('single'),
  };

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
  let onlineRemoteInputBuf  = {};
  let onlineRemoteLastInput = null;
  let onlineLocalSeq        = 0;
  let onlinePendingEnd        = null;
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

  function _drainRemoteInput() {
    const keys = Object.keys(onlineRemoteInputBuf).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return null;
    const seq = keys[0];
    const snap = onlineRemoteInputBuf[seq];
    delete onlineRemoteInputBuf[seq];
    onlineRemoteLastInput = snap;
    return snap;
  }


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

  document.getElementById('btn-local').addEventListener('click', () => {
    botConfig.enabled = false;
    p1Label = factoryName;
    p2Label = 'Player 2';
    showScreen('screen-setup');
  });

  document.getElementById('btn-cpu').addEventListener('click', () => showScreen('screen-cpu-setup'));

  document.getElementById('btn-online').addEventListener('click', () => enterOnlineFlow());

  document.getElementById('btn-ranked').addEventListener('click', () => _showRankedProfile());

  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('side-btn--active'));
      btn.classList.add('side-btn--active');
      botConfig.side = btn.dataset.side === 'p1' ? 'p2' : 'p1'; // bot is opposite of human
    });
  });

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('diff-btn--active'));
      btn.classList.add('diff-btn--active');
      botConfig.difficulty = btn.dataset.difficulty;
    });
  });

  document.querySelectorAll('.cpu-round-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cpu-round-btn').forEach(b => b.classList.remove('cpu-round-btn--active'));
      btn.classList.add('cpu-round-btn--active');
      selectedRounds = Number(btn.dataset.rounds);
    });
  });

  document.querySelectorAll('.cpu-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cpu-layout-btn').forEach(b => b.classList.remove('cpu-layout-btn--active'));
      btn.classList.add('cpu-layout-btn--active');
      selectedLayout = btn.dataset.layout;
    });
  });

  document.getElementById('btn-start-cpu').addEventListener('click', () => {
    botConfig.enabled = true;
    // Human side gets the factory name; bot gets 'CPU'
    if (botConfig.side === 'p1') {
      p1Label = 'CPU';
      p2Label = factoryName;
    } else {
      p1Label = factoryName;
      p2Label = 'CPU';
    }
    gameState.roundTarget = selectedRounds === 3 ? 2 : 3;
    startMatch();
  });

  document.getElementById('btn-cpu-back').addEventListener('click', () => showScreen('screen-menu'));

  document.querySelectorAll('.round-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.round-btn').forEach(b => b.classList.remove('round-btn--active'));
      btn.classList.add('round-btn--active');
      selectedRounds = Number(btn.dataset.rounds);
    });
  });

  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('layout-btn--active'));
      btn.classList.add('layout-btn--active');
      selectedLayout = btn.dataset.layout;
    });
  });

  document.getElementById('btn-start-match').addEventListener('click', () => {
    gameState.roundTarget = selectedRounds === 3 ? 2 : 3;
    startMatch();
  });

  document.getElementById('btn-setup-back').addEventListener('click', () => showScreen('screen-menu'));
  document.getElementById('btn-rematch').addEventListener('click', () => startMatch());
  document.getElementById('btn-result-menu').addEventListener('click', () => {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    showScreen('screen-menu');
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
    onlineClient.cb.onConnected = () => {
      onlineClient.requestQueueStatus();
    };

    onlineClient.cb.onQueueCounts = (counts) => {
      onlineQueueCounts = counts;
      _updateQueueHint();
    };

    onlineClient.cb.onSearching = () => {
      _setSideLocked('searching-side-locked');
      _startSearchDots(onlineIsRanked ? 'Searching Ranked' : 'Searching');
      showLobbyPhase('searching');
    };

    onlineClient.cb.onSearchCancelled = () => {
      _stopSearchDots();
      _setSideLocked('online-side-locked');
      _updateQueueHint();
      showLobbyPhase('main');
    };

    onlineClient.cb.onRoomCreated = (code) => {
      document.getElementById('room-code-display').textContent = code;
      _startWaitingDots();
      showLobbyPhase('create');
    };

    onlineClient.cb.onMatchReady = ({ seed, remoteSide, serverNow, startAt }) => {
      _stopSearchDots();
      _stopWaitingDots();
      onlineMatchSeed   = seed;
      onlineClockOffset = serverNow - Date.now();
      onlineStartAt     = startAt;
      _startOnlineMatch();
    };

    onlineClient.cb.onRemoteProfile = (profile) => {
      onlineRemoteIdentity = profile;
    };

    onlineClient.cb.onRemoteInput = (snap) => {
      const frame = snap.seq;
      const age   = rbLocalFrame - frame;
      onlineRemoteLastInput = snap;

      // Outside rollback window (too old or from the future) — just update last-known
      if (age <= 0 || age > ROLLBACK_WINDOW) return;

      const slot      = frame % ROLLBACK_WINDOW;
      const predicted = rbPredicted[slot];
      if (predicted && inputsDiffer(predicted, snap)) {
        rbPredicted[slot] = { ...snap };
        resimulate(frame);
      }
    };

    onlineClient.cb.onRemoteRoundEnd = (re) => {
      // Buffer the partner's result; local sim gets a few ticks to agree before we force it
      if (gameState.phase === 'active') {
        onlinePartnerEnd = re;
      }
    };

    onlineClient.cb.onSideConflict = () => {
      _stopSearchDots();
      _stopWaitingDots();
      document.querySelectorAll('.side-card').forEach(c => c.classList.remove('side-card--selected'));
      document.getElementById('side-conflict-error').hidden = false;
      showScreen('screen-online-lobby');
      showLobbyPhase('side_select');
    };

    onlineClient.cb.onPartnerLeft = () => {
      _stopSearchDots();
      _stopWaitingDots();
      onlineClient.stopPinging();

      // Award forfeit ELO win if we were in an active ranked match
      const activePhasesForForfeit = new Set(['online_countdown', 'round_start', 'active', 'round_end']);
      if (onlineIsRanked && activePhasesForForfeit.has(gameState.phase)
          && onlineIdentity?.playerId && onlineRemoteIdentity?.playerId) {
        const sessionId = `sumorai:${onlineMatchSeed}:forfeit`;
        const apiClient = createPlatformApiClient();
        if (typeof apiClient?.updateGameRating === 'function') {
          apiClient.updateGameRating('sumorai-ranked', {
            opponentPlayerId: onlineRemoteIdentity.playerId,
            outcome:          'win',
            sessionId,
          }).catch(() => {});
        }
      }

      isOnline = false;
      onlineRemoteIdentity = null;
      gameState.phase = 'menu';
      stopAmbient();
      showScreen('screen-online-disconnected');
    };

    onlineClient.cb.onError = (code, message) => {
      console.warn('[Sumorai Online] error:', code, message);
    };
  }

  function _publishOnlineMatchResult(matchWinner) {
    const myResult   = matchWinner === onlineSide ? 'win' : 'loss';
    const sessionId  = `sumorai:${onlineMatchSeed}`;

    publishSumoraiMatchActivity({
      result:          myResult,
      mySide:          onlineSide,
      p1Wins:          gameState.p1.wins,
      p2Wins:          gameState.p2.wins,
      myProfile:       onlineIdentity,
      opponentProfile: onlineRemoteIdentity,
      sessionId,
    }).catch(() => {});

    // Update ELO for ranked matches only — session dedup prevents double-applying
    if (onlineIsRanked && onlineIdentity?.playerId && onlineRemoteIdentity?.playerId) {
      const apiClient = createPlatformApiClient();
      if (typeof apiClient?.updateGameRating === 'function') {
        apiClient.updateGameRating('sumorai-ranked', {
          opponentPlayerId: onlineRemoteIdentity.playerId,
          outcome:          myResult,
          sessionId,
        }).catch(() => {});
      }
    }
  }

  async function _showOnlineResultRating() {
    const pid = onlineIdentity?.playerId;
    const wrapper = document.getElementById('ranked-result-rating');
    if (!pid || !wrapper) return;
    try {
      const apiClient = createPlatformApiClient();
      const rating = await apiClient.getGameRating('sumorai-ranked', pid);
      if (rating) {
        document.getElementById('ranked-result-value').textContent = `Rating: ${rating.rating}`;
        const w = rating.wins ?? 0, l = rating.losses ?? 0, d = rating.draws ?? 0;
        document.getElementById('ranked-result-record').textContent = `${w}W / ${l}L / ${d}D`;
        wrapper.hidden = false;
      }
    } catch { /* silent — don't break result screen */ }
  }

  async function _showRankedProfile() {
    showScreen('screen-ranked-profile');
    const identity = onlineIdentity ?? buildOnlineIdentity(factoryProfile);
    const pid = identity?.playerId;
    if (!pid) {
      document.getElementById('ranked-rating-num').textContent = '—';
      document.getElementById('ranked-record').textContent = 'Sign in to track your rating.';
      document.getElementById('ranked-winrate').textContent = '';
      return;
    }
    document.getElementById('ranked-rating-num').textContent = '…';
    document.getElementById('ranked-record').textContent = '';
    document.getElementById('ranked-winrate').textContent = '';
    try {
      const apiClient = createPlatformApiClient();
      const rating = await apiClient.getGameRating('sumorai-ranked', pid);
      if (rating) {
        document.getElementById('ranked-rating-num').textContent = String(rating.rating ?? 1200);
        const w = rating.wins ?? 0, l = rating.losses ?? 0, d = rating.draws ?? 0;
        document.getElementById('ranked-record').textContent = `${w}W / ${l}L / ${d}D`;
        const total = w + l + d;
        document.getElementById('ranked-winrate').textContent =
          total > 0 ? `${Math.round(w / total * 100)}% win rate` : '';
      } else {
        document.getElementById('ranked-rating-num').textContent = '1200';
        document.getElementById('ranked-record').textContent = '0W / 0L / 0D';
      }
    } catch {
      document.getElementById('ranked-rating-num').textContent = '—';
      document.getElementById('ranked-record').textContent = 'Could not load rating.';
    }
  }

  function _startOnlineMatch() {
    const myName     = onlineIdentity?.displayName || factoryName;
    const remoteName = onlineRemoteIdentity?.displayName || 'Opponent';
    p1Label = onlineSide === 'p1' ? myName : remoteName;
    p2Label = onlineSide === 'p2' ? myName : remoteName;
    gameState.roundTarget = 3;
    isOnline              = true;
    onlineLocalSeq        = 0;
    onlineRemoteInputBuf  = {};
    onlineRemoteLastInput = null;
    onlinePendingEnd      = null;
    onlinePartnerEnd      = null;
    onlinePartnerGraceTicks = 0;
    rbLocalFrame       = 0;
    rbStateBuffer      = new Array(ROLLBACK_WINDOW);
    rbLocalInputs      = new Array(ROLLBACK_WINDOW);
    rbPredicted        = new Array(ROLLBACK_WINDOW);
    resimulating       = false;
    rbRollbacksThisSec = 0;
    rbDisplayRollbacks = 0;
    rbSecStartFrame    = 0;
    onlineClient.startPinging();
    gameState.phase = 'online_countdown';
    showScreen('screen-game');
    startAmbient();
  }


  // Side-select cards
  document.querySelectorAll('.side-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-card').forEach(c => c.classList.remove('side-card--selected'));
      btn.classList.add('side-card--selected');
      onlineSide = btn.dataset.side;
      document.getElementById('side-conflict-error').hidden = true;
    });
  });

  document.getElementById('btn-side-confirm').addEventListener('click', () => {
    document.getElementById('side-conflict-error').hidden = true;
    _setSideLocked('online-side-locked');
    _updateQueueHint();
    showLobbyPhase('main');
  });

  document.getElementById('btn-online-side-back').addEventListener('click', () => {
    _stopSearchDots();
    _stopWaitingDots();
    if (onlineClient) { onlineClient.disconnect(); onlineClient = null; }
    onlineQueueCounts = null;
    showScreen('screen-menu');
  });

  // Main lobby
  document.getElementById('btn-ranked-match').addEventListener('click', () => {
    onlineIsRanked = true;
    onlineClient.findMatch(onlineSide, true);
  });

  document.getElementById('btn-find-match').addEventListener('click', () => {
    onlineIsRanked = false;
    onlineClient.findMatch(onlineSide, false);
  });

  document.getElementById('btn-play-friend').addEventListener('click', () => {
    _setSideLocked('friend-side-locked');
    showLobbyPhase('friend_options');
  });

  document.getElementById('btn-lobby-main-back').addEventListener('click', () => {
    showLobbyPhase('side_select');
  });

  // Searching phase
  document.getElementById('btn-cancel-search').addEventListener('click', () => {
    _stopSearchDots();
    onlineClient.cancelSearch();
    onlineClient.cancelRoom();
    _setSideLocked('online-side-locked');
    _updateQueueHint();
    showLobbyPhase('main');
  });

  // Friend options
  document.getElementById('btn-create-room').addEventListener('click', () => {
    onlineClient.createRoom(onlineSide);
    // onRoomCreated callback handles transition
  });

  document.getElementById('btn-join-room-option').addEventListener('click', () => {
    document.getElementById('room-code-input').value = '';
    showLobbyPhase('join');
  });

  document.getElementById('btn-friend-options-back').addEventListener('click', () => {
    _setSideLocked('online-side-locked');
    _updateQueueHint();
    showLobbyPhase('main');
  });

  // Create (waiting) phase
  document.getElementById('btn-cancel-room').addEventListener('click', () => {
    _stopWaitingDots();
    onlineClient.cancelRoom();
    _setSideLocked('online-side-locked');
    _updateQueueHint();
    showLobbyPhase('main');
  });

  // Join phase
  document.getElementById('btn-join-submit').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length < 4) return;
    document.getElementById('searching-label').textContent = 'Joining room…';
    _setSideLocked('searching-side-locked');
    showLobbyPhase('searching');
    onlineClient.joinRoom(onlineSide, code);
  });

  document.getElementById('room-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-join-submit').click();
  });

  document.getElementById('room-code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  document.getElementById('btn-join-back').addEventListener('click', () => {
    showLobbyPhase('friend_options');
    _setSideLocked('friend-side-locked');
  });

  // Online result
  document.getElementById('btn-online-rematch').addEventListener('click', () => {
    isOnline = false;
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    if (onlineClient) {
      _setSideLocked('online-side-locked');
      _updateQueueHint();
      showScreen('screen-online-lobby');
      showLobbyPhase('main');
    } else {
      showScreen('screen-menu');
    }
  });

  document.getElementById('btn-online-result-menu').addEventListener('click', () => {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    _stopSearchDots();
    _stopWaitingDots();
    if (onlineClient) { onlineClient.disconnect(); onlineClient = null; }
    isOnline = false;
    showScreen('screen-menu');
  });

  // Disconnected
  document.getElementById('btn-ranked-back').addEventListener('click', () => showScreen('screen-menu'));

  document.getElementById('btn-disconnected-menu').addEventListener('click', () => {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    stopAmbient();
    if (onlineClient) { onlineClient.disconnect(); onlineClient = null; }
    isOnline = false;
    showScreen('screen-menu');
  });


  function spawnChing(x, y) {
    spawnChingEffect(gameState, x, y);
    playSound('ching');
  }

  function spawnBlood(x, y, flip) {
    spawnBloodEffect(gameState, x, y, flip);
  }

  function startMatch() {
    gameState.p1.wins = 0;
    gameState.p2.wins = 0;
    gameState.roundNum = 0;
    gameState.roundEnd = null;
    botState = createBotState();
    startAmbient();
    startRound();
  }

  function startRound() {
    gameState.roundNum++;
    gameState.phase          = 'round_start';
    gameState.roundStartTick = 0;
    gameState.platforms      = isOnline
      ? createPlatforms(pickOnlineStage(onlineMatchSeed, gameState.roundNum))
      : createPlatforms(selectedLayout);
    gameState.p1Projectile   = null;
    gameState.p2Projectile   = null;
    gameState.gridlock       = null;
    gameState.effects        = [];
    gameState.clashFlash     = 0;
    gameState.deathFlash     = 0;
    resetPlayer(gameState.p1);
    resetPlayer(gameState.p2);
    gameState.p1.inputsLocked = true;
    gameState.p2.inputsLocked = true;
    resetCamera(camera);
    showScreen('screen-game');
  }


  function triggerRoundEnd(winner, isBlastKill = false) {
    gameState.phase        = 'round_end';
    gameState.deathFlash   = 1;
    gameState.p1Projectile = null;
    gameState.p2Projectile = null;
    if (isBlastKill) playSound('explosion');
    else             playSound('death');

    if (winner === 'draw') {
      for (const p of [gameState.p1, gameState.p2]) {
        p.inputsLocked      = true;
        p.attackTimer       = 0;
        p.throwing          = false;
        p.dashBursting      = false;
        p.dashBurstTimer    = 0;
        p.dashRecovering    = false;
        p.dashRecoveryTimer = 0;
        p.speedX            = 0;
        if (!p.dead) {
          p.dying = true;
          if (!isBlastKill) spawnBlood(p.x - p.facing * 10, p.y - 14, p.facing === -1);
        }
      }
      gameState.roundEnd = { winner: 'draw', loser: null, tick: 0, triggered: false, fadingIn: false, isBlastKill };
      return;
    }

    const loserSide    = winner === 'p1' ? 'p2' : 'p1';
    const loser        = gameState[loserSide];
    const winnerPlayer = gameState[winner];

    loser.inputsLocked = true;
    if (!loser.dead) {
      loser.dying = true;
      if (!isBlastKill) spawnBlood(
        loser.x - loser.facing * 10,
        loser.y - 14,
        loser.facing === -1,
      );
    }

    // Lock winner so held attack/movement doesn't loop during the death sequence
    winnerPlayer.inputsLocked      = true;
    winnerPlayer.attackTimer       = 0;
    winnerPlayer.throwing          = false;
    winnerPlayer.dashBursting      = false;
    winnerPlayer.dashBurstTimer    = 0;
    winnerPlayer.dashRecovering    = false;
    winnerPlayer.dashRecoveryTimer = 0;
    winnerPlayer.speedX            = 0;

    gameState.roundEnd = {
      winner,
      loser:      loserSide,
      tick:       0,
      triggered:  false,
      fadingIn:   false,
      isBlastKill,
    };
  }

  function tickRoundEnd() {
    const re = gameState.roundEnd;
    updatePlatforms(gameState.platforms);
    tickVisualEffects(gameState);

    // Keep gravity + floor collision running — inputs locked so no movement, just fall
    const noInputs = {
      left: false, right: false, up: false, down: false,
      attack: false, dash: false, projectile: false, attackJustPressed: false,
    };
    applyPhysics(gameState.p1, noInputs, gameState.platforms);
    applyPhysics(gameState.p2, noInputs, gameState.platforms);

    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);
    re.tick++;

    if (re.tick === 180 && !re.triggered) {
      re.triggered = true;
      if      (re.winner === 'p1') gameState.p1.wins++;
      else if (re.winner === 'p2') gameState.p2.wins++;
      // 'draw': no wins awarded

      if (gameState.p1.wins >= gameState.roundTarget || gameState.p2.wins >= gameState.roundTarget) {
        gameState.phase = 'match_end';
        if (isOnline) {
          document.getElementById('online-result-winner').textContent =
            re.winner === 'p1' ? `${p1Label} Wins!` : `${p2Label} Wins!`;
          document.getElementById('online-result-opponent').textContent =
            onlineRemoteIdentity?.displayName ? `vs ${onlineRemoteIdentity.displayName}` : '';
          document.getElementById('ranked-result-rating').hidden = true;
          _publishOnlineMatchResult(re.winner);
          setTimeout(() => {
            showScreen('screen-online-result');
            if (onlineIsRanked) _showOnlineResultRating();
          }, 2000);
        } else {
          document.getElementById('result-winner').textContent =
            re.winner === 'p1' ? `${p1Label} Wins!` : `${p2Label} Wins!`;
          setTimeout(() => showScreen('screen-result'), 2000);
        }
      } else {
        gameState.roundNum++;
        gameState.platforms    = isOnline
          ? createPlatforms(pickOnlineStage(onlineMatchSeed, gameState.roundNum))
          : createPlatforms(selectedLayout);
        gameState.p1Projectile = null;
        gameState.p2Projectile = null;
        gameState.gridlock     = null;
        resetPlayer(gameState.p1);
        resetPlayer(gameState.p2);
        gameState.p1.inputsLocked = true;
        gameState.p2.inputsLocked = true;
        resetCamera(camera);
        re.fadingIn = true;
      }
    }

    if (re.fadingIn && re.tick >= 240) {
      gameState.phase          = 'round_start';
      gameState.roundStartTick = 0;
      gameState.roundEnd       = null;
    }
  }


  function tickRoundStart() {
    gameState.roundStartTick++;
    updatePlatforms(gameState.platforms);
    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);
    updateCamera(camera, gameState.p1, gameState.p2);

    if (gameState.roundStartTick === 1)  playSound('are_you_ready');
    if (gameState.roundStartTick === 90) playSound('fight');

    if (gameState.roundStartTick >= 150) {
      gameState.phase = 'active';
      gameState.p1.inputsLocked = false;
      gameState.p2.inputsLocked = false;
    }
  }


  function tickOnlineCountdown() {
    const secsLeft = getCountdownSecondsRemaining(onlineStartAt, onlineClockOffset);
    if (secsLeft <= 0) {
      gameState.p1.wins = 0;
      gameState.p2.wins = 0;
      gameState.roundNum = 0;
      gameState.roundEnd = null;
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
    if (gameState.gridlock) {
      tickVisualEffects(gameState);
      const result = tickGridlock(gameState.gridlock, gameState.p1, gameState.p2, p1In, p2In);
      stepAnimation(gameState.p1);
      stepAnimation(gameState.p2);
      updateCamera(camera, gameState.p1, gameState.p2);
      if (result?.resolved) {
        playSound('gridlock_end');
        gameState.gridlock        = null;
        gameState.p1.inGridlock   = false;
        gameState.p2.inGridlock   = false;
        gameState.p1.inputsLocked = false;
        gameState.p2.inputsLocked = false;
      }
      return;
    }

    tickVisualEffects(gameState);
    updatePlatforms(gameState.platforms);

    const p1WasCharging  = gameState.p1.dashCharge > 0;
    const p2WasCharging  = gameState.p2.dashCharge > 0;
    const p1WasBlocking  = gameState.p1.blocking;
    const p2WasBlocking  = gameState.p2.blocking;
    const p1WasAttacking = gameState.p1.attackTimer > 0;
    const p2WasAttacking = gameState.p2.attackTimer > 0;
    const p1WasDashAtk   = isDashAttackActive(gameState.p1);
    const p2WasDashAtk   = isDashAttackActive(gameState.p2);

    const p1Result = applyPhysics(gameState.p1, p1In, gameState.platforms);
    const p2Result = applyPhysics(gameState.p2, p2In, gameState.platforms);

    if (!p1WasCharging  && gameState.p1.dashCharge > 0) playSound('dash');
    if (!p2WasCharging  && gameState.p2.dashCharge > 0) playSound('dash');
    if (!p1WasBlocking  && gameState.p1.blocking)       playSound('shield');
    if (!p2WasBlocking  && gameState.p2.blocking)       playSound('shield');
    if (!p1WasAttacking && gameState.p1.attackTimer > 0 && gameState.p1.throwing) playSound('throw');
    if (!p2WasAttacking && gameState.p2.attackTimer > 0 && gameState.p2.throwing) playSound('throw');
    if (!p1WasDashAtk && isDashAttackActive(gameState.p1)) playSound('swing');
    if (!p2WasDashAtk && isDashAttackActive(gameState.p2)) playSound('swing');

    if (gameState.p1.wantsProjectile && !gameState.p1Projectile) {
      gameState.p1Projectile = createProjectile('p1', gameState.p1.x + gameState.p1.facing * 24, gameState.p1.y, gameState.p1.facing);
    }
    if (gameState.p2.wantsProjectile && !gameState.p2Projectile) {
      gameState.p2Projectile = createProjectile('p2', gameState.p2.x + gameState.p2.facing * 24, gameState.p2.y, gameState.p2.facing);
    }

    if (gameState.p1Projectile?.active) tickProjectile(gameState.p1Projectile);
    if (gameState.p2Projectile?.active) tickProjectile(gameState.p2Projectile);

    if (checkProjectileClash(gameState.p1Projectile, gameState.p2Projectile)) {
      spawnChing(
        (gameState.p1Projectile.x + gameState.p2Projectile.x) / 2,
        (gameState.p1Projectile.y + gameState.p2Projectile.y) / 2,
      );
      gameState.p1Projectile.active = false;
      gameState.p2Projectile.active = false;
    }

    const p1Box = isAttackActive(gameState.p1)    ? getAttackHitbox(gameState.p1)
                : isDashAttackActive(gameState.p1) ? getDashHitbox(gameState.p1)
                : null;
    const p2Box = isAttackActive(gameState.p2)    ? getAttackHitbox(gameState.p2)
                : isDashAttackActive(gameState.p2) ? getDashHitbox(gameState.p2)
                : null;
    if (p1Box && checkHitboxVsProjectile(p1Box, gameState.p2Projectile)) {
      spawnChing(gameState.p2Projectile.x, gameState.p2Projectile.y);
      gameState.p2Projectile.active = false;
    }
    if (p2Box && checkHitboxVsProjectile(p2Box, gameState.p1Projectile)) {
      spawnChing(gameState.p1Projectile.x, gameState.p1Projectile.y);
      gameState.p1Projectile.active = false;
    }

    let projKillP1 = false;
    if (gameState.p2Projectile?.active) {
      const facing = gameState.p2Projectile.facing;
      const r = checkProjectileVsPlayer(gameState.p2Projectile, gameState.p1);
      if (r) {
        gameState.p2Projectile.active = false;
        if (r === 'block') {
          gameState.p1.speedX  = facing * PROJ_SHIELD_KNOCKBACK;
          gameState.p1.stamina = Math.max(0, gameState.p1.stamina - 3);
          spawnChing(gameState.p1.x, gameState.p1.y);
        } else {
          projKillP1 = true;
          playSound('proj_hit');
        }
      }
    }

    let projKillP2 = false;
    if (gameState.p1Projectile?.active) {
      const facing = gameState.p1Projectile.facing;
      const r = checkProjectileVsPlayer(gameState.p1Projectile, gameState.p2);
      if (r) {
        gameState.p1Projectile.active = false;
        if (r === 'block') {
          gameState.p2.speedX  = facing * PROJ_SHIELD_KNOCKBACK;
          gameState.p2.stamina = Math.max(0, gameState.p2.stamina - 3);
          spawnChing(gameState.p2.x, gameState.p2.y);
        } else {
          projKillP2 = true;
          playSound('proj_hit');
        }
      }
    }

    const combatResult = resolveHits(gameState.p1, gameState.p2);

    if (combatResult && !combatResult.gridlock) {
      if (combatResult.p1HitP2) {
        playSound(gameState.p1.dashBursting ? 'dash2' : 'hit');
        if (combatResult.p2Killed) {
          playSound('hurt');
        } else {
          spawnChing(gameState.p2.x, gameState.p2.y);
        }
      }
      if (combatResult.p2HitP1) {
        playSound(gameState.p2.dashBursting ? 'dash2' : 'hit');
        if (combatResult.p1Killed) {
          playSound('hurt');
        } else {
          spawnChing(gameState.p1.x, gameState.p1.y);
        }
      }
    }

    const p1WasSwingActive = isAttackActive(gameState.p1);
    const p2WasSwingActive = isAttackActive(gameState.p2);

    stepAnimation(gameState.p1);
    stepAnimation(gameState.p2);

    if (!p1WasSwingActive && isAttackActive(gameState.p1)) playSound('swing');
    if (!p2WasSwingActive && isAttackActive(gameState.p2)) playSound('swing');

    updateCamera(camera, gameState.p1, gameState.p2);

    if (gameState.p1Projectile && !gameState.p1Projectile.active) gameState.p1Projectile = null;
    if (gameState.p2Projectile && !gameState.p2Projectile.active) gameState.p2Projectile = null;

    if (combatResult?.gridlock) {
      spawnChing(
        (gameState.p1.x + gameState.p2.x) / 2,
        (gameState.p1.y + gameState.p2.y) / 2,
      );
      gameState.gridlock = createGridlockState();
      for (const p of [gameState.p1, gameState.p2]) {
        p.inGridlock        = true;
        p.inputsLocked      = true;
        p.dashBursting      = false;
        p.dashBurstTimer    = 0;
        p.dashRecovering    = false;
        p.dashRecoveryTimer = 0;
        p.speedX            = 0;
      }
      return;
    }

    const p1Dead = p1Result === 'dead' || combatResult?.p1Killed || projKillP1;
    const p2Dead = p2Result === 'dead' || combatResult?.p2Killed || projKillP2;

    if (p1Dead || p2Dead) {
      if (p1Dead) { gameState.p1.dead = (p1Result === 'dead'); gameState.p1.inputsLocked = true; }
      if (p2Dead) { gameState.p2.dead = (p2Result === 'dead'); gameState.p2.inputsLocked = true; }
      const winner = (p2Dead && !p1Dead) ? 'p1'
                   : (p1Dead && !p2Dead) ? 'p2'
                   : 'draw';
      const isBlastKill = (p1Dead && p1Result === 'dead') || (p2Dead && p2Result === 'dead');
      onlinePartnerEnd        = null;
      onlinePartnerGraceTicks = 0;
      if (!resimulating && isOnline) onlineClient.sendRoundEnd(winner);
      triggerRoundEnd(winner, isBlastKill);
    } else if (onlinePartnerEnd) {
      onlinePartnerGraceTicks++;
      if (onlinePartnerGraceTicks >= 8) {
        onlinePartnerGraceTicks = 0;
        if (!resimulating && isOnline) onlineClient.sendRoundEnd(onlinePartnerEnd.winner);
        triggerRoundEnd(onlinePartnerEnd.winner, false);
        onlinePartnerEnd = null;
      }
    }
  }


  function tickActive() {
    if (!isOnline) {
      const p1In = (botConfig.enabled && botConfig.side === 'p1')
        ? tickBot(botState, gameState, 'p1', botConfig.difficulty)
        : input.getSnapshot(bindings.p1);
      const p2In = (botConfig.enabled && botConfig.side === 'p2')
        ? tickBot(botState, gameState, 'p2', botConfig.difficulty)
        : input.getSnapshot(bindings.p2);
      input.flush();
      _tickSim(p1In, p2In);
      return;
    }

    const localIn = input.getSnapshot(bindings[onlineSide]);
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
