// The lobby client for online HORSE.
//
// ITS OWN GAME ID, `mini-hoops-horse`, for the reason floor tic-tac-toe has one:
// matchmaking is a pool, and a player looking for a timed score duel is not the
// opponent of a player looking to spell a word.
//
// WHAT IT SENDS IS A BIN AND A PULL, NEVER AN OUTCOME. `factory-network-server`
// replays every shot through a mirrored copy of this cabinet's sim and hands
// back the whole match — whose turn it is, what stands, and how much of the word
// each player has spelled. So there is no `resolveHorseShot` in this file and
// there must never be one: the browser animates the shot it already knows how to
// animate, and reads the ruling off the wire.
//
// The one thing that IS sent alongside the pull is the phase of the bin's motion
// clock at release. That is not the client asserting anything — the player may
// stand and watch a moving bin for as long as they like, so every phase is
// legitimately reachable, and choosing the moment is the skill the motions exist
// to ask for.
import {
  normalizeRoomCode,
  resolveWebSocketUrl,
  sanitizeIdentity,
} from "./online-client.js";
import { DEFAULT_WORD, HORSE_FIXED_SETUP, normalizeWord } from "../sim/horse.js";
import { ballById } from "../assets/ball-catalog.js";
import { locationById } from "../assets/location-catalog.js";
import { normalizeSandboxPieces } from "../sim/trick-shot.js";
import { BIN_TARGET, HOOP_TARGET } from "../sim/trick-shot-target.js";

export const HORSE_GAME_ID = "mini-hoops-horse";
export const HORSE_PROTOCOL_VERSION = 2;
const SESSION_KEY = "mini-hoops.horse-online-session.v1";

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

export function horseLobbySettings(word) {
  return { word: normalizeWord(word || DEFAULT_WORD), protocolVersion: HORSE_PROTOCOL_VERSION };
}

/**
 * Where the target stands. Clamped again server-side — this is only shaping.
 *
 * TWO PLACEMENT SHAPES, and the kind is what says which. A bin's is a world
 * point on the floor and a hoop's is a screen point on the back wall, so this
 * sends the one that belongs to the kind rather than a union of both: a field
 * from the wrong shape is a field the server's clamp does not read, and shipping
 * it would only invite someone to believe it meant something.
 *
 * ANYTHING THAT IS NOT EXPLICITLY A HOOP IS A BIN, the same default the sim's
 * `horseTargetKind` and the server's `sanitizeHorsePlacement` both keep — and
 * deliberately not the target catalog's own, which opens on the hoop because the
 * Trick Shot Lab does.
 */
export function sanitizeHorsePlacementIntent(value = {}) {
  const hoop = value.kind === HOOP_TARGET;
  const placement = value.placement || value;
  return {
    kind: hoop ? HOOP_TARGET : BIN_TARGET,
    motionId: text(value.motionId, 24, "still"),
    placement: hoop
      ? {
        cx: number(placement.cx, -4_000, 4_000, 0),
        rimY: number(placement.rimY, -4_000, 4_000, 0),
      }
      : {
        x: number(placement.x, -8, 8, 0),
        y: number(placement.y, 0, 8, 0),
        z: number(placement.z, 0, 8, 0),
      },
    locationId: locationById(value.locationId || HORSE_FIXED_SETUP.locationId).id,
    pieces: normalizeSandboxPieces(value.pieces),
  };
}

/**
 * The pull.
 *
 * `aimY` is deliberately not here, and that is the difference from the classic
 * cabinet's intent. There the reticle rides one fixed line and the server pins
 * it against a crafted client; here the vertical aim IS the placed target's own
 * rest height — a bin's mouth or a hung hoop's rim — which the server already
 * holds and has already clamped. Making the hoop placeable did not open that
 * back up, because the height a shot is solved to still comes off the setup.
 */
export function sanitizeHorseShotIntent(value = {}) {
  return {
    power: number(value.power, 0, 1, 0),
    aimX: number(value.aimX, 320, 640, 480),
    loft: number(value.loft, 0, 1, 1),
    motionSeconds: number(value.motionSeconds, 0, 3600, 0),
    expectedShots: Math.max(0, Math.floor(number(value.expectedShots, 0, 10_000, 0))),
    ballId: ballById(value.ballId).id,
  };
}

export function createHorseOnlineClient(options = {}) {
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
    const incoming = Array.isArray(data.players) ? data.players : [];
    return {
      roomCode: normalizeRoomCode(data.roomCode),
      ownerId: text(data.ownerId, 80),
      members,
      players: members.map((id, index) => ({
        id,
        name: text(incoming.find((player) => String(player?.id) === id)?.name, 24, `Player ${index + 1}`),
      })),
      playerCount: Number(data.playerCount) || members.length,
      isPrivate: data.isPrivate === true,
      status: text(data.status, 20, "open"),
      word: normalizeWord(data.settings?.word),
    };
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
      emit({
        status: "started",
        lobby: snapshot.lobby ? { ...snapshot.lobby, status: "started" } : snapshot.lobby,
        matchState: data.matchState || null,
        error: null,
      });
      return;
    }
    if (data.event === "message" && data.scope === "lobby"
      && ["horse_match", "horse_match_ended"].includes(data.messageType)) {
      const matchState = json(data.value);
      if (matchState) emit({ status: matchState.phase === "complete" ? "complete" : "started", matchState, error: null });
      return;
    }
    if (data.event === "lobby_player_left") {
      emit({ error: { code: "OPPONENT_LEFT", message: "Your opponent left the match." } });
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

  function request(type, { word, roomCode } = {}) {
    connect();
    send({
      type,
      gameId: HORSE_GAME_ID,
      ...(type === "join_lobby" ? { roomCode: normalizeRoomCode(roomCode) } : {
        minPlayers: 2,
        maxPlayers: 2,
        ...(type === "create_lobby" ? { private: true } : {}),
        settings: horseLobbySettings(word),
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
    findQuickMatch: (word) => request("find_lobby", { word }),
    createPrivateRoom: (word) => request("create_lobby", { word }),
    joinPrivateRoom: (code) => request("join_lobby", { roomCode: code }),
    startMatch() { send({ type: "start_lobby" }); },
    submitPlacement(setup) { sendLobbyMessage("horse_placement", sanitizeHorsePlacementIntent(setup)); },
    submitShot(intent) { sendLobbyMessage("horse_shot", sanitizeHorseShotIntent(intent)); },
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
