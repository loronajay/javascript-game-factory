import {
  buildCreateRoomPayload,
  buildFindMatchPayload,
  buildJoinRoomPayload,
  buildQueueStatusPayload,
  parseCircuitActionIntent,
  parseProfileMessage,
  serializeCircuitActionIntent,
  serializeProfileMessage
} from "../shared/commands.js";
import {
  parseMatchEventMessage,
  parseMatchSnapshotMessage,
  serializeMatchEvent,
  serializeMatchSnapshot
} from "../shared/snapshots.js";

const PROD_WS_URL = "wss://factory-network-server-production.up.railway.app";
const LOCAL_WS_PORT = "3000";

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolveWebSocketUrl(locationLike = globalThis.location) {
  const protocol = typeof locationLike?.protocol === "string" ? locationLike.protocol : "";
  const hostname = typeof locationLike?.hostname === "string" ? locationLike.hostname : "";

  if (isLocalHostname(hostname)) {
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${hostname}:${LOCAL_WS_PORT}`;
  }

  return PROD_WS_URL;
}

export function normalizeQueueCounts(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const hasBlue = Object.prototype.hasOwnProperty.call(payload, "blueWaiting")
    || Object.prototype.hasOwnProperty.call(payload, "blueCount");
  const hasRed = Object.prototype.hasOwnProperty.call(payload, "redWaiting")
    || Object.prototype.hasOwnProperty.call(payload, "redCount");

  if (!hasBlue && !hasRed) {
    return null;
  }

  const blue = Number(payload.blueWaiting ?? payload.blueCount ?? 0);
  const red = Number(payload.redWaiting ?? payload.redCount ?? 0);

  if (!Number.isFinite(blue) && !Number.isFinite(red)) {
    return null;
  }

  return {
    blue: Number.isFinite(blue) ? Math.max(0, Math.floor(blue)) : 0,
    red: Number.isFinite(red) ? Math.max(0, Math.floor(red)) : 0
  };
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function createRemoteMatchAdapter({
  gameId = "circuit-siege",
  locationLike = globalThis.location,
  socketFactory = (url) => new WebSocket(url)
} = {}) {
  const wsUrl = resolveWebSocketUrl(locationLike);
  let ws = null;
  let clientId = null;
  let roomCode = null;
  let inRoom = false;
  let mySide = null;
  let identity = null;

  const cb = {
    onConnected: null,
    onQueueCounts: null,
    onSearching: null,
    onSearchCancelled: null,
    onRoomCreated: null,
    onRoomJoined: null,
    onRoomPresenceChanged: null,
    onMatchReady: null,
    onRemoteProfile: null,
    onIntent: null,
    onSnapshot: null,
    onMatchEvent: null,
    onPartnerLeft: null,
    onSideConflict: null,
    onError: null,
    onClosed: null
  };

  function send(payload) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }

  function sendRoomMessage(messageType, value = "") {
    send({
      type: "room_message",
      messageType,
      value: typeof value === "string" ? value : JSON.stringify(value)
    });
  }

  function handleRoomMessage(data) {
    if (data.messageType === "profile") {
      const profile = parseProfileMessage(data.value);
      if (profile) cb.onRemoteProfile?.(profile);
      return;
    }

    if (data.messageType === "circuit_intent") {
      const intent = parseCircuitActionIntent(data.value);
      if (intent) cb.onIntent?.(intent);
      return;
    }

    if (data.messageType === "match_snapshot") {
      const snapshot = parseMatchSnapshotMessage(data.value);
      if (snapshot) cb.onSnapshot?.(snapshot);
      return;
    }

    if (data.messageType === "match_event") {
      const event = parseMatchEventMessage(data.value);
      if (event) cb.onMatchEvent?.(event);
    }
  }

  function handleEvent(data) {
    const queueCounts = normalizeQueueCounts(data);
    if (queueCounts) {
      cb.onQueueCounts?.(queueCounts);
    }

    if (data.event === "connected") {
      clientId = data.clientId || null;
      cb.onConnected?.({ clientId });
      return;
    }

    if (data.event === "searching") {
      cb.onSearching?.();
      return;
    }

    if (data.event === "search_cancelled") {
      cb.onSearchCancelled?.();
      return;
    }

    if (data.event === "queue_status") {
      return;
    }

    if (data.event === "room_joined") {
      roomCode = typeof data.roomCode === "string" ? data.roomCode : null;
      cb.onRoomJoined?.({
        roomCode,
        created: !!data.created
      });
      if (data.created && roomCode) {
        cb.onRoomCreated?.(roomCode);
      }
      return;
    }

    if (data.event === "player_joined" && Number(data.playerCount) >= 2) {
      inRoom = true;
      cb.onRoomPresenceChanged?.({
        roomCode,
        playerCount: Number(data.playerCount)
      });
      return;
    }

    if (data.event === "match_ready") {
      inRoom = true;
      cb.onMatchReady?.({
        seed: data.seed,
        remoteSide: typeof data.remoteSide === "string" ? data.remoteSide : null,
        serverNow: data.serverNow,
        startAt: data.startAt,
        roomCode
      });
      return;
    }

    if (data.event === "player_left") {
      if (Number.isFinite(Number(data.playerCount))) {
        inRoom = Number(data.playerCount) >= 2;
        cb.onRoomPresenceChanged?.({
          roomCode,
          playerCount: Number(data.playerCount)
        });
        return;
      }

      if (inRoom) {
        cb.onPartnerLeft?.();
      }
      return;
    }

    if (data.event === "message") {
      if (data.senderId === clientId) {
        return;
      }
      handleRoomMessage(data);
      return;
    }

    if (data.event === "error") {
      if (data.code === "SIDE_CONFLICT") {
        cb.onSideConflict?.();
        return;
      }
      cb.onError?.(data.code, data.message);
    }
  }

  function connect() {
    if (ws) return;

    ws = socketFactory(wsUrl);
    ws.addEventListener("message", (event) => {
      const data = safeParseJson(event.data);
      if (data) handleEvent(data);
    });
    ws.addEventListener("close", () => {
      if (inRoom) {
        cb.onPartnerLeft?.();
      }
      ws = null;
      clientId = null;
      roomCode = null;
      inRoom = false;
      cb.onClosed?.();
    });
    ws.addEventListener("error", () => {
      cb.onError?.("WS_ERROR", "Connection error");
    });
  }

  function setIdentity(nextIdentity) {
    identity = nextIdentity && typeof nextIdentity === "object"
      ? {
          playerId: typeof nextIdentity.playerId === "string" ? nextIdentity.playerId : "",
          displayName: typeof nextIdentity.displayName === "string" ? nextIdentity.displayName : ""
        }
      : null;
  }

  function findMatch(side) {
    mySide = side;
    send(buildFindMatchPayload(side, gameId, identity));
  }

  function createRoom(side) {
    mySide = side;
    send(buildCreateRoomPayload(side, gameId, identity));
  }

  function joinRoom(side, code) {
    mySide = side;
    send(buildJoinRoomPayload(side, code, gameId, identity));
  }

  function requestQueueStatus() {
    send(buildQueueStatusPayload(gameId));
  }

  function cancelSearch() {
    send({ type: "cancel_match" });
  }

  function leaveRoom() {
    send({ type: "leave_room" });
    roomCode = null;
    inRoom = false;
  }

  function sendProfile(sideOverride = null) {
    if (!identity?.displayName) return;
    sendRoomMessage("profile", serializeProfileMessage(identity, sideOverride || mySide));
  }

  function sendPlayerReady(ready) {
    sendRoomMessage("player_ready", String(Boolean(ready)));
  }

  function requestStart() {
    sendRoomMessage("request_start", "");
  }

  function sendIntent(intent) {
    sendRoomMessage("circuit_intent", serializeCircuitActionIntent(intent));
  }

  function sendSnapshot(snapshot) {
    sendRoomMessage("match_snapshot", serializeMatchSnapshot(snapshot));
  }

  function sendMatchEvent(event) {
    sendRoomMessage("match_event", serializeMatchEvent(event));
  }

  function disconnect() {
    inRoom = false;
    roomCode = null;
    ws?.close();
    ws = null;
  }

  function reset() {
    roomCode = null;
    inRoom = false;
  }

  return {
    connect,
    setIdentity,
    findMatch,
    createRoom,
    joinRoom,
    requestQueueStatus,
    cancelSearch,
    leaveRoom,
    sendProfile,
    sendPlayerReady,
    requestStart,
    sendIntent,
    sendSnapshot,
    sendMatchEvent,
    disconnect,
    reset,
    cb,
    get clientId() {
      return clientId;
    },
    get roomCode() {
      return roomCode;
    }
  };
}
