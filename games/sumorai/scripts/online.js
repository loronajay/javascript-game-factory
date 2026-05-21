// online.js — WebSocket network layer for Sumorai online play.
// All raw WebSocket calls live here; nothing outside this file may call new WebSocket directly.

const WS_URL = 'wss://factory-network-server-production.up.railway.app';

function sanitizeIdentityPayload(identity) {
  if (!identity || typeof identity !== 'object') return {};
  const payload = {};
  if (typeof identity.playerId === 'string' && identity.playerId.trim())
    payload.playerId = identity.playerId.trim();
  if (typeof identity.displayName === 'string')
    payload.displayName = identity.displayName;
  return payload;
}

function buildProfileMessage(identity, side) {
  return JSON.stringify({
    playerId:    typeof identity?.playerId === 'string' ? identity.playerId : '',
    displayName: identity?.displayName || '',
    side:        side || null,
  });
}

function parseProfileMessage(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p.displayName !== 'string') return null;
    return {
      playerId:    typeof p.playerId === 'string' ? p.playerId : '',
      displayName: p.displayName,
      side:        typeof p.side === 'string' ? p.side : null,
    };
  } catch { return null; }
}

function parseInputMessage(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    const seq = Number(p.seq);
    if (!Number.isFinite(seq)) return null;
    return {
      seq:               Math.floor(seq),
      left:              !!p.left,
      right:             !!p.right,
      up:                !!p.up,
      down:              !!p.down,
      attack:            !!p.attack,
      dash:              !!p.dash,
      projectile:        !!p.projectile,
      attackJustPressed: !!p.attackJustPressed,
    };
  } catch { return null; }
}

function parseRoundEndMessage(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const p = JSON.parse(value);
    if (!p || typeof p !== 'object') return null;
    if (p.winner !== 'p1' && p.winner !== 'p2' && p.winner !== 'draw') return null;
    return { winner: p.winner };
  } catch { return null; }
}

function _normalizeCountValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function normalizeQueueCounts(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const p1 = _normalizeCountValue(payload.p1Waiting ?? payload.p1Count ?? payload.p1Queue);
  const p2 = _normalizeCountValue(payload.p2Waiting ?? payload.p2Count ?? payload.p2Queue);
  const nested = (payload.queueCounts && typeof payload.queueCounts === 'object')
    ? payload.queueCounts
    : (payload.waiting && typeof payload.waiting === 'object' ? payload.waiting : null);
  const np1 = nested ? _normalizeCountValue(nested.p1) : null;
  const np2 = nested ? _normalizeCountValue(nested.p2) : null;
  const fp1 = p1 ?? np1;
  const fp2 = p2 ?? np2;
  if (fp1 == null && fp2 == null) return null;
  return { p1: fp1, p2: fp2 };
}

export function getCountdownSecondsRemaining(startAt, clockOffsetMs, clientNow = Date.now()) {
  const ms = startAt - (clientNow + clockOffsetMs);
  return ms <= 0 ? 0 : Math.ceil(ms / 1000);
}

export function hasCountdownStarted(startAt, clockOffsetMs, clientNow = Date.now()) {
  return clientNow + clockOffsetMs >= startAt;
}

export function createOnlineClient() {
  let ws           = null;
  let _clientId    = null;
  let _mySide      = null;
  let _roomCode    = null;
  let _inRoom      = false;
  let _coordinator = false;
  let _identity    = null;

  const cb = {
    onConnected:       null,  // ()
    onQueueCounts:     null,  // ({ p1, p2 })
    onSearching:       null,  // ()
    onSearchCancelled: null,  // ()
    onRoomCreated:     null,  // (code)
    onMatchReady:      null,  // ({ seed, remoteSide, serverNow, startAt })
    onRemoteProfile:   null,  // ({ playerId, displayName, side })
    onRemoteInput:     null,  // (inputSnapshot) — fired each game tick
    onRemoteRoundEnd:  null,  // ({ winner })
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
      type: 'room_message',
      messageType,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    });
  }

  function _broadcastProfile() {
    if (!_identity?.displayName) return;
    _roomMsg('profile', buildProfileMessage(_identity, _mySide));
  }

  function _handleRoomMsg({ messageType, value }) {
    if (messageType === 'input') {
      const snap = parseInputMessage(value);
      if (snap) cb.onRemoteInput?.(snap);
      return;
    }
    if (messageType === 'round_end') {
      const re = parseRoundEndMessage(value);
      if (re) cb.onRemoteRoundEnd?.(re);
      return;
    }
    if (messageType === 'profile') {
      const profile = parseProfileMessage(value);
      if (profile) cb.onRemoteProfile?.(profile);
    }
  }

  function _onEvent(data) {
    const ev     = data.event;
    const counts = normalizeQueueCounts(data);
    if (counts) cb.onQueueCounts?.(counts);

    if (ev === 'connected') {
      _clientId = data.clientId;
      cb.onConnected?.();
      return;
    }
    if (ev === 'searching') {
      _coordinator = false;
      cb.onSearching?.();
      return;
    }
    if (ev === 'search_cancelled') {
      cb.onSearchCancelled?.();
      return;
    }
    if (ev === 'queue_status') return;
    if (ev === 'room_joined') {
      _roomCode = data.roomCode;
      _broadcastProfile();
      if (data.created) {
        _coordinator = true;
        cb.onRoomCreated?.(data.roomCode);
      }
      return;
    }
    if (ev === 'player_joined' && data.playerCount === 2) {
      _inRoom = true;
      _broadcastProfile();
      return;
    }
    if (ev === 'match_ready') {
      _inRoom = true;
      cb.onMatchReady?.({
        seed:       data.seed,
        remoteSide: data.remoteSide || null,
        serverNow:  data.serverNow,
        startAt:    data.startAt,
      });
      _broadcastProfile();
      return;
    }
    if (ev === 'player_left') {
      if (_inRoom) cb.onPartnerLeft?.();
      return;
    }
    if (ev === 'message') {
      if (data.senderId === _clientId) return;
      _handleRoomMsg(data);
      return;
    }
    if (ev === 'error') {
      if (data.code === 'SIDE_CONFLICT') { cb.onSideConflict?.(); return; }
      cb.onError?.(data.code, data.message);
    }
  }

  function connect() {
    if (ws) return;
    ws = new WebSocket(WS_URL);
    ws.addEventListener('message', e => {
      try { _onEvent(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    });
    ws.addEventListener('close', () => {
      if (_inRoom) cb.onPartnerLeft?.();
      ws = null; _clientId = null; _roomCode = null; _inRoom = false;
    });
    ws.addEventListener('error', () => {
      cb.onError?.('WS_ERROR', 'Connection error');
    });
  }

  function findMatch(side) {
    _mySide = side;
    _send({ type: 'find_match', gameId: 'sumorai', side, ...sanitizeIdentityPayload(_identity) });
  }

  function createRoom(side) {
    _mySide = side; _coordinator = true;
    _send({ type: 'create_room', side, ...sanitizeIdentityPayload(_identity) });
  }

  function joinRoom(side, code) {
    _mySide = side;
    _send({ type: 'join_room', roomCode: code.trim().toUpperCase(), side, ...sanitizeIdentityPayload(_identity) });
  }

  function setIdentity(identity) {
    _identity = identity && typeof identity.displayName === 'string'
      ? { playerId: typeof identity.playerId === 'string' ? identity.playerId : '', displayName: identity.displayName }
      : null;
  }

  function requestQueueStatus() {
    _send({ type: 'queue_status', gameId: 'sumorai' });
  }

  function cancelSearch() {
    _send({ type: 'cancel_match' });
    _coordinator = false;
  }

  function cancelRoom() {
    _send({ type: 'leave_room' });
    _roomCode = null; _inRoom = false; _coordinator = false;
  }

  function sendInput(seq, snapshot) {
    _roomMsg('input', JSON.stringify({ seq, ...snapshot }));
  }

  function sendRoundEnd(winner) {
    _roomMsg('round_end', JSON.stringify({ winner }));
  }

  function disconnect() {
    _inRoom = false; _roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    _roomCode = null; _inRoom = false; _coordinator = false;
  }

  return {
    connect, findMatch, createRoom, joinRoom, requestQueueStatus,
    cancelSearch, cancelRoom, sendInput, sendRoundEnd, setIdentity,
    disconnect, reset, cb,
  };
}
