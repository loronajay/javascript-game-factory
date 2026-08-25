import { matchConfigSettings, normalizeMatchConfig } from "./match-config.js";

export const MINI_HOOPS_GAME_ID = "mini-hoops";
const PRODUCTION_WS_URL = "wss://factory-network-server-production.up.railway.app";
const SESSION_KEY = "mini-hoops.online-session.v1";

function text(value, max = 100, fallback = "") {
  const clean = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (clean || fallback).slice(0, max);
}

function number(value, min, max, fallback = min) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function json(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function attach(socket, type, listener) {
  if (typeof socket.addEventListener === "function") socket.addEventListener(type, listener);
  else socket[`on${type}`] = listener;
}

export function resolveWebSocketUrl(locationLike = globalThis.location) {
  const host = text(locationLike?.hostname);
  if (["localhost", "127.0.0.1", "::1"].includes(host)) {
    return `${locationLike?.protocol === "https:" ? "wss:" : "ws:"}//${host}:3000`;
  }
  return PRODUCTION_WS_URL;
}

export function normalizeRoomCode(value) {
  return text(value, 8).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function sanitizeIdentity(value = {}) {
  return { playerId: text(value.playerId, 64), displayName: text(value.displayName, 24, "Player") };
}

export function sanitizeShotIntent(value = {}) {
  return {
    power: number(value.power, 0, 1, 0),
    aimX: number(value.aimX, 320, 640, 480),
    // The shipping pull model has one vertical reticle line. Keep it server-
    // canonical rather than letting a crafted client invent a higher target.
    aimY: 224,
    loft: number(value.loft, 0, 1, 1),
    expectedShotNumber: Math.max(0, Math.floor(number(value.expectedShotNumber, 0, 10000, 0))),
  };
}

export function createMiniHoopsOnlineClient(options = {}) {
  const WebSocketCtor = options.WebSocketCtor || globalThis.WebSocket;
  const resolveIdentity = options.resolveIdentity || (() => ({}));
  const storage = options.storage === undefined ? globalThis.sessionStorage : options.storage;
  const setTimer = options.setTimer || globalThis.setTimeout;
  const reconnectDelayMs = Number(options.reconnectDelayMs) || 1500;
  const wsUrl = options.wsUrl || resolveWebSocketUrl(options.locationLike);
  const subscribers = new Set();
  let socket = null;
  let pending = [];
  let manualClose = false;
  let resumeCredentials = null;
  let snapshot = { status: "idle", clientId: "", lobby: null, matchState: null, error: null };

  function emit(patch) {
    snapshot = { ...snapshot, ...patch };
    for (const subscriber of subscribers) subscriber(getSnapshot());
  }

  function getSnapshot() {
    return structuredClone(snapshot);
  }

  function send(payload) {
    if (socket?.readyState === WebSocketCtor.OPEN) socket.send(JSON.stringify(payload));
    else pending.push(payload);
  }

  function flush() {
    if (socket?.readyState !== WebSocketCtor.OPEN) return;
    for (const payload of pending) socket.send(JSON.stringify(payload));
    pending = [];
  }

  function connect() {
    if (socket || !WebSocketCtor) return;
    manualClose = false;
    socket = new WebSocketCtor(wsUrl);
    emit({ status: "connecting", error: null });
    attach(socket, "open", flush);
    attach(socket, "message", (event) => handle(json(event.data)));
    attach(socket, "error", () => emit({ error: { code: "WS_ERROR", message: "Unable to reach Factory Network." } }));
    attach(socket, "close", () => {
      socket = null;
      if (manualClose) return;
      if (snapshot.matchState) {
        try {
          const saved = JSON.parse(storage?.getItem?.(SESSION_KEY) || "null");
          if (saved?.clientId && saved?.sessionToken) {
            resumeCredentials = { clientId: text(saved.clientId, 80), sessionToken: text(saved.sessionToken, 200) };
            emit({ status: "reconnecting", error: { code: "CONNECTION_LOST", message: "Connection lost. Rejoining the match…" } });
            setTimer(() => connect(), reconnectDelayMs);
            return;
          }
        } catch {}
      }
      emit({ status: "idle", error: { code: "CONNECTION_LOST", message: "Connection lost." } });
    });
  }

  function handle(data) {
    if (!data) return;
    if (data.event === "connected") {
      const saved = { clientId: text(data.clientId, 80), sessionToken: text(data.sessionToken, 200) };
      emit({ status: "connected", clientId: saved.clientId, error: null });
      if (resumeCredentials) send({ type: "resume_lobby", ...resumeCredentials });
      else try { storage?.setItem?.(SESSION_KEY, JSON.stringify(saved)); } catch {}
      return;
    }
    if (data.event === "session_resumed") {
      resumeCredentials = null;
      const saved = { clientId: text(data.clientId, 80), sessionToken: text(data.sessionToken, 200) };
      try { storage?.setItem?.(SESSION_KEY, JSON.stringify(saved)); } catch {}
      emit({ status: "started", clientId: saved.clientId, error: null });
      return;
    }
    if (data.event === "lobby_joined" || data.event === "lobby_updated") {
      emit({ status: "lobby", lobby: normalizeLobby(data), error: null });
      return;
    }
    if (data.event === "lobby_started") {
      emit({ status: "started", lobby: snapshot.lobby, matchState: data.matchState || null, error: null });
      return;
    }
    if (data.event === "message" && data.scope === "lobby" && ["mini_hoops_match", "mini_hoops_match_ended"].includes(data.messageType)) {
      const matchState = json(data.value);
      if (matchState) emit({ status: matchState.phase === "complete" ? "complete" : "started", matchState, error: null });
      return;
    }
    if (data.event === "lobby_left" || data.event === "lobby_closed") {
      try { storage?.removeItem?.(SESSION_KEY); } catch {}
      emit({ status: "idle", lobby: null, matchState: null });
      return;
    }
    if (data.event === "error") {
      if (data.code === "RESUME_REJECTED") {
        resumeCredentials = null;
        try { storage?.removeItem?.(SESSION_KEY); } catch {}
        emit({ status: "idle", lobby: null, matchState: null });
      }
      emit({ error: { code: text(data.code, 60), message: text(data.message, 160, "Online error") } });
    }
  }

  function normalizeLobby(data) {
    const members = Array.isArray(data.members) ? data.members.map(String) : [];
    return {
      roomCode: normalizeRoomCode(data.roomCode),
      ownerId: text(data.ownerId, 80),
      members,
      players: Array.isArray(data.players) ? data.players.map((player, index) => ({
        id: text(player?.id, 80, members[index] || `player-${index + 1}`),
        playerId: text(player?.playerId || player?.accountPlayerId, 64),
        name: text(player?.name, 24, `Player ${index + 1}`),
      })) : [],
      playerCount: Number(data.playerCount) || members.length,
      isPrivate: data.isPrivate === true,
      status: text(data.status, 20, "open"),
      settings: matchConfigSettings(data.settings),
    };
  }

  function request(type, config = {}, roomCode = "") {
    connect();
    const payload = {
      type,
      gameId: MINI_HOOPS_GAME_ID,
      ...(type === "join_lobby" ? { roomCode: normalizeRoomCode(roomCode) } : {
        minPlayers: 2,
        maxPlayers: 2,
        ...(type === "create_lobby" ? { private: true } : {}),
        settings: matchConfigSettings(config),
      }),
      identity: sanitizeIdentity(resolveIdentity()),
    };
    send(payload);
    emit({ status: type === "find_lobby" ? "searching" : type === "create_lobby" ? "creating" : "joining", error: null });
  }

  function sendLobbyMessage(messageType, value) {
    send({ type: "lobby_message", messageType, value: JSON.stringify(value) });
  }

  function resumeSavedSession() {
    if (socket) return Boolean(resumeCredentials);
    try {
      const saved = JSON.parse(storage?.getItem?.(SESSION_KEY) || "null");
      if (!saved?.clientId || !saved?.sessionToken) return false;
      resumeCredentials = { clientId: text(saved.clientId, 80), sessionToken: text(saved.sessionToken, 200) };
    } catch {
      return false;
    }
    connect();
    return true;
  }

  return {
    connect,
    resumeSavedSession,
    findQuickMatch: (config) => request("find_lobby", config),
    createPrivateRoom: (config) => request("create_lobby", config),
    joinPrivateRoom: (code) => request("join_lobby", {}, code),
    updateConfig(config) { send({ type: "update_lobby_settings", settings: matchConfigSettings(normalizeMatchConfig(config)) }); },
    startMatch() { send({ type: "start_lobby" }); },
    submitShot(intent) { sendLobbyMessage("mini_hoops_shot", sanitizeShotIntent(intent)); },
    leave() { send({ type: "leave_lobby" }); try { storage?.removeItem?.(SESSION_KEY); } catch {} },
    disconnect() { manualClose = true; try { storage?.removeItem?.(SESSION_KEY); } catch {} socket?.close(); socket = null; pending = []; emit({ status: "idle", lobby: null, matchState: null }); },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    getSnapshot,
  };
}
