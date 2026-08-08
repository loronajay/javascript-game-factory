// The WebSocket layer for Speed Demon online.
//
// **The only module in the cabinet that may call `new WebSocket`.** Everything
// above it deals in callbacks and plain objects, which is what lets
// `online/session.js` — where every rule about an online match lives — be pure
// and tested without a network. The same split as `radio/stereo.js` against
// `radio/playlist.js`.
//
// This talks to `factory-network-server`, not `platform-api`. That server is
// WebSocket-only and holds no database by design: a match's fault counters die
// with the match, and anything durable (times, ELO, ladders) belongs elsewhere.
// Speed Demon registers there as a **self-owning bridge**, so the room, the
// queue, the tree and the adjudication are all its own — see
// `games/speed-demon/server/` in that repo.

const WS_URL = "wss://factory-network-server-production.up.railway.app";
const GAME_ID = "speed-demon";

/** How long to wait before giving up on a connection that never opens. */
const CONNECT_TIMEOUT_MS = 12000;

export function createNet({
  url = WS_URL,
  socketFactory = (target) => new WebSocket(target),
  now = () => Date.now(),
} = {}) {
  let socket = null;
  let clientId = null;
  let connectTimer = null;

  const handlers = {
    onOpen: null,
    onClose: null,
    onError: null,
    onSearching: null,
    onSearchCancelled: null,
    onLobby: null,
    onRoundStart: null,
    onInputs: null,
    onRoundResult: null,
    onForfeit: null,
    onRematch: null,
    onRoomLeft: null,
  };

  function on(events) {
    Object.assign(handlers, events);
  }

  function isOpen() {
    return socket !== null && socket.readyState === 1;
  }

  function connect() {
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) {
      return;
    }
    try {
      socket = socketFactory(url);
    } catch (error) {
      handlers.onError?.({ message: "Could not reach the server" });
      return;
    }

    // A socket that never opens has to fail visibly rather than leaving the
    // screen on "connecting" forever.
    connectTimer = setTimeout(() => {
      if (!isOpen()) {
        handlers.onError?.({ message: "Could not reach the server" });
        close();
      }
    }, CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      clearTimeout(connectTimer);
      handlers.onOpen?.();
    };
    socket.onclose = () => {
      clearTimeout(connectTimer);
      socket = null;
      handlers.onClose?.();
    };
    socket.onerror = () => {
      handlers.onError?.({ message: "Connection lost" });
    };
    socket.onmessage = (event) => receive(event?.data);
  }

  function close() {
    clearTimeout(connectTimer);
    if (socket) {
      // Detached first so the close handler does not report a disconnection the
      // player asked for as though it were a failure.
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        /* already gone */
      }
    }
    socket = null;
    clientId = null;
  }

  function receive(raw) {
    let data = null;
    try {
      data = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return; // a frame we cannot read is one we cannot act on
    }
    if (!data || typeof data !== "object") return;

    switch (data.event) {
      case "connected":
        clientId = data.clientId ?? null;
        return;
      case "searching":
        return void handlers.onSearching?.(data);
      case "search_cancelled":
        return void handlers.onSearchCancelled?.(data);
      case "sd_lobby":
        return void handlers.onLobby?.(data);
      case "sd_round_start":
        // The local clock is read here, at the moment the frame lands, because
        // that is the only instant at which it can be compared with the
        // server's. Everything downstream works in the offset between them.
        return void handlers.onRoundStart?.(data, now());
      case "sd_inputs":
        return void handlers.onInputs?.(data);
      case "sd_round_result":
        return void handlers.onRoundResult?.(data);
      case "sd_match_forfeit":
        return void handlers.onForfeit?.(data);
      case "sd_rematch":
        return void handlers.onRematch?.(data);
      case "room_left":
        return void handlers.onRoomLeft?.(data);
      case "error":
        return void handlers.onError?.({ code: data.code, message: data.message });
      default:
        return;
    }
  }

  function send(payload) {
    if (!isOpen()) return false;
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /** A room message. `value` travels as an object; the bridge accepts either. */
  function roomMessage(messageType, value) {
    return send({ type: "room_message", messageType, value });
  }

  // -------------------------------------------------------------------------
  // The things the game asks for
  // -------------------------------------------------------------------------

  const identity = { playerId: "", displayName: "", modelId: null, livery: null };

  /**
   * Who this driver is and what they are driving. Held here so every entry path
   * carries it without the caller having to remember — the opponent needs the
   * car to draw it, and a room joined without one shows a default.
   */
  function setIdentity(next) {
    if (typeof next?.playerId === "string") identity.playerId = next.playerId;
    if (typeof next?.displayName === "string") identity.displayName = next.displayName;
    if (next?.modelId !== undefined) identity.modelId = next.modelId;
    if (next?.livery !== undefined) identity.livery = next.livery;
  }

  const findMatch = () => send({ type: "find_match", gameId: GAME_ID, ...identity });
  const cancelSearch = () => send({ type: "cancel_match" });
  const createRoom = (config) => send({ type: "create_room", gameId: GAME_ID, config, ...identity });
  const joinRoom = (roomCode) =>
    send({ type: "join_room", gameId: GAME_ID, roomCode: String(roomCode || "").trim().toUpperCase(), ...identity });
  const leaveRoom = () => send({ type: "leave_room" });

  const sendConfig = (config) => roomMessage("config", config);
  const sendLoadout = () => roomMessage("loadout", { modelId: identity.modelId, livery: identity.livery });
  const sendReady = (ready = true) => roomMessage("ready", { ready });
  const sendRematch = () => roomMessage("rematch", {});

  /**
   * The driver's inputs so far this round. Only the tail is sent — the log is
   * append-only and the server merges by identity, so a resend costs bandwidth
   * and nothing else.
   */
  const sendInputs = (round, attempt, events) =>
    events.length > 0 && roomMessage("inputs", { round, attempt, events });

  /**
   * "I have sent you everything." Deliberately carries no time: what this client
   * thinks it achieved is not evidence, and the server replays the log to find
   * out for itself.
   */
  const sendDone = (round, attempt) => roomMessage("done", { round, attempt });

  return {
    on,
    connect,
    close,
    isOpen,
    setIdentity,
    findMatch,
    cancelSearch,
    createRoom,
    joinRoom,
    leaveRoom,
    sendConfig,
    sendLoadout,
    sendReady,
    sendRematch,
    sendInputs,
    sendDone,
    get clientId() {
      return clientId;
    },
    // Exposed for tests, which drive frames in directly rather than over a wire.
    receive,
  };
}
