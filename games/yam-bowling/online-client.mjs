export const YAM_BOWLING_GAME_ID = "yam-bowling";
export const YAM_BOWLING_PROTOCOL_VERSION = 2;

const PROD_WS_URL = "wss://factory-network-server-production.up.railway.app";
const LOCAL_WS_PORT = "3000";
const SESSION_STORAGE_KEY = "yam-bowling.online-session.v1";

function clamp(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function boundedText(value, maxLength, fallback = "") {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (text || fallback).slice(0, maxLength).trim();
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readSession(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(SESSION_STORAGE_KEY) || "null");
    if (!parsed?.clientId || !parsed?.sessionToken) return null;
    return { clientId: String(parsed.clientId), sessionToken: String(parsed.sessionToken) };
  } catch {
    return null;
  }
}

function writeSession(storage, session) {
  if (!session?.clientId || !session?.sessionToken) return;
  try {
    storage?.setItem?.(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage is a reconnect optimization, never a prerequisite for online play.
  }
}

function clearSession(storage) {
  try {
    storage?.removeItem?.(SESSION_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

function normalizeModeId(modeId) {
  return modeId === "classic" ? "classic" : "quick";
}

const PRESENTATION_FIELDS = Object.freeze([
  "ballTrailId", "strikeBurstId", "victoryPoseId", "playerCardId", "profileIconId", "entranceId",
]);

// The presentation fields that are lists rather than ids: the two reaction
// wheels. They are bounded here as well as on the server, because a wheel's
// length is what a slot index is checked against, and an unbounded list on the
// wire is an unbounded index to validate.
const REACTION_WHEEL_FIELDS = Object.freeze({ emote: "emoteIds", "catch-line": "catchLineIds" });
const REACTION_WHEEL_SIZE = 4;

function sanitizeWheel(raw) {
  return Array.from(
    { length: REACTION_WHEEL_SIZE },
    (_unused, index) => boundedText(Array.isArray(raw) ? raw[index] : "", 96),
  );
}

function sanitizePresentation(raw) {
  return {
    ...Object.fromEntries(PRESENTATION_FIELDS.map((key) => [key, boundedText(raw?.[key], 96)])),
    ...Object.fromEntries(Object.values(REACTION_WHEEL_FIELDS)
      .map((field) => [field, sanitizeWheel(raw?.[field])])),
  };
}

export function resolveWebSocketUrl(locationLike = globalThis.location) {
  const hostname = typeof locationLike?.hostname === "string" ? locationLike.hostname : "";
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return `${locationLike?.protocol === "https:" ? "wss:" : "ws:"}//${hostname}:${LOCAL_WS_PORT}`;
  }
  return PROD_WS_URL;
}

export function normalizeRoomCode(value) {
  return boundedText(value, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function sanitizeOnlineIdentity(identity) {
  return {
    playerId: boundedText(identity?.playerId, 64),
    displayName: boundedText(identity?.displayName, 24, "Player"),
  };
}

export function sanitizeShot(shot = {}) {
  return {
    position: clamp(shot.position, -0.46, 0.46, 0),
    aim: clamp(shot.aim, -0.45, 0.45, 0.1),
    hook: clamp(shot.hook, -1, 1, 0),
    power: clamp(shot.power, 0.08, 1, 0.78),
    release: clamp(shot.release, -0.035, 0.035, 0),
    ballIndex: Math.round(clamp(shot.ballIndex, 0, 7, 0)),
  };
}

function normalizeLobby(data = {}) {
  const members = Array.isArray(data.members) ? data.members.filter((id) => typeof id === "string" && id) : [];
  const players = Array.isArray(data.players)
      ? data.players.map((player, index) => ({
        id: boundedText(player?.id, 80, members[index] || `player-${index + 1}`),
        playerId: boundedText(player?.playerId || player?.accountPlayerId, 64),
        name: boundedText(player?.name, 24, `Player ${index + 1}`),
        characterSlug: boundedText(player?.characterSlug, 64),
        skinId: boundedText(player?.skinId, 40),
        presentation: sanitizePresentation(player?.presentation),
      }))
    : members.map((id, index) => ({ id, name: `Player ${index + 1}` }));
  return {
    roomCode: normalizeRoomCode(data.roomCode),
    ownerId: boundedText(data.ownerId, 80),
    members,
    players,
    playerCount: Number.isFinite(Number(data.playerCount)) ? Number(data.playerCount) : members.length,
    minPlayers: 2,
    maxPlayers: 2,
    status: boundedText(data.status, 20, "open"),
    isPrivate: data.isPrivate === true,
    settings: {
      matchType: normalizeModeId(data.settings?.matchType),
      protocolVersion: Number(data.settings?.protocolVersion) || 1,
    },
    startAt: Number.isFinite(Number(data.startAt)) ? Number(data.startAt) : null,
  };
}

function attach(ws, eventName, handler) {
  if (typeof ws.addEventListener === "function") ws.addEventListener(eventName, handler);
  else ws[`on${eventName}`] = handler;
}

export function createOnlineClient(options = {}) {
  const WebSocketCtor = options.WebSocketCtor || globalThis.WebSocket;
  const wsUrl = options.wsUrl || resolveWebSocketUrl(options.locationLike || globalThis.location);
  const storage = options.storage || globalThis.sessionStorage || globalThis.localStorage;
  const setTimer = options.setTimer || globalThis.setTimeout;
  const reconnectDelayMs = Number.isFinite(Number(options.reconnectDelayMs)) ? Number(options.reconnectDelayMs) : 1500;
  let socket = null;
  let identity = sanitizeOnlineIdentity(null);
  let selectedCharacterSlug = "daisy-monroe";
  let selectedSkinId = "canon";
  let selectedPresentation = sanitizePresentation(null);
  let pending = [];
  let manualClose = false;
  let resumeCredentials = null;
  let newConnectionSession = null;
  let snapshot = {
    status: "idle",
    clientId: "",
    lobby: null,
    matchState: null,
    disconnectedClientId: "",
    reconnectExpiresAt: null,
    error: null,
    lastReaction: null,
  };
  const subscribers = new Set();

  function getSnapshot() {
    return {
      ...snapshot,
      lobby: snapshot.lobby
        ? { ...snapshot.lobby, members: [...snapshot.lobby.members], players: snapshot.lobby.players.map((player) => ({ ...player })) }
        : null,
      matchState: snapshot.matchState ? { ...snapshot.matchState } : null,
      error: snapshot.error ? { ...snapshot.error } : null,
      lastReaction: snapshot.lastReaction ? { ...snapshot.lastReaction } : null,
    };
  }

  function emit(patch = {}) {
    snapshot = { ...snapshot, ...patch };
    const value = getSnapshot();
    for (const subscriber of subscribers) subscriber(value);
  }

  function send(payload) {
    if (socket?.readyState === WebSocketCtor.OPEN) socket.send(JSON.stringify(payload));
    else pending.push(payload);
  }

  function flush() {
    if (socket?.readyState !== WebSocketCtor.OPEN) return;
    for (const payload of pending) socket.send(JSON.stringify(payload));
    pending = [];
  }

  function lobbyMessage(messageType, value = {}) {
    send({ type: "lobby_message", messageType, value: typeof value === "string" ? value : JSON.stringify(value) });
  }

  function publishProfile() {
    lobbyMessage("yam_profile", {
      ...identity,
      characterSlug: selectedCharacterSlug,
      skinId: selectedSkinId,
      presentation: selectedPresentation,
      protocolVersion: YAM_BOWLING_PROTOCOL_VERSION,
    });
  }

  function handlePayload(data) {
    if (data.event === "connected") {
      const nextSession = { clientId: boundedText(data.clientId, 80), sessionToken: boundedText(data.sessionToken, 200) };
      newConnectionSession = nextSession;
      emit({ status: resumeCredentials ? "reconnecting" : "connected", clientId: nextSession.clientId, error: null });
      if (resumeCredentials) {
        send({ type: "resume_lobby", ...resumeCredentials });
      } else {
        writeSession(storage, nextSession);
      }
      return;
    }

    if (data.event === "session_resumed") {
      resumeCredentials = null;
      const resumed = { clientId: boundedText(data.clientId, 80), sessionToken: boundedText(data.sessionToken, 200) };
      writeSession(storage, resumed);
      emit({ status: "started", clientId: resumed.clientId, disconnectedClientId: "", reconnectExpiresAt: null, error: null });
      return;
    }

    if (data.event === "lobby_joined" || data.event === "lobby_updated") {
      const lobby = normalizeLobby(data);
      const status = lobby.status === "started"
        ? "started"
        : lobby.status === "ended"
          ? "complete"
          : "lobby";
      emit({ status, lobby, error: null });
      if (data.event === "lobby_joined") publishProfile();
      return;
    }

    if (data.event === "lobby_started") {
      emit({
        status: "started",
        lobby: snapshot.lobby ? { ...snapshot.lobby, status: "started", roomCode: normalizeRoomCode(data.roomCode) || snapshot.lobby.roomCode } : snapshot.lobby,
        matchState: data.matchState || snapshot.matchState,
        disconnectedClientId: "",
        reconnectExpiresAt: null,
        error: null,
      });
      return;
    }

    if (data.event === "message" && data.scope === "lobby" && (data.messageType === "yam_match" || data.messageType === "yam_match_ended")) {
      const matchState = parseJson(data.value);
      if (matchState) emit({ status: matchState.phase === "complete" ? "complete" : "started", matchState, error: null });
      return;
    }

    if (data.event === "message" && data.scope === "lobby" && data.messageType === "yam_reaction") {
      const value = parseJson(data.value);
      const senderClientId = boundedText(value?.senderClientId, 80);
      // The server resolved the slot into a whole item id, so the id's own
      // prefix is the kind. Trusting the prefix rather than a separate `kind`
      // field is what stops the two from ever arriving in disagreement.
      const reactionId = boundedText(value?.reactionId, 96);
      const sequence = Number(value?.sequence);
      const kind = Object.keys(REACTION_WHEEL_FIELDS)
        .find((entry) => new RegExp(`^${entry}:[a-z0-9-]{1,64}$`).test(reactionId)) || "";
      if (senderClientId && kind && Number.isInteger(sequence) && sequence > 0) {
        emit({ lastReaction: { senderClientId, kind, reactionId, sequence } });
      }
      return;
    }

    if (data.event === "lobby_player_disconnected") {
      emit({ disconnectedClientId: boundedText(data.clientId, 80), reconnectExpiresAt: Number(data.reconnectExpiresAt) || null });
      return;
    }

    if (data.event === "lobby_player_reconnected") {
      emit({ disconnectedClientId: "", reconnectExpiresAt: null });
      return;
    }

    if (data.event === "lobby_left" || data.event === "lobby_closed") {
      clearSession(storage);
      emit({ status: "idle", lobby: null, matchState: null, disconnectedClientId: "", reconnectExpiresAt: null });
      return;
    }

    if (data.event === "error") {
      if (data.code === "RESUME_REJECTED") {
        resumeCredentials = null;
        clearSession(storage);
        writeSession(storage, newConnectionSession);
        emit({ status: "idle", lobby: null, matchState: null });
      }
      emit({ error: { code: boundedText(data.code, 60, "ONLINE_ERROR"), message: boundedText(data.message, 160, "Online error") } });
    }
  }

  function connect() {
    if (socket || !WebSocketCtor) return;
    manualClose = false;
    socket = new WebSocketCtor(wsUrl);
    emit({ status: resumeCredentials ? "reconnecting" : "connecting", error: null });
    attach(socket, "open", flush);
    attach(socket, "message", (event) => {
      const payload = parseJson(event.data);
      if (payload) handlePayload(payload);
    });
    attach(socket, "error", () => emit({ error: { code: "WS_ERROR", message: "Unable to reach the Factory Network server." } }));
    attach(socket, "close", () => {
      socket = null;
      const shouldResume = !manualClose && Boolean(snapshot.matchState || snapshot.lobby?.status === "started");
      if (shouldResume) {
        resumeCredentials = readSession(storage);
        emit({ status: "reconnecting", error: { code: "CONNECTION_LOST", message: "Connection lost. Rejoining your lane…" } });
        setTimer(() => connect(), reconnectDelayMs);
      } else {
        emit({ status: "idle", clientId: "", lobby: null });
      }
    });
  }

  function resumeSavedSession() {
    if (socket) return Boolean(resumeCredentials);
    resumeCredentials = readSession(storage);
    if (!resumeCredentials) return false;
    connect();
    return true;
  }

  function setIdentity(value) {
    identity = sanitizeOnlineIdentity(value);
  }

  function lobbyRequest(type, { modeId = "quick", characterSlug = "daisy-monroe", skinId = "canon", presentation = {}, roomCode = "", privateRoom = false } = {}) {
    selectedCharacterSlug = boundedText(characterSlug, 64, "daisy-monroe");
    selectedSkinId = boundedText(skinId, 40, "canon");
    selectedPresentation = sanitizePresentation(presentation);
    const payload = {
      type,
      gameId: YAM_BOWLING_GAME_ID,
      ...(type === "join_lobby" ? { roomCode: normalizeRoomCode(roomCode) } : {
        minPlayers: 2,
        maxPlayers: 2,
        private: privateRoom,
        settings: { matchType: normalizeModeId(modeId), protocolVersion: YAM_BOWLING_PROTOCOL_VERSION },
      }),
      identity,
    };
    send(payload);
    emit({ status: type === "find_lobby" ? "searching" : type === "create_lobby" ? "creating" : "joining", error: null });
  }

  function findQuickMatch(options = {}) {
    lobbyRequest("find_lobby", { ...options, privateRoom: false });
  }

  function createPrivateRoom(options = {}) {
    lobbyRequest("create_lobby", { ...options, privateRoom: true });
  }

  function joinPrivateRoom(roomCode, options = {}) {
    lobbyRequest("join_lobby", { ...options, roomCode });
  }

  function startLobby() {
    send({ type: "start_lobby" });
  }

  function submitShot(shot) {
    lobbyMessage("yam_shot", {
      ...sanitizeShot(shot),
      expectedRollNumber: Number(snapshot.matchState?.rollNumber) || 0,
    });
  }

  function requestRematch() {
    lobbyMessage("yam_rematch", { requested: true });
  }

  function sendReaction(kind, slot = 0) {
    // The wire carries a kind and a wheel slot, never a slug. The server
    // resolves the id from the wheel frozen into the match at start, so choosing
    // in-match still cannot send a sticker or a line this account does not own
    // -- ownership was decided once, by the garage the server itself sanitized.
    const index = Number(slot);
    if (!Object.hasOwn(REACTION_WHEEL_FIELDS, kind)) return false;
    if (!Number.isInteger(index) || index < 0 || index >= REACTION_WHEEL_SIZE) return false;
    lobbyMessage("yam_reaction", { kind, slot: index });
    return true;
  }

  function leaveLobby() {
    send({ type: "leave_lobby" });
    clearSession(storage);
  }

  function disconnect() {
    manualClose = true;
    pending = [];
    clearSession(storage);
    socket?.close();
    socket = null;
    emit({ status: "idle", clientId: "", lobby: null, matchState: null, disconnectedClientId: "", reconnectExpiresAt: null });
  }

  function subscribe(subscriber) {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return {
    connect,
    resumeSavedSession,
    setIdentity,
    findQuickMatch,
    createPrivateRoom,
    joinPrivateRoom,
    startLobby,
    submitShot,
    requestRematch,
    sendReaction,
    leaveLobby,
    disconnect,
    subscribe,
    getSnapshot,
  };
}
