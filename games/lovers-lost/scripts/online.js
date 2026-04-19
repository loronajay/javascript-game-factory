// online.js — WebSocket network layer for online co-op.
// All raw WebSocket calls live here. Nothing outside this file may call new WebSocket directly.

const WS_URL = 'wss://factory-network-server-production.up.railway.app';

export function createOnlineClient() {
  let ws           = null;
  let _mySide      = null;
  let _remoteSide  = null;
  let _roomCode    = null;
  let _coordinator = false;  // true if we were the queue-waiter or room creator
  let _pendingSeed = null;   // seed chosen by coordinator, sent in 'hello'
  let _inRoom      = false;  // true once both players are confirmed in room

  // Callbacks — caller assigns these after createOnlineClient()
  const cb = {
    onConnected:       null,  // ()
    onSearching:       null,  // () — entered public queue
    onSearchCancelled: null,  // () — cancelled before match
    onRoomCreated:     null,  // (code) — private room created, waiting for partner
    onMatchStart:      null,  // (seed, remoteSide, startTime)
    onRemoteAction:    null,  // (action: string)
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

  function _sendHello() {
    _pendingSeed = (Math.random() * 0xFFFFFFFF) >>> 0;
    _roomMsg('hello', { side: _mySide, seed: _pendingSeed });
  }

  function _handleRoomMsg({ messageType, value }) {
    if (messageType === 'hello') {
      let payload;
      try { payload = JSON.parse(value); } catch { return; }
      _remoteSide = payload.side;

      if (_remoteSide === _mySide) {
        _roomMsg('side_conflict');
        cb.onSideConflict?.();
        return;
      }
      _roomMsg('hello_ack', { side: _mySide });
      // Non-coordinator waits for match_start from coordinator.
    }

    else if (messageType === 'hello_ack') {
      let payload;
      try { payload = JSON.parse(value); } catch { return; }
      _remoteSide = payload.side;

      if (_remoteSide === _mySide) {
        _roomMsg('side_conflict');
        cb.onSideConflict?.();
        return;
      }
      const startTime = Date.now();
      _roomMsg('match_start', { seed: _pendingSeed, startTime });
      cb.onMatchStart?.(_pendingSeed, _remoteSide, startTime);
    }

    else if (messageType === 'match_start') {
      let payload;
      try { payload = JSON.parse(value); } catch { return; }
      cb.onMatchStart?.(payload.seed, _remoteSide, payload.startTime);
    }

    else if (messageType === 'side_conflict') {
      cb.onSideConflict?.();
    }

    else if (messageType === 'action') {
      cb.onRemoteAction?.(value);
    }
  }

  // ─── Server event dispatcher ──────────────────────────────────────────────

  function _onEvent(data) {
    const ev = data.event;

    if (ev === 'connected') {
      cb.onConnected?.();
      return;
    }

    // Entered public queue — we are now the coordinator (we were first in queue)
    if (ev === 'searching') {
      _coordinator = true;
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
      if (_coordinator) _sendHello();
      return;
    }

    if (ev === 'player_left') {
      if (_inRoom) cb.onPartnerLeft?.();
      return;
    }

    if (ev === 'message') {
      _handleRoomMsg(data);
      return;
    }

    if (ev === 'error') {
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
      ws = null; _roomCode = null; _inRoom = false;
    });

    ws.addEventListener('error', () => {
      cb.onError?.('WS_ERROR', 'Connection error');
    });
  }

  function findMatch(side) {
    _mySide = side; _coordinator = false;
    _send({ type: 'find_match', gameId: 'lovers-lost' });
  }

  function createRoom(side) {
    _mySide = side; _coordinator = true;
    _send({ type: 'create_room' });
  }

  function joinRoom(side, code) {
    _mySide = side; _coordinator = false;
    _send({ type: 'join_room', roomCode: code.trim().toUpperCase() });
  }

  function cancelSearch() {
    _send({ type: 'cancel_match' });
    _coordinator = false;
  }

  function cancelRoom() {
    _send({ type: 'leave_room' });
    _roomCode = null; _inRoom = false; _coordinator = false; _pendingSeed = null;
  }

  function sendAction(action) {
    _roomMsg('action', action);
  }

  function disconnect() {
    _inRoom = false; _roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    _roomCode = null; _remoteSide = null;
    _inRoom = false; _coordinator = false; _pendingSeed = null;
  }

  return { connect, findMatch, createRoom, joinRoom, cancelSearch, cancelRoom, sendAction, disconnect, reset, cb };
}
