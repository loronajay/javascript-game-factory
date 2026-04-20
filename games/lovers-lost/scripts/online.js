// online.js — WebSocket network layer for online co-op.
// All raw WebSocket calls live here. Nothing outside this file may call new WebSocket directly.

const WS_URL = 'wss://factory-network-server-production.up.railway.app';

function serializeActionMessage(action, phase = 'press') {
  return JSON.stringify({ action, phase });
}

function buildFindMatchPayload(side, gameId = 'lovers-lost') {
  return { type: 'find_match', gameId, side };
}

function buildCreateRoomPayload(side) {
  return { type: 'create_room', side };
}

function buildJoinRoomPayload(side, code) {
  return { type: 'join_room', roomCode: code.trim().toUpperCase(), side };
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

export function createOnlineClient() {
  let ws           = null;
  let _clientId    = null;   // assigned by server on connect; used to filter self-echo
  let _mySide      = null;
  let _remoteSide  = null;
  let _roomCode    = null;
  let _coordinator = false;  // true if we created the private room
  let _inRoom      = false;  // true once both players are confirmed in room

  // Callbacks — caller assigns these after createOnlineClient()
  const cb = {
    onConnected:       null,  // ()
    onSearching:       null,  // () — entered public queue
    onSearchCancelled: null,  // () — cancelled before match
    onRoomCreated:     null,  // (code) — private room created, waiting for partner
    onMatchReady:      null,  // ({ seed, remoteSide, serverNow, startAt })
    onRemoteAction:    null,  // ({ action, phase })
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
    }
  }

  // ─── Server event dispatcher ──────────────────────────────────────────────

  function _onEvent(data) {
    const ev = data.event;

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

    if (ev === 'room_joined') {
      _roomCode = data.roomCode;

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
    _send(buildFindMatchPayload(side));
  }

  function createRoom(side) {
    _mySide = side; _coordinator = true;
    _send(buildCreateRoomPayload(side));
  }

  function joinRoom(side, code) {
    _mySide = side; _coordinator = false;
    _send(buildJoinRoomPayload(side, code));
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

  function disconnect() {
    _inRoom = false; _roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    _roomCode = null; _remoteSide = null;
    _inRoom = false; _coordinator = false;
  }

  return { connect, findMatch, createRoom, joinRoom, cancelSearch, cancelRoom, sendAction, disconnect, reset, cb };
}

export {
  buildCreateRoomPayload,
  buildFindMatchPayload,
  buildJoinRoomPayload,
  getCountdownSecondsRemaining,
  hasCountdownStarted,
  parseActionMessage,
  serializeActionMessage,
};
