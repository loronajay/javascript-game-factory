// online.js — WebSocket network layer for Illuminauts.
// All new WebSocket() calls live here. Nothing outside this file may call new WebSocket directly.

const WS_URL = 'wss://factory-network-server-production.up.railway.app';

export function createOnlineClient() {
  let ws         = null;
  let _clientId  = null;
  let _inRoom    = false;
  let _coordinator = false; // true if we created the private room

  // Caller assigns callbacks after createOnlineClient().
  const cb = {
    onConnected:    null, // ()
    onSearching:    null, // ()
    onRoomCreated:  null, // (code: string)
    onMatchReady:   null, // ({ serverNow: number, startAt: number })
    onRemoteMessage: null, // ({ messageType: string, value: any })
    onPartnerLeft:  null, // ()
    onError:        null, // (code: string, message: string)
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

    // Server may send clientId on first connect or embed it in messages.
    if (msg.clientId && !_clientId) _clientId = msg.clientId;

    switch (msg.event) {
      case 'room_created':
        _coordinator = true;
        cb.onRoomCreated?.(msg.code ?? msg.roomCode ?? '');
        break;

      case 'searching':
        cb.onSearching?.();
        break;

      case 'match_ready':
        _inRoom = true;
        cb.onMatchReady?.({
          serverNow: msg.serverNow ?? Date.now(),
          startAt:   msg.startAt   ?? (Date.now() + 3000),
        });
        break;

      case 'partner_left':
      case 'opponent_left':
      case 'player_left':
        if (_inRoom) {
          _inRoom = false;
          cb.onPartnerLeft?.();
        }
        break;

      default:
        // In-room relay messages
        if (msg.type === 'room_message') {
          if (_clientId && msg.senderId === _clientId) return; // filter self-echo
          let value;
          try { value = JSON.parse(msg.value); } catch { value = msg.value; }
          cb.onRemoteMessage?.({ messageType: msg.messageType, value });
        }
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.addEventListener('open', () => {
      cb.onConnected?.();
    });

    ws.addEventListener('message', (e) => {
      _handleMessage(e.data);
    });

    ws.addEventListener('close', () => {
      if (_inRoom) {
        _inRoom = false;
        cb.onPartnerLeft?.();
      }
    });

    ws.addEventListener('error', () => {
      cb.onError?.('connection_failed', 'Could not reach the server. Check your connection.');
    });
  }

  return {
    get callbacks() { return cb; },

    connect,

    findMatch(playerId, displayName) {
      _send({ type: 'find_match', gameId: 'illuminauts', playerId, displayName });
      cb.onSearching?.();
    },

    createRoom(playerId, displayName) {
      _coordinator = true;
      _send({ type: 'create_room', playerId, displayName });
    },

    joinRoom(code, playerId, displayName) {
      _coordinator = false;
      _send({ type: 'join_room', roomCode: code.trim().toUpperCase(), playerId, displayName });
    },

    // Send local player tile position every step.
    sendPosition(x, y, dir) {
      _roomMsg('position', { x, y, dir });
    },

    // Send a game event (pickup_taken, door_opened, player_died, won).
    sendEvent(type, data = {}) {
      _roomMsg('event', { type, ...data });
    },

    // Relay identity for role determination.
    sendProfile(playerId, displayName) {
      _roomMsg('profile', { playerId, displayName });
    },

    disconnect() {
      _inRoom = false;
      ws?.close();
      ws = null;
    },
  };
}
