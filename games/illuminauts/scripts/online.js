// online.js — WebSocket network layer for Illuminauts.
// All new WebSocket() calls live here. Nothing outside this file may call new WebSocket directly.

const WS_URL = 'wss://factory-network-server-production.up.railway.app';

export function createOnlineClient() {
  let ws         = null;
  let _clientId  = null;
  let _inRoom    = false;
  let _coordinator = false;

  // Caller assigns callbacks directly: onlineClient.cb.onConnected = () => { ... }
  const cb = {
    onConnected:    null, // ()
    onSearching:    null, // ()
    onRoomCreated:  null, // (code: string)
    onMatchReady:   null, // ({ remoteSide, serverNow, startAt })
    onRemoteMessage: null, // ({ messageType, value })
    onPartnerLeft:  null, // ()
    onError:        null, // (code, message)
  };

  // ─── Internal helpers ────────────────────────────────────────────────────────

  function _send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function _roomMsg(messageType, value) {
    _send({ type: 'room_message', messageType, value: JSON.stringify(value) });
  }

  function _handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.event) {
      case 'connected':
        // Server sends this as its first message with the assigned clientId.
        _clientId = msg.clientId || _clientId;
        cb.onConnected?.();
        break;

      case 'room_joined':
        // Fired for both create_room (created:true) and join_room (created:false).
        if (msg.created) {
          _coordinator = true;
          cb.onRoomCreated?.(msg.roomCode ?? msg.code ?? '');
        }
        break;

      case 'searching':
        cb.onSearching?.();
        break;

      case 'match_ready':
        _inRoom = true;
        cb.onMatchReady?.({
          remoteSide: msg.remoteSide ?? null,
          serverNow:  msg.serverNow  ?? Date.now(),
          startAt:    msg.startAt    ?? (Date.now() + 3000),
        });
        break;

      case 'player_left':
      case 'partner_left':
      case 'opponent_left':
        if (_inRoom) {
          _inRoom = false;
          cb.onPartnerLeft?.();
        }
        break;

      case 'message':
        // Server relays room_message payloads with event:'message'.
        if (_clientId && msg.senderId === _clientId) return; // filter self-echo
        {
          let value;
          try { value = JSON.parse(msg.value); } catch { value = msg.value; }
          cb.onRemoteMessage?.({ messageType: msg.messageType, value });
        }
        break;
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  function connect() {
    if (ws) return; // already connected — don't double-open
    ws = new WebSocket(WS_URL);

    ws.addEventListener('message', (e) => {
      _handleMessage(e.data);
    });

    ws.addEventListener('close', () => {
      if (_inRoom) {
        _inRoom = false;
        cb.onPartnerLeft?.();
      }
      ws = null;
    });

    ws.addEventListener('error', () => {
      cb.onError?.('connection_failed', 'Could not reach the server. Check your connection.');
    });
  }

  return {
    cb,

    connect,

    // side: 'alpha' | 'beta' — server queues alpha with beta
    findMatch(side, playerId, displayName) {
      _send({ type: 'find_match', gameId: 'illuminauts', side, playerId, displayName });
    },

    createRoom(side, playerId, displayName) {
      _coordinator = true;
      _send({ type: 'create_room', side, playerId, displayName });
    },

    joinRoom(side, code, playerId, displayName) {
      _coordinator = false;
      _send({ type: 'join_room', roomCode: code.trim().toUpperCase(), side, playerId, displayName });
    },

    cancelSearch() {
      _send({ type: 'cancel_match' });
    },

    cancelRoom() {
      _inRoom = false;
      _coordinator = false;
      _send({ type: 'leave_room' });
    },

    sendPosition(x, y, dir) {
      _roomMsg('position', { x, y, dir });
    },

    sendEvent(type, data = {}) {
      _roomMsg('event', { type, ...data });
    },

    sendProfile(playerId, displayName, side) {
      _roomMsg('profile', { playerId, displayName, side });
    },

    disconnect() {
      _inRoom = false;
      _coordinator = false;
      ws?.close();
      ws = null;
    },
  };
}
