import { createGameState, selectMatchMapIndex } from './scripts/state.js';
import { bindInput, clearFrameInput, consumeAnyKey } from './scripts/input.js';
import { updateAliens } from './scripts/hazards.js';
import { updatePlayer } from './scripts/player.js';
import {
  renderMenu,
  renderSideSelect,
  renderLobby,
  renderCountdown,
  renderDisconnected,
  renderGameView,
  renderWinScreen,
} from './scripts/renderer.js';
import { createAudioController, enqueueSoundEvent, isTileVisibleToPlayer } from './scripts/audio.js';
import { loadAssets } from './scripts/assets.js';
import { createOnlineClient } from './scripts/online.js';
import { getLocalIdentity } from './scripts/online-identity.js';

const canvas = document.getElementById('gameCanvas');
const audioController = createAudioController();

// Input bound once to DOM events — survives state resets.
const input = { held: new Set(), justPressed: new Set() };
bindInput(input);

function unlockAudio() {
  audioController.unlock();
}

window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio, { passive: true });

// ─── UI button registry ───────────────────────────────────────────────────────
// Renderer writes button bounds here each frame; click + hover handlers read them.

const uiButtons = [];
let hoveredButtonId = null;

function clearButtons() { uiButtons.length = 0; }

function registerButton(id, x, y, w, h) {
  uiButtons.push({ id, x, y, w, h });
}

function _inButton(cx, cy, btn) {
  return cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h;
}

function _canvasCoords(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    cx: (e.clientX - rect.left) * scaleX,
    cy: (e.clientY - rect.top)  * scaleY,
  };
}

canvas.addEventListener('mousemove', (e) => {
  const { cx, cy } = _canvasCoords(e);
  let found = null;
  for (const btn of uiButtons) {
    if (_inButton(cx, cy, btn)) { found = btn.id; break; }
  }
  hoveredButtonId = found;
  canvas.style.cursor = found ? 'pointer' : 'default';
});

canvas.addEventListener('mouseleave', () => {
  hoveredButtonId = null;
  canvas.style.cursor = 'default';
});

canvas.addEventListener('click', (e) => {
  const { cx, cy } = _canvasCoords(e);
  for (const btn of uiButtons) {
    if (_inButton(cx, cy, btn)) {
      handleButtonClick(btn.id);
      return;
    }
  }
});

// ─── Phase & state ────────────────────────────────────────────────────────────
// Phases: 'menu' | 'side_select' | 'lobby' | 'countdown' | 'playing' | 'win' | 'disconnected'

let phase = 'menu';
let state = createGameState(0);
state.input = input;

let accumulator = 0;
const TICK_MS = 1000 / 60;

// ─── Online session state ─────────────────────────────────────────────────────

let onlineClient     = createOnlineClient();
let onlineSide       = 'alpha';       // 'alpha' | 'beta'
let onlineLobbyPhase = 'main';        // 'main' | 'searching' | 'friend_options' | 'create' | 'join'
let onlineHostCode   = '';            // received from server after create_room
let onlineCodeInput  = '';            // typed by user during join phase
let onlineSearchTick = 0;             // incremented while searching or waiting in create
let onlineClockOffset = 0;
let onlineStartAt    = 0;
let onlineLocalRole  = 'A';          // 'A' (alpha → S tile) or 'B' (beta → T tile)
let localIdentity    = null;
let remotePlayerId   = '';
let remoteDisplayName = '';
let winnerIsLocal    = true;
let winnerName       = '';
let lastSentTx       = -1;
let lastSentTy       = -1;

// ─── Online client callbacks ──────────────────────────────────────────────────

function wireOnlineCallbacks() {
  const cb = onlineClient.cb;

  cb.onConnected = () => {
    // Connected and server is ready — user drives the lobby flow from here.
  };

  cb.onSearching = () => {
    // Server confirmed we're queued — lobby phase is already 'searching'.
  };

  cb.onRoomCreated = (code) => {
    // Server assigned us a room code.
    onlineHostCode = code;
  };

  cb.onMatchReady = ({ serverNow, startAt }) => {
    onlineClockOffset = serverNow - Date.now();
    onlineStartAt     = startAt;
    onlineLocalRole   = onlineSide === 'alpha' ? 'A' : 'B';
    phase = 'countdown';
    onlineClient.sendProfile(localIdentity.playerId, localIdentity.displayName, onlineSide);
  };

  cb.onRemoteMessage = ({ messageType, value }) => {
    if (messageType === 'profile') {
      remotePlayerId    = value.playerId    || '';
      remoteDisplayName = value.displayName || 'Opponent';
      if (state.remote) {
        state.remote.displayName = remoteDisplayName;
        state.remote.playerId    = remotePlayerId;
      }
    } else if (messageType === 'position' && phase === 'playing') {
      state.remote.tx = value.x;
      state.remote.ty = value.y;
      state.remote.px = value.x + 0.5;
      state.remote.py = value.y + 0.5;
      state.remote.dir = value.dir;
      state.remote.active = true;
    } else if (messageType === 'event' && phase === 'playing') {
      handleRemoteEvent(value);
    }
  };

  cb.onPartnerLeft = () => {
    if (phase === 'playing' || phase === 'countdown') {
      phase = 'disconnected';
      _freshClient();
    }
  };

  cb.onError = (_code, message) => {
    console.warn('[Illuminauts online]', message);
    _freshClient();
    goToMenu();
  };
}

wireOnlineCallbacks();

function _freshClient() {
  onlineClient.disconnect();
  onlineClient = createOnlineClient();
  wireOnlineCallbacks();
}

// ─── Remote event handler ─────────────────────────────────────────────────────

function handleRemoteEvent(value) {
  const { type, pickupId, doorId } = value;
  if (type === 'pickup_taken' && pickupId) {
    const pickup = state.map.pickups.find((p) => p.id === pickupId);
    if (pickup) pickup.active = false;
  } else if (type === 'door_opened' && doorId) {
    const door = state.map.doors.find((d) => d.id === doorId);
    if (door) {
      door.open = true;
      if (isTileVisibleToPlayer(state, door.x, door.y, performance.now())) {
        enqueueSoundEvent(state, 'door-unlock', { doorId: door.id, remote: true });
      }
    }
  } else if (type === 'player_died') {
    const remoteSpawn = onlineLocalRole === 'A' ? state.map.start2 : state.map.start;
    state.remote.tx = remoteSpawn.x;
    state.remote.ty = remoteSpawn.y;
    state.remote.px = remoteSpawn.x + 0.5;
    state.remote.py = remoteSpawn.y + 0.5;
  } else if (type === 'won') {
    winnerIsLocal = false;
    winnerName    = remoteDisplayName || 'Opponent';
    phase         = 'win';
  }
}

// ─── Online lobby helpers ─────────────────────────────────────────────────────

async function enterLobby(side) {
  onlineSide        = side;
  onlineLocalRole   = side === 'alpha' ? 'A' : 'B';
  onlineLobbyPhase  = 'main';
  onlineHostCode    = '';
  onlineCodeInput   = '';
  onlineSearchTick  = 0;
  localIdentity     = await getLocalIdentity();
  remotePlayerId    = '';
  remoteDisplayName = '';
  onlineClient.connect(); // connect once; stays alive through the whole lobby
  phase = 'lobby';
}

function leaveLobby() {
  _freshClient();
  goToMenu();
}

function doFindMatch() {
  onlineLobbyPhase = 'searching';
  onlineSearchTick = 0;
  onlineClient.findMatch(onlineSide, localIdentity.playerId, localIdentity.displayName);
}

function doCancelSearch() {
  onlineClient.cancelSearch();
  onlineLobbyPhase = 'main';
}

function doCreateRoom() {
  onlineLobbyPhase = 'create';
  onlineHostCode   = '';
  onlineSearchTick = 0;
  onlineClient.createRoom(onlineSide, localIdentity.playerId, localIdentity.displayName);
}

function doCancelRoom() {
  onlineClient.cancelRoom();
  onlineHostCode   = '';
  onlineLobbyPhase = 'friend_options';
}

function doJoinRoom() {
  if (onlineCodeInput.length < 2) return;
  onlineClient.joinRoom(onlineSide, onlineCodeInput, localIdentity.playerId, localIdentity.displayName);
}

// ─── Keyboard handler ─────────────────────────────────────────────────────────

window.addEventListener('keydown', (e) => {
  if (phase === 'side_select') {
    if (e.key === 'Escape') { phase = 'menu'; }
    return;
  }

  if (phase === 'lobby') {
    if (onlineLobbyPhase === 'join') {
      e.preventDefault();
      if (e.key === 'Backspace') { onlineCodeInput = onlineCodeInput.slice(0, -1); return; }
      if (e.key === 'Enter')     { doJoinRoom(); return; }
      if (e.key === 'Escape')    { onlineLobbyPhase = 'friend_options'; return; }
      if (/^[A-Za-z0-9]$/.test(e.key) && onlineCodeInput.length < 8) {
        onlineCodeInput += e.key.toUpperCase();
      }
      return;
    }
    if (e.key === 'Escape') {
      if      (onlineLobbyPhase === 'main')           leaveLobby();
      else if (onlineLobbyPhase === 'searching')      doCancelSearch();
      else if (onlineLobbyPhase === 'friend_options') onlineLobbyPhase = 'main';
      else if (onlineLobbyPhase === 'create')         doCancelRoom();
    }
    return;
  }

  if (phase === 'countdown') {
    if (e.key === 'Escape') { _freshClient(); goToMenu(); }
    return;
  }
});

// ─── Button click dispatch ────────────────────────────────────────────────────

function handleButtonClick(id) {
  switch (id) {
    case 'btn_play_online':
      phase = 'side_select';
      break;
    case 'btn_side_alpha':
      void enterLobby('alpha');
      break;
    case 'btn_side_beta':
      void enterLobby('beta');
      break;
    case 'btn_find_match':
      if (onlineLobbyPhase === 'main') doFindMatch();
      break;
    case 'btn_play_friend':
      if (onlineLobbyPhase === 'main') onlineLobbyPhase = 'friend_options';
      break;
    case 'btn_create_room':
      if (onlineLobbyPhase === 'friend_options') doCreateRoom();
      break;
    case 'btn_enter_code':
      if (onlineLobbyPhase === 'friend_options') { onlineLobbyPhase = 'join'; onlineCodeInput = ''; }
      break;
    case 'btn_cancel':
      if (onlineLobbyPhase === 'searching')    doCancelSearch();
      else if (onlineLobbyPhase === 'create')  doCancelRoom();
      break;
    case 'btn_join_submit':
      doJoinRoom();
      break;
    case 'btn_back':
      if (onlineLobbyPhase === 'join') onlineLobbyPhase = 'friend_options';
      break;
    case 'btn_back_to_menu':
      if (phase === 'disconnected') goToMenu();
      else leaveLobby();
      break;
  }
}

// ─── Playtest entry point ─────────────────────────────────────────────────────
// Called on boot when sessionStorage holds a test map from the map editor.

function startTestGame(mapEntry, side) {
  const role = side === 'beta' ? 'B' : 'A';
  state = createGameState(0, role, mapEntry);
  state.input = input;
  state.gameStartAt = performance.now();
  state.lastTime = performance.now();
  input.held.clear();
  input.justPressed.clear();
  accumulator = 0;
  phase = 'playing';
}

// ─── Online game start ────────────────────────────────────────────────────────

function startOnlineGame() {
  state = createGameState(selectMatchMapIndex(onlineStartAt), onlineLocalRole);
  state.input = input;
  state.gameStartAt = performance.now();
  state.online.enabled = true;
  state.online.localPlayerId = localIdentity?.playerId || '';
  state.remote.displayName  = remoteDisplayName;
  state.remote.playerId     = remotePlayerId;
  input.held.clear();
  input.justPressed.clear();
  accumulator  = 0;
  lastSentTx   = -1;
  lastSentTy   = -1;
  state.lastTime = performance.now();
  phase = 'playing';
}

// ─── State transitions ────────────────────────────────────────────────────────

function goToMenu() {
  state = createGameState();
  state.input = input;
  input.held.clear();
  input.justPressed.clear();
  phase = 'menu';
  accumulator = 0;
  state.lastTime = performance.now();
}

// ─── Fixed-timestep tick ──────────────────────────────────────────────────────

function gameTick(now) {
  if (phase !== 'playing') return;

  const elapsed = now - (state.gameStartAt || 0);
  updateAliens(state.hazards, elapsed);
  updatePlayer(state, now, TICK_MS);

  if (state.online?.enabled && onlineClient) {
    for (const event of state.online.outbox) {
      onlineClient.sendEvent(event.type, event);
    }
    state.online.outbox.length = 0;

    const p = state.player;
    if (p.tx !== lastSentTx || p.ty !== lastSentTy) {
      onlineClient.sendPosition(p.tx, p.ty, p.dir);
      lastSentTx = p.tx;
      lastSentTy = p.ty;
    }
  }

  if (state.player.won) {
    winnerIsLocal = true;
    winnerName    = localIdentity?.displayName || 'You';
    phase = 'win';
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

function loop(now) {
  accumulator += Math.min(100, now - state.lastTime);
  state.lastTime = now;

  while (accumulator >= TICK_MS) {
    gameTick(now);
    accumulator -= TICK_MS;
  }

  // Increment search/create tick for animated dots
  if (phase === 'lobby' && (onlineLobbyPhase === 'searching' || onlineLobbyPhase === 'create')) {
    onlineSearchTick++;
  }

  void audioController.sync(state, phase, now);

  clearButtons();

  switch (phase) {
    case 'menu':
      renderMenu(canvas, hoveredButtonId, registerButton);
      break;

    case 'side_select':
      renderSideSelect(canvas, hoveredButtonId, registerButton);
      break;

    case 'lobby':
      renderLobby(canvas, {
        lobbyPhase: onlineLobbyPhase,
        side:       onlineSide,
        hostCode:   onlineHostCode,
        codeInput:  onlineCodeInput,
        searchTick: onlineSearchTick,
      }, hoveredButtonId, now, registerButton);
      break;

    case 'countdown': {
      const serverNow = Date.now() + onlineClockOffset;
      const msLeft    = Math.max(0, onlineStartAt - serverNow);
      const secs      = Math.ceil(msLeft / 1000);
      renderCountdown(canvas, secs, now);
      if (serverNow >= onlineStartAt) {
        startOnlineGame();
      }
      break;
    }

    case 'playing':
      renderGameView(canvas, state, now);
      break;

    case 'win':
      renderWinScreen(canvas, state, now, winnerIsLocal, winnerName);
      if (consumeAnyKey(state.input)) {
        _freshClient();
        goToMenu();
      }
      break;

    case 'disconnected':
      renderDisconnected(canvas, hoveredButtonId, registerButton);
      break;
  }

  clearFrameInput(state.input);
  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  void loadAssets().catch(() => {
    console.warn('[Illuminauts] Sprite sheet load failed — falling back to debug glyphs.');
  });
  const testMapJSON = sessionStorage.getItem('illuminauts_test_map');
  const testSide    = sessionStorage.getItem('illuminauts_test_side') || 'alpha';
  if (testMapJSON) {
    sessionStorage.removeItem('illuminauts_test_map');
    sessionStorage.removeItem('illuminauts_test_side');
    try { startTestGame(JSON.parse(testMapJSON), testSide); } catch (_) { /* malformed — fall through to menu */ }
  } else {
    state.lastTime = performance.now();
  }
  requestAnimationFrame(loop);
}

boot().catch(() => {
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
});
