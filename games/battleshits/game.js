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

const bgMusic = createBgMusicController();

function goToScreen(screenId) {
  showScreen(screenId);
  bgMusic.transition(screenId);
}

// ─── State ────────────────────────────────────────────────────────────────────

function createInitialState() {
  return {
    phase: 'menu',        // 'menu'|'matchmaking'|'placement'|'waiting_opponent'|'battle'|'match_ended'
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
    rematchPending: false,
    opponentWantsRematch: false,
    pendingNetAction: null, // called inside onConnected
    pendingShot: null, // { col, row, startedAt }
    activeEmotes: {
      mine: null,
      theirs: null,
    },
  };
}

let gs = createInitialState();
let net = null;

function clearAll() {
  clearPublicMatchRetry();
  clearBattleTimers();
  bgMusic.stop();
}

// ─── Placement logic ──────────────────────────────────────────────────────────

function lockIn() {
  if (!FLEET_DEFS.every(d => gs.placedShips[d.id])) return;
  gs.phase = 'waiting_opponent';
  net.sendPlacementReady();
  goToScreen('waiting');
  if (gs.opponentReady) transitionToBattle(gs, {
    clearAll,
    handleTargetClick: (c, r) => handleTargetClick(gs, net, c, r),
  });
}

// ─── Match flow ───────────────────────────────────────────────────────────────

function resetForRematch() {
  clearAll();
  const side    = gs.mySide;
  const seed    = (gs.seed ?? 0) + 1;
  const myProf  = gs.myProfile;
  const oppProf = gs.opponentProfile;

  gs = createInitialState();
  gs.mySide           = side;
  gs.seed             = seed;
  gs.myProfile        = myProf;
  gs.opponentProfile  = oppProf;
  gs.phase            = 'placement';

  goToScreen('placement');
  buildBoardGrid(
    document.getElementById('fleet-board'),
    (c, r) => handlePlacementClick(gs, c, r),
    (c, r) => handlePlacementHover(gs, c, r),
  );
  renderPlacementBoard(gs);
  renderShipRoster(gs, (id) => selectShip(gs, id));
}

// ─── Online callbacks ─────────────────────────────────────────────────────────

function wireOnlineCallbacks() {
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
    gs.phase = 'placement';
    goToScreen('placement');
    buildBoardGrid(
      document.getElementById('fleet-board'),
      (c, r) => handlePlacementClick(gs, c, r),
      (c, r) => handlePlacementHover(gs, c, r),
    );
    renderPlacementBoard(gs);
    renderShipRoster(gs, (id) => selectShip(gs, id));
  };

  net.cb.onRemoteProfile = ({ playerId, displayName }) => {
    gs.opponentProfile = { playerId, displayName };
    const waitEl = document.getElementById('opponent-name-waiting');
    if (waitEl) waitEl.textContent = `Opponent: ${displayName}`;
  };

  net.cb.onOpponentReady = () => {
    gs.opponentReady = true;
    if (gs.phase === 'waiting_opponent') transitionToBattle(gs, {
      clearAll,
      handleTargetClick: (c, r) => handleTargetClick(gs, net, c, r),
    });
  };

  net.cb.onOpponentShot = ({ col, row }) => {
    if (gs.phase !== 'battle') return;
    handleIncomingShot(gs, net, col, row, { clearAll });
  };

  net.cb.onShotResult = (result) => {
    if (gs.phase !== 'battle') return;
    handleShotResult(gs, result, { clearAll });
  };

  net.cb.onEmote = (type) => {
    if (gs.phase !== 'battle') return;
    showBattleEmote(gs, 'theirs', type);
  };

  net.cb.onRematch = (type) => {
    if (type !== 'request') return;
    gs.opponentWantsRematch = true;
    const statusEl = document.getElementById('rematch-status');
    if (statusEl) statusEl.textContent = 'Opponent wants a rematch!';
    if (gs.rematchPending) resetForRematch();
  };

  net.cb.onPartnerLeft = () => {
    clearAll();
    if (gs.phase === 'battle') {
      transitionToMatchEnded(gs, 'forfeit_win', { clearAll });
    } else if (gs.phase === 'match_ended') {
      // opponent left after results — stay so the player can still add friend
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
  document.getElementById('btn-find-match')?.addEventListener('click', () => {
    bgMusic.stop();
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
    bgMusic.stop();
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

  document.getElementById('btn-rotate')?.addEventListener('click', () => rotateShip(gs));

  document.getElementById('btn-lock-in')?.addEventListener('click', lockIn);

  document.getElementById('btn-rematch')?.addEventListener('click', () => {
    gs.rematchPending = true;
    net.sendRematch('request');
    const statusEl = document.getElementById('rematch-status');
    if (statusEl) statusEl.textContent = gs.opponentWantsRematch ? 'Starting rematch...' : 'Waiting for opponent...';
    if (gs.opponentWantsRematch) resetForRematch();
  });

  document.getElementById('btn-exit-to-menu')?.addEventListener('click', () => {
    clearAll();
    net?.disconnect();
    net = null;
    gs = createInitialState();
    goToScreen('menu');
  });

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

export function initGame() {
  wireButtons();
  goToScreen('menu');
}
