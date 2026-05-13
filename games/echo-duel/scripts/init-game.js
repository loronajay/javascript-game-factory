import { PHASES } from './config.js';
import { applyAuthoritativeMatchMessage, getAuthoritativeSyncSeq, isAuthoritativeMatchMessageType } from './authority-sync.js';
import { activePlayers, cloneState, createMatchState, hydrateNetworkState, serializeStateForNetwork } from './state.js';
import { handleInput, resolveCopyPhase, startSinglePlayerMatch, tick } from './engine.js';
import { createInputController } from './input.js';
import { playFailureTone, playInputTone, startMenuMusic, stopMenuMusic, unlockAudio } from './audio.js';
import { currentPlaybackStep, flashInput, renderMatch, renderOnlineLobby, showScreen } from './renderer.js';
import { createOnlineClient } from './online.js';
import { loadArcadeIdentity } from './identity.js';
import { shouldCloseMatchToMenuOnPlayerLeft, shouldPreserveResultsScreen, shouldResetStartRequest } from './online-session-state.js';
import {
  applyPlayerLeftToLobby,
  buildPlayersFromLobby,
  createOnlineRuntimeState,
  mergeLobbySnapshot,
  resetOnlineRuntimeState,
  shouldTickLobbyCountdown,
} from './online-runtime-state.js';
import { wireGameButtons } from './button-bindings.js';
import { createOnlineSessionController } from './online-session-controller.js';

let state = null;
let inputController = null;
let rafId = null;
let lastPlaybackToneToken = '';
const online = createOnlineRuntimeState();
let onlineController = null;

function qs(id) { return document.getElementById(id); }

function onlineUsesServerAuthority() {
  return online.authorityMode === 'server';
}

function setMenuNotice(message = '') {
  const el = qs('menu-notice');
  if (!el) return;
  if (!message) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

function goMenuWithNotice(message) {
  stopLoop();
  state = null;
  onlineController?.disconnectOnline();
  showScreen('menu');
  setMenuNotice(message);
  startMenuMusic();
}

function bumpNetworkPhase(next, { newTurn = false } = {}) {
  next.phaseId = Number(next.phaseId || 0) + 1;
  if (newTurn) next.turnId = Number(next.turnId || 0) + 1;
  return next;
}

function continueAfterDisconnectedPlayer(clientId, reason = 'disconnect') {
  if (!state || state.mode !== 'online' || state.phase === PHASES.MATCH_OVER) return false;

  const leavingPlayer = state.players.find(player => player.clientId === clientId || player.id === clientId);
  const activeBefore = activePlayers(state).length;
  if (!leavingPlayer || leavingPlayer.eliminated) return false;

  // In 1v1, a disconnect ends the experience for the remaining player instead of awarding a cheap win.
  if (activeBefore <= 2) {
    goMenuWithNotice('Your partner disconnected. The match was closed.');
    return true;
  }

  let next = cloneState(state);
  const leavingIndex = next.players.findIndex(player => player.clientId === clientId || player.id === clientId);
  if (leavingIndex < 0) return false;

  next.players[leavingIndex] = {
    ...next.players[leavingIndex],
    eliminated: true,
    lastResult: reason === 'host-left' ? 'host-left' : 'disconnected',
  };
  delete next.copyProgress[next.players[leavingIndex].id];

  const remaining = next.players.filter(player => !player.eliminated);
  if (remaining.length <= 1) {
    next.phase = PHASES.MATCH_OVER;
    next.winnerId = remaining[0]?.id || null;
    next.timer = null;
    next.status = `${remaining[0]?.name || 'No one'} wins after a disconnect.`;
    setState(next, { broadcast: true });
    return true;
  }

  const leavingWasOwner = leavingIndex === next.ownerIndex;
  if (leavingWasOwner) {
    const nextOwnerIndex = next.players.findIndex(player => !player.eliminated);
    next.ownerIndex = nextOwnerIndex >= 0 ? nextOwnerIndex : 0;
    bumpNetworkPhase(next, { newTurn: true });
    next.phase = PHASES.OWNER_CREATE_INITIAL;
    next.activeSequence = [];
    next.ownerDraft = [];
    next.ownerReplayIndex = 0;
    next.appendTargetLength = 0;
    next.copyProgress = {};
    next.roundResults = [];
    next.timer = null;
    next.playback = null;
    next.status = `${leavingPlayer.name} disconnected. ${next.players[next.ownerIndex]?.name || 'Next player'} takes control.`;
    setState(next, { broadcast: true });
    return true;
  }

  if (next.phase === PHASES.CHALLENGER_COPY) {
    const unresolved = Object.values(next.copyProgress || {}).some(progress => progress.status === 'copying');
    if (!unresolved) {
      next = resolveCopyPhase(next);
      next.status = `${leavingPlayer.name} disconnected and was removed from the match.`;
      setState(next, { broadcast: true });
      return true;
    }
  }

  next.status = `${leavingPlayer.name} disconnected and was removed from the match.`;
  setState(next, { broadcast: true });
  return true;
}

function isActiveMatchPhase(phase) {
  return phase === PHASES.OWNER_CREATE_INITIAL
    || phase === PHASES.OWNER_REPLAY
    || phase === PHASES.OWNER_APPEND
    || phase === PHASES.SIGNAL_PLAYBACK
    || phase === PHASES.CHALLENGER_COPY;
}

function setState(nextState, { broadcast = true } = {}) {
  const previous = state;
  state = nextState;

  if (isActiveMatchPhase(state.phase)) {
    stopMenuMusic();
  }

  if (state.phase === PHASES.MATCH_OVER && previous?.phase !== PHASES.MATCH_OVER) {
    playFailureTone();
  }

  renderMatch(state);

  if (broadcast && state.mode === 'online' && online.isHost && !onlineUsesServerAuthority()) {
    broadcastState();
  }
}

function broadcastState() {
  if (!state || !online.net || !online.isHost || onlineUsesServerAuthority()) return;
  const snapshot = serializeStateForNetwork(state);
  snapshot.network = {
    ...(snapshot.network || {}),
    syncSeq: ++online.outboundStateSeq,
  };
  online.net.sendState(snapshot);
}

function playerIdForClientId(clientId) {
  return clientId;
}

function submitLocalInput(input) {
  if (!state) return;
  playInputTone(input);
  flashInput(input);
  const before = state;
  const after = handleInput(state, input);
  if (after !== before) {
    const failed = after.players.some((player, index) => player.lastResult && player.lastResult !== before.players[index]?.lastResult && ['fail', 'owner-fail', 'eliminated'].includes(player.lastResult));
    if (failed) playFailureTone();
    setState(after);
  }
}

function mirrorVisibleOwnerInput() {
  // Owner inputs are now presented through the formal SIGNAL_PLAYBACK phase.
  // Do not use raw live network input as the memory source; network timing and fast
  // button presses make that unreadable.
  return false;
}


function submitOnlineInput(input) {
  if (!online.net || !state) return;
  playInputTone(input);
  flashInput(input);

  if (online.isHost && !onlineUsesServerAuthority()) {
    applyAuthoritativeInput(online.net.clientId, input);
  } else {
    online.net.sendInput(input, { phaseId: state.phaseId, turnId: state.turnId });
  }
}

function submitInput(input) {
  if (state?.mode === 'online') submitOnlineInput(input);
  else submitLocalInput(input);
}

function applyAuthoritativeInput(senderId, input, meta = null) {
  if (!state || !online.isHost) return;

  if (meta) {
    const phaseId = Number(meta.phaseId);
    const turnId = Number(meta.turnId);
    if (!Number.isFinite(phaseId) || !Number.isFinite(turnId)) return;
    if (phaseId !== Number(state.phaseId || 0) || turnId !== Number(state.turnId || 0)) return;
  }

  const before = state;
  const after = handleInput(state, input, playerIdForClientId(senderId));
  if (after !== before) {
    const failed = after.players.some((player, index) => player.lastResult && player.lastResult !== before.players[index]?.lastResult && ['fail', 'owner-fail', 'eliminated'].includes(player.lastResult));
    if (failed) playFailureTone();
    setState(after, { broadcast: true });
  }
}

function syncPlaybackTone() {
  if (!state || state.phase !== PHASES.SIGNAL_PLAYBACK || !state.playback) {
    lastPlaybackToneToken = '';
    return;
  }
  const step = currentPlaybackStep(state);
  if (!step) return;
  const token = `${state.playback.sequence.join('')}:${step.index}`;
  if (token === lastPlaybackToneToken) return;
  lastPlaybackToneToken = token;
  playInputTone(step.input);
  flashInput(step.input);
}

function startLoop() {
  if (rafId != null) cancelAnimationFrame(rafId);
  let lastBroadcastAt = 0;
  const frame = () => {
    if (state && state.phase !== PHASES.MATCH_OVER) {
      if (state.mode === 'online' && (!online.isHost || onlineUsesServerAuthority())) {
        renderMatch(state);
      } else {
        const next = tick(state);
        if (next !== state) setState(next, { broadcast: true });
        else renderMatch(state);
      }

      syncPlaybackTone();

      if (state?.mode === 'online' && online.isHost && !onlineUsesServerAuthority()) {
        const now = performance.now();
        if (now - lastBroadcastAt > 1000) {
          lastBroadcastAt = now;
          broadcastState();
        }
      }
    }
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  if (rafId != null) cancelAnimationFrame(rafId);
  rafId = null;
}

function resetToMenu() {
  setMenuNotice('');
  stopLoop();
  state = null;
  onlineController?.disconnectOnline();
  showScreen('menu');
  startMenuMusic();
}

export function initGame() {
  onlineController = createOnlineSessionController({
    online,
    windowLike: window,
    createOnlineClient,
    loadArcadeIdentity,
    renderOnlineLobby,
    renderMatch,
    showScreen,
    createMatchState,
    hydrateNetworkState,
    applyAuthoritativeMatchMessage,
    getAuthoritativeSyncSeq,
    isAuthoritativeMatchMessageType,
    mergeLobbySnapshot,
    applyPlayerLeftToLobby,
    buildPlayersFromLobby,
    resetOnlineRuntimeState,
    shouldTickLobbyCountdown,
    shouldResetStartRequest,
    shouldPreserveResultsScreen,
    shouldCloseMatchToMenuOnPlayerLeft,
    getState: () => state,
    setState,
    setRawState: nextState => { state = nextState; },
    startLoop,
    isLoopRunning: () => rafId != null,
    goMenuWithNotice,
    continueAfterDisconnectedPlayer,
    applyAuthoritativeInput,
    mirrorVisibleOwnerInput,
    onlineUsesServerAuthority,
    onMatchStarting: stopMenuMusic,
    playerIdForClientId,
    queryElementById: qs,
    logWarn: (...args) => console.warn(...args),
  });

  wireGameButtons({
    onCreatePublic: async settings => {
      await unlockAudio();
      await startMenuMusic();
      setMenuNotice('');
      onlineController.disconnectOnline();
      await onlineController.startCreatePublic(settings);
    },
    onFindPublic: async () => {
      await unlockAudio();
      await startMenuMusic();
      setMenuNotice('');
      onlineController.disconnectOnline();
      await onlineController.findPublic();
    },
    onPrivate: async settings => {
      await unlockAudio();
      await startMenuMusic();
      setMenuNotice('');
      onlineController.disconnectOnline();
      await onlineController.startPrivate(settings);
    },
    onShowMenu: screen => {
      showScreen(screen || 'menu');
      if (!screen || screen === 'menu' || screen === 'onlineConfig' || screen === 'joinRoom' || screen === 'singlePlayerConfig') startMenuMusic();
    },
    onJoinPrivate: async code => {
      await unlockAudio();
      await startMenuMusic();
      setMenuNotice('');
      onlineController.disconnectOnline();
      await onlineController.joinPrivate(code);
    },
    onResetToMenu: resetToMenu,
    onStartOnlineNow: () => onlineController.requestStartNow(),
    onStartSinglePlayer: async settings => {
      await unlockAudio();
      setMenuNotice('');
      onlineController.disconnectOnline();
      const next = startSinglePlayerMatch(settings);
      setState(next, { broadcast: false });
      startLoop();
    },
  });
  inputController = createInputController({ onInput: submitInput });
  inputController.connect();
  showScreen('menu');
  startMenuMusic();
}
