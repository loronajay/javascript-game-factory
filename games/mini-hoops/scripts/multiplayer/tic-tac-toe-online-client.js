import {
  normalizeRoomCode,
  resolveWebSocketUrl,
  sanitizeIdentity,
} from "./online-client.js";
import { createTicTacToeMatch, resolveAttempt } from "../sim/tic-tac-toe.js";

export const TIC_TAC_TOE_GAME_ID = "mini-hoops-tic-tac-toe";
const SESSION_KEY = "mini-hoops.tic-tac-toe-online-session.v1";
const SETTINGS = Object.freeze({ protocolVersion: 1 });

function text(value, max = 100, fallback = "") {
  const clean = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (clean || fallback).slice(0, max);
}

function json(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function attach(socket, type, listener) {
  if (typeof socket.addEventListener === "function") socket.addEventListener(type, listener);
  else socket[`on${type}`] = listener;
}

export function sanitizeOnlineAttempt(value = {}) {
  const cell = Number(value.cell);
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) return null;
  const sequence = Number(value.expectedAttempt);
  return {
    cell,
    made: value.made === true || value.made === 1,
    expectedAttempt: Number.isFinite(sequence) ? Math.max(0, Math.min(100, Math.floor(sequence))) : 0,
  };
}

export function createTicTacToeOnlineClient(options = {}) {
  const WebSocketCtor = options.WebSocketCtor || globalThis.WebSocket;
  const resolveIdentity = options.resolveIdentity || (() => ({}));
  const storage = options.storage === undefined ? globalThis.sessionStorage : options.storage;
  const wsUrl = options.wsUrl || resolveWebSocketUrl(options.locationLike);
  const subscribers = new Set();
  let socket = null;
  let pending = [];
  let manualClose = false;
  let snapshot = { status: "idle", clientId: "", lobby: null, matchState: null, error: null };

  function getSnapshot() {
    return structuredClone(snapshot);
  }

  function emit(patch) {
    snapshot = { ...snapshot, ...patch };
    for (const subscriber of subscribers) subscriber(getSnapshot());
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
      emit({
        status: "idle",
        lobby: null,
        matchState: null,
        error: { code: "CONNECTION_LOST", message: "Connection lost. Rejoin to play again." },
      });
    });
  }

  function normalizeLobby(data) {
    const members = Array.isArray(data.members) ? data.members.map(String).slice(0, 2) : [];
    const incomingPlayers = Array.isArray(data.players) ? data.players : [];
    return {
      roomCode: normalizeRoomCode(data.roomCode),
      ownerId: text(data.ownerId, 80),
      members,
      players: members.map((id, index) => ({
        id,
        name: text(incomingPlayers.find((player) => String(player?.id) === id)?.name, 24, `Player ${index + 1}`),
      })),
      playerCount: Number(data.playerCount) || members.length,
      isPrivate: data.isPrivate === true,
      status: text(data.status, 20, "open"),
      startAt: Number(data.startAt) || null,
    };
  }

  function createStartedMatch(data) {
    const members = Array.isArray(data.members) ? data.members.map(String).slice(0, 2) : snapshot.lobby?.members || [];
    if (members.length !== 2 || !members.includes(snapshot.clientId)) return null;
    const rows = members.map((id, index) => {
      const player = snapshot.lobby?.players?.find((entry) => entry.id === id);
      return { id, name: player?.name || `Player ${index + 1}` };
    });
    const humanMark = members.indexOf(snapshot.clientId) === 0 ? "x" : "o";
    return Object.assign(createTicTacToeMatch({ mode: "online", humanMark }), {
      roomCode: normalizeRoomCode(data.roomCode || snapshot.lobby?.roomCode),
      startAt: Number(data.startAt) || Date.now(),
      members,
      players: { x: rows[0], o: rows[1] },
    });
  }

  function handleAttempt(data) {
    const attempt = sanitizeOnlineAttempt(json(data.value));
    const match = snapshot.matchState;
    if (!attempt || !match || match.status !== "playing" || attempt.expectedAttempt !== match.attempts) return;
    const senderIndex = match.members.indexOf(String(data.senderId || ""));
    const senderMark = senderIndex === 0 ? "x" : senderIndex === 1 ? "o" : null;
    if (!senderMark || senderMark !== match.turn) return;
    const outcome = resolveAttempt(match, attempt.cell, attempt.made);
    if (outcome.accepted) emit({ status: match.status === "playing" ? "started" : "complete", matchState: match, error: null });
  }

  function handle(data) {
    if (!data) return;
    if (data.event === "connected") {
      const saved = { clientId: text(data.clientId, 80), sessionToken: text(data.sessionToken, 200) };
      try { storage?.setItem?.(SESSION_KEY, JSON.stringify(saved)); } catch {}
      emit({ status: "connected", clientId: saved.clientId, error: null });
      return;
    }
    if (data.event === "lobby_joined" || data.event === "lobby_updated") {
      const lobby = normalizeLobby(data);
      emit({ status: lobby.status === "started" ? "started" : "lobby", lobby, error: null });
      return;
    }
    if (data.event === "lobby_started") {
      const matchState = createStartedMatch(data);
      if (matchState) emit({
        status: "started",
        lobby: snapshot.lobby ? { ...snapshot.lobby, status: "started", startAt: matchState.startAt } : snapshot.lobby,
        matchState,
        error: null,
      });
      return;
    }
    if (data.event === "message" && data.scope === "lobby" && data.messageType === "tic_tac_toe_attempt") {
      handleAttempt(data);
      return;
    }
    if (data.event === "lobby_player_left") {
      const matchState = snapshot.matchState;
      if (matchState?.status === "playing") matchState.status = "abandoned";
      emit({
        status: "lobby",
        matchState,
        error: { code: "OPPONENT_LEFT", message: "Your opponent left the match." },
      });
      return;
    }
    if (data.event === "lobby_left" || data.event === "lobby_closed") {
      try { storage?.removeItem?.(SESSION_KEY); } catch {}
      emit({ status: "idle", lobby: null, matchState: null, error: null });
      return;
    }
    if (data.event === "error") {
      emit({ error: { code: text(data.code, 60), message: text(data.message, 160, "Online error") } });
    }
  }

  function request(type, roomCode = "") {
    connect();
    send({
      type,
      gameId: TIC_TAC_TOE_GAME_ID,
      ...(type === "join_lobby" ? { roomCode: normalizeRoomCode(roomCode) } : {
        minPlayers: 2,
        maxPlayers: 2,
        ...(type === "create_lobby" ? { private: true } : {}),
        settings: SETTINGS,
      }),
      identity: sanitizeIdentity(resolveIdentity()),
    });
    emit({ status: type === "find_lobby" ? "searching" : type === "create_lobby" ? "creating" : "joining", error: null });
  }

  function sendLobbyMessage(messageType, value) {
    send({ type: "lobby_message", messageType, value: JSON.stringify(value) });
  }

  return {
    connect,
    findQuickMatch: () => request("find_lobby"),
    createPrivateRoom: () => request("create_lobby"),
    joinPrivateRoom: (code) => request("join_lobby", code),
    startMatch() { send({ type: "start_lobby" }); },
    submitAttempt(value) {
      const attempt = sanitizeOnlineAttempt(value);
      if (attempt) sendLobbyMessage("tic_tac_toe_attempt", attempt);
      return Boolean(attempt);
    },
    leave() {
      send({ type: "leave_lobby" });
      try { storage?.removeItem?.(SESSION_KEY); } catch {}
    },
    disconnect() {
      manualClose = true;
      try { storage?.removeItem?.(SESSION_KEY); } catch {}
      socket?.close();
      socket = null;
      pending = [];
      emit({ status: "idle", lobby: null, matchState: null, error: null });
    },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    getSnapshot,
  };
}
