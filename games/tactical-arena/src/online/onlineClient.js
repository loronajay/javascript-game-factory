// onlineClient.js — WebSocket relay layer for Tactical Arena online (1v1 today).
//
// This is the ONLY file in the game that touches `new WebSocket`. It rides the
// GENERIC factory-network-server v2 LOBBY (create_lobby / find_lobby / join_lobby
// / start_lobby / leave_lobby / lobby_message), with zero server-side match logic
// — the "host-nothing relay" pattern. A 1v1 is simply a 2-player lobby; the cap is
// raised to 4 the day FFA/teams ships (the relay is seat-count-agnostic). Ported
// near-verbatim from Mini-Tactics — only GAME_ID and the lobby limits differ.
//
// Authority model (see onlineSession.js): deterministic lockstep. Every client
// builds the match from the relay-provided shared `seed` + the ordered `members`
// array `lobby_started` delivers (seat = index in members + 1, identical on all
// clients), and runs the same seeded core reducer — so dice match without ever being
// sent. The active player applies its own accepted command locally and broadcasts
// the command; every peer replays it. The lobby OWNER broadcasts its state hash per
// revision so a divergence is caught.
//
// room (lobby) message contract (all `value`s are JSON strings):
//   owner -> all : config   { rulesetVersion, size, format, teamColors, teamNames }
//   each  -> all : ready     { ready }                          lobby squad lock-in flag
//   each  -> all : setup     { seat, composition, skins }       blind squad pick
//   active-> all : command   { command }                        an ACCEPTED core command
//   owner -> all : hash      { revision, hash }                  desync check
//   each  -> all : profile   { playerId, displayName, seat }    name exchange
//   each         : ping/pong { t }                              approx RTT for the HUD
//
// The server echoes every lobby_message back to the sender too, so we drop our own
// echoes (we already applied them locally).

const PROD_WS_URL = "wss://factory-network-server-production.up.railway.app";
const LOCAL_WS_PORT = "3000";
const GAME_ID = "tactical-arena";
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const RELAY_STORAGE_KEY = "tacticalArenaRelay";

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function readRelayOverride(locationLike, storageLike) {
  const candidates = [];
  const search = typeof locationLike?.search === "string" ? locationLike.search : "";
  try {
    const params = new URLSearchParams(search);
    candidates.push(params.get("relay"), params.get("ws"));
  } catch {
    // Ignore malformed query strings and fall back below.
  }
  try {
    candidates.push(storageLike?.getItem?.(RELAY_STORAGE_KEY));
  } catch {
    // Storage can throw in private/cross-origin contexts.
  }
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function localWebSocketUrl(locationLike) {
  const protocol = typeof locationLike?.protocol === "string" ? locationLike.protocol : "";
  const hostname = typeof locationLike?.hostname === "string" ? locationLike.hostname : "";
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  const host = hostname === "::1" ? "[::1]" : (hostname || "localhost");
  return `${wsProtocol}//${host}:${LOCAL_WS_PORT}`;
}

// Default to the production relay even when the game is served from localhost:
// cross-device online tests need both players on the same relay. Developers can
// still force a local relay with ?relay=local or localStorage.tacticalArenaRelay.
export function resolveWebSocketUrl(locationLike = globalThis.location, storageLike = globalThis.localStorage) {
  const override = readRelayOverride(locationLike, storageLike);
  if (/^wss?:\/\//i.test(override)) return override;
  if (/^(local|localhost)$/i.test(override)) return localWebSocketUrl(locationLike);
  if (/^(prod|production)$/i.test(override)) return PROD_WS_URL;

  const hostname = typeof locationLike?.hostname === "string" ? locationLike.hostname : "";
  if (isLocalHostname(hostname) && /^(1|true|yes)$/i.test(override)) {
    return localWebSocketUrl(locationLike);
  }
  return PROD_WS_URL;
}

export function normalizeRoomCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

// ─── Message parsers (validation seam — never trust the wire) ─────────────────

function sanitizeIdentity(identity) {
  const displayName =
    typeof identity?.displayName === "string" && identity.displayName.trim()
      ? identity.displayName.trim().slice(0, 18)
      : "Commander";
  return {
    playerId: typeof identity?.playerId === "string" ? identity.playerId : "",
    displayName,
  };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseProfileMessage(value) {
  const p = parseJson(value);
  if (!p || typeof p.displayName !== "string") return null;
  return {
    playerId: typeof p.playerId === "string" ? p.playerId : "",
    displayName: p.displayName,
    seat: Number.isFinite(Number(p.seat)) ? Math.floor(Number(p.seat)) : null,
  };
}

// Owner-authored match framing. Every field is optional/clamped at build time (the
// core normalizes board size); here we only confirm the shape.
function parseConfigMessage(value) {
  const p = parseJson(value);
  if (!p || typeof p !== "object") return null;
  const out = {};
  const size = Number(p.size);
  const rulesetVersion = Number(p.rulesetVersion);
  if (Number.isFinite(rulesetVersion)) out.rulesetVersion = Math.floor(rulesetVersion);
  if (Number.isFinite(size)) out.size = Math.floor(size);
  if (p.format === "ffa" || p.format === "teams") out.format = p.format;
  if (p.teamColors && typeof p.teamColors === "object") out.teamColors = { ...p.teamColors };
  if (p.teamNames && typeof p.teamNames === "object") out.teamNames = { ...p.teamNames };
  return out;
}

function parseReadyMessage(value) {
  const p = parseJson(value);
  if (!p || typeof p !== "object" || typeof p.ready !== "boolean") return null;
  return { ready: p.ready };
}

// A player's blind squad pick, keyed by its seat so every client builds the same
// { seat: composition } map. The composition is re-normalized at match build
// (squadModel.normalizeSquad); here we only confirm the wire shape.
function parseSetupMessage(value) {
  const p = parseJson(value);
  if (!p || typeof p !== "object") return null;
  const seat = Number(p.seat);
  if (!Number.isFinite(seat)) return null;
  const composition = Array.isArray(p.composition)
    ? p.composition.slice(0, 4).map((type) => (typeof type === "string" ? type : null))
    : null;
  const skins = Array.isArray(p.skins)
    ? p.skins.slice(0, 4).map((slug) => (typeof slug === "string" ? slug : null))
    : null;
  return { seat: Math.floor(seat), composition, skins };
}

// A command is a plain serializable object { type, player, ...payload }. The core
// reducer is the real validator — here we only confirm the wire shape.
function parseCommandMessage(value) {
  const p = parseJson(value);
  if (!p || typeof p !== "object") return null;
  if (typeof p.command !== "object" || p.command === null) return null;
  const command = p.command;
  if (typeof command.type !== "string") return null;
  if (!Number.isFinite(Number(command.player))) return null;
  return { command };
}

function parseHashMessage(value) {
  const p = parseJson(value);
  if (!p || typeof p !== "object") return null;
  if (typeof p.hash !== "string") return null;
  const revision = Number(p.revision);
  if (!Number.isFinite(revision)) return null;
  return { revision: Math.floor(revision), hash: p.hash };
}

// Normalize a lobby payload's player roster into a stable, ordered list every
// client can read identically (id + display name + seat).
function normalizeLobby(data) {
  const members = Array.isArray(data.members) ? data.members.slice() : [];
  const nameById = new Map(
    Array.isArray(data.players) ? data.players.map((p) => [p.id, p.name]) : [],
  );
  return {
    roomCode: data.roomCode || null,
    ownerId: data.ownerId || null,
    status: data.status || "open",
    minPlayers: Number(data.minPlayers) || MIN_PLAYERS,
    maxPlayers: Number(data.maxPlayers) || MAX_PLAYERS,
    settings: data.settings && typeof data.settings === "object" ? { ...data.settings } : {},
    members,
    players: members.map((id, index) => ({
      id,
      seat: index + 1,
      name: nameById.get(id) || `Player ${index + 1}`,
    })),
  };
}

// ─── Client factory ──────────────────────────────────────────────────────────

export function createOnlineClient() {
  const wsUrl = resolveWebSocketUrl();
  let ws = null;
  let _clientId = null;
  let _identity = sanitizeIdentity(null);
  let _roomCode = null;
  let _inLobby = false;
  let _latencyMs = null;
  let _pingTimer = null;

  const cb = {
    onConnected: null, // ()
    onLobbyJoined: null, // (lobby, { created })
    onLobbyUpdated: null, // (lobby)
    onLobbyStarted: null, // ({ seed, ownerId, members, myClientId })
    onPlayerLeft: null, // ({ clientId, ownerId, playerCount })
    onRemoteConfig: null, // ({ rulesetVersion?, size?, format?, teamColors?, teamNames? })
    onRemoteReady: null, // ({ clientId, ready })
    onRemoteSetup: null, // ({ seat, composition?, skins? })
    onRemoteCommand: null, // ({ command })
    onRemoteHash: null, // ({ revision, hash })
    onRemoteProfile: null, // ({ playerId, displayName, seat })
    onLatency: null, // (ms)
    onError: null, // (code, message)
    onClosed: null, // ()
  };

  function _send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  function _lobbyMsg(messageType, value) {
    _send({
      type: "lobby_message",
      messageType,
      value: typeof value === "string" ? value : JSON.stringify(value),
    });
  }

  function _handleLobbyMessage(messageType, value, senderId = null) {
    switch (messageType) {
      case "config": {
        const m = parseConfigMessage(value);
        if (m) cb.onRemoteConfig?.(m);
        return;
      }
      case "ready": {
        const m = parseReadyMessage(value);
        if (m && senderId) cb.onRemoteReady?.({ clientId: senderId, ready: m.ready });
        return;
      }
      case "setup": {
        const m = parseSetupMessage(value);
        if (m) cb.onRemoteSetup?.(m);
        return;
      }
      case "command": {
        const m = parseCommandMessage(value);
        if (m) cb.onRemoteCommand?.(m);
        return;
      }
      case "hash": {
        const m = parseHashMessage(value);
        if (m) cb.onRemoteHash?.(m);
        return;
      }
      case "profile": {
        const m = parseProfileMessage(value);
        if (m) cb.onRemoteProfile?.(m);
        return;
      }
      case "ping": {
        _lobbyMsg("pong", value);
        return;
      }
      case "pong": {
        const p = parseJson(value);
        if (p && typeof p.t === "number") {
          _latencyMs = Math.round((Date.now() - p.t) / 2);
          cb.onLatency?.(_latencyMs);
        }
        return;
      }
    }
  }

  function _onEvent(data) {
    switch (data.event) {
      case "connected":
        _clientId = data.clientId;
        cb.onConnected?.();
        return;
      case "lobby_joined":
        _roomCode = data.roomCode;
        _inLobby = true;
        _broadcastProfile();
        cb.onLobbyJoined?.(normalizeLobby(data), { created: !!data.created });
        return;
      case "lobby_updated":
        cb.onLobbyUpdated?.(normalizeLobby(data));
        return;
      case "lobby_player_joined":
        // A fresh join needs our name; re-announce so its roster shows us correctly.
        _broadcastProfile();
        return;
      case "lobby_started":
        _inLobby = true;
        cb.onLobbyStarted?.({
          seed: data.seed,
          ownerId: data.ownerId || null,
          members: Array.isArray(data.members) ? data.members.slice() : [],
          myClientId: _clientId,
        });
        _broadcastProfile();
        return;
      case "lobby_player_left":
        cb.onPlayerLeft?.({
          clientId: data.clientId,
          ownerId: data.ownerId || null,
          playerCount: Number(data.playerCount) || 0,
        });
        return;
      case "lobby_left":
      case "lobby_closed":
        _inLobby = false;
        _roomCode = null;
        return;
      case "message":
        if (data.scope !== "lobby") return;
        if (data.senderId === _clientId) return; // drop our own echo
        _handleLobbyMessage(String(data.messageType || ""), String(data.value ?? ""), data.senderId || null);
        return;
      case "error":
        cb.onError?.(data.code, data.message);
        return;
    }
  }

  function connect() {
    if (ws) return;
    ws = new WebSocket(wsUrl);
    ws.addEventListener("message", (e) => {
      const data = parseJson(e.data);
      if (data) _onEvent(data);
    });
    ws.addEventListener("close", () => {
      const wasInLobby = _inLobby;
      ws = null;
      _clientId = null;
      _roomCode = null;
      _inLobby = false;
      if (wasInLobby) cb.onClosed?.();
    });
    ws.addEventListener("error", () => {
      cb.onError?.("WS_ERROR", "Connection error");
    });
  }

  function setIdentity(identity) {
    _identity = sanitizeIdentity(identity);
  }

  // Quick Match: join an open public lobby for this game or create one.
  function lobbyOptions(options = {}) {
    const minPlayers = Number.isFinite(Number(options.minPlayers)) ? Math.floor(Number(options.minPlayers)) : MIN_PLAYERS;
    const maxPlayers = Number.isFinite(Number(options.maxPlayers)) ? Math.floor(Number(options.maxPlayers)) : MAX_PLAYERS;
    return {
      minPlayers,
      maxPlayers,
      settings: options.settings && typeof options.settings === "object" ? { ...options.settings } : {},
    };
  }

  function findLobby(options = {}) {
    const opts = lobbyOptions(options);
    _send({
      type: "find_lobby",
      gameId: GAME_ID,
      minPlayers: opts.minPlayers,
      maxPlayers: opts.maxPlayers,
      settings: opts.settings,
      identity: _identity,
    });
  }

  // Create a private (code-only) lobby; the creator becomes the owner.
  function createLobby(options = {}) {
    const opts = lobbyOptions(options);
    _send({
      type: "create_lobby",
      gameId: GAME_ID,
      private: true,
      minPlayers: opts.minPlayers,
      maxPlayers: opts.maxPlayers,
      settings: opts.settings,
      identity: _identity,
    });
  }

  function joinLobby(code) {
    _send({
      type: "join_lobby",
      gameId: GAME_ID,
      roomCode: normalizeRoomCode(code),
      identity: _identity,
    });
  }

  function startLobby() {
    _send({ type: "start_lobby" });
  }

  function leaveLobby() {
    _send({ type: "leave_lobby" });
    _inLobby = false;
    _roomCode = null;
  }

  function _broadcastProfile() {
    if (!_inLobby || !_identity?.displayName) return;
    _lobbyMsg("profile", JSON.stringify(_identity));
  }

  // ── Outbound gameplay messages ──
  function sendConfig(config) {
    _lobbyMsg("config", JSON.stringify(config || {}));
  }
  function sendSetup({ seat, composition = null, skins = null } = {}) {
    _lobbyMsg("setup", JSON.stringify({ seat, composition, skins }));
  }
  function sendReady(ready) {
    _lobbyMsg("ready", JSON.stringify({ ready: !!ready }));
  }
  function sendCommand(command) {
    _lobbyMsg("command", JSON.stringify({ command }));
  }
  function sendHash(revision, hash) {
    _lobbyMsg("hash", JSON.stringify({ revision, hash }));
  }
  function sendProfile() {
    _broadcastProfile();
  }

  function startPinging() {
    stopPinging();
    _pingTimer = setInterval(() => _lobbyMsg("ping", JSON.stringify({ t: Date.now() })), 2000);
  }

  function stopPinging() {
    if (_pingTimer !== null) {
      clearInterval(_pingTimer);
      _pingTimer = null;
    }
    _latencyMs = null;
  }

  function getLatencyMs() {
    return _latencyMs;
  }
  function getClientId() {
    return _clientId;
  }
  function getRoomCode() {
    return _roomCode;
  }

  function disconnect() {
    stopPinging();
    _inLobby = false;
    _roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    stopPinging();
    _roomCode = null;
    _inLobby = false;
  }

  return {
    connect,
    setIdentity,
    findLobby,
    createLobby,
    joinLobby,
    startLobby,
    leaveLobby,
    sendConfig,
    sendReady,
    sendSetup,
    sendCommand,
    sendHash,
    sendProfile,
    startPinging,
    stopPinging,
    getLatencyMs,
    getClientId,
    getRoomCode,
    getWebSocketUrl: () => wsUrl,
    disconnect,
    reset,
    cb,
  };
}
