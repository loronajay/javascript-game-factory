import {
  createGameState, tickFrame, advancePhaseState,
  shouldHandleMappedKeyLocally,
} from './game-tick.js';
import { RUN_DISTANCE } from './player.js';
import { buildDebugCollisionSnapshot } from './collision.js';
import { buildLaneSnapshot } from './lane-snapshot.js';
import { createLaneInputHandler } from './lane-input.js';
import {
  sanitizeOnlineDisplayName, isValidOnlineDisplayName,
  buildOnlineIdentity, deriveOnlineRunOverrideName,
  attachOnlineResultIdentities, sanitizeOnlinePlayerId,
} from './online-identity.js';
import { getOnlineSideSelectRects, getOnlineNameEntryButtonRects, getOnlineLobbyButtonRects } from './lobby-ui.js';
import { debugEnabledFromSearch, debugObstacleTypeFromSearch, toggleDebugHotkey, DEBUG_OBSTACLE_LABELS } from './debug-flags.js';
import { loadGameAssets } from './game-assets.js';
import { applyRemoteSnapshot } from './remote-snapshot.js';
import { createRenderer } from './renderer.js';
import { createInput, keyToAction } from './input.js';
import { createSounds } from './sounds.js';
import { createOnlineClient, getCountdownSecondsRemaining, hasCountdownStarted } from './online.js';
import { evaluateRun } from './scoring.js';
import { publishLoversLostRunActivity } from '../../../js/platform/activity/activity.mjs';
import { loadFactoryProfile } from '../../../js/platform/identity/factory-profile.mjs';
import { createOnlineIdentityPayload } from '../../../js/platform/identity/match-identity.mjs';
import { updateScoreOverlay } from './score-overlay.js';
import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  removeStorageText,
} from '../../../js/platform/storage/storage.mjs';

const LEGACY_ONLINE_NAME_STORAGE_KEY = getPlatformStorageKey('loversLostLegacyOnlineName');

const EMOTE_BINDINGS = {
  jump:   'heart',
  crouch: 'middle-finger',
  attack: 'smile',
  block:  'crying',
};
const EMOTE_COOLDOWN_MS = 1000;

function initGame() {
  loadGameAssets((images, emoteImages) => _initWithAssets(images, emoteImages));
}

function _initWithAssets(images, emoteImages) {
  // ── Sounds ───────────────────────────────────────────────────────────────────
  const sounds = createSounds();

  // ── Online client ────────────────────────────────────────────────────────────
  const onlineClient = createOnlineClient();
  let onlineRemoteSide     = null;
  let onlineRemoteIdentity = null;
  let onlineCountdown      = null;
  let onlineQueueCounts    = null;
  let onlineSnapshotSeq    = 0;
  const remoteLaneSeq      = { boy: -1, girl: -1 };
  const storage            = getDefaultPlatformStorage(window);
  const legacyDisplayName  = sanitizeOnlineDisplayName(readStorageText(storage, LEGACY_ONLINE_NAME_STORAGE_KEY) || '');
  const factoryProfile     = loadFactoryProfile(storage, { seedProfileName: legacyDisplayName });
  if (legacyDisplayName) removeStorageText(storage, LEGACY_ONLINE_NAME_STORAGE_KEY);

  onlineClient.cb.onConnected   = () => { onlineClient.requestQueueStatus('lovers-lost'); };
  onlineClient.cb.onQueueCounts = (counts) => { onlineQueueCounts = counts; };
  onlineClient.cb.onRemoteProfile = (profile) => {
    onlineRemoteIdentity = {
      playerId:    sanitizeOnlinePlayerId(profile?.playerId    || ''),
      displayName: sanitizeOnlineDisplayName(profile?.displayName || ''),
    };
    if (!onlineRemoteSide && (profile?.side === 'boy' || profile?.side === 'girl')) onlineRemoteSide = profile.side;
  };
  onlineClient.cb.onSearching       = () => {};
  onlineClient.cb.onSearchCancelled = () => { onlineLobbyPhase = 'main'; };
  onlineClient.cb.onRoomCreated     = (code) => { onlineRoomCode = code; };
  onlineClient.cb.onSideConflict    = () => {
    onlineRoomCode = ''; onlineRemoteSide = null; onlineRemoteIdentity = null;
    onlineCountdown = null; onlineQueueCounts = null; onlineLobbyPhase = 'main';
    gs = { ...gs, phase: 'online_lobby' };
  };
  onlineClient.cb.onError = (code, msg) => { console.warn('[online]', code, msg); };

  onlineClient.cb.onMatchReady = ({ seed, remoteSide, serverNow, startAt }) => {
    onlineRemoteSide = remoteSide;
    onlineCountdown  = { seed, startAt, clockOffsetMs: serverNow - Date.now() };
    gs = { ...gs, phase: 'online_countdown' };
    inp.tick();
  };

  onlineClient.cb.onRemoteAction = () => {};

  onlineClient.cb.onRemoteEmote = (type) => {
    renderer.addEmote(onlineSide, type);
  };

  onlineClient.cb.onPartnerLeft = () => {
    if (gs.phase === 'online_countdown') {
      onlineRemoteSide = null; onlineRemoteIdentity = null; onlineCountdown = null;
      onlineRoomCode = ''; onlineQueueCounts = null; onlineLobbyPhase = 'main';
      gs = { ...gs, phase: 'online_lobby' };
      return;
    }
    if (gs.phase === 'playing') {
      const summary = attachOnlineResultIdentities(
        { ...evaluateRun(gs.boy, gs.girl, gs.elapsed), disconnectNote: true },
        onlineSide, onlineIdentity, onlineRemoteSide, onlineRemoteIdentity
      );
      gs = { ...gs, phase: 'gameover', phaseFrames: 0, runSummary: summary };
      sounds.stopMusic();
      sounds.play('run-failed');
    }
  };

  // ── Canvas + renderer ────────────────────────────────────────────────────────
  const canvas   = document.getElementById('gameCanvas');
  const renderer = createRenderer(canvas, images, emoteImages);
  const search   = window.location && window.location.search;
  const debugObstacleType = debugObstacleTypeFromSearch(search);
  let debugEnabled = debugEnabledFromSearch(search);

  // ── Input ────────────────────────────────────────────────────────────────────
  const inp = createInput();
  window.addEventListener('keydown', e => {
    sounds.retryPendingMusic();
    if (gs.phase === 'menu_help') {
      gs = { ...gs, phase: 'menu' }; inp.tick(); return;
    }
    if (gs.phase === 'solo_side_select') {
      if (e.key === 'Escape') { gs = { ...gs, phase: 'menu' }; }
      return;
    }
    if (gs.phase === 'solo_countdown') {
      if (e.key === 'Escape') { soloMode = false; gs = { ...gs, phase: 'menu' }; }
      return;
    }
    if (gs.phase === 'online_side_select') {
      if (e.key === 'Escape') { onlineClient.disconnect(); onlineQueueCounts = null; gs = { ...gs, phase: 'menu' }; }
      return;
    }
    if (gs.phase === 'online_name_entry') {
      if (e.key === 'Escape')     { onlineNameError = ''; gs = { ...gs, phase: 'online_side_select' }; return; }
      if (e.key === 'Backspace')  { onlineNameInput = onlineNameInput.slice(0, -1); onlineNameError = ''; return; }
      if (e.key === 'Enter')      { _tryContinueNameEntry(); return; }
      if (e.key.length === 1)     { onlineNameInput = sanitizeOnlineDisplayName(onlineNameInput + e.key); onlineNameError = ''; return; }
      return;
    }
    if (gs.phase === 'online_countdown') {
      if (e.key === 'Escape') {
        onlineClient.disconnect(); onlineClient.reset();
        onlineRemoteSide = null; onlineRemoteIdentity = null; onlineCountdown = null;
        onlineRoomCode = ''; onlineQueueCounts = null; onlineLobbyPhase = 'main';
        gs = { ...gs, phase: 'menu' };
      }
      return;
    }
    if (gs.phase === 'online_lobby') {
      if (onlineLobbyPhase === 'join') {
        if (e.key === 'Backspace') { onlineCodeInput = onlineCodeInput.slice(0, -1); return; }
        if (e.key === 'Enter')     { _tryJoinRoom(); return; }
        if (e.key === 'Escape')    { onlineLobbyPhase = 'friend_options'; return; }
        if (e.key.length === 1)    { if (onlineCodeInput.length < 8) onlineCodeInput += e.key.toUpperCase(); return; }
        return;
      }
      if (e.key === 'Escape') {
        if (onlineLobbyPhase === 'main')           { onlineClient.disconnect(); onlineQueueCounts = null; onlineRemoteIdentity = null; gs = { ...gs, phase: 'online_side_select' }; }
        else if (onlineLobbyPhase === 'searching') { _cancelSearch(); onlineLobbyPhase = 'main'; }
        else if (onlineLobbyPhase === 'friend_options') onlineLobbyPhase = 'main';
        else if (onlineLobbyPhase === 'create' || onlineLobbyPhase === 'join') { _cancelRoom(); onlineLobbyPhase = 'friend_options'; }
      }
      return;
    }
    const toggle = toggleDebugHotkey(debugEnabled, e.key);
    if (toggle.handled) {
      debugEnabled = toggle.enabled;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    if (keyToAction(e.key) && typeof e.preventDefault === 'function') e.preventDefault();
    const mapped = keyToAction(e.key);
    if (gs.mode === 'online' && mapped && mapped.side !== onlineSide &&
        (gs.phase === 'playing' || gs.phase === 'reunion')) {
      const emoteType = EMOTE_BINDINGS[mapped.action];
      if (emoteType) {
        const now = Date.now();
        if (now - lastEmoteSentAt >= EMOTE_COOLDOWN_MS) {
          lastEmoteSentAt = now;
          onlineClient.sendEmote(emoteType);
          renderer.addEmote(onlineRemoteSide, emoteType);
        }
      }
      return;
    }
    if (!shouldHandleMappedKeyLocally(gs.mode, onlineSide, mapped && mapped.side)) return;
    inp.keydown(e.key);
  });

  window.addEventListener('keyup', e => {
    const mapped = keyToAction(e.key);
    if (!shouldHandleMappedKeyLocally(gs.mode, onlineSide, mapped && mapped.side)) return;
    inp.keyup(e.key);
  });

  // Menu button bounds (canvas space)
  const MENU_BTN0_X = 300, MENU_BTN0_Y = 148, MENU_BTN0_W = 360, MENU_BTN0_H = 56; // SINGLE PLAYER
  const MENU_BTN_X  = 300, MENU_BTN_Y  = 216, MENU_BTN_W  = 360, MENU_BTN_H  = 56; // LOCAL MULTIPLAYER
  const MENU_BTN2_X = 300, MENU_BTN2_Y = 284, MENU_BTN2_W = 360, MENU_BTN2_H = 56; // ONLINE MULTIPLAYER
  const MENU_BTN3_X = 360, MENU_BTN3_Y = 360, MENU_BTN3_W = 240, MENU_BTN3_H = 44; // HOW TO PLAY
  let menuBtn0Hovered = false;
  let menuBtnHovered  = false;
  let menuBtn2Hovered = false;
  let menuBtn3Hovered = false;

  function _inBtn(cx, cy, bx, by, bw, bh) { return cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh; }
  function _inRect(cx, cy, rect) { return !!rect && _inBtn(cx, cy, rect.x, rect.y, rect.w, rect.h); }

  // ── Solo state ───────────────────────────────────────────────────────────────
  let soloMode          = false;
  let soloSide          = 'boy';
  let soloCountdownTick = 0;
  let soloSideBoyHov    = false;
  let soloSideGirlHov   = false;
  const SOLO_COUNTDOWN_TICKS = 180;

  // ── Online UI state ──────────────────────────────────────────────────────────
  let lastEmoteSentAt      = 0;
  let onlineSide           = 'boy';
  let onlineRunOverrideName = '';
  let onlineIdentity       = buildOnlineIdentity(factoryProfile, onlineRunOverrideName);
  let onlineNameInput      = onlineIdentity.displayName;
  let onlineNameError      = '';
  let onlineLobbyPhase     = 'main';
  let onlineCodeInput      = '';
  let onlineRoomCode       = '';
  let onlineSearchTick     = 0;

  let onlineSideBoyHov = false, onlineSideGirlHov = false;
  let onlineNameContinueHov = false;
  let onlineFindMatchHov = false, onlinePlayFriendHov = false;
  let onlineCancelHov = false;
  let onlineCreateHov = false, onlineJoinHov = false;
  let onlineJoinSubmitHov = false;

  function _tryJoinRoom()  { if (onlineCodeInput.length > 0) onlineClient.joinRoom(onlineSide, onlineCodeInput); }
  function _cancelSearch() { onlineClient.cancelSearch(); }
  function _cancelRoom()   { onlineRoomCode = ''; onlineClient.cancelRoom(); }
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

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);

    if (gs.phase === 'menu') {
      menuBtn0Hovered = _inBtn(cx, cy, MENU_BTN0_X, MENU_BTN0_Y, MENU_BTN0_W, MENU_BTN0_H);
      menuBtnHovered  = _inBtn(cx, cy, MENU_BTN_X,  MENU_BTN_Y,  MENU_BTN_W,  MENU_BTN_H);
      menuBtn2Hovered = _inBtn(cx, cy, MENU_BTN2_X, MENU_BTN2_Y, MENU_BTN2_W, MENU_BTN2_H);
      menuBtn3Hovered = _inBtn(cx, cy, MENU_BTN3_X, MENU_BTN3_Y, MENU_BTN3_W, MENU_BTN3_H);
    } else { menuBtn0Hovered = menuBtnHovered = menuBtn2Hovered = menuBtn3Hovered = false; }

    if (gs.phase === 'solo_side_select') {
      const r = getOnlineSideSelectRects();
      soloSideBoyHov  = _inRect(cx, cy, r.boy);
      soloSideGirlHov = _inRect(cx, cy, r.girl);
    } else { soloSideBoyHov = soloSideGirlHov = false; }

    if (gs.phase === 'online_side_select') {
      const r = getOnlineSideSelectRects();
      onlineSideBoyHov  = _inRect(cx, cy, r.boy);
      onlineSideGirlHov = _inRect(cx, cy, r.girl);
    } else { onlineSideBoyHov = onlineSideGirlHov = false; }

    if (gs.phase === 'online_name_entry') {
      onlineNameContinueHov = _inRect(cx, cy, getOnlineNameEntryButtonRects().continue);
    } else { onlineNameContinueHov = false; }

    if (gs.phase === 'online_lobby') {
      const r = getOnlineLobbyButtonRects(onlineLobbyPhase);
      onlineFindMatchHov  = _inRect(cx, cy, r.findMatch);
      onlinePlayFriendHov = _inRect(cx, cy, r.playFriend);
      onlineCancelHov     = _inRect(cx, cy, r.cancel);
      onlineCreateHov     = _inRect(cx, cy, r.create);
      onlineJoinHov       = _inRect(cx, cy, r.join);
      onlineJoinSubmitHov = _inRect(cx, cy, r.joinSubmit);
    } else {
      onlineFindMatchHov = onlinePlayFriendHov = onlineCancelHov =
        onlineCreateHov = onlineJoinHov = onlineJoinSubmitHov = false;
    }
  });

  canvas.addEventListener('click', e => {
    sounds.retryPendingMusic();
    if (gs.phase === 'menu_help') { gs = { ...gs, phase: 'menu' }; return; }
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);

    if (gs.phase === 'menu') {
      if      (_inBtn(cx, cy, MENU_BTN0_X, MENU_BTN0_Y, MENU_BTN0_W, MENU_BTN0_H)) { soloCountdownTick = 0; gs = { ...gs, phase: 'solo_side_select' }; }
      else if (_inBtn(cx, cy, MENU_BTN_X,  MENU_BTN_Y,  MENU_BTN_W,  MENU_BTN_H))  startPlaying();
      else if (_inBtn(cx, cy, MENU_BTN2_X, MENU_BTN2_Y, MENU_BTN2_W, MENU_BTN2_H)) { onlineSide = 'boy'; onlineLobbyPhase = 'main'; gs = { ...gs, phase: 'online_side_select' }; }
      else if (_inBtn(cx, cy, MENU_BTN3_X, MENU_BTN3_Y, MENU_BTN3_W, MENU_BTN3_H)) gs = { ...gs, phase: 'menu_help' };
      return;
    }
    if (gs.phase === 'solo_side_select') {
      const r = getOnlineSideSelectRects();
      if (_inRect(cx, cy, r.boy))  { soloSide = 'boy';  soloCountdownTick = 0; gs = { ...gs, phase: 'solo_countdown' }; }
      if (_inRect(cx, cy, r.girl)) { soloSide = 'girl'; soloCountdownTick = 0; gs = { ...gs, phase: 'solo_countdown' }; }
      return;
    }
    if (gs.phase === 'online_side_select') {
      const r = getOnlineSideSelectRects();
      if (_inRect(cx, cy, r.boy))  { onlineSide = 'boy';  onlineNameError = ''; gs = { ...gs, phase: 'online_name_entry' }; }
      if (_inRect(cx, cy, r.girl)) { onlineSide = 'girl'; onlineNameError = ''; gs = { ...gs, phase: 'online_name_entry' }; }
      return;
    }
    if (gs.phase === 'online_name_entry') {
      if (_inRect(cx, cy, getOnlineNameEntryButtonRects().continue)) _tryContinueNameEntry();
      return;
    }
    if (gs.phase === 'online_lobby') {
      const r = getOnlineLobbyButtonRects(onlineLobbyPhase);
      if (onlineLobbyPhase === 'main') {
        if (_inRect(cx, cy, r.findMatch))  { onlineLobbyPhase = 'searching'; onlineSearchTick = 0; onlineClient.findMatch(onlineSide); }
        if (_inRect(cx, cy, r.playFriend)) { onlineLobbyPhase = 'friend_options'; }
      } else if (onlineLobbyPhase === 'searching') {
        if (_inRect(cx, cy, r.cancel)) { _cancelSearch(); onlineLobbyPhase = 'main'; }
      } else if (onlineLobbyPhase === 'friend_options') {
        if (_inRect(cx, cy, r.create)) { onlineLobbyPhase = 'create'; onlineSearchTick = 0; onlineClient.createRoom(onlineSide); }
        if (_inRect(cx, cy, r.join))   { onlineLobbyPhase = 'join'; onlineCodeInput = ''; }
      } else if (onlineLobbyPhase === 'create') {
        if (_inRect(cx, cy, r.cancel)) { _cancelRoom(); onlineLobbyPhase = 'friend_options'; }
      } else if (onlineLobbyPhase === 'join') {
        if (_inRect(cx, cy, r.joinSubmit)) _tryJoinRoom();
        if (_inRect(cx, cy, r.cancel))     { _cancelRoom(); onlineLobbyPhase = 'friend_options'; }
      }
      return;
    }
  });

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

  onlineClient.cb.onRemoteSnapshot = (snapshot) => {
    if (!onlineRemoteSide || !snapshot) return;
    const result = applyRemoteSnapshot({ gs, boyAnim, girlAnim, remoteLaneSeq }, renderer, onlineRemoteSide, snapshot);
    if (result) { gs = result.gs; boyAnim = result.boyAnim; girlAnim = result.girlAnim; }
  };

  // ── State machine ────────────────────────────────────────────────────────────
  function startPlaying() {
    sounds.stop('run-success'); sounds.stop('run-failed');
    gs = { ...createGameState(gs.mode, Date.now() >>> 0, { debugObstacleType }), phase: 'playing' };
    boyAnim = { state: 'running', actionTick: 0 };
    girlAnim = { state: 'running', actionTick: 0 };
    inp.tick();
  }

  function startPlayingSolo(side) {
    sounds.stop('run-success'); sounds.stop('run-failed');
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

  // ── Main loop ────────────────────────────────────────────────────────────────
  function loop(timestamp) {
    if (loopLastTime === null) loopLastTime = timestamp ?? performance.now();
    if (timestamp == null) { requestAnimationFrame(loop); return; }
    const frameTime = Math.min(timestamp - loopLastTime, 100);
    loopLastTime = timestamp;
    loopAccumulator += frameTime;

    while (loopAccumulator >= TICK_MS) {
      loopAccumulator -= TICK_MS;

      const musicPhase = (gs.phase === 'menu_help' || gs.phase === 'solo_side_select' || gs.phase === 'solo_countdown') ? 'menu' : gs.phase;
      if (musicPhase !== lastMusicPhase) {
        if (musicPhase === 'menu')                                    sounds.playMusic('bg-music-menu');
        else if (musicPhase === 'playing')                            sounds.playMusic('bg-music-game');
        else if (musicPhase === 'reunion' || musicPhase === 'gameover') sounds.stopMusic();
        lastMusicPhase = musicPhase;
      }

      if (gs.phase === 'score_screen') {
        const anyPressed =
          inp.isPressed('boy',  'jump')  || inp.isPressed('boy',  'attack') ||
          inp.isPressed('boy',  'block') || inp.isPressed('boy',  'crouch') ||
          inp.isPressed('girl', 'jump')  || inp.isPressed('girl', 'attack') ||
          inp.isPressed('girl', 'block') || inp.isPressed('girl', 'crouch');
        if (anyPressed) returnToMenu();
      }

      if (gs.phase === 'solo_countdown') {
        soloCountdownTick++;
        if (soloCountdownTick >= SOLO_COUNTDOWN_TICKS) startPlayingSolo(soloSide);
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

    if      (gs.phase === 'menu')              renderer.renderMenu(debugState, menuBtn0Hovered, menuBtnHovered, menuBtn2Hovered, menuBtn3Hovered);
    else if (gs.phase === 'solo_side_select')  renderer.renderSoloSideSelect(soloSideBoyHov, soloSideGirlHov);
    else if (gs.phase === 'solo_countdown')    renderer.renderSoloCountdown(soloSide, Math.ceil((SOLO_COUNTDOWN_TICKS - soloCountdownTick) / 60));
    else if (gs.phase === 'online_side_select') renderer.renderOnlineSideSelect(onlineSideBoyHov, onlineSideGirlHov, onlineSide);
    else if (gs.phase === 'online_name_entry')  renderer.renderOnlineNameEntry(onlineSide, onlineNameInput, onlineNameError, { continue: onlineNameContinueHov });
    else if (gs.phase === 'online_lobby') {
      onlineSearchTick++;
      renderer.renderOnlineLobby(onlineSide, onlineLobbyPhase, onlineRoomCode, onlineCodeInput, onlineSearchTick,
        { findMatch: onlineFindMatchHov, playFriend: onlinePlayFriendHov, cancel: onlineCancelHov, create: onlineCreateHov, join: onlineJoinHov, joinSubmit: onlineJoinSubmitHov },
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
    else if (gs.phase === 'score_screen') renderer.renderScore(gs.boy, gs.girl, gs.runSummary, soloMode ? soloSide : null);

    updateScoreOverlay(gs.phase, prevPhase, gs.runSummary, onlineSide);
    if (gs.phase !== prevPhase) prevPhase = gs.phase;

    requestAnimationFrame(loop);
  }

  loop();
}

export { initGame };
