// online.js — Echo Duel WebSocket lobby client.
// Raw WebSocket access stays isolated here, matching the other platform games.

const PROD_WS_URL = 'wss://factory-network-server-production.up.railway.app';
const LOCAL_WS_PORT = '3000';

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function resolveWebSocketUrl(locationLike = globalThis.location) {
  const protocol = typeof locationLike?.protocol === 'string' ? locationLike.protocol : '';
  const hostname = typeof locationLike?.hostname === 'string' ? locationLike.hostname : '';
  if (isLocalHostname(hostname)) {
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${hostname}:${LOCAL_WS_PORT}`;
  }
  return PROD_WS_URL;
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function sanitizeIdentity(identity) {
  const displayName = typeof identity?.displayName === 'string' && identity.displayName.trim()
    ? identity.displayName.trim().slice(0, 18)
    : 'Player';
  return {
    playerId: typeof identity?.playerId === 'string' ? identity.playerId : '',
    displayName,
  };
}

export function createOnlineClient(gameId = 'echo-duel') {
  const wsUrl = resolveWebSocketUrl();
  let ws = null;
  let clientId = null;
  let identity = sanitizeIdentity(null);
  let inputId = 0;

  const cb = {
    onConnected: null,
    onLobbyJoined: null,
    onLobbyUpdated: null,
    onLobbyCountdownStarted: null,
    onLobbyStarted: null,
    onLobbyMessage: null,
    onLobbyLeft: null,
    onPlayerJoined: null,
    onPlayerLeft: null,
    onError: null,
    onClosed: null,
  };

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  function lobbyMessage(messageType, value = '') {
    send({
      type: 'lobby_message',
      messageType,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    });
  }

  function handleEvent(data) {
    if (data.event === 'connected') {
      clientId = data.clientId;
      inputId = 0;
      cb.onConnected?.({ clientId });
      return;
    }

    if (data.event === 'lobby_joined') {
      cb.onLobbyJoined?.({ ...data, clientId });
      return;
    }

    if (data.event === 'lobby_updated') {
      cb.onLobbyUpdated?.({ ...data, clientId });
      return;
    }

    if (data.event === 'lobby_countdown_started') {
      cb.onLobbyCountdownStarted?.({ ...data, clientId });
      return;
    }

    if (data.event === 'lobby_started') {
      cb.onLobbyStarted?.({ ...data, clientId });
      return;
    }

    if (data.event === 'lobby_left') {
      cb.onLobbyLeft?.(data);
      return;
    }

    if (data.event === 'lobby_player_joined') {
      cb.onPlayerJoined?.(data);
      return;
    }

    if (data.event === 'lobby_player_left') {
      cb.onPlayerLeft?.(data);
      return;
    }

    if (data.event === 'message' && data.scope === 'lobby') {
      if (data.senderId === clientId && data.messageType !== 'state_sync') return;
      cb.onLobbyMessage?.({
        messageType: data.messageType,
        value: data.value,
        senderId: data.senderId,
        roomCode: data.roomCode,
      });
      return;
    }

    if (data.event === 'error') {
      cb.onError?.(data.code, data.message);
    }
  }

  function connect() {
    if (ws) return;
    ws = new WebSocket(wsUrl);
    ws.addEventListener('message', event => {
      const data = parseJson(event.data);
      if (data) handleEvent(data);
    });
    ws.addEventListener('error', () => cb.onError?.('WS_ERROR', 'Connection error'));
    ws.addEventListener('close', () => {
      ws = null;
      clientId = null;
      cb.onClosed?.();
    });
  }

  function setIdentity(nextIdentity) {
    identity = sanitizeIdentity(nextIdentity);
  }

  function createLobby({ minPlayers, maxPlayers, penaltyWord, isPrivate = false, countdownMs = 20000 }) {
    send({
      type: 'create_lobby',
      gameId,
      private: !!isPrivate,
      minPlayers,
      maxPlayers,
      countdownMs,
      settings: { penaltyWord },
      identity,
    });
  }

  function findLobby({ minPlayers, maxPlayers, penaltyWord, countdownMs = 20000 }) {
    send({
      type: 'find_lobby',
      gameId,
      minPlayers,
      maxPlayers,
      countdownMs,
      settings: { penaltyWord },
      identity,
    });
  }

  function joinLobby(roomCode) {
    send({ type: 'join_lobby', gameId, roomCode: String(roomCode || '').trim().toUpperCase(), identity });
  }

  function updateLobbySettings({ minPlayers, maxPlayers, penaltyWord }) {
    send({ type: 'update_lobby_settings', minPlayers, maxPlayers, settings: { penaltyWord } });
  }

  function startLobby() {
    send({ type: 'start_lobby' });
  }

  function leaveLobby() {
    send({ type: 'leave_lobby' });
  }

  function sendProfile() {
    lobbyMessage('profile', identity);
  }

  function sendInput(input, meta = {}) {
    lobbyMessage('input', {
      input,
      inputId: ++inputId,
      phaseId: Number(meta.phaseId),
      turnId: Number(meta.turnId),
      clientTime: Date.now(),
    });
  }

  function sendState(stateSnapshot) {
    lobbyMessage('state_sync', stateSnapshot);
  }

  function disconnect() {
    ws?.close();
    ws = null;
    clientId = null;
    inputId = 0;
  }

  return {
    connect,
    setIdentity,
    createLobby,
    findLobby,
    joinLobby,
    updateLobbySettings,
    startLobby,
    leaveLobby,
    sendProfile,
    sendInput,
    sendState,
    lobbyMessage,
    disconnect,
    get clientId() { return clientId; },
    get identity() { return { ...identity }; },
    cb,
  };
}
