import { createOnlineClient, getOppositeMatchSide } from './scripts/online.js';
import { createAudioController, getResolutionSoundId, LAUNCH_SOUND_ID } from './scripts/audio.js';
import {
  EMOTE_ASSET_PATHS,
  EMOTE_COOLDOWN_MS,
  EMOTE_DISPLAY_MS,
  keyToEmoteType,
} from './scripts/emojis.js';
import {
  SHOT_ANIMATION_MS,
  getBattleStatusCopy,
  getEndedScreenCopy,
  getTargetLabelCopy,
} from './scripts/presentation.js';
import {
  createFleetBoard, createTargetBoard, FLEET_DEFS, BOARD_SIZE, cellIndex,
  isValidPlacement, placeShip, removeShip, resolveIncomingShot,
  isShipSunk, isFleetDestroyed, recordShotResult, isCellShot, shipCells,
} from './scripts/board.js';
import { publishBattleshitsMatchActivity } from '../../js/platform/activity/activity.mjs';
import { loadFactoryProfile } from '../../js/platform/identity/factory-profile.mjs';
import { createOnlineIdentityPayload } from '../../js/platform/identity/match-identity.mjs';

const COL_LABELS = 'ABCDEFGHIJ';

const SPRITES = {
  endLeft:  'images/end-piece-left.png',
  endRight: 'images/end-piece-right.png',
  middle:   'images/middle-piece.png',
  missile:  'images/missile-piece.png',
};

const PUBLIC_MATCH_RETRY_MS = 2500;

// Returns { src, rotate } for the ship piece at (col, row), or null if no ship.
// Derives piece type from neighbor adjacency — works for both horizontal and vertical ships.
function getShipPieceInfo(board, col, row) {
  const cell = board[cellIndex(col, row)];
  if (!cell?.ship) return null;

  const id = cell.ship;
  const hasL = col > 0            && board[cellIndex(col - 1, row)]?.ship === id;
  const hasR = col < BOARD_SIZE-1 && board[cellIndex(col + 1, row)]?.ship === id;
  const hasU = row > 0            && board[cellIndex(col, row - 1)]?.ship === id;
  const hasD = row < BOARD_SIZE-1 && board[cellIndex(col, row + 1)]?.ship === id;

  const vertical = hasU || hasD;

  if (vertical) {
    if (!hasU) return { src: SPRITES.endLeft,  rotate: true };
    if (!hasD) return { src: SPRITES.endRight, rotate: true };
    return       { src: SPRITES.middle,         rotate: true };
  }
  if (!hasL)   return { src: SPRITES.endLeft,  rotate: false };
  if (!hasR)   return { src: SPRITES.endRight, rotate: false };
  return         { src: SPRITES.middle,         rotate: false };
}

function makeSprite(src, rotate, extraClass = '') {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.className = 'ship-sprite' + (rotate ? ' vertical' : '') + (extraClass ? ' ' + extraClass : '');
  return img;
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
let publicMatchRetryTimer = null;
let pendingShotTimer = null;
let emoteTimers = { mine: null, theirs: null };
let lastEmoteSentAt = 0;
const audio = createAudioController();

function clearPublicMatchRetry() {
  if (publicMatchRetryTimer !== null) {
    clearTimeout(publicMatchRetryTimer);
    publicMatchRetryTimer = null;
  }
}

function clearPendingShotTimer() {
  if (pendingShotTimer !== null) {
    clearTimeout(pendingShotTimer);
    pendingShotTimer = null;
  }
}

function clearEmoteTimers() {
  for (const side of ['mine', 'theirs']) {
    if (emoteTimers[side] !== null) {
      clearTimeout(emoteTimers[side]);
      emoteTimers[side] = null;
    }
  }
}

function schedulePublicMatchRetry() {
  clearPublicMatchRetry();
  if (gs.matchmakingMode !== 'public' || gs.phase !== 'matchmaking' || !net) return;

  publicMatchRetryTimer = setTimeout(() => {
    publicMatchRetryTimer = null;
    if (gs.matchmakingMode !== 'public' || gs.phase !== 'matchmaking' || !net) return;

    gs.mySide = getOppositeMatchSide(gs.mySide);
    const statusEl = document.getElementById('matchmaking-status');
    if (statusEl) statusEl.textContent = `Still searching... retrying as ${gs.mySide}.`;
    net.findMatch(gs.mySide);
  }, PUBLIC_MATCH_RETRY_MS);
}

// ─── Board DOM ────────────────────────────────────────────────────────────────

function buildBoardGrid(container, onCellClick, onCellHover) {
  container.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'board-corner';
  container.appendChild(corner);

  for (let c = 0; c < BOARD_SIZE; c++) {
    const label = document.createElement('div');
    label.className = 'board-col-label';
    label.textContent = COL_LABELS[c];
    container.appendChild(label);
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    const rowLabel = document.createElement('div');
    rowLabel.className = 'board-row-label';
    rowLabel.textContent = r + 1;
    container.appendChild(rowLabel);

    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.col = c;
      cell.dataset.row = r;
      if (onCellClick) cell.addEventListener('click', () => onCellClick(c, r));
      if (onCellHover) {
        cell.addEventListener('mouseenter', () => onCellHover(c, r));
        cell.addEventListener('mouseleave', () => onCellHover(null, null));
      }
      container.appendChild(cell);
    }
  }
}

function getCellEl(container, col, row) {
  return container.querySelector(`[data-col="${col}"][data-row="${row}"]`);
}

// ─── Placement render ─────────────────────────────────────────────────────────

function renderPlacementBoard() {
  const container = document.getElementById('fleet-board');
  if (!container) return;

  // First pass: placed ships
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = gs.myFleet[cellIndex(c, r)];
      const el = getCellEl(container, c, r);
      if (!el) continue;
      el.className = 'board-cell';
      el.innerHTML = '';
      if (cell.ship) {
        const info = getShipPieceInfo(gs.myFleet, c, r);
        if (info) el.appendChild(makeSprite(info.src, info.rotate));
      }
    }
  }

  // Second pass: hover ghost preview
  if (gs.selectedShipId !== null && gs.hoverCol !== null) {
    const def = FLEET_DEFS.find(d => d.id === gs.selectedShipId);
    if (def) {
      const cells = shipCells(gs.hoverCol, gs.hoverRow, def.length, gs.horizontal);
      const valid = isValidPlacement(gs.myFleet, def.length, gs.hoverCol, gs.hoverRow, gs.horizontal);
      cells.forEach(({ col, row }, i) => {
        if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return;
        const el = getCellEl(container, col, row);
        if (!el) return;
        el.classList.add(valid ? 'cell-hover-valid' : 'cell-hover-invalid');
        const src = i === 0 ? SPRITES.endLeft
          : i === cells.length - 1 ? SPRITES.endRight
          : SPRITES.middle;
        el.appendChild(makeSprite(src, !gs.horizontal, valid ? 'ghost' : 'ghost invalid'));
      });
    }
  }
}

function renderShipRoster() {
  const roster = document.getElementById('ship-roster');
  if (!roster) return;

  roster.innerHTML = '';
  const placed = new Set(Object.keys(gs.placedShips));

  for (const def of FLEET_DEFS) {
    const item = document.createElement('div');
    item.className = 'roster-ship';
    if (placed.has(def.id)) item.classList.add('roster-ship--placed');
    if (gs.selectedShipId === def.id) item.classList.add('roster-ship--selected');

    const nameEl = document.createElement('div');
    nameEl.className = 'roster-ship-name';
    nameEl.textContent = def.name;

    const lengthEl = document.createElement('div');
    lengthEl.className = 'roster-ship-length';
    for (let i = 0; i < def.length; i++) {
      const sq = document.createElement('div');
      sq.className = 'roster-ship-cell';
      lengthEl.appendChild(sq);
    }

    item.appendChild(nameEl);
    item.appendChild(lengthEl);
    item.addEventListener('click', () => selectShip(def.id));
    roster.appendChild(item);
  }

  const lockBtn = document.getElementById('btn-lock-in');
  if (lockBtn) lockBtn.disabled = !FLEET_DEFS.every(d => placed.has(d.id));
}

// ─── Battle render ────────────────────────────────────────────────────────────

function renderFleetBoard() {
  const container = document.getElementById('fleet-board-battle');
  if (!container) return;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = gs.myFleet[cellIndex(c, r)];
      const el = getCellEl(container, c, r);
      if (!el) continue;
      el.className = 'board-cell';
      el.innerHTML = '';

      if (cell.ship) {
        const info = getShipPieceInfo(gs.myFleet, c, r);
        if (info) el.appendChild(makeSprite(info.src, info.rotate));

        if (cell.hit && isShipSunk(gs.myFleet, cell.ship)) {
          el.classList.add('cell-sunk');
        } else if (cell.hit) {
          const overlay = document.createElement('div');
          overlay.className = 'hit-overlay';
          el.appendChild(overlay);
        }
      } else if (cell.hit) {
        el.classList.add('cell-water-hit');
      }
    }
  }
}

function renderTargetBoard() {
  const container = document.getElementById('target-board-battle');
  if (!container) return;

  const isMyTurn = gs.turn === 'mine';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = gs.myTarget[cellIndex(c, r)];
      const el = getCellEl(container, c, r);
      if (!el) continue;
      el.className = 'board-cell';
      el.innerHTML = '';
      const isPendingShot = gs.pendingShot?.col === c && gs.pendingShot?.row === r;

      if (cell === null) {
        if (isMyTurn) el.classList.add('cell-targetable');
        if (isPendingShot) {
          el.classList.add('cell-target-pending');
          el.appendChild(makeSprite(SPRITES.missile, false, 'shot-marker shot-falling'));
        }
      } else if (cell.result === 'miss') {
        el.classList.add('cell-target-miss');
      } else if (cell.result === 'hit') {
        el.classList.add('cell-target-hit');
        el.appendChild(makeSprite(SPRITES.missile, false, 'shot-marker'));
      } else if (cell.result === 'sunk') {
        el.classList.add('cell-target-sunk');
        el.appendChild(makeSprite(SPRITES.missile, false, 'shot-marker'));
      }
    }
  }
}

function showAnnouncement(text) {
  const el = document.getElementById('battle-announcement');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-visible');
  void el.offsetWidth;
  el.classList.add('is-visible');
}

function renderBattleStatus() {
  const turnEl  = document.getElementById('battle-turn-indicator');
  const oppEl   = document.getElementById('battle-opponent-name');
  const labelEl = document.getElementById('target-label');

  if (turnEl) turnEl.textContent = getBattleStatusCopy(gs.turn);

  if (oppEl) {
    oppEl.textContent = gs.opponentProfile?.displayName ? `vs. ${gs.opponentProfile.displayName}` : '';
  }

  if (labelEl) labelEl.textContent = getTargetLabelCopy(gs.turn);
}

function renderFleetStatus() {
  const el = document.getElementById('fleet-ships-status');
  if (!el) return;
  el.innerHTML = '';

  for (const def of FLEET_DEFS) {
    const row = document.createElement('div');
    row.className = 'ship-status-row';
    const sunk = isShipSunk(gs.myFleet, def.id);
    row.classList.add(sunk ? 'ship-status--sunk' : 'ship-status--afloat');
    row.textContent = `${sunk ? '💀' : '💩'} ${def.name}`;
    el.appendChild(row);
  }
}

function renderEmoteBubbles() {
  const bubbleMap = [
    {
      stateKey: 'mine',
      bubbleEl: document.getElementById('fleet-emote-bubble'),
      imageEl: document.getElementById('fleet-emote-image'),
    },
    {
      stateKey: 'theirs',
      bubbleEl: document.getElementById('target-emote-bubble'),
      imageEl: document.getElementById('target-emote-image'),
    },
  ];

  for (const { stateKey, bubbleEl, imageEl } of bubbleMap) {
    if (!bubbleEl || !imageEl) continue;
    const emoteType = gs.activeEmotes[stateKey];
    bubbleEl.classList.toggle('hidden', !emoteType);
    if (emoteType) {
      imageEl.src = EMOTE_ASSET_PATHS[emoteType];
      imageEl.alt = emoteType;
    } else {
      imageEl.removeAttribute('src');
      imageEl.alt = '';
    }
  }
}

function showBattleEmote(side, emoteType) {
  if (!EMOTE_ASSET_PATHS[emoteType]) return;
  gs.activeEmotes = {
    ...gs.activeEmotes,
    [side]: emoteType,
  };
  renderEmoteBubbles();

  if (emoteTimers[side] !== null) clearTimeout(emoteTimers[side]);
  emoteTimers[side] = setTimeout(() => {
    emoteTimers[side] = null;
    gs.activeEmotes = {
      ...gs.activeEmotes,
      [side]: null,
    };
    renderEmoteBubbles();
  }, EMOTE_DISPLAY_MS);
}

function trySendBattleEmote(type) {
  if (gs.phase !== 'battle' || !net) return;
  const now = Date.now();
  if (now - lastEmoteSentAt < EMOTE_COOLDOWN_MS) return;
  lastEmoteSentAt = now;
  net.sendEmote(type);
  showBattleEmote('mine', type);
}

// ─── Screen management ────────────────────────────────────────────────────────

const ALL_SCREENS = [
  'menu', 'matchmaking', 'room-create', 'room-join',
  'placement', 'waiting', 'battle', 'ended',
];

function showScreen(name) {
  for (const id of ALL_SCREENS) {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.classList.toggle('hidden', id !== name);
  }
}

// ─── Placement logic ──────────────────────────────────────────────────────────

function selectShip(shipId) {
  if (gs.placedShips[shipId]) {
    gs.myFleet = removeShip(gs.myFleet, shipId);
    delete gs.placedShips[shipId];
  } else if (gs.selectedShipId === shipId) {
    gs.selectedShipId = null;
    renderPlacementBoard();
    renderShipRoster();
    return;
  }
  gs.selectedShipId = shipId;
  renderPlacementBoard();
  renderShipRoster();
}

function handlePlacementHover(col, row) {
  gs.hoverCol = col;
  gs.hoverRow = row;
  renderPlacementBoard();
}

function handlePlacementClick(col, row) {
  if (!gs.selectedShipId) {
    const cell = gs.myFleet[cellIndex(col, row)];
    if (cell.ship) selectShip(cell.ship);
    return;
  }

  const def = FLEET_DEFS.find(d => d.id === gs.selectedShipId);
  if (!def) return;

  const result = placeShip(gs.myFleet, gs.selectedShipId, def.length, col, row, gs.horizontal);
  if (!result) return;

  gs.myFleet = result;
  gs.placedShips[gs.selectedShipId] = { col, row, horizontal: gs.horizontal };
  gs.selectedShipId = null;

  renderPlacementBoard();
  renderShipRoster();
}

function rotateShip() {
  gs.horizontal = !gs.horizontal;
  renderPlacementBoard();
}

function lockIn() {
  if (!FLEET_DEFS.every(d => gs.placedShips[d.id])) return;
  gs.phase = 'waiting_opponent';
  net.sendPlacementReady();
  showScreen('waiting');
  if (gs.opponentReady) transitionToBattle();
}

// ─── Battle logic ─────────────────────────────────────────────────────────────

function handleTargetClick(col, row) {
  if (gs.turn !== 'mine') return;
  if (isCellShot(gs.myTarget, col, row)) return;
  clearPendingShotTimer();
  gs.turn = 'awaiting_result';
  gs.pendingShot = { col, row, startedAt: Date.now() };
  audio.play(LAUNCH_SOUND_ID);
  net.sendShot(col, row);
  renderBattleStatus();
  renderTargetBoard();
}

function handleIncomingShot(col, row) {
  const { valid, board, hit, shipId, sunk } = resolveIncomingShot(gs.myFleet, col, row);
  if (!valid) return;

  gs.myFleet = board;
  const fleetDestroyed = isFleetDestroyed(gs.myFleet);
  audio.play(getResolutionSoundId(hit));

  net.sendShotResult(col, row, hit, sunk, shipId, fleetDestroyed);

  renderFleetBoard();
  renderFleetStatus();

  if (fleetDestroyed) {
    transitionToMatchEnded('loss');
  } else {
    gs.turn = 'mine';
    renderBattleStatus();
    renderTargetBoard();
  }
}

function applyShotResult({ col, row, hit, sunk, shipId, fleetDestroyed }) {
  pendingShotTimer = null;
  gs.myTarget = recordShotResult(gs.myTarget, col, row, hit, sunk, shipId);
  gs.lastShotInfo = { hit, sunk, shipId };
  gs.pendingShot = null;
  audio.play(getResolutionSoundId(hit));

  const def = FLEET_DEFS.find(d => d.id === shipId);
  if (sunk && def) showAnnouncement(`💀 You sunk their ${def.name}!`);
  else if (hit)    showAnnouncement('💥 Direct hit!');
  else             showAnnouncement('💦 Splash! Missed.');

  renderTargetBoard();

  if (fleetDestroyed) {
    transitionToMatchEnded('win');
  } else {
    gs.turn = 'theirs';
    renderBattleStatus();
  }
}

function handleShotResult(result) {
  const pendingShot = gs.pendingShot;
  if (!pendingShot) {
    applyShotResult(result);
    return;
  }

  const elapsed = Date.now() - pendingShot.startedAt;
  const remaining = Math.max(0, SHOT_ANIMATION_MS - elapsed);
  clearPendingShotTimer();
  pendingShotTimer = setTimeout(() => applyShotResult(result), remaining);
}

// ─── Match flow ───────────────────────────────────────────────────────────────

function determineTurnOrder() {
  const alphaFirst = (gs.seed % 2) === 0;
  return (alphaFirst && gs.mySide === 'alpha') || (!alphaFirst && gs.mySide === 'beta')
    ? 'mine'
    : 'theirs';
}

function transitionToBattle() {
  clearPublicMatchRetry();
  clearPendingShotTimer();
  clearEmoteTimers();
  gs.phase = 'battle';
  gs.turn = determineTurnOrder();
  gs.pendingShot = null;
  gs.activeEmotes = { mine: null, theirs: null };

  showScreen('battle');

  const fleetContainer  = document.getElementById('fleet-board-battle');
  const targetContainer = document.getElementById('target-board-battle');

  buildBoardGrid(fleetContainer, null, null);
  buildBoardGrid(targetContainer, handleTargetClick, null);

  renderFleetBoard();
  renderTargetBoard();
  renderBattleStatus();
  renderFleetStatus();
  renderEmoteBubbles();
}

function transitionToMatchEnded(result) {
  clearPublicMatchRetry();
  clearPendingShotTimer();
  clearEmoteTimers();
  gs.phase = 'match_ended';
  gs.matchResult = result;
  publishBattleshitsMatchActivity({
    result,
    myProfile: gs.myProfile,
    opponentProfile: gs.opponentProfile,
    matchmakingMode: gs.matchmakingMode,
    roomCode: gs.roomCode,
    sessionId: `battleshits:${gs.roomCode || gs.matchmakingMode || 'match'}:${gs.seed ?? 0}`,
  });

  const titleEl   = document.getElementById('ended-title');
  const messageEl = document.getElementById('ended-message');
  const statusEl  = document.getElementById('rematch-status');

  const endedCopy = getEndedScreenCopy(result);
  if (titleEl) titleEl.textContent = endedCopy.title;
  if (messageEl) messageEl.textContent = endedCopy.message;
  if (statusEl) statusEl.textContent = '';

  showScreen('ended');
}

function resetForRematch() {
  clearPublicMatchRetry();
  clearPendingShotTimer();
  clearEmoteTimers();
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

  showScreen('placement');
  buildBoardGrid(
    document.getElementById('fleet-board'),
    handlePlacementClick,
    handlePlacementHover,
  );
  renderPlacementBoard();
  renderShipRoster();
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
    schedulePublicMatchRetry();
  };

  net.cb.onRoomCreated = (code) => {
    clearPublicMatchRetry();
    gs.roomCode = code;
    const el = document.getElementById('room-code-display');
    if (el) el.textContent = code;
    showScreen('room-create');
  };

  net.cb.onMatchReady = ({ seed }) => {
    clearPublicMatchRetry();
    gs.seed = seed;
    gs.phase = 'placement';
    showScreen('placement');
    buildBoardGrid(
      document.getElementById('fleet-board'),
      handlePlacementClick,
      handlePlacementHover,
    );
    renderPlacementBoard();
    renderShipRoster();
  };

  net.cb.onRemoteProfile = ({ playerId, displayName }) => {
    gs.opponentProfile = { playerId, displayName };
    const waitEl = document.getElementById('opponent-name-waiting');
    if (waitEl) waitEl.textContent = `Opponent: ${displayName}`;
  };

  net.cb.onOpponentReady = () => {
    gs.opponentReady = true;
    if (gs.phase === 'waiting_opponent') transitionToBattle();
  };

  net.cb.onOpponentShot = ({ col, row }) => {
    if (gs.phase !== 'battle') return;
    handleIncomingShot(col, row);
  };

  net.cb.onShotResult = (result) => {
    if (gs.phase !== 'battle') return;
    handleShotResult(result);
  };

  net.cb.onEmote = (type) => {
    if (gs.phase !== 'battle') return;
    showBattleEmote('theirs', type);
  };

  net.cb.onRematch = (type) => {
    if (type !== 'request') return;
    gs.opponentWantsRematch = true;
    const statusEl = document.getElementById('rematch-status');
    if (statusEl) statusEl.textContent = 'Opponent wants a rematch!';
    if (gs.rematchPending) resetForRematch();
  };

  net.cb.onPartnerLeft = () => {
    clearPublicMatchRetry();
    clearPendingShotTimer();
    clearEmoteTimers();
    if (gs.phase === 'battle') {
      transitionToMatchEnded('forfeit_win');
    } else {
      const myProf = gs.myProfile;
      gs = createInitialState();
      gs.myProfile = myProf;
      showScreen('menu');
    }
  };

  net.cb.onSideConflict = () => {
    const newSide = gs.mySide === 'alpha' ? 'beta' : 'alpha';
    gs.mySide = newSide;
    net.findMatch(newSide);
  };

  net.cb.onError = (code, message) => {
    console.warn('Battleshits network error:', code, message);
    clearPublicMatchRetry();
    clearPendingShotTimer();
    clearEmoteTimers();
    const myProf = gs.myProfile;
    gs = createInitialState();
    gs.myProfile = myProf;
    net?.disconnect();
    net = null;
    showScreen('menu');
  };
}

// ─── Match start helpers ──────────────────────────────────────────────────────

function loadIdentity() {
  const profile = loadFactoryProfile();
  return createOnlineIdentityPayload(profile);
}

function startPublicMatch() {
  gs.mySide  = Math.random() < 0.5 ? 'alpha' : 'beta';
  gs.matchmakingMode = 'public';
  gs.myProfile = loadIdentity();
  gs.pendingNetAction = () => net.findMatch(gs.mySide);

  net.setIdentity(gs.myProfile);
  net.connect();

  showScreen('matchmaking');
  gs.phase = 'matchmaking';
}

function startPrivateCreate() {
  gs.mySide  = 'alpha';
  gs.matchmakingMode = 'private_create';
  gs.myProfile = loadIdentity();
  gs.pendingNetAction = () => net.createRoom(gs.mySide);

  net.setIdentity(gs.myProfile);
  net.connect();

  gs.phase = 'matchmaking';
}

function startPrivateJoin(code) {
  gs.mySide  = 'beta';
  gs.matchmakingMode = 'private_join';
  gs.myProfile = loadIdentity();
  gs.pendingNetAction = () => net.joinRoom(gs.mySide, code);

  net.setIdentity(gs.myProfile);
  net.connect();

  showScreen('matchmaking');
  gs.phase = 'matchmaking';
}

// ─── Button wiring ────────────────────────────────────────────────────────────

function wireButtons() {
  document.getElementById('btn-find-match')?.addEventListener('click', () => {
    net = createOnlineClient('battleshits');
    wireOnlineCallbacks();
    startPublicMatch();
  });

  document.getElementById('btn-create-room')?.addEventListener('click', () => {
    net = createOnlineClient('battleshits');
    wireOnlineCallbacks();
    startPrivateCreate();
  });

  document.getElementById('btn-join-room')?.addEventListener('click', () => {
    showScreen('room-join');
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
    startPrivateJoin(code);
  });

  document.getElementById('btn-cancel-join')?.addEventListener('click', () => {
    showScreen('menu');
  });

  document.getElementById('btn-cancel-match')?.addEventListener('click', () => {
    clearPublicMatchRetry();
    clearPendingShotTimer();
    clearEmoteTimers();
    net?.cancelSearch();
    net?.disconnect();
    net = null;
    gs = createInitialState();
    showScreen('menu');
  });

  document.getElementById('btn-cancel-room')?.addEventListener('click', () => {
    clearPublicMatchRetry();
    clearPendingShotTimer();
    clearEmoteTimers();
    net?.cancelRoom();
    net?.disconnect();
    net = null;
    gs = createInitialState();
    showScreen('menu');
  });

  document.getElementById('btn-rotate')?.addEventListener('click', rotateShip);

  document.getElementById('btn-lock-in')?.addEventListener('click', lockIn);

  document.getElementById('btn-rematch')?.addEventListener('click', () => {
    gs.rematchPending = true;
    net.sendRematch('request');
    const statusEl = document.getElementById('rematch-status');
    if (statusEl) statusEl.textContent = gs.opponentWantsRematch ? 'Starting rematch...' : 'Waiting for opponent...';
    if (gs.opponentWantsRematch) resetForRematch();
  });

  document.getElementById('btn-exit-to-menu')?.addEventListener('click', () => {
    clearPublicMatchRetry();
    clearPendingShotTimer();
    clearEmoteTimers();
    net?.disconnect();
    net = null;
    gs = createInitialState();
    showScreen('menu');
  });

  window.addEventListener('keydown', (e) => {
    const emoteType = keyToEmoteType(e.key);
    if (emoteType && gs.phase === 'battle') {
      trySendBattleEmote(emoteType);
      return;
    }

    if (gs.phase === 'placement') {
      if (e.key === 'r' || e.key === 'R') rotateShip();
      if (e.key === 'Enter') lockIn();
    }
  });
}

// ─── Entry ────────────────────────────────────────────────────────────────────

export function initGame() {
  wireButtons();
  showScreen('menu');
}
