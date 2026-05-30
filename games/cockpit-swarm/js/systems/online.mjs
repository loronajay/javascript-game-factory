// online.mjs — WebSocket network layer for Cockpit Swarm 1v1 Dodgeball.
// All raw WebSocket calls live here; nothing outside this file may call `new WebSocket` directly.
//
// Architecture (see MULTIPLAYER_SCOPE.md):
//   - Rides the GENERIC factory-network-server relay (find_match / room_message), no server changes.
//   - p1 is the HOST authority: it runs the single sim and broadcasts `state`.
//   - p2 (guest) sends only `input` and reconciles to authoritative `state`.
//
// Message contract over `room_message`:
//   guest -> host : input      { tick, railIntent: -1..1, laser, lob }   (per-tick weapon attempts)
//   host  -> both : state      { tick, p1x, p2x, p1hp, p2hp, p1heat, p2heat, p1burn, p2burn, bullets, events, round, timeMs }
//                               bullets carry kind: 'laser' | 'lob'; host owns heat/burnout truth
//   host  -> both : round_start { round, startAt }   (server-clock ms)
//   host  -> both : round_end   { winner: 'p1'|'p2'|'draw' }
//   host  -> both : match_end   { winner: 'p1'|'p2' }
//   either        : rematch    { ready }
//   either        : ping/pong  { t }   (RTT measurement)

const WS_URL = "wss://factory-network-server-production.up.railway.app";
const GAME_ID = "cockpit-swarm";

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
    playerId:    typeof identity?.playerId === "string" ? identity.playerId : "",
    displayName: identity?.displayName || "",
    side:        side || null,
  });
}

function parseProfileMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p.displayName !== "string") return null;
    return {
      playerId:    typeof p.playerId === "string" ? p.playerId : "",
      displayName: p.displayName,
      side:        typeof p.side === "string" ? p.side : null,
    };
  } catch { return null; }
}

function parseInputMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== "object") return null;
    const tick = Number(p.tick);
    if (!Number.isFinite(tick)) return null;
    let rail = Number(p.railIntent);
    if (!Number.isFinite(rail)) rail = 0;
    rail = Math.max(-1, Math.min(1, rail));
    return { tick: Math.floor(tick), railIntent: rail, laser: !!p.laser, lob: !!p.lob };
  } catch { return null; }
}

function parseStateMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== "object") return null;
    const tick = Number(p.tick);
    if (!Number.isFinite(tick)) return null;
    return {
      tick:   Math.floor(tick),
      p1x:    Number(p.p1x) || 0,
      p2x:    Number(p.p2x) || 0,
      p1hp:   Number(p.p1hp) || 0,
      p2hp:   Number(p.p2hp) || 0,
      p1heat: Number(p.p1heat) || 0,
      p2heat: Number(p.p2heat) || 0,
      p1burn: !!p.p1burn,
      p2burn: !!p.p2burn,
      bullets: Array.isArray(p.bullets) ? p.bullets : [],
      events:  Array.isArray(p.events) ? p.events : [],
      round:  Number(p.round) || 0,
      timeMs: Number(p.timeMs) || 0,
      sd:     !!p.sd,   // sudden death active (lob-only, one-hit-kill)
    };
  } catch { return null; }
}

function parseRoundStartMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== "object") return null;
    const startAt = Number(p.startAt);
    if (!Number.isFinite(startAt)) return null;
    return { round: Number(p.round) || 0, startAt };
  } catch { return null; }
}

function parseRoundEndMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== "object") return null;
    if (p.winner !== "p1" && p.winner !== "p2" && p.winner !== "draw") return null;
    return { winner: p.winner };
  } catch { return null; }
}

function parseMatchEndMessage(value) {
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== "object") return null;
    if (p.winner !== "p1" && p.winner !== "p2") return null;
    return { winner: p.winner };
  } catch { return null; }
}

function _normalizeCountValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function normalizeQueueCounts(payload) {
  if (!payload || typeof payload !== "object") return null;
  const p1 = _normalizeCountValue(payload.p1Waiting ?? payload.p1Count ?? payload.p1Queue);
  const p2 = _normalizeCountValue(payload.p2Waiting ?? payload.p2Count ?? payload.p2Queue);
  const nested = (payload.queueCounts && typeof payload.queueCounts === "object")
    ? payload.queueCounts
    : (payload.waiting && typeof payload.waiting === "object" ? payload.waiting : null);
  const np1 = nested ? _normalizeCountValue(nested.p1) : null;
  const np2 = nested ? _normalizeCountValue(nested.p2) : null;
  const fp1 = p1 ?? np1;
  const fp2 = p2 ?? np2;
  if (fp1 == null && fp2 == null) return null;
  return { p1: fp1, p2: fp2 };
}

// ─── Server-clock countdown helpers (shared by both peers) ───────────────────

export function getCountdownSecondsRemaining(startAt, clockOffsetMs, clientNow = Date.now()) {
  const ms = startAt - (clientNow + clockOffsetMs);
  return ms <= 0 ? 0 : Math.ceil(ms / 1000);
}

export function hasCountdownStarted(startAt, clockOffsetMs, clientNow = Date.now()) {
  return clientNow + clockOffsetMs >= startAt;
}

// ─── Client factory ──────────────────────────────────────────────────────────

export function createOnlineClient() {
  let ws           = null;
  let _clientId    = null;
  let _mySide      = null;   // 'p1' (host) | 'p2' (guest)
  let _roomCode    = null;
  let _inRoom      = false;
  let _identity    = null;
  let _latencyMs   = null;
  let _pingTimer   = null;

  const cb = {
    onConnected:       null,  // ()
    onQueueCounts:     null,  // ({ p1, p2 })
    onSearching:       null,  // ()
    onSearchCancelled: null,  // ()
    onRoomCreated:     null,  // (code)
    onMatchReady:      null,  // ({ seed, remoteSide, serverNow, startAt })
    onRemoteProfile:   null,  // ({ playerId, displayName, side })
    onRemoteInput:     null,  // ({ tick, railIntent, firePressed }) — host consumes
    onRemoteState:     null,  // (stateSnapshot) — guest consumes
    onRoundStart:      null,  // ({ round, startAt })
    onRemoteRoundEnd:  null,  // ({ winner })
    onMatchEnd:        null,  // ({ winner })
    onRematch:         null,  // ({ ready })
    onSideConflict:    null,  // ()
    onPartnerLeft:     null,  // ()
    onError:           null,  // (code, message)
  };

  function _send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify(payload));
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
      case "input":       { const m = parseInputMessage(value);      if (m) cb.onRemoteInput?.(m); return; }
      case "state":       { const m = parseStateMessage(value);      if (m) cb.onRemoteState?.(m); return; }
      case "round_start": { const m = parseRoundStartMessage(value); if (m) cb.onRoundStart?.(m); return; }
      case "round_end":   { const m = parseRoundEndMessage(value);   if (m) cb.onRemoteRoundEnd?.(m); return; }
      case "match_end":   { const m = parseMatchEndMessage(value);   if (m) cb.onMatchEnd?.(m); return; }
      case "rematch":     { try { cb.onRematch?.({ ready: !!JSON.parse(value).ready }); } catch {} return; }
      case "profile":     { const m = parseProfileMessage(value);    if (m) cb.onRemoteProfile?.(m); return; }
      case "ping":        { _roomMsg("pong", value); return; }
      case "pong": {
        try {
          const p = JSON.parse(value);
          if (typeof p.t === "number") _latencyMs = Math.round((Date.now() - p.t) / 2);
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
        if (data.playerCount === 2) { _inRoom = true; _broadcastProfile(); }
        return;
      case "match_ready":
        _inRoom = true;
        cb.onMatchReady?.({
          seed:       data.seed,
          remoteSide: data.remoteSide || null,
          serverNow:  data.serverNow,
          startAt:    data.startAt,
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
        if (data.code === "SIDE_CONFLICT") { cb.onSideConflict?.(); return; }
        cb.onError?.(data.code, data.message);
        return;
    }
  }

  function connect() {
    if (ws) return;
    ws = new WebSocket(WS_URL);
    ws.addEventListener("message", (e) => {
      try { _onEvent(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    });
    ws.addEventListener("close", () => {
      if (_inRoom) cb.onPartnerLeft?.();
      ws = null; _clientId = null; _roomCode = null; _inRoom = false;
    });
    ws.addEventListener("error", () => {
      cb.onError?.("WS_ERROR", "Connection error");
    });
  }

  function findMatch(side, ranked = false) {
    _mySide = side;
    const gameId = ranked ? `${GAME_ID}-ranked` : GAME_ID;
    _send({ type: "find_match", gameId, side, ...sanitizeIdentityPayload(_identity) });
  }

  function createRoom(side) {
    _mySide = side;
    _send({ type: "create_room", side, ...sanitizeIdentityPayload(_identity) });
  }

  function joinRoom(side, code) {
    _mySide = side;
    _send({ type: "join_room", roomCode: code.trim().toUpperCase(), side, ...sanitizeIdentityPayload(_identity) });
  }

  function setIdentity(identity) {
    _identity = identity && typeof identity.displayName === "string"
      ? { playerId: typeof identity.playerId === "string" ? identity.playerId : "", displayName: identity.displayName }
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
    _roomCode = null; _inRoom = false;
  }

  // ── Outbound gameplay messages ──
  function sendInput(tick, snapshot)  { _roomMsg("input", JSON.stringify({ tick, ...snapshot })); }
  function sendState(state)           { _roomMsg("state", JSON.stringify(state)); }
  function sendRoundStart(round, startAt) { _roomMsg("round_start", JSON.stringify({ round, startAt })); }
  function sendRoundEnd(winner)       { _roomMsg("round_end", JSON.stringify({ winner })); }
  function sendMatchEnd(winner)       { _roomMsg("match_end", JSON.stringify({ winner })); }
  function sendRematch(ready)         { _roomMsg("rematch", JSON.stringify({ ready: !!ready })); }

  function startPinging() {
    stopPinging();
    _pingTimer = setInterval(() => _roomMsg("ping", JSON.stringify({ t: Date.now() })), 2000);
  }

  function stopPinging() {
    if (_pingTimer !== null) { clearInterval(_pingTimer); _pingTimer = null; }
    _latencyMs = null;
  }

  function getLatencyMs() { return _latencyMs; }
  function getMySide()    { return _mySide; }
  function isHost()       { return _mySide === "p1"; }
  function getRoomCode()  { return _roomCode; }

  function disconnect() {
    stopPinging();
    _inRoom = false; _roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    stopPinging();
    _roomCode = null; _inRoom = false;
  }

  return {
    connect, findMatch, createRoom, joinRoom, requestQueueStatus,
    cancelSearch, cancelRoom, setIdentity,
    sendInput, sendState, sendRoundStart, sendRoundEnd, sendMatchEnd, sendRematch,
    startPinging, stopPinging, getLatencyMs, getMySide, isHost, getRoomCode,
    disconnect, reset, cb,
  };
}
