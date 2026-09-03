// The socket, and nothing else.
//
// It knows how to reach the Factory Network, how to open or find a two-seat
// lobby, how to send a stroke, and how to turn what comes back into one plain
// snapshot. It does NOT know what a rack is, what a foul is, or what any of it
// means — `online-match.js` above it answers those, and the server decides them.
//
// No THREE, no canvas, no element. Everything the interface needs arrives
// through `subscribe`, which is what lets the whole of this file be driven by a
// fake socket in the tests.
//
// THE SESSION SURVIVES A RELOAD. The client id and its token are kept in session
// storage, so a refreshed tab rejoins the rack it left rather than opening a new
// lobby and abandoning a live match to the grace timer.

import { matchConfigSettings, normalizeMatchConfig } from "./match-config.js";

export const SHARK_HALL_GAME_ID = "shark-hall";

const PRODUCTION_WS_URL = "wss://factory-network-server-production.up.railway.app";
const SESSION_KEY = "shark-hall.online-session.v1";

/** Two seats, always, and the client must SEND these. */
export const LOBBY_LIMITS = Object.freeze({ minPlayers: 2, maxPlayers: 2 });

function text(value, max = 100, fallback = "") {
  const clean = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (clean || fallback).slice(0, max);
}

function json(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function attach(socket, type, listener) {
  if (typeof socket.addEventListener === "function") socket.addEventListener(type, listener);
  else socket[`on${type}`] = listener;
}

export function resolveWebSocketUrl(locationLike = globalThis.location) {
  const host = text(locationLike?.hostname);
  if (["localhost", "127.0.0.1", "::1"].includes(host)) {
    return `${locationLike?.protocol === "https:" ? "wss:" : "ws:"}//${host}:3000`;
  }
  return PRODUCTION_WS_URL;
}

export function normalizeRoomCode(value) {
  return text(value, 8).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function sanitizeIdentity(value = {}) {
  return { playerId: text(value.playerId, 64), displayName: text(value.displayName, 24, "Player") };
}

/**
 * The four numbers a stroke is, plus the two the placement is.
 *
 * Clamped here as well as on the server — not because the server needs the help,
 * but because a value that is wrong locally would be drawn wrong locally before
 * anybody sent anything.
 */
export function sanitizeShotIntent(value = {}) {
  const number = (raw, min, max, fallback) => {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
  };
  const intent = {
    seq: Math.max(0, Math.floor(number(value.seq, 0, 1e9, 0))),
    angle: number(value.angle, -Math.PI * 2, Math.PI * 2, 0),
    power: number(value.power, 0, 1, 0.5),
    spinX: number(value.spinX, -1, 1, 0),
    spinY: number(value.spinY, -1, 1, 0),
  };
  // The placement rides with the stroke rather than as a message of its own:
  // until the ball is struck nothing has happened, so there is nothing for the
  // opponent to be told about, and one message cannot arrive without the other.
  if (value.place) {
    intent.place = { x: number(value.place.x, -10, 10, 0), z: number(value.place.z, -10, 10, 0) };
  }
  return intent;
}

export function createOnlineClient(options = {}) {
  const WebSocketCtor = options.WebSocketCtor || globalThis.WebSocket;
  const resolveIdentity = options.resolveIdentity || (() => ({}));
  const storage = options.storage === undefined ? globalThis.sessionStorage : options.storage;
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const reconnectDelayMs = Number(options.reconnectDelayMs) || 1500;
  const wsUrl = options.wsUrl || resolveWebSocketUrl(options.locationLike);

  const subscribers = new Set();
  const shotListeners = new Set();
  let socket = null;
  let pending = [];
  let manualClose = false;
  let resumeCredentials = null;
  let snapshot = { status: "idle", clientId: "", lobby: null, matchState: null, error: null };

  function emit(patch) {
    snapshot = { ...snapshot, ...patch };
    for (const subscriber of subscribers) subscriber(getSnapshot());
  }

  function getSnapshot() {
    return { ...snapshot, lobby: snapshot.lobby ? { ...snapshot.lobby } : null };
  }

  function send(payload) {
    if (socket && socket.readyState === WebSocketCtor.OPEN) socket.send(JSON.stringify(payload));
    else pending.push(payload);
  }

  function flush() {
    if (!socket || socket.readyState !== WebSocketCtor.OPEN) return;
    for (const payload of pending) socket.send(JSON.stringify(payload));
    pending = [];
  }

  function connect() {
    if (socket || !WebSocketCtor) return;
    manualClose = false;
    socket = new WebSocketCtor(wsUrl);
    emit({ status: "connecting", error: null });
    attach(socket, "open", flush);
    attach(socket, "message", (event) => handle(json(event.data)));
    attach(socket, "error", () => emit({ error: { code: "WS_ERROR", message: "Unable to reach Factory Network." } }));
    attach(socket, "close", () => {
      socket = null;
      if (manualClose) return;
      // A live match is worth rejoining; an idle lobby is not. The server holds
      // the seat for its grace window and the rack is exactly where it was.
      if (snapshot.matchState && readSaved()) {
        resumeCredentials = readSaved();
        emit({ status: "reconnecting", error: { code: "CONNECTION_LOST", message: "Connection lost · rejoining the table…" } });
        setTimer(() => connect(), reconnectDelayMs);
        return;
      }
      emit({ status: "idle", error: { code: "CONNECTION_LOST", message: "Connection lost." } });
    });
  }

  function readSaved() {
    try {
      const saved = JSON.parse(storage?.getItem?.(SESSION_KEY) || "null");
      if (!saved?.clientId || !saved?.sessionToken) return null;
      return { clientId: text(saved.clientId, 80), sessionToken: text(saved.sessionToken, 200) };
    } catch {
      return null;
    }
  }

  function save(credentials) {
    try {
      storage?.setItem?.(SESSION_KEY, JSON.stringify(credentials));
    } catch {
      /* a private window is not a reason to refuse a match */
    }
  }

  function forget() {
    try {
      storage?.removeItem?.(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  function handle(data) {
    if (!data) return;

    if (data.event === "connected") {
      const credentials = { clientId: text(data.clientId, 80), sessionToken: text(data.sessionToken, 200) };
      emit({ status: "connected", clientId: credentials.clientId, error: null });
      if (resumeCredentials) send({ type: "resume_lobby", ...resumeCredentials });
      else save(credentials);
      return;
    }

    if (data.event === "session_resumed") {
      resumeCredentials = null;
      const credentials = { clientId: text(data.clientId, 80), sessionToken: text(data.sessionToken, 200) };
      save(credentials);
      emit({ status: "started", clientId: credentials.clientId, error: null });
      return;
    }

    if (data.event === "lobby_joined" || data.event === "lobby_updated") {
      emit({ status: snapshot.matchState ? snapshot.status : "lobby", lobby: normalizeLobby(data), error: null });
      // The protocol handshake. Announced on every lobby event rather than once,
      // because a reconnect gets a fresh lobby view and the server will not
      // start a match until both seats have said which protocol they speak.
      send({ type: "lobby_message", messageType: "shark_profile", value: JSON.stringify({ protocolVersion: options.protocolVersion || 1 }) });
      return;
    }

    if (data.event === "lobby_started") {
      emit({ status: "started", matchState: data.matchState || null, error: null });
      return;
    }

    if (data.event === "message" && data.scope === "lobby") {
      if (data.messageType === "shark_shot_played") {
        const played = json(data.value);
        if (!played) return;
        // The stroke goes to the listeners so it can be ANIMATED; the match
        // state it produced goes into the snapshot so it can be applied when
        // that animation reaches the same place.
        for (const listener of shotListeners) listener(played);
        emit({ matchState: played.match || snapshot.matchState, error: null });
        return;
      }
      if (data.messageType === "shark_match" || data.messageType === "shark_match_ended") {
        const matchState = json(data.value);
        if (matchState) emit({ status: "started", matchState, error: null });
        return;
      }
      return;
    }

    if (data.event === "lobby_left" || data.event === "lobby_closed") {
      forget();
      emit({ status: "idle", lobby: null, matchState: null });
      return;
    }

    if (data.event === "error") {
      if (data.code === "RESUME_REJECTED") {
        resumeCredentials = null;
        forget();
        emit({ status: "idle", lobby: null, matchState: null });
      }
      emit({ error: { code: text(data.code, 60), message: text(data.message, 160, "Online error") } });
    }
  }

  function normalizeLobby(data) {
    const members = Array.isArray(data.members) ? data.members.map(String) : [];
    return {
      roomCode: normalizeRoomCode(data.roomCode),
      ownerId: text(data.ownerId, 80),
      members,
      players: Array.isArray(data.players)
        ? data.players.map((player, index) => ({
          id: text(player?.id, 80, members[index] || `player-${index + 1}`),
          playerId: text(player?.playerId, 64),
          name: text(player?.name, 24, `Player ${index + 1}`),
        }))
        : [],
      playerCount: Number(data.playerCount) || members.length,
      isPrivate: data.isPrivate === true,
      status: text(data.status, 20, "open"),
      settings: normalizeMatchConfig(data.settings),
    };
  }

  function request(type, config = {}, roomCode = "") {
    connect();
    send({
      type,
      gameId: SHARK_HALL_GAME_ID,
      ...(type === "join_lobby"
        ? { roomCode: normalizeRoomCode(roomCode) }
        : {
          // These MUST be sent. A search that omits them is sanitized to the
          // server-wide default of 2-6 seats, and a two-seat game that omits
          // them opens a private room for every player and matches nobody.
          ...LOBBY_LIMITS,
          ...(type === "create_lobby" ? { private: true } : {}),
          settings: matchConfigSettings(config),
        }),
      identity: sanitizeIdentity(resolveIdentity()),
    });
    emit({
      status: type === "find_lobby" ? "searching" : type === "create_lobby" ? "creating" : "joining",
      error: null,
    });
  }

  return {
    connect,

    /** Rejoin a match this tab was already in. False if there is nothing to rejoin. */
    resumeSavedSession() {
      if (socket) return Boolean(resumeCredentials);
      const saved = readSaved();
      if (!saved) return false;
      resumeCredentials = saved;
      connect();
      return true;
    },

    findQuickMatch: (config) => request("find_lobby", config),
    createPrivateRoom: (config) => request("create_lobby", config),
    joinPrivateRoom: (code) => request("join_lobby", {}, code),

    updateConfig(config) {
      send({ type: "update_lobby_settings", settings: matchConfigSettings(config) });
    },

    startMatch() {
      send({ type: "start_lobby" });
    },

    submitShot(intent) {
      send({ type: "lobby_message", messageType: "shark_shot", value: JSON.stringify(sanitizeShotIntent(intent)) });
    },

    requestRematch() {
      send({ type: "lobby_message", messageType: "shark_rematch", value: JSON.stringify({}) });
    },

    leave() {
      send({ type: "leave_lobby" });
      forget();
      // Do not leave a finished match mounted while the acknowledgement makes a
      // round trip: the player may open matchmaking again immediately, and a
      // stale lobby would lock every control until the server answered.
      emit({ status: "idle", lobby: null, matchState: null, error: null });
    },

    disconnect() {
      manualClose = true;
      forget();
      socket?.close();
      socket = null;
      pending = [];
      emit({ status: "idle", lobby: null, matchState: null, error: null });
    },

    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },

    /** Every stroke the server played, in order, for whoever is drawing them. */
    onShot(listener) {
      shotListeners.add(listener);
      return () => shotListeners.delete(listener);
    },

    getSnapshot,
  };
}
