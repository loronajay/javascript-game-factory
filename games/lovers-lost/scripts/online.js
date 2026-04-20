// online.js — WebSocket network layer for online co-op.
// All raw WebSocket calls live here. Nothing outside this file may call new WebSocket directly.

const WS_URL = 'wss://factory-network-server-production.up.railway.app';

function serializeActionMessage(action, phase = 'press') {
  return JSON.stringify({ action, phase });
}

function serializeSnapshotMessage(snapshot) {
  return JSON.stringify(snapshot);
}

function sanitizeIdentityPayload(identity) {
  if (!identity || typeof identity !== 'object') return {};

  const payload = {};
  if (typeof identity.playerId === 'string' && identity.playerId.trim()) {
    payload.playerId = identity.playerId.trim();
  }
  if (typeof identity.displayName === 'string') {
    payload.displayName = identity.displayName;
  }
  return payload;
}

function buildProfileMessage(identity, side) {
  return JSON.stringify({
    playerId: typeof identity?.playerId === 'string' ? identity.playerId : '',
    displayName: identity?.displayName || '',
    side: side || null,
  });
}

function parseProfileMessage(value) {
  if (typeof value !== 'string' || value.length === 0) return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed.displayName !== 'string') return null;
    return {
      playerId: typeof parsed.playerId === 'string' ? parsed.playerId : '',
      displayName: parsed.displayName,
      side: typeof parsed.side === 'string' ? parsed.side : null,
    };
  } catch {
    return null;
  }
}

function buildFindMatchPayload(side, gameId = 'lovers-lost', identity = null) {
  return { type: 'find_match', gameId, side, ...sanitizeIdentityPayload(identity) };
}

function buildCreateRoomPayload(side, identity = null) {
  return { type: 'create_room', side, ...sanitizeIdentityPayload(identity) };
}

function buildJoinRoomPayload(side, code, identity = null) {
  return { type: 'join_room', roomCode: code.trim().toUpperCase(), side, ...sanitizeIdentityPayload(identity) };
}

function buildQueueStatusPayload(gameId = 'lovers-lost') {
  return { type: 'queue_status', gameId };
}

function getCountdownSecondsRemaining(startAt, clockOffsetMs, clientNow = Date.now()) {
  const msRemaining = startAt - (clientNow + clockOffsetMs);
  if (msRemaining <= 0) return 0;
  return Math.ceil(msRemaining / 1000);
}

function hasCountdownStarted(startAt, clockOffsetMs, clientNow = Date.now()) {
  return clientNow + clockOffsetMs >= startAt;
}

function parseActionMessage(value) {
  if (typeof value !== 'string' || value.length === 0) return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed.action !== 'string') return null;
    return {
      action: parsed.action,
      phase: parsed.phase === 'release' ? 'release' : 'press',
    };
  } catch {
    return { action: value, phase: 'press' };
  }
}

function parseSnapshotMessage(value) {
  if (typeof value !== 'string' || value.length === 0) return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.player || typeof parsed.player !== 'object') return null;

    const seq = Number(parsed.seq);
    if (!Number.isFinite(seq)) return null;

    const obstacleCount = Number(parsed.obstacleCount);
    const elapsed = Number(parsed.elapsed);
    const anim = parsed.anim && typeof parsed.anim === 'object'
      ? {
          state: typeof parsed.anim.state === 'string' ? parsed.anim.state : 'running',
          actionTick: Math.max(0, Math.floor(Number(parsed.anim.actionTick) || 0)),
        }
      : { state: 'running', actionTick: 0 };

    const resolved = Array.isArray(parsed.resolved)
      ? parsed.resolved.map(item => ({
          feedback: typeof item?.feedback === 'string' ? item.feedback : null,
          effectType: typeof item?.effectType === 'string' ? item.effectType : null,
          hit: !!item?.hit,
          linger: !!item?.linger,
          goblinDeath: !!item?.goblinDeath,
        }))
      : [];

    return {
      seq: Math.floor(seq),
      elapsed: Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed)) : 0,
      obstacleCount: Number.isFinite(obstacleCount) ? Math.max(0, Math.floor(obstacleCount)) : 0,
      player: { ...parsed.player },
      anim,
      resolved,
    };
  } catch {
    return null;
  }
}

function _normalizeQueueCountValue(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  return Math.max(0, Math.floor(count));
}

function normalizeQueueCounts(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const directBoy = _normalizeQueueCountValue(payload.boyWaiting ?? payload.boyCount ?? payload.boyQueue);
  const directGirl = _normalizeQueueCountValue(payload.girlWaiting ?? payload.girlCount ?? payload.girlQueue);

  const nested = payload.queueCounts && typeof payload.queueCounts === 'object'
    ? payload.queueCounts
    : payload.waiting && typeof payload.waiting === 'object'
      ? payload.waiting
      : null;

  const boy = directBoy ?? _normalizeQueueCountValue(nested?.boy);
  const girl = directGirl ?? _normalizeQueueCountValue(nested?.girl);

  if (boy == null && girl == null) return null;
  return { boy, girl };
}

export function createOnlineClient() {
  let ws           = null;
  let _clientId    = null;   // assigned by server on connect; used to filter self-echo
  let _mySide      = null;
  let _remoteSide  = null;
  let _roomCode    = null;
  let _coordinator = false;  // true if we created the private room
  let _inRoom      = false;  // true once both players are confirmed in room
  let _pendingSeed = null;
  let _startResolved = false;
  let _legacyStartTimer = null;
  let _identity = null;

  // Callbacks — caller assigns these after createOnlineClient()
  const cb = {
    onConnected:       null,  // ()
    onQueueCounts:     null,  // ({ boy, girl })
    onSearching:       null,  // () — entered public queue
    onSearchCancelled: null,  // () — cancelled before match
    onRoomCreated:     null,  // (code) — private room created, waiting for partner
    onMatchReady:      null,  // ({ seed, remoteSide, serverNow, startAt })
    onRemoteAction:    null,  // ({ action, phase })
    onRemoteSnapshot:  null,  // (snapshot)
    onRemoteProfile:   null,  // ({ displayName, side })
    onSideConflict:    null,  // () — both players picked same side
    onPartnerLeft:     null,  // () — partner disconnected during a run
    onError:           null,  // (code: string, message: string)
  };

  // ─── Internal send helpers ────────────────────────────────────────────────

  function _send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function _roomMsg(messageType, value = '') {
    _send({
      type: 'room_message',
      messageType,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    });
  }

  // ─── Handshake logic ──────────────────────────────────────────────────────
  // Protocol once both players are in a room:
  //   coordinator  → hello      { side, seed }
  //   non-coord    → hello_ack  { side }         (or side_conflict)
  //   coordinator  → match_start { seed, startTime }
  //   Both call onMatchStart and begin the run.

  function _handleRoomMsg({ messageType, value }) {
    if (messageType === 'action') {
      const actionMessage = parseActionMessage(value);
      if (actionMessage) cb.onRemoteAction?.(actionMessage);
      return;
    }

    if (messageType === 'snapshot') {
      const snapshot = parseSnapshotMessage(value);
      if (snapshot) cb.onRemoteSnapshot?.(snapshot);
      return;
    }

    if (messageType === 'profile') {
      const profile = parseProfileMessage(value);
      if (profile) cb.onRemoteProfile?.(profile);
    }
  }

  function _broadcastProfile() {
    if (!_identity?.displayName) return;
    _roomMsg('profile', buildProfileMessage(_identity, _mySide));
  }

  // ─── Server event dispatcher ──────────────────────────────────────────────

  function _onEvent(data) {
    const ev = data.event;
    const queueCounts = normalizeQueueCounts(data);

    if (queueCounts) cb.onQueueCounts?.(queueCounts);

    if (ev === 'connected') {
      _clientId = data.clientId;
      cb.onConnected?.();
      return;
    }

    // Entered public queue — we are now the coordinator (we were first in queue)
    if (ev === 'searching') {
      _coordinator = false;
      cb.onSearching?.();
      return;
    }

    if (ev === 'search_cancelled') {
      cb.onSearchCancelled?.();
      return;
    }

    if (ev === 'queue_status') {
      return;
    }

    if (ev === 'room_joined') {
      _roomCode = data.roomCode;
      _broadcastProfile();

      if (data.created) {
        // We created a private room — coordinator, waiting for partner
        _coordinator = true;
        cb.onRoomCreated?.(data.roomCode);
        return;
      }

      // Joined an existing room (find_match or join_room).
      // If already full (playerCount=2), non-coordinator just waits for 'hello'.
      // Coordinator path is handled by player_joined below.
      return;
    }

    if (ev === 'player_joined' && data.playerCount === 2) {
      _inRoom = true;
      _broadcastProfile();
      return;
    }

    if (ev === 'match_ready') {
      _inRoom = true;
      _remoteSide = data.remoteSide || null;
      cb.onMatchReady?.({
        seed: data.seed,
        remoteSide: _remoteSide,
        serverNow: data.serverNow,
        startAt: data.startAt,
      });
      _broadcastProfile();
      return;
    }

    if (ev === 'player_left') {
      if (_inRoom) cb.onPartnerLeft?.();
      return;
    }

    if (ev === 'message') {
      if (data.senderId === _clientId) return; // server echoes messages to sender — ignore own
      _handleRoomMsg(data);
      return;
    }

    if (ev === 'error') {
      if (data.code === 'SIDE_CONFLICT') {
        cb.onSideConflict?.();
        return;
      }
      cb.onError?.(data.code, data.message);
      return;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

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
    _mySide = side; _coordinator = false;
    _send(buildFindMatchPayload(side, 'lovers-lost', _identity));
  }

  function createRoom(side) {
    _mySide = side; _coordinator = true;
    _send(buildCreateRoomPayload(side, _identity));
  }

  function joinRoom(side, code) {
    _mySide = side; _coordinator = false;
    _send(buildJoinRoomPayload(side, code, _identity));
  }

  function setIdentity(identity) {
    _identity = identity && typeof identity.displayName === 'string'
      ? {
          playerId: typeof identity.playerId === 'string' ? identity.playerId : '',
          displayName: identity.displayName,
        }
      : null;
  }

  function requestQueueStatus(gameId = 'lovers-lost') {
    _send(buildQueueStatusPayload(gameId));
  }

  function cancelSearch() {
    _send({ type: 'cancel_match' });
    _coordinator = false;
  }

  function cancelRoom() {
    _send({ type: 'leave_room' });
    _roomCode = null; _inRoom = false; _coordinator = false;
  }

  function sendAction(action, phase = 'press') {
    _roomMsg('action', serializeActionMessage(action, phase));
  }

  function sendSnapshot(snapshot) {
    _roomMsg('snapshot', serializeSnapshotMessage(snapshot));
  }

  function disconnect() {
    _inRoom = false; _roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    _roomCode = null; _remoteSide = null;
    _inRoom = false; _coordinator = false;
  }

  return { connect, findMatch, createRoom, joinRoom, requestQueueStatus, cancelSearch, cancelRoom, sendAction, sendSnapshot, setIdentity, disconnect, reset, cb };
}

export {
  buildProfileMessage,
  buildCreateRoomPayload,
  buildFindMatchPayload,
  buildJoinRoomPayload,
  buildQueueStatusPayload,
  getCountdownSecondsRemaining,
  hasCountdownStarted,
  normalizeQueueCounts,
  parseActionMessage,
  parseProfileMessage,
  parseSnapshotMessage,
  serializeActionMessage,
  serializeSnapshotMessage,
};
