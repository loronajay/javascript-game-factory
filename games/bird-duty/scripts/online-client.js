const PROD_WS_URL = "wss://factory-network-server-production.up.railway.app";
const LOCAL_WS_PORT = "3000";

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolveWebSocketUrl(locationLike = globalThis.location) {
  const protocol = typeof locationLike?.protocol === "string" ? locationLike.protocol : "";
  const hostname = typeof locationLike?.hostname === "string" ? locationLike.hostname : "";
  if (isLocalHostname(hostname)) {
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${hostname}:${LOCAL_WS_PORT}`;
  }
  return PROD_WS_URL;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function sanitizeOnlineIdentity(identity) {
  const playerId = typeof identity?.playerId === "string" ? identity.playerId.trim() : "";
  const displayName = typeof identity?.displayName === "string" && identity.displayName.trim()
    ? identity.displayName.trim().slice(0, 18).trim()
    : "Player";
  return { playerId, displayName };
}

export function buildLobbySettings(settings = {}) {
  const minPlayers = Math.max(2, Math.min(4, Math.floor(Number(settings.minPlayers) || 2)));
  const maxPlayers = Math.max(minPlayers, Math.min(4, Math.floor(Number(settings.maxPlayers) || minPlayers)));
  return {
    minPlayers,
    maxPlayers,
    private: settings.private === true,
  };
}

export function createOnlineClient(gameId = "bird-duty") {
  const wsUrl = resolveWebSocketUrl();
  let ws = null;
  let clientId = null;
  let identity = sanitizeOnlineIdentity(null);

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
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function lobbyMessage(messageType, value = "") {
    send({
      type: "lobby_message",
      messageType,
      value: typeof value === "string" ? value : JSON.stringify(value),
    });
  }

  function handleEvent(data) {
    if (data.event === "connected") {
      clientId = data.clientId;
      cb.onConnected?.({ clientId });
      return;
    }
    if (data.event === "lobby_joined") {
      cb.onLobbyJoined?.({ ...data, clientId });
      return;
    }
    if (data.event === "lobby_updated") {
      cb.onLobbyUpdated?.({ ...data, clientId });
      return;
    }
    if (data.event === "lobby_countdown_started") {
      cb.onLobbyCountdownStarted?.({ ...data, clientId });
      return;
    }
    if (data.event === "lobby_started") {
      cb.onLobbyStarted?.({ ...data, clientId });
      return;
    }
    if (data.event === "lobby_left") {
      cb.onLobbyLeft?.(data);
      return;
    }
    if (data.event === "lobby_player_joined") {
      cb.onPlayerJoined?.(data);
      return;
    }
    if (data.event === "lobby_player_left") {
      cb.onPlayerLeft?.(data);
      return;
    }
    if (data.event === "message" && data.scope === "lobby") {
      if (data.senderId === clientId) return;
      cb.onLobbyMessage?.({
        messageType: data.messageType,
        value: data.value,
        senderId: data.senderId,
        roomCode: data.roomCode,
      });
      return;
    }
    if (data.event === "error") {
      cb.onError?.(data.code, data.message);
    }
  }

  function connect() {
    if (ws) return;
    ws = new WebSocket(wsUrl);
    ws.addEventListener("message", (event) => {
      const data = parseJson(event.data);
      if (data) handleEvent(data);
    });
    ws.addEventListener("error", () => cb.onError?.("WS_ERROR", "Connection error"));
    ws.addEventListener("close", () => {
      ws = null;
      clientId = null;
      cb.onClosed?.();
    });
  }

  function setIdentity(nextIdentity) {
    identity = sanitizeOnlineIdentity(nextIdentity);
  }

  function createLobby(settings = {}) {
    const lobby = buildLobbySettings(settings);
    send({
      type: "create_lobby",
      gameId,
      private: lobby.private,
      minPlayers: lobby.minPlayers,
      maxPlayers: lobby.maxPlayers,
      countdownMs: 5000,
      settings: { turnStyle: "hotseat", shotsPerTurn: 5, rounds: 3 },
      identity,
    });
  }

  function findLobby(settings = {}) {
    const lobby = buildLobbySettings(settings);
    send({
      type: "find_lobby",
      gameId,
      minPlayers: lobby.minPlayers,
      maxPlayers: lobby.maxPlayers,
      countdownMs: 5000,
      createIfMissing: true,
      settings: { turnStyle: "hotseat", shotsPerTurn: 5, rounds: 3 },
      identity,
    });
  }

  function joinLobby(roomCode) {
    send({
      type: "join_lobby",
      gameId,
      roomCode: String(roomCode || "").trim().toUpperCase(),
      identity,
    });
  }

  function startLobby() {
    send({ type: "start_lobby" });
  }

  function leaveLobby() {
    send({ type: "leave_lobby" });
  }

  function sendProfile() {
    lobbyMessage("profile", identity);
  }

  // The entire client-to-server vocabulary for a match: three booleans saying which keys are down.
  // There is deliberately no counterpart that sends state — the server owns the match, and a
  // `state_sync` from a client is refused on the other end with SERVER_AUTHORITY.
  function sendInput(input) {
    lobbyMessage("bird_duty_input", {
      left: input?.left === true,
      right: input?.right === true,
      drop: input?.drop === true,
    });
  }

  function disconnect() {
    ws?.close();
    ws = null;
    clientId = null;
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
    sendInput,
    disconnect,
    get clientId() {
      return clientId;
    },
    get identity() {
      return { ...identity };
    },
    cb,
  };
}
