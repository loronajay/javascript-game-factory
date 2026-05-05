import { PHASES, timerSecondsForLength } from './config.js';
import { activePlayers, cloneState, createMatchState, hydrateNetworkState, serializeStateForNetwork } from './state.js';
import { handleInput, tick } from './engine.js';
import { createInputController } from './input.js';
import { playFailureTone, playInputTone } from './audio.js';
import { flashInput, renderMatch, renderOnlineLobby, showScreen } from './renderer.js';
import { wireOnlineConfig } from './lobby.js';
import { createOnlineClient } from './online.js';
import { loadArcadeIdentity } from './identity.js';

let state = null;
let adapter = null;
let inputController = null;
let rafId = null;

const online = {
  net: null,
  lobby: null,
  profiles: {},
  identity: null,
  isHost: false,
  started: false,
};

function qs(id) { return document.getElementById(id); }

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
  adapter?.disconnect();
  adapter = null;
  const net = online.net;
  if (net) {
    net.leaveLobby?.();
    net.disconnect?.();
  }
  online.net = null;
  online.lobby = null;
  online.profiles = {};
  online.isHost = false;
  online.started = false;
  showScreen('menu');
  setMenuNotice(message);
}

function makePhaseTimer(length, settings) {
  const now = performance.now();
  const seconds = timerSecondsForLength(length, settings);
  return { startedAt: now, durationMs: seconds * 1000, endsAt: now + seconds * 1000 };
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
    next.phase = PHASES.OWNER_CREATE_INITIAL;
    next.activeSequence = [];
    next.ownerDraft = [];
    next.ownerReplayIndex = 0;
    next.copyProgress = {};
    next.roundResults = [];
    next.timer = null;
    next.status = `${leavingPlayer.name} disconnected. ${next.players[next.ownerIndex]?.name || 'Next player'} takes control.`;
    setState(next, { broadcast: true });
    return true;
  }

  if (next.phase === PHASES.CHALLENGER_COPY) {
    const unresolved = Object.values(next.copyProgress || {}).some(progress => progress.status === 'copying');
    if (!unresolved) {
      next.phase = PHASES.OWNER_REPLAY;
      next.ownerReplayIndex = 0;
      next.ownerDraft = [];
      next.roundResults = [];
      next.timer = makePhaseTimer(next.activeSequence.length, next.settings);
    }
  }

  next.status = `${leavingPlayer.name} disconnected and was removed from the match.`;
  setState(next, { broadcast: true });
  return true;
}


function safeParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function setState(nextState, { broadcast = true } = {}) {
  const previous = state;
  state = nextState;

  if (state.phase === PHASES.MATCH_OVER && previous?.phase !== PHASES.MATCH_OVER) {
    playFailureTone();
  }

  renderMatch(state);

  if (broadcast && state.mode === 'online' && online.isHost) {
    broadcastState();
  }
}

function broadcastState() {
  if (!state || !online.net || !online.isHost) return;
  online.net.sendState(serializeStateForNetwork(state));
}

function playerIdForClientId(clientId) {
  return clientId;
}

function makePlayersFromLobby(lobby) {
  const members = Array.isArray(lobby?.members) ? lobby.members : [];
  return members.map((clientId, index) => ({
    id: playerIdForClientId(clientId),
    clientId,
    name: online.profiles[clientId]?.displayName || (clientId === online.net?.clientId ? online.identity?.displayName : '') || `Player ${index + 1}`,
  }));
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

function submitOnlineInput(input) {
  if (!online.net || !state) return;
  playInputTone(input);
  flashInput(input);

  if (online.isHost) {
    applyAuthoritativeInput(online.net.clientId, input);
  } else {
    online.net.sendInput(input);
  }
}

function submitInput(input) {
  if (state?.mode === 'online') submitOnlineInput(input);
  else submitLocalInput(input);
}

function applyAuthoritativeInput(senderId, input) {
  if (!state || !online.isHost) return;
  const before = state;
  const after = handleInput(state, input, playerIdForClientId(senderId));
  if (after !== before) {
    const failed = after.players.some((player, index) => player.lastResult && player.lastResult !== before.players[index]?.lastResult && ['fail', 'owner-fail', 'eliminated'].includes(player.lastResult));
    if (failed) playFailureTone();
    setState(after, { broadcast: true });
  }
}

function startLoop() {
  if (rafId != null) cancelAnimationFrame(rafId);
  let lastBroadcastAt = 0;
  const frame = () => {
    if (state && state.phase !== PHASES.MATCH_OVER) {
      if (state.mode === 'online' && !online.isHost) {
        renderMatch(state);
      } else {
        const next = tick(state);
        if (next !== state) setState(next, { broadcast: true });
        else renderMatch(state);
      }

      if (state?.mode === 'online' && online.isHost) {
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
  adapter?.disconnect();
  adapter = null;
  disconnectOnline();
  showScreen('menu');
}

function disconnectOnline() {
  online.net?.leaveLobby?.();
  online.net?.disconnect?.();
  online.net = null;
  online.lobby = null;
  online.profiles = {};
  online.isHost = false;
  online.started = false;
}

async function ensureOnlineClient() {
  if (online.net) return online.net;
  online.identity = await loadArcadeIdentity();
  const net = createOnlineClient('echo-duel');
  net.setIdentity(online.identity);
  online.profiles = {};
  wireOnlineCallbacks(net);
  online.net = net;
  net.connect();
  return net;
}

function updateLobbyView(status = '') {
  if (!online.lobby) return;
  renderOnlineLobby({
    lobby: online.lobby,
    profiles: online.profiles,
    myClientId: online.net?.clientId,
    status,
  });
}

function cacheMyProfile() {
  if (!online.net?.clientId || !online.identity) return;
  online.profiles[online.net.clientId] = { ...online.identity };
}

function broadcastProfileSoon() {
  window.setTimeout(() => online.net?.sendProfile(), 50);
  window.setTimeout(() => online.net?.sendProfile(), 450);
}

function wireOnlineCallbacks(net) {
  net.cb.onConnected = () => {
    cacheMyProfile();
    if (online.pendingAction) {
      online.pendingAction();
      online.pendingAction = null;
    }
  };

  net.cb.onLobbyJoined = payload => {
    online.lobby = payload;
    online.isHost = payload.ownerId === net.clientId;
    cacheMyProfile();
    updateLobbyView(payload.created ? 'Lobby created.' : 'Joined lobby.');
    broadcastProfileSoon();
  };

  net.cb.onLobbyUpdated = payload => {
    online.lobby = { ...(online.lobby || {}), ...payload };
    online.isHost = payload.ownerId === net.clientId;
    updateLobbyView();
    broadcastProfileSoon();
  };

  net.cb.onLobbyCountdownStarted = payload => {
    online.lobby = { ...(online.lobby || {}), ...payload };
    online.isHost = payload.ownerId === net.clientId;
    updateLobbyView();
  };

  net.cb.onPlayerJoined = () => {
    broadcastProfileSoon();
  };

  net.cb.onPlayerLeft = payload => {
    const leavingHost = state?.network?.hostId && payload.clientId === state.network.hostId;

    if (state?.mode === 'online' && online.started && state.phase !== PHASES.MATCH_OVER) {
      if (leavingHost && !online.isHost) {
        goMenuWithNotice('The lobby host disconnected. The online match was closed.');
        return;
      }

      if (online.isHost) {
        continueAfterDisconnectedPlayer(payload.clientId, leavingHost ? 'host-left' : 'disconnect');
        return;
      }
    }

    if (online.lobby) {
      online.lobby = {
        ...online.lobby,
        playerCount: payload.playerCount,
        ownerId: payload.ownerId,
        members: Array.isArray(online.lobby.members)
          ? online.lobby.members.filter(memberId => memberId !== payload.clientId)
          : online.lobby.members,
      };
      online.isHost = payload.ownerId === net.clientId;
    }

    if (!online.started && Number(payload.playerCount) < 2) {
      goMenuWithNotice('Your partner disconnected. The lobby was closed.');
      return;
    }

    updateLobbyView('A player left.');
  };

  net.cb.onLobbyStarted = payload => {
    online.lobby = { ...(online.lobby || {}), ...payload, status: 'started' };
    online.isHost = payload.ownerId === net.clientId;
    online.started = true;
    const members = payload.members || online.lobby.members || [];
    online.lobby.members = members;
    const start = () => {
      if (online.isHost) {
        const players = makePlayersFromLobby(online.lobby);
        const matchState = createMatchState({
          mode: 'online',
          seed: payload.seed,
          playerCount: players.length,
          players,
          penaltyWord: payload.settings?.penaltyWord || online.lobby.settings?.penaltyWord || 'ECHO',
          network: { roomCode: payload.roomCode, hostId: payload.ownerId, myClientId: net.clientId },
        });
        setState(matchState, { broadcast: true });
        startLoop();
      } else {
        showScreen('match');
      }
    };
    const delay = Math.max(0, Number(payload.startAt || 0) - Date.now());
    window.setTimeout(start, delay);
  };

  net.cb.onLobbyMessage = ({ messageType, value, senderId }) => {
    if (messageType === 'profile') {
      const profile = safeParse(value);
      if (profile?.displayName) {
        online.profiles[senderId] = {
          playerId: profile.playerId || '',
          displayName: String(profile.displayName).slice(0, 18),
        };
        if (online.lobby && online.lobby.status !== 'started') updateLobbyView();
      }
      return;
    }

    if (messageType === 'input') {
      if (!online.isHost) return;
      const msg = safeParse(value);
      if (msg?.input) applyAuthoritativeInput(senderId, msg.input);
      return;
    }

    if (messageType === 'state_sync') {
      if (online.isHost) return;
      const snapshot = safeParse(value);
      const hydrated = hydrateNetworkState(snapshot);
      if (hydrated) {
        state = hydrated;
        renderMatch(state);
        if (!rafId) startLoop();
      }
    }
  };

  net.cb.onError = (code, message) => {
    console.warn('Echo Duel network error:', code, message);
    const err = qs('join-room-error') || qs('online-error');
    if (err) {
      err.textContent = message || code || 'Network error';
      err.classList.remove('hidden');
    }
  };

  net.cb.onClosed = () => {
    if (state?.mode === 'online' && state.phase !== PHASES.MATCH_OVER) {
      goMenuWithNotice('Connection lost. You were returned to the menu.');
    }
  };
}

async function startCreatePublicOnline(settings) {
  setMenuNotice('');
  disconnectOnline();
  const net = await ensureOnlineClient();
  online.pendingAction = () => net.createLobby({ ...settings, isPrivate: false });
  if (net.clientId) online.pendingAction();
  showScreen('onlineLobby');
}

async function findPublicOnline() {
  setMenuNotice('');
  disconnectOnline();
  const net = await ensureOnlineClient();
  const defaults = { minPlayers: 2, maxPlayers: 6, penaltyWord: 'STATIC' };
  online.pendingAction = () => net.findLobby(defaults);
  if (net.clientId) online.pendingAction();
  showScreen('onlineLobby');
}

async function startPrivateOnline(settings) {
  setMenuNotice('');
  disconnectOnline();
  const net = await ensureOnlineClient();
  online.pendingAction = () => net.createLobby({ ...settings, isPrivate: true });
  if (net.clientId) online.pendingAction();
  showScreen('onlineLobby');
}

async function joinPrivateOnline(code) {
  setMenuNotice('');
  disconnectOnline();
  const net = await ensureOnlineClient();
  online.pendingAction = () => net.joinLobby(code);
  if (net.clientId) online.pendingAction();
  showScreen('onlineLobby');
}

function wireButtons() {
  const onlineConfig = wireOnlineConfig({
    onCreatePublic: settings => startCreatePublicOnline(settings),
    onFindPublic: () => findPublicOnline(),
    onPrivate: settings => startPrivateOnline(settings),
    onBack: () => showScreen('menu'),
  });

  qs('btn-create-public')?.addEventListener('click', () => onlineConfig.configure('create-public'));
  qs('btn-public')?.addEventListener('click', () => onlineConfig.findPublic());
  qs('btn-private')?.addEventListener('click', () => onlineConfig.configure('private'));
  qs('btn-join-private')?.addEventListener('click', () => showScreen('joinRoom'));

  qs('btn-submit-private-join')?.addEventListener('click', () => {
    const code = qs('join-room-code')?.value?.trim().toUpperCase();
    const err = qs('join-room-error');
    if (!code || code.length < 4) {
      if (err) { err.textContent = 'Enter a valid room code.'; err.classList.remove('hidden'); }
      return;
    }
    err?.classList.add('hidden');
    joinPrivateOnline(code);
  });

  qs('btn-cancel-private-join')?.addEventListener('click', () => showScreen('menu'));
  qs('btn-online-leave')?.addEventListener('click', resetToMenu);
  qs('btn-online-start-now')?.addEventListener('click', () => online.net?.startLobby());

  qs('btn-reset-match')?.addEventListener('click', () => {
    if (!state) return;
    if (state.mode === 'online') {
      if (online.isHost) {
        const players = state.players.map(p => ({ id: p.id, clientId: p.clientId, name: p.name }));
        setState(createMatchState({
          mode: 'online',
          players,
          playerCount: players.length,
          penaltyWord: state.settings.penaltyWord,
          network: state.network,
        }), { broadcast: true });
      }
      return;
    }
    resetToMenu();
  });

  qs('btn-exit')?.addEventListener('click', resetToMenu);
  qs('btn-ended-menu')?.addEventListener('click', resetToMenu);
  qs('btn-rematch')?.addEventListener('click', () => {
    if (!state) return;
    if (state.mode === 'online') {
      if (online.isHost) {
        const players = state.players.map(p => ({ id: p.id, clientId: p.clientId, name: p.name }));
        setState(createMatchState({
          mode: 'online',
          players,
          playerCount: players.length,
          penaltyWord: state.settings.penaltyWord,
          network: state.network,
        }), { broadcast: true });
      }
      return;
    }
    resetToMenu();
  });
}

export function initGame() {
  wireButtons();
  inputController = createInputController({ onInput: submitInput });
  inputController.connect();
  showScreen('menu');
}
