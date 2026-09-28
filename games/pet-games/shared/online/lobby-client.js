// The socket for a Pet Games event, and nothing else.
//
// It reaches the Factory Network, opens or finds a lobby, tells the room which
// pet this person is bringing, sends the person's keys, and turns what comes
// back into plain state. It does not know what a race or a brawl is: the
// server decides those, and the cabinet's online session draws them.
//
// THE SESSION SURVIVES A RELOAD. The client id and its token are kept in
// session storage, so a refreshed tab (or a dropped connection) rejoins the
// match it left rather than abandoning a live race to the grace timer.

const PRODUCTION_WS_URL = "wss://factory-network-server-production.up.railway.app";

function text(value, max = 100, fallback = "") {
  const clean = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (clean || fallback).slice(0, max);
}

function json(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
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

/** One roster row as the lobby shows it: who, and the pet they are bringing. */
function normalizePlayer(player, index, members) {
  const pet = player?.pet && typeof player.pet === "object" ? player.pet : null;
  return {
    id: text(player?.id, 80, members[index] || `player-${index + 1}`),
    name: text(player?.name, 24, `Player ${index + 1}`),
    pet: pet ? { speciesId: text(pet.speciesId, 40), name: text(pet.name, 20, "Farm Pet"), paletteId: text(pet.paletteId, 24, "standard"), stats: pet.stats ?? null } : null,
  };
}

/**
 * `config`: { gameId, limits: { minPlayers, maxPlayers }, storageKey,
 *   inputMessage, snapshotMessage, endedMessage }.
 */
export function createPetLobbyClient(config, options = {}) {
  const WebSocketCtor = options.WebSocketCtor || globalThis.WebSocket;
  const resolveIdentity = options.resolveIdentity || (() => ({}));
  const storage = options.storage === undefined ? globalThis.sessionStorage : options.storage;
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const wsUrl = options.wsUrl || resolveWebSocketUrl(options.locationLike);

  const subscribers = new Set();
  const snapshotListeners = new Set();
  let socket = null;
  let announcedOn = null;
  let pending = [];
  let manualClose = false;
  let resumeCredentials = null;
  let pet = null;
  let state = { status: "idle", clientId: "", lobby: null, match: null, ended: false, error: null };

  function emit(patch) {
    state = { ...state, ...patch };
    for (const subscriber of subscribers) subscriber(state);
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

  function readSaved() {
    try {
      const saved = JSON.parse(storage?.getItem?.(config.storageKey) || "null");
      return saved?.clientId && saved?.sessionToken ? { clientId: text(saved.clientId, 80), sessionToken: text(saved.sessionToken, 200) } : null;
    } catch {
      return null;
    }
  }

  function save(credentials) {
    try { storage?.setItem?.(config.storageKey, JSON.stringify(credentials)); } catch { /* a private window is not a reason to refuse a race */ }
  }

  function forget() {
    try { storage?.removeItem?.(config.storageKey); } catch { /* ignore */ }
  }

  function announcePet() {
    if (pet) send({ type: "lobby_message", messageType: "pet_profile", value: JSON.stringify({ pet }) });
  }

  function connect() {
    if (socket || !WebSocketCtor) return;
    manualClose = false;
    socket = new WebSocketCtor(wsUrl);
    emit({ status: state.status === "reconnecting" ? "reconnecting" : "connecting", error: null });
    attach(socket, "open", flush);
    attach(socket, "message", (event) => handle(json(event.data)));
    attach(socket, "error", () => emit({ error: { code: "WS_ERROR", message: "Unable to reach the Factory Network." } }));
    attach(socket, "close", () => {
      socket = null;
      announcedOn = null;
      if (manualClose) return;
      // A live match is worth rejoining; an idle lobby is not.
      if (state.match && !state.ended && readSaved()) {
        resumeCredentials = readSaved();
        emit({ status: "reconnecting", error: { code: "CONNECTION_LOST", message: "Connection lost · rejoining…" } });
        setTimer(() => connect(), 1500);
        return;
      }
      emit({ status: "idle", lobby: null, error: { code: "CONNECTION_LOST", message: "Connection lost." } });
    });
  }

  function normalizeLobby(data) {
    const members = Array.isArray(data.members) ? data.members.map(String) : [];
    return {
      roomCode: normalizeRoomCode(data.roomCode),
      ownerId: text(data.ownerId, 80),
      members,
      players: Array.isArray(data.players) ? data.players.map((player, index) => normalizePlayer(player, index, members)) : [],
      playerCount: Number(data.playerCount) || members.length,
      minPlayers: Number(data.minPlayers) || config.limits.minPlayers,
      maxPlayers: Number(data.maxPlayers) || config.limits.maxPlayers,
      isPrivate: data.isPrivate === true,
      status: text(data.status, 20, "open"),
      settings: data.settings && typeof data.settings === "object" ? { ...data.settings } : {},
    };
  }

  function handle(data) {
    if (!data) return;
    if (data.event === "connected") {
      const credentials = { clientId: text(data.clientId, 80), sessionToken: text(data.sessionToken, 200) };
      emit({ clientId: credentials.clientId, error: null, status: resumeCredentials ? "reconnecting" : state.status === "connecting" ? "connected" : state.status });
      if (resumeCredentials) send({ type: "resume_lobby", ...resumeCredentials });
      else save(credentials);
      return;
    }
    if (data.event === "session_resumed") {
      resumeCredentials = null;
      save({ clientId: text(data.clientId, 80), sessionToken: text(data.sessionToken, 200) });
      emit({ status: state.match ? "playing" : "lobby", clientId: text(data.clientId, 80), error: null });
      return;
    }
    if (data.event === "lobby_joined" || data.event === "lobby_updated") {
      const lobby = normalizeLobby(data);
      const live = state.match && !state.ended;
      emit({ status: live ? "playing" : "lobby", lobby, error: null });
      if (announcedOn !== socket) {
        announcedOn = socket;
        send({ type: "lobby_message", messageType: "profile", value: JSON.stringify(resolveIdentity()) });
        announcePet();
      }
      return;
    }
    if (data.event === "lobby_started") {
      emit({ status: "playing", match: data.matchState || null, ended: false, error: null });
      return;
    }
    if (data.event === "message" && data.scope === "lobby") {
      if (data.messageType === config.snapshotMessage || data.messageType === config.endedMessage) {
        const match = json(data.value);
        if (!match) return;
        const ended = data.messageType === config.endedMessage;
        for (const listener of snapshotListeners) listener(match, { ended });
        // The state only changes on the edges — a repaint per snapshot would be twenty a second.
        if (ended || !state.match || state.status !== "playing") emit({ status: "playing", match, ended });
        else state = { ...state, match };
      }
      return;
    }
    if (data.event === "lobby_left" || data.event === "lobby_closed") {
      forget();
      emit({ status: "idle", lobby: null, match: null, ended: false });
      return;
    }
    if (data.event === "error") {
      if (data.code === "RESUME_REJECTED") {
        resumeCredentials = null;
        forget();
        emit({ status: "idle", lobby: null, match: null, ended: false });
      }
      emit({ error: { code: text(data.code, 60), message: text(data.message, 160, "Online error") } });
    }
  }

  function request(type, { settings = {}, roomCode = "" } = {}) {
    connect();
    send({
      type,
      gameId: config.gameId,
      ...(type === "join_lobby"
        ? { roomCode: normalizeRoomCode(roomCode) }
        : {
          // These MUST be sent: a search that omits them is sanitized to the server's
          // default of 2-6 seats and silently matches nobody for a game with other limits.
          minPlayers: config.limits.minPlayers,
          maxPlayers: config.limits.maxPlayers,
          ...(type === "create_lobby" ? { private: true } : {}),
          countdownMs: 5000,
          settings,
        }),
      identity: resolveIdentity(),
    });
    emit({ status: type === "find_lobby" ? "searching" : type === "create_lobby" ? "creating" : "joining", match: null, ended: false, error: null });
  }

  return {
    connect,
    /** Rejoin a match this tab was already in. False if there is nothing to rejoin. */
    resumeSavedSession() {
      if (socket) return Boolean(resumeCredentials);
      const saved = readSaved();
      if (!saved) return false;
      resumeCredentials = saved;
      emit({ status: "reconnecting" });
      connect();
      return true;
    },
    findQuickMatch: (settings) => request("find_lobby", { settings }),
    createPrivateRoom: (settings) => request("create_lobby", { settings }),
    joinPrivateRoom: (roomCode) => request("join_lobby", { roomCode }),
    /** The pet this person brings; re-announced to the room whenever it changes. */
    setPet(next) {
      pet = next ? { speciesId: next.speciesId, name: next.name, paletteId: next.paletteId, stats: { ...next.stats } } : null;
      if (state.lobby && !state.match) announcePet();
    },
    updateSettings(settings) {
      send({ type: "update_lobby_settings", settings });
    },
    startMatch() {
      send({ type: "start_lobby" });
    },
    sendInputs(batch) {
      if (batch) send({ type: "lobby_message", messageType: config.inputMessage, value: JSON.stringify(batch) });
    },
    /** After the results: back to the room's lobby, which the server has already reopened. */
    backToLobby() {
      emit({ status: state.lobby ? "lobby" : "idle", match: null, ended: false });
      announcePet();
    },
    leave() {
      send({ type: "leave_lobby" });
      forget();
      emit({ status: "idle", lobby: null, match: null, ended: false, error: null });
    },
    disconnect() {
      manualClose = true;
      forget();
      socket?.close();
      socket = null;
      pending = [];
      emit({ status: "idle", lobby: null, match: null, ended: false, error: null });
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    /** Every snapshot, as it arrives (twenty a second), for the session that draws the match. */
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    getState: () => state,
  };
}
