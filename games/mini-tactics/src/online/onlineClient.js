// onlineClient.js — WebSocket relay layer for Mini-Tactics 1v1 online.
//
// This is the ONLY file in the game that touches `new WebSocket`. It rides the
// GENERIC factory-network-server relay (find_match / create_room / join_room /
// room_message), with zero server-side match logic — the cockpit-swarm pattern.
//
// Authority model (see CLAUDE.md): deterministic lockstep. Both clients build the
// match from the same relay-provided `seed` and run the same seeded core reducer,
// so dice match without ever being sent. Each player applies its own accepted
// command locally and broadcasts the command; the other client replays it. The
// host (p1) periodically broadcasts its state hash so a divergence is caught.
//
// Sides: p1 = host (seat 1), p2 = guest (seat 2). The relay's side-pair
// matchmaking guarantees one of each; we never trust a client-claimed side after
// the lobby.
//
// room_message contract (all `value`s are JSON strings):
//   host  -> guest : setup    { size }            once, right after match_ready
//   either -> other: command  { command }         an ACCEPTED core command object
//   host  -> guest : hash     { revision, hash }   desync check after a command batch
//   either         : profile  { playerId, displayName, side }   name exchange
//   either         : ping/pong { t }               RTT for the network-health HUD

const WS_URL = "wss://factory-network-server-production.up.railway.app";
const GAME_ID = "mini-tactics";

// ─── Message parsers (validation seam — never trust the wire) ─────────────────

function sanitizeIdentityPayload(identity) {
  if (!identity || typeof identity !== "object") return {};
  const payload = {};
  if (typeof identity.playerId === "string" && identity.playerId.trim())
    payload.playerId = identity.playerId.trim();
  if (typeof identity.displayName === "string")
    payload.displayName = identity.displayName;
  return payload;
}

function buildProfileMessage(identity, side) {
  return JSON.stringify({
    playerId: typeof identity?.playerId === "string" ? identity.playerId : "",
    displayName: identity?.displayName || "",
    side: side || null,
  });
}

function parseProfileMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p.displayName !== "string") return null;
    return {
      playerId: typeof p.playerId === "string" ? p.playerId : "",
      displayName: p.displayName,
      side: typeof p.side === "string" ? p.side : null,
    };
  } catch {
    return null;
  }
}

function parseSetupMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== "object") return null;
    const size = Number(p.size);
    if (!Number.isFinite(size)) return null;
    return { size: Math.floor(size) };
  } catch {
    return null;
  }
}

// A command is a plain serializable object { type, player, ...payload }. The core
// reducer is the real validator — here we only confirm the wire shape so a
// malformed frame can't crash the apply path.
function parseCommandMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== "object") return null;
    if (typeof p.command !== "object" || p.command === null) return null;
    const command = p.command;
    if (typeof command.type !== "string") return null;
    if (!Number.isFinite(Number(command.player))) return null;
    return { command };
  } catch {
    return null;
  }
}

function parseHashMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== "object") return null;
    if (typeof p.hash !== "string") return null;
    const revision = Number(p.revision);
    if (!Number.isFinite(revision)) return null;
    return { revision: Math.floor(revision), hash: p.hash };
  } catch {
    return null;
  }
}

function _normalizeCountValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function normalizeQueueCounts(payload) {
  if (!payload || typeof payload !== "object") return null;
  const nested =
    payload.queueCounts && typeof payload.queueCounts === "object"
      ? payload.queueCounts
      : null;
  const p1 = _normalizeCountValue(payload.p1Waiting ?? nested?.p1);
  const p2 = _normalizeCountValue(payload.p2Waiting ?? nested?.p2);
  if (p1 == null && p2 == null) return null;
  return { p1, p2 };
}

// ─── Client factory ──────────────────────────────────────────────────────────

export function createOnlineClient() {
  let ws = null;
  let _clientId = null;
  let _mySide = null; // 'p1' (host) | 'p2' (guest)
  let _roomCode = null;
  let _inRoom = false;
  let _identity = null;
  let _latencyMs = null;
  let _pingTimer = null;

  const cb = {
    onConnected: null, // ()
    onQueueCounts: null, // ({ p1, p2 })
    onSearching: null, // ()
    onSearchCancelled: null, // ()
    onRoomCreated: null, // (code)
    onMatchReady: null, // ({ seed, remoteSide, serverNow, startAt })
    onRemoteProfile: null, // ({ playerId, displayName, side })
    onRemoteSetup: null, // ({ size })
    onRemoteCommand: null, // ({ command })
    onRemoteHash: null, // ({ revision, hash })
    onLatency: null, // (ms)
    onSideConflict: null, // ()
    onPartnerLeft: null, // ()
    onError: null, // (code, message)
  };

  function _send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  function _roomMsg(messageType, value) {
    _send({
      type: "room_message",
      messageType,
      value: typeof value === "string" ? value : JSON.stringify(value),
    });
  }

  function _broadcastProfile() {
    if (!_identity?.displayName) return;
    _roomMsg("profile", buildProfileMessage(_identity, _mySide));
  }

  function _handleRoomMsg({ messageType, value }) {
    switch (messageType) {
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
        _roomMsg("pong", value);
        return;
      }
      case "pong": {
        try {
          const p = JSON.parse(value);
          if (typeof p.t === "number") {
            _latencyMs = Math.round((Date.now() - p.t) / 2);
            cb.onLatency?.(_latencyMs);
          }
        } catch {}
        return;
      }
    }
  }

  function _onEvent(data) {
    const counts = normalizeQueueCounts(data);
    if (counts) cb.onQueueCounts?.(counts);

    switch (data.event) {
      case "connected":
        _clientId = data.clientId;
        cb.onConnected?.();
        return;
      case "searching":
        cb.onSearching?.();
        return;
      case "search_cancelled":
        cb.onSearchCancelled?.();
        return;
      case "queue_status":
        return;
      case "room_joined":
        _roomCode = data.roomCode;
        _broadcastProfile();
        if (data.created) cb.onRoomCreated?.(data.roomCode);
        return;
      case "player_joined":
        if (data.playerCount === 2) {
          _inRoom = true;
          _broadcastProfile();
        }
        return;
      case "match_ready":
        _inRoom = true;
        // The relay tells each client the OTHER player's side; ours is the
        // opposite. Never trust a locally-claimed side past this point.
        if (data.remoteSide) _mySide = data.remoteSide === "p1" ? "p2" : "p1";
        cb.onMatchReady?.({
          seed: data.seed,
          remoteSide: data.remoteSide || null,
          serverNow: data.serverNow,
          startAt: data.startAt,
        });
        _broadcastProfile();
        return;
      case "player_left":
        if (_inRoom) cb.onPartnerLeft?.();
        return;
      case "message":
        if (data.senderId === _clientId) return;
        _handleRoomMsg(data);
        return;
      case "error":
        if (data.code === "SIDE_CONFLICT") {
          cb.onSideConflict?.();
          return;
        }
        cb.onError?.(data.code, data.message);
        return;
    }
  }

  function connect() {
    if (ws) return;
    ws = new WebSocket(WS_URL);
    ws.addEventListener("message", (e) => {
      try {
        _onEvent(JSON.parse(e.data));
      } catch {
        /* ignore malformed */
      }
    });
    ws.addEventListener("close", () => {
      if (_inRoom) cb.onPartnerLeft?.();
      ws = null;
      _clientId = null;
      _roomCode = null;
      _inRoom = false;
    });
    ws.addEventListener("error", () => {
      cb.onError?.("WS_ERROR", "Connection error");
    });
  }

  function findMatch(side) {
    _mySide = side;
    _send({ type: "find_match", gameId: GAME_ID, side, ...sanitizeIdentityPayload(_identity) });
  }

  function createRoom(side) {
    _mySide = side;
    _send({ type: "create_room", gameId: GAME_ID, side, ...sanitizeIdentityPayload(_identity) });
  }

  function joinRoom(side, code) {
    _mySide = side;
    _send({
      type: "join_room",
      gameId: GAME_ID,
      roomCode: String(code).trim().toUpperCase(),
      side,
      ...sanitizeIdentityPayload(_identity),
    });
  }

  function setIdentity(identity) {
    _identity =
      identity && typeof identity.displayName === "string"
        ? {
            playerId: typeof identity.playerId === "string" ? identity.playerId : "",
            displayName: identity.displayName,
          }
        : null;
  }

  function requestQueueStatus() {
    _send({ type: "queue_status", gameId: GAME_ID });
  }

  function cancelSearch() {
    _send({ type: "cancel_match" });
  }

  function cancelRoom() {
    _send({ type: "leave_room" });
    _roomCode = null;
    _inRoom = false;
  }

  // ── Outbound gameplay messages ──
  function sendSetup(size) {
    _roomMsg("setup", JSON.stringify({ size }));
  }
  function sendCommand(command) {
    _roomMsg("command", JSON.stringify({ command }));
  }
  function sendHash(revision, hash) {
    _roomMsg("hash", JSON.stringify({ revision, hash }));
  }

  function startPinging() {
    stopPinging();
    _pingTimer = setInterval(() => _roomMsg("ping", JSON.stringify({ t: Date.now() })), 2000);
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
  function getMySide() {
    return _mySide;
  }
  function isHost() {
    return _mySide === "p1";
  }
  function getRoomCode() {
    return _roomCode;
  }

  function disconnect() {
    stopPinging();
    _inRoom = false;
    _roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    stopPinging();
    _roomCode = null;
    _inRoom = false;
  }

  return {
    connect,
    findMatch,
    createRoom,
    joinRoom,
    requestQueueStatus,
    cancelSearch,
    cancelRoom,
    setIdentity,
    sendSetup,
    sendCommand,
    sendHash,
    startPinging,
    stopPinging,
    getLatencyMs,
    getMySide,
    isHost,
    getRoomCode,
    disconnect,
    reset,
    cb,
  };
}
