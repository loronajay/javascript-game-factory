// online.js — WebSocket network layer for Battleshits online play.
// All raw WebSocket calls live here. Nothing outside this file may call new WebSocket directly.
// Adapted from the Lovers Lost Factory Network baseline.
import { sanitizeEmoteType } from './emojis.js';

const PROD_WS_URL = 'wss://factory-network-server-production.up.railway.app';
const LOCAL_WS_PORT = '3000';

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function getOppositeMatchSide(side) {
  return side === 'alpha' ? 'beta' : 'alpha';
}

export function resolveWebSocketUrl(locationLike = globalThis.location) {
  const protocol = typeof locationLike?.protocol === 'string' ? locationLike.protocol : '';
  const hostname = typeof locationLike?.hostname === 'string' ? locationLike.hostname : '';

  if (isLocalHostname(hostname)) {
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${hostname}:${LOCAL_WS_PORT}`;
  }

  return PROD_WS_URL;
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

function parseShotMessage(value) {
  try {
    const parsed = JSON.parse(value);
    const col = Number(parsed.col);
    const row = Number(parsed.row);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    if (col < 0 || col > 9 || row < 0 || row > 9) return null;
    return { col: Math.floor(col), row: Math.floor(row) };
  } catch {
    return null;
  }
}

function parseShotResultMessage(value) {
  try {
    const parsed = JSON.parse(value);
    const col = Number(parsed.col);
    const row = Number(parsed.row);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    return {
      col: Math.floor(col),
      row: Math.floor(row),
      hit: !!parsed.hit,
      sunk: !!parsed.sunk,
      shipId: typeof parsed.shipId === 'string' ? parsed.shipId : null,
      fleetDestroyed: !!parsed.fleetDestroyed,
    };
  } catch {
    return null;
  }
}

function parseEmoteMessage(value) {
  return sanitizeEmoteType(value);
}

function normalizeQueueCounts(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const alpha = Number(payload.alphaWaiting ?? payload.alphaCount ?? 0);
  const beta = Number(payload.betaWaiting ?? payload.betaCount ?? 0);
  if (!Number.isFinite(alpha) && !Number.isFinite(beta)) return null;
  return {
    alpha: Number.isFinite(alpha) ? Math.max(0, Math.floor(alpha)) : 0,
    beta:  Number.isFinite(beta)  ? Math.max(0, Math.floor(beta))  : 0,
  };
}

export function createOnlineClient(gameId = 'battleshits') {
  const wsUrl = resolveWebSocketUrl();
  let ws          = null;
  let _clientId   = null;
  let _mySide     = null;
  let _roomCode   = null;
  let _inRoom     = false;
  let _identity   = null;

  const cb = {
    onConnected:       null,  // ()
    onQueueCounts:     null,  // ({ alpha, beta })
    onSearching:       null,  // ()
    onSearchCancelled: null,  // ()
    onRoomCreated:     null,  // (code)
    onMatchReady:      null,  // ({ seed, remoteSide, serverNow, startAt })
    onRemoteProfile:   null,  // ({ displayName, side })
    onOpponentReady:   null,  // ()
    onOpponentShot:    null,  // ({ col, row })
    onShotResult:      null,  // ({ col, row, hit, sunk, shipId, fleetDestroyed })
    onEmote:           null,  // (type: string)
    onRematch:         null,  // (type: 'request' | 'accept')
    onPartnerLeft:     null,  // ()
    onSideConflict:    null,  // ()
    onError:           null,  // (code, message)
  };

  // ─── Internal helpers ─────────────────────────────────────────────────────

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

  function _broadcastProfile() {
    if (!_identity?.displayName) return;
    _roomMsg('profile', buildProfileMessage(_identity, _mySide));
  }

  // ─── Room message dispatcher ──────────────────────────────────────────────

  function _handleRoomMsg({ messageType, value }) {
    if (messageType === 'profile') {
      const profile = parseProfileMessage(value);
      if (profile) cb.onRemoteProfile?.(profile);
      return;
    }

    if (messageType === 'placement_ready') {
      cb.onOpponentReady?.();
      return;
    }

    if (messageType === 'shot') {
      const shot = parseShotMessage(value);
      if (shot) cb.onOpponentShot?.(shot);
      return;
    }

    if (messageType === 'shot_result') {
      const result = parseShotResultMessage(value);
      if (result) cb.onShotResult?.(result);
      return;
    }

    if (messageType === 'emote') {
      const emoteType = parseEmoteMessage(value);
      if (emoteType) cb.onEmote?.(emoteType);
      return;
    }

    if (messageType === 'rematch') {
      if (value === 'request' || value === 'accept') cb.onRematch?.(value);
      return;
    }
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

    if (ev === 'searching') {
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
        seed: data.seed,
        remoteSide: data.remoteSide || null,
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
      if (data.senderId === _clientId) return;
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
    ws = new WebSocket(wsUrl);

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
    _send({ type: 'find_match', gameId, side, ...sanitizeIdentityPayload(_identity) });
  }

  function createRoom(side) {
    _mySide = side;
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
    _send({ type: 'queue_status', gameId });
  }

  function cancelSearch() {
    _send({ type: 'cancel_match' });
  }

  function cancelRoom() {
    _send({ type: 'leave_room' });
    _roomCode = null; _inRoom = false;
  }

  function sendPlacementReady() {
    _roomMsg('placement_ready', '');
  }

  function sendShot(col, row) {
    _roomMsg('shot', JSON.stringify({ col, row }));
  }

  function sendShotResult(col, row, hit, sunk, shipId, fleetDestroyed) {
    _roomMsg('shot_result', JSON.stringify({ col, row, hit, sunk, shipId, fleetDestroyed }));
  }

  function sendRematch(type) {
    _roomMsg('rematch', type);
  }

  function sendEmote(type) {
    const emoteType = sanitizeEmoteType(type);
    if (!emoteType) return;
    _roomMsg('emote', emoteType);
  }

  function disconnect() {
    _inRoom = false; _roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    _roomCode = null; _inRoom = false;
  }

  return {
    connect, findMatch, createRoom, joinRoom,
    setIdentity, requestQueueStatus, cancelSearch, cancelRoom,
    sendPlacementReady, sendShot, sendShotResult, sendRematch, sendEmote,
    disconnect, reset,
    cb,
  };
}
