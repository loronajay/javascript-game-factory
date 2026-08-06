import { createOnlineClient } from './scripts/online.js';
import { keyToEmoteType } from './scripts/emojis.js';
import { createFleetBoard, createTargetBoard, FLEET_DEFS } from './scripts/board.js';
import {
  buildBoardGrid, showScreen,
  renderPlacementBoard, renderShipRoster,
} from './scripts/renderer.js';
import { createBgMusicController } from './scripts/audio.js';
import {
  selectShip, handlePlacementHover, handlePlacementClick, rotateShip,
} from './scripts/placement.js';
import {
  transitionToBattle, transitionToMatchEnded,
} from './scripts/match-flow.js';
import {
  clearBattleTimers, handleTargetClick, handleIncomingShot, handleShotResult,
  showBattleEmote, trySendBattleEmote,
} from './scripts/battle.js';
import {
  clearPublicMatchRetry, schedulePublicMatchRetry,
  startPublicMatch, startPrivateCreate, startPrivateJoin,
} from './scripts/matchmaking.js';
import { createBotClient, clearBotBattleTimers } from './scripts/bot-battle.js';
import { createRematchFlow } from './scripts/rematch-flow.js';

const bgMusic = createBgMusicController();

function goToScreen(screenId) {
  showScreen(screenId);
  bgMusic.transition(screenId);
}

// ─── State ────────────────────────────────────────────────────────────────────

function createInitialState() {
  return {
    phase: 'menu',        // 'menu'|'difficulty'|'matchmaking'|'placement'|'waiting_opponent'|'battle'|'match_ended'
    matchmakingMode: null,// null|'public'|'private_create'|'private_join'
    turn: null,           // 'mine'|'theirs'|'awaiting_result'  (battle only)
    mySide: null,         // 'alpha'|'beta'
    seed: null,
    myFleet: createFleetBoard(),
    myTarget: createTargetBoard(),
    placedShips: {},      // { [shipId]: { col, row, horizontal } }
    selectedShipId: null,
    horizontal: true,
    hoverCol: null,
    hoverRow: null,
    opponentReady: false,
    matchResult: null,    // 'win'|'loss'|'forfeit_win'
    lastShotInfo: null,   // { hit, sunk, shipId } for status bar
    myProfile: null,      // { playerId, displayName }
    opponentProfile: null,// { playerId, displayName }
    roomCode: null,
    rematchRound: 0,
    pendingNetAction: null, // called inside onConnected
    pendingShot: null, // { col, row, startedAt }
    incomingShot: null, // { col, row } while opponent shot impact animation plays
    activeEmotes: {
      mine: null,
      theirs: null,
    },
    // Solo mode fields
    isSoloMode: false,
    botDifficulty: null,  // 'easy'|'medium'|'hard'
    botFleet: null,       // FleetBoard for bot ships (hidden)
    botTarget: null,      // TargetBoard tracking bot's shots (for stats + AI)
  };
}

let gs = createInitialState();
let net = null;
let rematchFlow = null;

function clearAll() {
  clearPublicMatchRetry();
  clearBattleTimers();
  if (gs.isSoloMode) clearBotBattleTimers();
  bgMusic.stop();
}

// ─── Placement helpers (shared by online and solo) ────────────────────────────

function enterPlacementScreen() {
  gs.phase = 'placement';
  goToScreen('placement');
  buildBoardGrid(
    document.getElementById('fleet-board'),
    (c, r) => handlePlacementClick(gs, c, r),
    (c, r) => handlePlacementHover(gs, c, r),
  );
  renderPlacementBoard(gs);
  renderShipRoster(gs, (id) => selectShip(gs, id));
}

// ─── Lock-in ──────────────────────────────────────────────────────────────────

function lockIn() {
  if (!FLEET_DEFS.every(d => gs.placedShips[d.id])) return;

  if (gs.isSoloMode) {
    lockInSolo();
    return;
  }

  gs.phase = 'waiting_opponent';
  net.sendPlacementReady();
  goToScreen('waiting');
  if (gs.opponentReady) {
    transitionToBattle(gs, {
      clearAll,
      handleTargetClick: (c, r) => handleTargetClick(gs, net, c, r),
    });
    bgMusic.transition('battle');
  }
}

function lockInSolo() {
  net.startSolo(); // populates gs.botFleet and gs.botTarget
  gs.seed   = 0;   // even → alpha goes first
  gs.mySide = 'alpha'; // player is always alpha in solo (goes first)
  transitionToBattle(gs, {
    clearAll,
    handleTargetClick: (c, r) => handleTargetClick(gs, net, c, r),
  });
  bgMusic.transition('battle');
}

// ─── Solo mode ────────────────────────────────────────────────────────────────

function startSoloMatch(difficulty) {
  gs.isSoloMode     = true;
  gs.botDifficulty  = difficulty;

  net = createBotClient(gs);

  net.cb.onShotResult = (result) => {
    if (gs.phase !== 'battle') return;
    handleShotResult(gs, result, { clearAll });
  };

  net.cb.onOpponentShot = ({ col, row }) => {
    if (gs.phase !== 'battle') return;
    handleIncomingShot(gs, net, col, row, { clearAll });
  };

  enterPlacementScreen();
}

function resetForSoloBattle() {
  clearAll();
  const difficulty = gs.botDifficulty;
  const myProf     = gs.myProfile;

  gs = createInitialState();
  gs.myProfile = myProf;

  startSoloMatch(difficulty);
}

// ─── Match flow ───────────────────────────────────────────────────────────────

function resetForRematch({ seed, round } = {}) {
  clearAll();
  const side    = gs.mySide;
  const nextSeed = Number.isFinite(Number(seed)) ? Number(seed) : (gs.seed ?? 0) + 1;
  const myProf  = gs.myProfile;
  const oppProf = gs.opponentProfile;
  const matchmakingMode = gs.matchmakingMode;
  const roomCode = gs.roomCode;

  gs = createInitialState();
  gs.mySide           = side;
  gs.seed             = nextSeed;
  gs.myProfile        = myProf;
  gs.opponentProfile  = oppProf;
  gs.matchmakingMode  = matchmakingMode;
  gs.roomCode          = roomCode;
  gs.rematchRound      = Math.max(0, Math.floor(Number(round) || 0));

  enterPlacementScreen();
}

// ─── Online callbacks ─────────────────────────────────────────────────────────

function wireOnlineCallbacks() {
  rematchFlow = createRematchFlow({
    sendState: state => net.sendRematch(state),
    sendStart: start => net.sendRematchStart(start),
    isCoordinator: () => net.getMySide() === 'alpha',
    buildStart: round => ({ round, seed: (Number(gs.seed) || 0) + 1 }),
    onState: syncRematchUi,
    onAccepted: resetForRematch,
  });

  net.cb.onConnected = () => {
    const statusEl = document.getElementById('matchmaking-status');
    if (statusEl) statusEl.textContent = 'Connected — searching...';
    gs.pendingNetAction?.();
    gs.pendingNetAction = null;
  };

  net.cb.onSearching = () => {
    const statusEl = document.getElementById('matchmaking-status');
    if (statusEl) statusEl.textContent = `In queue as ${gs.mySide} — waiting for an opponent...`;
    schedulePublicMatchRetry(gs, net);
  };

  net.cb.onRoomCreated = (code) => {
    clearPublicMatchRetry();
    gs.roomCode = code;
    const el = document.getElementById('room-code-display');
    if (el) el.textContent = code;
    goToScreen('room-create');
  };

  net.cb.onMatchReady = ({ seed }) => {
    clearPublicMatchRetry();
    gs.seed = seed;
    enterPlacementScreen();
  };

  net.cb.onRemoteProfile = ({ playerId, displayName }) => {
    gs.opponentProfile = { playerId, displayName };
    const waitEl = document.getElementById('opponent-name-waiting');
    if (waitEl) waitEl.textContent = `Opponent: ${displayName}`;
  };

  net.cb.onOpponentReady = () => {
    gs.opponentReady = true;
    if (gs.phase === 'waiting_opponent') {
      transitionToBattle(gs, {
        clearAll,
        handleTargetClick: (c, r) => handleTargetClick(gs, net, c, r),
      });
      bgMusic.transition('battle');
    }
  };

  net.cb.onOpponentShot = ({ col, row }) => {
    if (gs.phase !== 'battle') return;
    handleIncomingShot(gs, net, col, row, { clearAll, onMatchEnded: beginOnlineResults });
  };

  net.cb.onShotResult = (result) => {
    if (gs.phase !== 'battle') return;
    handleShotResult(gs, result, { clearAll, onMatchEnded: beginOnlineResults });
  };

  net.cb.onEmote = (type) => {
    if (gs.phase !== 'battle') return;
    showBattleEmote(gs, 'theirs', type);
  };

  net.cb.onRematch = state => rematchFlow.receiveState(state);
  net.cb.onRematchStart = start => rematchFlow.receiveStart(start);

  net.cb.onPartnerLeft = () => {
    clearAll();
    if (gs.phase === 'battle') {
      transitionToMatchEnded(gs, 'forfeit_win', { clearAll });
      beginOnlineResults('forfeit_win');
    } else if (gs.phase === 'match_ended') {
      // opponent left after results — stay so the player can still add friend
      rematchFlow.receiveState({ round: gs.rematchRound, available: false, requested: false });
    } else {
      const myProf = gs.myProfile;
      gs = createInitialState();
      gs.myProfile = myProf;
      goToScreen('menu');
    }
  };

  net.cb.onSideConflict = () => {
    const newSide = gs.mySide === 'alpha' ? 'beta' : 'alpha';
    gs.mySide = newSide;
    net.findMatch(newSide);
  };

  net.cb.onError = (code, message) => {
    console.warn('Battleshits network error:', code, message);
    clearAll();
    const myProf = gs.myProfile;
    gs = createInitialState();
    gs.myProfile = myProf;
    net?.disconnect();
    net = null;
    goToScreen('menu');
  };
}

// ─── Button wiring ────────────────────────────────────────────────────────────

function wireButtons() {
  // ── Solo Battle ────────────────────────────────────────────────────────────

  document.getElementById('btn-solo-battle')?.addEventListener('click', () => {
    gs.phase = 'difficulty';
    goToScreen('difficulty');
  });

  document.getElementById('btn-difficulty-easy')?.addEventListener('click', () => {
    startSoloMatch('easy');
  });

  document.getElementById('btn-difficulty-medium')?.addEventListener('click', () => {
    startSoloMatch('medium');
  });

  document.getElementById('btn-difficulty-hard')?.addEventListener('click', () => {
    startSoloMatch('hard');
  });

  document.getElementById('btn-cancel-difficulty')?.addEventListener('click', () => {
    gs = createInitialState();
    goToScreen('menu');
  });

  // ── Online Battle ──────────────────────────────────────────────────────────

  document.getElementById('btn-find-match')?.addEventListener('click', () => {
    net = createOnlineClient('battleshits');
    wireOnlineCallbacks();
    startPublicMatch(gs, net);
  });

  document.getElementById('btn-create-room')?.addEventListener('click', () => {
    net = createOnlineClient('battleshits');
    wireOnlineCallbacks();
    startPrivateCreate(gs, net);
  });

  document.getElementById('btn-join-room')?.addEventListener('click', () => {
    goToScreen('room-join');
  });

  document.getElementById('btn-submit-join')?.addEventListener('click', () => {
    const input = document.getElementById('room-code-input');
    const code  = input?.value?.trim().toUpperCase();
    const errEl = document.getElementById('join-error');
    if (!code || code.length < 4) {
      if (errEl) { errEl.textContent = 'Enter a valid room code.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (errEl) errEl.classList.add('hidden');
    net = createOnlineClient('battleshits');
    wireOnlineCallbacks();
    startPrivateJoin(gs, net, code);
  });

  document.getElementById('btn-cancel-join')?.addEventListener('click', () => {
    goToScreen('menu');
  });

  document.getElementById('btn-cancel-match')?.addEventListener('click', () => {
    clearAll();
    net?.cancelSearch();
    net?.disconnect();
    net = null;
    gs = createInitialState();
    goToScreen('menu');
  });

  document.getElementById('btn-cancel-room')?.addEventListener('click', () => {
    clearAll();
    net?.cancelRoom();
    net?.disconnect();
    net = null;
    gs = createInitialState();
    goToScreen('menu');
  });

  // ── Placement ──────────────────────────────────────────────────────────────

  document.getElementById('btn-rotate')?.addEventListener('click', () => rotateShip(gs));
  document.getElementById('btn-lock-in')?.addEventListener('click', lockIn);

  // ── Match ended ────────────────────────────────────────────────────────────

  document.getElementById('btn-rematch')?.addEventListener('click', () => {
    if (gs.isSoloMode) {
      resetForSoloBattle();
      return;
    }
    rematchFlow?.request();
  });

  document.getElementById('btn-change-difficulty')?.addEventListener('click', () => {
    clearAll();
    net?.disconnect();
    net = null;
    gs = createInitialState();
    goToScreen('difficulty');
  });

  document.getElementById('btn-exit-to-menu')?.addEventListener('click', () => {
    clearAll();
    if (!gs.isSoloMode && gs.phase === 'match_ended') rematchFlow?.leaveResults();
    net?.disconnect();
    net = null;
    gs = createInitialState();
    goToScreen('menu');
  });

  // ── Global keyboard ────────────────────────────────────────────────────────

  window.addEventListener('keydown', (e) => {
    const emoteType = keyToEmoteType(e.key);
    if (emoteType && gs.phase === 'battle') {
      trySendBattleEmote(gs, net, emoteType);
      return;
    }

    if (gs.phase === 'placement') {
      if (e.key === 'r' || e.key === 'R') rotateShip(gs);
      if (e.key === 'Enter') lockIn();
    }
  });
}

// ─── Entry ────────────────────────────────────────────────────────────────────

function beginOnlineResults(result) {
  rematchFlow?.enterResults({ round: gs.rematchRound, enabled: result !== 'forfeit_win' });
}

function syncRematchUi({
  available = false,
  localRequested = false,
  opponentRequested = false,
  declined = false,
  opponentUnavailable = false,
  starting = false,
  disabled = false,
} = {}) {
  const button = document.getElementById('btn-rematch');
  const status = document.getElementById('rematch-status');
  if (!button || !status) return;
  if (disabled || declined || opponentUnavailable) {
    button.disabled = true;
    button.textContent = declined ? 'Rematch Declined' : 'Rematch Unavailable';
    status.textContent = declined
      ? 'Your opponent declined the rematch.'
      : 'Your opponent left the results screen. Rematch is unavailable.';
  } else if (starting) {
    button.disabled = true;
    button.textContent = 'Starting Rematch';
    status.textContent = 'Starting rematch...';
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

export function initGame() {
  wireButtons();
  goToScreen('menu');
}
