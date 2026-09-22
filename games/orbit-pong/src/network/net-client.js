const PRODUCTION_WS_URL = "wss://factory-network-server-production.up.railway.app";
const LOCAL_WS_URL = "ws://localhost:3000";
const GAME_ID = "orbit-pong";
const CONNECT_TIMEOUT_MS = 12000;

export function resolveWsUrl(location = globalThis.location) {
  const override = new URLSearchParams(location?.search ?? "").get("ws");
  if (override) return override;
  const hostname = location?.hostname ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
    ? LOCAL_WS_URL
    : PRODUCTION_WS_URL;
}

export function createNetClient({
  url = resolveWsUrl(),
  socketFactory = (target) => new WebSocket(target),
} = {}) {
  let socket = null;
  let connectTimer = null;
  let identity = { playerId: "", displayName: "Orbiter" };
  const handlers = {
    open: null,
    close: null,
    error: null,
    searching: null,
    searchCancelled: null,
    lobby: null,
    matchStarted: null,
    snapshot: null,
    matchEnded: null,
    playerLeft: null,
    roomLeft: null,
  };

  function on(nextHandlers) {
    Object.assign(handlers, nextHandlers);
  }

  function isOpen() {
    return socket?.readyState === 1;
  }

  function receive(raw) {
    let data;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    const routes = {
      searching: "searching",
      search_cancelled: "searchCancelled",
      op_lobby: "lobby",
      op_match_started: "matchStarted",
      op_snapshot: "snapshot",
      op_match_ended: "matchEnded",
      player_left: "playerLeft",
      room_left: "roomLeft",
    };
    if (data.event === "error") handlers.error?.(data);
    else if (routes[data.event]) handlers[routes[data.event]]?.(data);
  }

  function connect() {
    if (socket && socket.readyState <= 1) return;
    try {
      socket = socketFactory(url);
    } catch {
      handlers.error?.({ message: "Could not reach the match server." });
      return;
    }
    connectTimer = setTimeout(() => {
      if (!isOpen()) handlers.error?.({ message: "The match server did not answer." });
    }, CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      clearTimeout(connectTimer);
      handlers.open?.();
    };
    socket.onclose = () => {
      clearTimeout(connectTimer);
      socket = null;
      handlers.close?.();
    };
    socket.onerror = () => handlers.error?.({ message: "Connection lost." });
    socket.onmessage = (event) => receive(event.data);
  }

  function send(payload) {
    if (!isOpen()) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }

  function roomMessage(messageType, value = {}) {
    return send({ type: "room_message", messageType, value });
  }

  return {
    on,
    connect,
    receive,
    isOpen,
    setIdentity(next) {
      identity = {
        playerId: typeof next?.playerId === "string" ? next.playerId : "",
        displayName: String(next?.displayName || "Orbiter").slice(0, 18),
      };
    },
    findMatch: () => send({ type: "find_match", gameId: GAME_ID, ...identity }),
    cancelSearch: () => send({ type: "cancel_match" }),
    createRoom: () => send({ type: "create_room", gameId: GAME_ID, ...identity }),
    joinRoom: (roomCode) => send({
      type: "join_room",
      gameId: GAME_ID,
      roomCode: String(roomCode || "").trim().toUpperCase(),
      ...identity,
    }),
    leaveRoom: () => send({ type: "leave_room" }),
    setReady: (ready = true) => roomMessage("ready", { ready }),
    sendInput: (sequence, orbit) => roomMessage("input", { sequence, orbit: Math.sign(orbit) }),
    ping: (sentAt) => roomMessage("ping", { sentAt }),
    close() {
      clearTimeout(connectTimer);
      if (socket) socket.close();
      socket = null;
    },
  };
}
