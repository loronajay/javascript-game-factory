// Keyboard input routing for Lovers Lost.
//
// `createKeyboardRouter` returns the `keydown`/`keyup` handlers init-game
// registers on `window`. All per-phase routing lives here; gameplay/online
// state is read and mutated through the shared `host` accessor object.
import { keyToAction } from './input.js';
import { toggleDebugHotkey } from './debug-flags.js';
import { shouldHandleScoreScreenKeydown, shouldHandleMappedKeyLocally } from './game-tick.js';
import { sanitizeOnlineDisplayName } from './online-identity.js';

const EMOTE_BINDINGS = {
  jump:   'heart',
  crouch: 'middle-finger',
  attack: 'smile',
  block:  'crying',
};
const EMOTE_COOLDOWN_MS = 1000;

function createKeyboardRouter(host) {
  function onKeyDown(e) {
    host.sounds.retryPendingMusic();
    if (shouldHandleScoreScreenKeydown(host.gs.phase, e.key)) {
      host.returnToMenu();
      return;
    }
    if (host.gs.phase === 'menu_help') {
      host.gs = { ...host.gs, phase: 'menu' }; host.inp.tick(); return;
    }
    if (host.gs.phase === 'solo_side_select') {
      if (e.key === 'Escape') { host.gs = { ...host.gs, phase: 'menu' }; }
      return;
    }
    if (host.gs.phase === 'solo_countdown') {
      if (e.key === 'Escape') { host.soloMode = false; host.gs = { ...host.gs, phase: 'menu' }; }
      return;
    }
    if (host.gs.phase === 'local_countdown') {
      if (e.key === 'Escape') { host.gs = { ...host.gs, phase: 'menu' }; }
      return;
    }
    if (host.gs.phase === 'online_side_select') {
      if (e.key === 'Escape') { host.onlineClient.disconnect(); host.onlineQueueCounts = null; host.gs = { ...host.gs, phase: 'menu' }; }
      return;
    }
    if (host.gs.phase === 'online_name_entry') {
      if (e.key === 'Escape')     { host.cancelNameEntry(); return; }
      if (e.key === 'Backspace')  { host.onlineNameInput = host.onlineNameInput.slice(0, -1); host.onlineNameError = ''; return; }
      if (e.key === 'Enter')      { host.tryContinueNameEntry(); return; }
      if (e.key.length === 1)     { host.onlineNameInput = sanitizeOnlineDisplayName(host.onlineNameInput + e.key); host.onlineNameError = ''; return; }
      return;
    }
    if (host.gs.phase === 'online_countdown') {
      if (e.key === 'Escape') {
        host.onlineClient.disconnect(); host.onlineClient.reset();
        host.onlineRemoteSide = null; host.onlineRemoteIdentity = null; host.onlineCountdown = null;
        host.onlineRoomCode = ''; host.onlineQueueCounts = null; host.onlineLobbyPhase = 'main';
        host.gs = { ...host.gs, phase: 'menu' };
      }
      return;
    }
    if (host.gs.phase === 'online_lobby') {
      if (host.onlineLobbyPhase === 'join') {
        if (e.key === 'Backspace') { host.onlineCodeInput = host.onlineCodeInput.slice(0, -1); return; }
        if (e.key === 'Enter')     { host.tryJoinRoom(); return; }
        if (e.key === 'Escape')    { host.onlineLobbyPhase = 'friend_options'; return; }
        if (e.key.length === 1)    { if (host.onlineCodeInput.length < 8) host.onlineCodeInput += e.key.toUpperCase(); return; }
        return;
      }
      if (e.key === 'Escape') {
        if (host.onlineLobbyPhase === 'main')           { host.onlineClient.disconnect(); host.onlineQueueCounts = null; host.onlineRemoteIdentity = null; host.gs = { ...host.gs, phase: 'online_side_select' }; }
        else if (host.onlineLobbyPhase === 'searching') { host.cancelSearch(); host.onlineLobbyPhase = 'main'; }
        else if (host.onlineLobbyPhase === 'friend_options') host.onlineLobbyPhase = 'main';
        else if (host.onlineLobbyPhase === 'create' || host.onlineLobbyPhase === 'join') { host.cancelRoom(); host.onlineLobbyPhase = 'friend_options'; }
      }
      return;
    }
    const toggle = toggleDebugHotkey(host.debugEnabled, e.key);
    if (toggle.handled) {
      host.debugEnabled = toggle.enabled;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    if (keyToAction(e.key) && typeof e.preventDefault === 'function') e.preventDefault();
    const mapped = keyToAction(e.key);
    if (host.gs.mode === 'online' && mapped && mapped.side !== host.onlineSide &&
        (host.gs.phase === 'playing' || host.gs.phase === 'reunion')) {
      const emoteType = EMOTE_BINDINGS[mapped.action];
      if (emoteType) {
        const now = Date.now();
        if (now - host.lastEmoteSentAt >= EMOTE_COOLDOWN_MS) {
          host.lastEmoteSentAt = now;
          host.onlineClient.sendEmote(emoteType);
          host.renderer.addEmote(host.onlineRemoteSide, emoteType);
        }
      }
      return;
    }
    if (!shouldHandleMappedKeyLocally(host.gs.mode, host.onlineSide, mapped && mapped.side)) return;
    host.inp.keydown(e.key);
  }

  function onKeyUp(e) {
    const mapped = keyToAction(e.key);
    if (!shouldHandleMappedKeyLocally(host.gs.mode, host.onlineSide, mapped && mapped.side)) return;
    host.inp.keyup(e.key);
  }

  return { onKeyDown, onKeyUp };
}

export { createKeyboardRouter };
