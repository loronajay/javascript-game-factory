import { createGameState } from './scripts/state.js';
import { bindInput, clearFrameInput, consumeAnyKey } from './scripts/input.js';
import { updateAliens } from './scripts/hazards.js';
import { updatePlayer } from './scripts/player.js';
import {
  renderMenu,
  renderSearching,
  renderRoomHost,
  renderRoomJoin,
  renderCountdown,
  renderDisconnected,
  renderGameView,
  renderWinScreen,
  renderDebugView,
} from './scripts/renderer.js';
import { loadAssets } from './scripts/assets.js';
import { MAPS } from './scripts/maps.js';
import { createOnlineClient } from './scripts/online.js';
import { getLocalIdentity } from './scripts/online-identity.js';

const canvas = document.getElementById('gameCanvas');

// Input bound once to DOM events — survives state resets.
const input = { held: new Set(), justPressed: new Set() };
bindInput(input);

// ─── UI button registry ───────────────────────────────────────────────────────
// Renderer writes button bounds here each frame; click handler reads them.

const uiButtons = [];

function clearButtons() { uiButtons.length = 0; }

function registerButton(id, x, y, w, h) {
  uiButtons.push({ id, x, y, w, h });
}

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx = (e.clientX - rect.left) * scaleX;
  const cy = (e.clientY - rect.top) * scaleY;
  for (const btn of uiButtons) {
    if (cx >= btn.x && cx <= btn.x + btn.w && cy >= btn.y && cy <= btn.y + btn.h) {
      handleButtonClick(btn.id);
      return;
    }
  }
});

// ─── Phase & state ────────────────────────────────────────────────────────────
// Phases: 'menu' | 'searching' | 'room_host' | 'room_join'
//         | 'countdown' | 'playing' | 'win' | 'disconnected'

let phase = 'menu';
let state = createGameState(0);
state.input = input;

let accumulator = 0;
const TICK_MS = 1000 / 60;

// ─── Online session state ────────────────────────────────────────────────────

let onlineClient     = null;
let pendingAction    = null;   // 'find_match' | 'create_room' | 'join_room'
let onlineClockOffset = 0;     // Date.now() + onlineClockOffset ≈ serverNow
let onlineStartAt    = 0;      // server timestamp when game begins
let onlineLocalRole  = 'A';   // 'A' = spawn S, 'B' = spawn T
let localIdentity    = null;   // { playerId, displayName }
let remotePlayerId   = '';
let remoteDisplayName = '';
let roleResolved     = false;
let winnerIsLocal    = true;
let winnerName       = '';
let lastSentTx       = -1;
let lastSentTy       = -1;

// Room join — keyboard buffer for code entry
let onlineRoomCode   = '';    // characters typed so far
let onlineHostCode   = '';    // code received after create_room

// ─── Debug map browser ────────────────────────────────────────────────────────

let debugMode    = false;
let debugMapIndex = 0;

function hotSwapMap(index) {
  debugMapIndex = ((index % MAPS.length) + MAPS.length) % MAPS.length;
  state = createGameState(debugMapIndex);
  state.input = input;
  input.held.clear();
  input.justPressed.clear();
  accumulator = 0;
  state.lastTime = performance.now();
  if (phase !== 'playing') phase = 'playing';
}

window.addEventListener('keydown', (e) => {
  // Debug toggles always work
  if (e.code === 'F3') {
    e.preventDefault();
    debugMode = !debugMode;
    return;
  }
  if (debugMode) {
    if (e.code === 'BracketLeft')  { e.preventDefault(); hotSwapMap(debugMapIndex - 1); }
    if (e.code === 'BracketRight') { e.preventDefault(); hotSwapMap(debugMapIndex + 1); }
    return;
  }

  // Room code entry — only active during room_join phase
  if (phase === 'room_join') {
    e.preventDefault();
    if (e.key === 'Backspace') {
      onlineRoomCode = onlineRoomCode.slice(0, -1);
    } else if (e.key === 'Enter') {
      handleButtonClick('btn_join_submit');
    } else if (/^[A-Za-z0-9]$/.test(e.key) && onlineRoomCode.length < 8) {
      onlineRoomCode += e.key.toUpperCase();
    }
  }
});

// ─── Online setup helpers ────────────────────────────────────────────────────

function setupOnlineCallbacks() {
  const cb = onlineClient.callbacks;

  cb.onConnected = () => {
    const id = localIdentity;
    if (pendingAction === 'find_match') {
      onlineClient.findMatch(id.playerId, id.displayName);
    } else if (pendingAction === 'create_room') {
      onlineClient.createRoom(id.playerId, id.displayName);
    } else if (pendingAction === 'join_room') {
      onlineClient.joinRoom(onlineRoomCode, id.playerId, id.displayName);
    }
  };

  cb.onSearching = () => {
    phase = 'searching';
  };

  cb.onRoomCreated = (code) => {
    onlineHostCode = code;
    phase = 'room_host';
  };

  cb.onMatchReady = ({ serverNow, startAt }) => {
    onlineClockOffset = serverNow - Date.now();
    onlineStartAt = startAt;
    phase = 'countdown';
    // Send profile immediately so both clients can resolve roles.
    onlineClient.sendProfile(localIdentity.playerId, localIdentity.displayName);
  };

  cb.onRemoteMessage = ({ messageType, value }) => {
    if (messageType === 'profile') {
      remotePlayerId    = value.playerId    || '';
      remoteDisplayName = value.displayName || 'Opponent';
      if (!roleResolved && remotePlayerId) {
        roleResolved    = true;
        // Lexicographically smaller playerId → Player A (S tile).
        // Both clients make this same deterministic choice.
        onlineLocalRole = localIdentity.playerId <= remotePlayerId ? 'A' : 'B';
      }
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
      cleanupOnlineClient();
    }
  };

  cb.onError = (_code, message) => {
    console.warn('[Illuminauts online]', message);
    // Fall back to menu on connection error
    cancelOnline();
  };
}

function handleRemoteEvent(value) {
  const { type, pickupId, doorId } = value;
  if (type === 'pickup_taken' && pickupId) {
    const pickup = state.map.pickups.find((p) => p.id === pickupId);
    if (pickup) pickup.active = false;
  } else if (type === 'door_opened' && doorId) {
    const door = state.map.doors.find((d) => d.id === doorId);
    if (door) door.open = true;
  } else if (type === 'player_died') {
    // Snap remote player back to their spawn
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

function cleanupOnlineClient() {
  if (onlineClient) {
    onlineClient.disconnect();
    onlineClient = null;
  }
  roleResolved = false;
}

// ─── Button click dispatch ────────────────────────────────────────────────────

function handleButtonClick(id) {
  switch (id) {
    case 'btn_find_match':   startFindMatch();   break;
    case 'btn_create_room':  startCreateRoom();  break;
    case 'btn_join_room':
      onlineRoomCode = '';
      phase = 'room_join';
      break;
    case 'btn_join_submit':  submitJoinRoom();   break;
    case 'btn_back_to_menu': cancelOnline();     break;
  }
}

function startFindMatch() {
  localIdentity = getLocalIdentity();
  pendingAction = 'find_match';
  phase = 'searching';
  onlineClient = createOnlineClient();
  setupOnlineCallbacks();
  onlineClient.connect();
}

function startCreateRoom() {
  localIdentity  = getLocalIdentity();
  pendingAction  = 'create_room';
  onlineHostCode = '';
  phase = 'room_host'; // show "connecting..." immediately
  onlineClient = createOnlineClient();
  setupOnlineCallbacks();
  onlineClient.connect();
}

function submitJoinRoom() {
  if (onlineRoomCode.length < 2) return;
  localIdentity = getLocalIdentity();
  pendingAction = 'join_room';
  onlineClient  = createOnlineClient();
  setupOnlineCallbacks();
  onlineClient.connect();
  // joinRoom is called from onConnected
}

function cancelOnline() {
  cleanupOnlineClient();
  pendingAction    = null;
  onlineRoomCode   = '';
  onlineHostCode   = '';
  goToMenu();
}

function startOnlineGame() {
  state = createGameState(0, onlineLocalRole);
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

function startNewGame() {
  state = createGameState(debugMapIndex);
  state.input = input;
  state.gameStartAt = performance.now();
  input.held.clear();
  input.justPressed.clear();
  phase = 'playing';
  accumulator = 0;
  state.lastTime = performance.now();
}

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

  // Flush online outbox and send position updates
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
    // If online, the 'won' event is already in the outbox — it was flushed above.
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

  clearButtons();

  switch (phase) {
    case 'menu':
      renderMenu(canvas, now, registerButton);
      break;

    case 'searching':
      renderSearching(canvas, now, registerButton);
      break;

    case 'room_host':
      renderRoomHost(canvas, onlineHostCode, now, registerButton);
      break;

    case 'room_join':
      renderRoomJoin(canvas, onlineRoomCode, now, registerButton);
      break;

    case 'countdown': {
      const serverNow = Date.now() + onlineClockOffset;
      const msLeft    = Math.max(0, onlineStartAt - serverNow);
      const secs      = Math.ceil(msLeft / 1000);
      renderCountdown(canvas, secs, now);
      if (serverNow >= onlineStartAt) {
        if (!roleResolved) onlineLocalRole = 'A'; // fallback if profile exchange lagged
        startOnlineGame();
      }
      break;
    }

    case 'playing':
      if (debugMode) {
        renderDebugView(canvas, state, now);
      } else {
        renderGameView(canvas, state, now);
      }
      break;

    case 'win':
      renderWinScreen(canvas, state, now, winnerIsLocal, winnerName);
      if (consumeAnyKey(state.input)) {
        cleanupOnlineClient();
        goToMenu();
      }
      break;

    case 'disconnected':
      renderDisconnected(canvas, now, registerButton);
      break;
  }

  clearFrameInput(state.input);
  requestAnimationFrame(loop);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  await loadAssets();
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
}

boot().catch(() => {
  console.warn('[Illuminauts] Sprite sheet load failed — falling back to debug glyphs.');
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
});
