// online.js — WebSocket client for Creature Battler online 1v1.
// All new WebSocket() calls live here.

const CB_WS_URL = 'wss://factory-network-server-production.up.railway.app';

function buildCbGameId(pickStyle, levelCap) {
  // levelCap: 'any' or a number
  const lvlStr = (levelCap === 'any') ? 'any' : `lv${levelCap}`;
  return `creature-battler-${pickStyle}-${lvlStr}`;
}

function createCbOnlineClient() {
  let ws             = null;
  let _clientId      = null;
  let _inRoom        = false;
  let _isCoordinator = false;
  let _mySide        = null;
  let _pendingSends  = [];
  let _heartbeatTimer = null;

  function _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 20000);
  }

  function _stopHeartbeat() {
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  }

  const cb = {
    onConnected:     null, // ()
    onSearching:     null, // ()
    onRoomCreated:   null, // (code: string)
    onMatchReady:    null, // ({ remoteSide })
    onRemoteMessage: null, // ({ messageType, value })
    onPartnerLeft:   null, // ()
    onError:         null, // (code, message)
  };

  function _send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    _pendingSends.push(payload);
    return false;
  }

  function _flushPendingSends() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const sends = _pendingSends;
    _pendingSends = [];
    for (const payload of sends) {
      ws.send(JSON.stringify(payload));
    }
  }

  function _roomMsg(messageType, value) {
    _send({ type: 'room_message', messageType, value: JSON.stringify(value) });
  }

  function _handle(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.event) {
      case 'connected':
        _clientId = msg.clientId ?? _clientId;
        cb.onConnected?.();
        break;

      case 'room_joined':
        if (msg.created) {
          _isCoordinator = true;
          cb.onRoomCreated?.(msg.roomCode ?? msg.code ?? '');
        }
        break;

      case 'searching':
        cb.onSearching?.();
        break;

      case 'error':
      case 'match_error':
      case 'room_error':
        cb.onError?.(
          msg.code ?? msg.errorCode ?? 'online_error',
          msg.message ?? msg.error ?? 'The online service could not complete that request.'
        );
        break;

      case 'match_ready':
        _inRoom = true;
        _startHeartbeat();
        // Server assigned sides; derive ours from remoteSide so both players agree.
        if (msg.remoteSide) _mySide = msg.remoteSide === 'alpha' ? 'beta' : 'alpha';
        if (_mySide) _isCoordinator = (_mySide === 'alpha');
        cb.onMatchReady?.({ remoteSide: msg.remoteSide ?? null, seed: msg.seed ?? null });
        break;

      case 'player_left':
      case 'partner_left':
      case 'opponent_left':
        if (_inRoom) { _inRoom = false; cb.onPartnerLeft?.(); }
        break;

      case 'message':
        if (_clientId && msg.senderId === _clientId) return;
        {
          let value;
          try { value = JSON.parse(msg.value); } catch { value = msg.value; }
          cb.onRemoteMessage?.({ messageType: msg.messageType, value });
        }
        break;
    }
  }

  return {
    cb,
    get isCoordinator() { return _isCoordinator; },

    connect() {
      if (ws) return;
      ws = new WebSocket(CB_WS_URL);
      ws.addEventListener('open', _flushPendingSends);
      ws.addEventListener('message', e => _handle(e.data));
      ws.addEventListener('close', () => {
        _stopHeartbeat();
        if (_inRoom) { _inRoom = false; cb.onPartnerLeft?.(); }
        ws = null;
      });
      ws.addEventListener('error', () => {
        cb.onError?.('connection_failed', 'Could not reach the server. Check your connection.');
      });
    },

    // levelCap: 'any' or a number from ONLINE_LEVEL_OPTIONS
    findMatch(pickStyle, levelCap, playerId, displayName) {
      _send({ type: 'find_match', gameId: buildCbGameId(pickStyle, levelCap), playerId, displayName });
    },

    createRoom(playerId, displayName) {
      _isCoordinator = true;
      _mySide = 'alpha';
      _send({ type: 'create_room', side: 'alpha', playerId, displayName });
    },

    joinRoom(code, playerId, displayName) {
      _isCoordinator = false;
      _mySide = 'beta';
      _send({ type: 'join_room', roomCode: code.trim().toUpperCase(), side: 'beta', playerId, displayName });
    },

    cancelSearch() { _send({ type: 'cancel_match' }); },
    cancelRoom()   { _inRoom = false; _isCoordinator = false; _send({ type: 'leave_room' }); },

    send(messageType, value) { _roomMsg(messageType, value); },

    disconnect() {
      _stopHeartbeat();
      _inRoom = false;
      _isCoordinator = false;
      _pendingSends = [];
      ws?.close();
      ws = null;
    },
  };
}
