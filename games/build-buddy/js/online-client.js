import {
  createBuilderCommandMessage,
  createRunnerInputMessage,
  createStateSyncMessage,
} from './online-gameplay.js';

export const BUILD_BUDDY_GAME_ID = 'build-buddy';
export const BUILD_BUDDY_PROTOCOL_VERSION = 1;

const PROD_WS_URL = 'wss://factory-network-server-production.up.railway.app';
const LOCAL_WS_PORT = '3000';
const DEFAULT_RUN_FORMAT = 'canon_10_stage';
const DEFAULT_PACK_ID = 'pack_01';

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
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function boundedText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maxLength).trim() || fallback;
}

export function sanitizeOnlineIdentity(identity) {
  return {
    playerId: boundedText(identity?.playerId, '', 64),
    displayName: boundedText(identity?.displayName, 'Player', 24),
  };
}

function buildLobbySettings(settings = {}) {
  return {
    packId: boundedText(settings.packId, DEFAULT_PACK_ID, 32),
    runFormat: boundedText(settings.runFormat, DEFAULT_RUN_FORMAT, 32),
    protocolVersion: BUILD_BUDDY_PROTOCOL_VERSION,
  };
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

function normalizeLobby(data = {}) {
  const members = Array.isArray(data.members)
    ? data.members.filter((memberId) => typeof memberId === 'string' && memberId)
    : [];
  return {
    roomCode: normalizeRoomCode(data.roomCode),
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    members,
    playerCount: Number.isFinite(Number(data.playerCount)) ? Number(data.playerCount) : members.length,
    minPlayers: Number.isFinite(Number(data.minPlayers)) ? Number(data.minPlayers) : 2,
    maxPlayers: Number.isFinite(Number(data.maxPlayers)) ? Number(data.maxPlayers) : 2,
    status: typeof data.status === 'string' ? data.status : 'open',
    isPrivate: data.isPrivate === true,
    settings: data.settings && typeof data.settings === 'object' ? { ...data.settings } : {},
    startAt: data.startAt ?? null,
  };
}

function attachSocketListener(ws, eventName, handler) {
  if (typeof ws.addEventListener === 'function') ws.addEventListener(eventName, handler);
  else ws[`on${eventName}`] = handler;
}

function createInitialSnapshot() {
  return {
    status: 'idle',
    clientId: '',
    lobby: null,
    profiles: {},
    readyByPlayerId: {},
    onlineGameplay: {
      lastStageStart: null,
      lastRunnerInput: null,
      lastBuilderCommand: null,
      lastStateSync: null,
      lastStageResult: null,
      lastRunComplete: null,
      lastMatchState: null,
      lastRunnerState: null,
      lastBuilderCursor: null,
    },
    error: null,
  };
}

function createOptions(input) {
  if (typeof input === 'string') return { gameId: input };
  return input && typeof input === 'object' ? input : {};
}

export function createOnlineClient(input = {}) {
  const options = createOptions(input);
  const gameId = options.gameId || BUILD_BUDDY_GAME_ID;
  const WebSocketCtor = options.WebSocketCtor || globalThis.WebSocket;
  const wsUrl = options.wsUrl || resolveWebSocketUrl(options.locationLike || globalThis.location);
  let ws = null;
  let identity = sanitizeOnlineIdentity(null);
  let snapshot = createInitialSnapshot();
  let pendingSends = [];
  const subscribers = new Set();

  function emit(patch = {}) {
    snapshot = { ...snapshot, ...patch };
    const readonlySnapshot = getSnapshot();
    for (const subscriber of subscribers) subscriber(readonlySnapshot);
  }

  function getSnapshot() {
    return {
      ...snapshot,
      lobby: snapshot.lobby ? { ...snapshot.lobby, members: [...snapshot.lobby.members] } : null,
      profiles: structuredClone(snapshot.profiles),
      readyByPlayerId: { ...snapshot.readyByPlayerId },
      onlineGameplay: structuredClone(snapshot.onlineGameplay),
      error: snapshot.error ? { ...snapshot.error } : null,
    };
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocketCtor.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    pendingSends.push(payload);
  }

  function flushPendingSends() {
    if (!ws || ws.readyState !== WebSocketCtor.OPEN) return;
    for (const payload of pendingSends) {
      ws.send(JSON.stringify(payload));
    }
    pendingSends = [];
  }

  function lobbyMessage(messageType, value = {}) {
    send({
      type: 'lobby_message',
      messageType,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    });
  }

  function applyLobbyEvent(data) {
    emit({
      status: 'lobby',
      lobby: normalizeLobby(data),
      error: null,
    });
  }

  function applyLobbyMessage(data) {
    const senderId = typeof data.senderId === 'string' ? data.senderId : '';
    const gameplayMessageTypes = new Set(['stage_start', 'runner_input', 'builder_command', 'state_sync', 'stage_result', 'run_complete', 'match_state', 'match_ended']);
    if (!senderId || (senderId === snapshot.clientId && !gameplayMessageTypes.has(data.messageType))) return;

    const value = parseJson(data.value);
    if (data.messageType === 'profile') {
      emit({
        profiles: {
          ...snapshot.profiles,
          [senderId]: sanitizeOnlineIdentity(value),
        },
      });
    }
    if (data.messageType === 'ready') {
      emit({
        readyByPlayerId: {
          ...snapshot.readyByPlayerId,
          [senderId]: value?.ready === true && value?.protocolVersion === BUILD_BUDDY_PROTOCOL_VERSION,
        },
      });
    }
    if (data.messageType === 'stage_start') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastStageStart: { senderId, value },
        },
      });
    }
    if (data.messageType === 'runner_input') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastRunnerInput: { senderId, value: createRunnerInputMessage(value).value },
        },
      });
    }
    if (data.messageType === 'builder_command') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastBuilderCommand: { senderId, value: createBuilderCommandMessage(value).value },
        },
      });
    }
    if (data.messageType === 'state_sync') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastStateSync: { senderId, ...createStateSyncMessage(value).value },
        },
      });
    }
    if (data.messageType === 'stage_result') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastStageResult: { senderId, value },
        },
      });
    }
    if (data.messageType === 'run_complete') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastRunComplete: { senderId, value },
        },
      });
    }
    if (data.messageType === 'match_state' || data.messageType === 'match_ended') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastMatchState: { senderId, value },
        },
      });
    }
    if (data.messageType === 'runner_state') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastRunnerState: { senderId, value },
        },
      });
    }
    if (data.messageType === 'builder_cursor') {
      emit({
        onlineGameplay: {
          ...snapshot.onlineGameplay,
          lastBuilderCursor: { senderId, value },
        },
      });
    }
  }

  function handleEvent(data) {
    if (data.event === 'connected') {
      emit({ status: 'connected', clientId: typeof data.clientId === 'string' ? data.clientId : '', error: null });
      return;
    }
    if (data.event === 'lobby_joined' || data.event === 'lobby_updated') {
      applyLobbyEvent(data);
      return;
    }
    if (data.event === 'lobby_player_joined' || data.event === 'lobby_player_left') {
      emit({ status: 'lobby' });
      return;
    }
    if (data.event === 'lobby_started') {
      emit({
        status: 'started',
        onlineGameplay: data.matchState
          ? { ...snapshot.onlineGameplay, lastMatchState: { senderId: 'server', value: data.matchState } }
          : snapshot.onlineGameplay,
      });
      return;
    }
    if (data.event === 'lobby_left') {
      emit({ status: 'idle', lobby: null, readyByPlayerId: {}, error: null });
      return;
    }
    if (data.event === 'message' && data.scope === 'lobby') {
      applyLobbyMessage(data);
      return;
    }
    if (data.event === 'error') {
      emit({
        status: snapshot.status === 'idle' ? 'error' : snapshot.status,
        error: {
          code: typeof data.code === 'string' ? data.code : 'ERROR',
          message: typeof data.message === 'string' ? data.message : 'Online error',
        },
      });
    }
  }

  function connect() {
    if (ws || !WebSocketCtor) return;
    ws = new WebSocketCtor(wsUrl);
    emit({ status: 'connecting', error: null });
    attachSocketListener(ws, 'message', (event) => {
      const data = parseJson(event.data);
      if (data) handleEvent(data);
    });
    attachSocketListener(ws, 'open', () => {
      flushPendingSends();
    });
    attachSocketListener(ws, 'error', () => {
      emit({ error: { code: 'WS_ERROR', message: 'Connection error' } });
    });
    attachSocketListener(ws, 'close', () => {
      ws = null;
      emit({ status: 'idle', clientId: '', lobby: null, readyByPlayerId: {} });
    });
  }

  function setIdentity(nextIdentity) {
    identity = sanitizeOnlineIdentity(nextIdentity);
  }

  function createLobby(settings = {}) {
    send({
      type: 'create_lobby',
      gameId,
      minPlayers: 2,
      maxPlayers: 2,
      private: true,
      settings: buildLobbySettings(settings),
      identity,
    });
    emit({ status: 'creating' });
  }

  function findLobby(settings = {}) {
    send({
      type: 'find_lobby',
      gameId,
      minPlayers: 2,
      maxPlayers: 2,
      private: false,
      createIfMissing: true,
      settings: buildLobbySettings(settings),
      identity,
    });
    emit({ status: 'searching' });
  }

  function joinLobby(roomCode) {
    send({
      type: 'join_lobby',
      gameId,
      roomCode: normalizeRoomCode(roomCode),
      identity,
    });
    emit({ status: 'joining' });
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

  function sendReady(ready = true) {
    if (snapshot.clientId) {
      emit({
        readyByPlayerId: {
          ...snapshot.readyByPlayerId,
          [snapshot.clientId]: ready === true,
        },
      });
    }
    lobbyMessage('ready', { ready: ready === true, protocolVersion: BUILD_BUDDY_PROTOCOL_VERSION });
  }

  function sendInput(input, meta = {}) {
    lobbyMessage('runner_input', createRunnerInputMessage({ ...input, tick: meta.tick ?? input?.tick }).value);
  }

  function sendBuilderCommand(command, meta = {}) {
    lobbyMessage('builder_command', createBuilderCommandMessage({ ...command, tick: meta.tick ?? command?.tick }).value);
  }

  function sendState(stateSnapshot) {
    lobbyMessage('state_sync', createStateSyncMessage(stateSnapshot).value);
  }

  function sendOnlineGameplayMessage(message) {
    if (!message?.messageType) return;
    lobbyMessage(message.messageType, message.value ?? {});
  }

  function disconnect() {
    ws?.close();
    ws = null;
    pendingSends = [];
    emit({ status: 'idle', clientId: '', lobby: null, readyByPlayerId: {} });
  }

  function subscribe(subscriber) {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return {
    connect,
    setIdentity,
    createLobby,
    findLobby,
    joinLobby,
    startLobby,
    leaveLobby,
    sendProfile,
    sendReady,
    sendInput,
    sendBuilderCommand,
    sendState,
    sendOnlineGameplayMessage,
    lobbyMessage,
    disconnect,
    subscribe,
    getSnapshot,
    get clientId() {
      return snapshot.clientId;
    },
    get identity() {
      return { ...identity };
    },
  };
}
