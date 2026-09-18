// Who else is standing in this arcade right now.
//
// The room used to be single-player in every sense: two people on the same
// `/room/?id=` each walked a private copy of the layout. Presence is the seam
// that makes the room shared — one WebSocket to `factory-network-server`, an
// `arcade_room_join` for the arcade being viewed (keyed by its OWNER's player
// id, so the owner and every guest land in the same room), and a stream of
// poses in each direction. The server keeps the roster and relays; it never
// simulates anyone, so a member here is exactly what its client last said.
//
// This module owns the protocol and the roster and nothing visual. It knows no
// THREE and no DOM: the socket is injectable, the clock is injectable, and the
// timers are injectable, so the whole thing runs under node against a fake
// socket. `arcade-room-visitors.mts` turns the roster into bodies.
//
// Reconnection is quiet: a dropped socket is retried on a backoff, and the
// roster is cleared meanwhile (a body that stays standing after its socket is
// gone is a ghost, not a guest). Poses are throttled to `poseIntervalMs` and
// sent only when they change, with a keepalive so a still player is still known
// to be there.

import { resolveFactoryNetworkUrl } from "./platform/api/factory-network-url.mjs";

export type PresencePose = Readonly<{
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  /** What the player is doing beyond walking: a cabinet title while playing, else "". */
  activity: string;
}>;

export type PresenceIdentity = Readonly<{
  playerId: string;
  displayName: string;
  avatarId: string;
}>;

export type RemoteMember = Readonly<{
  clientId: string;
  playerId: string;
  displayName: string;
  avatarId: string;
  pose: PresencePose;
  /** `now()` when the pose last changed; the body interpolates from it. */
  poseAt: number;
  /** The last emote received and when; the body plays it once. */
  emote: string;
  emoteAt: number;
}>;

export type PresenceStatus = "idle" | "connecting" | "online" | "offline" | "full";

export type PresenceEmote = "wave" | "cheer";

export type PresenceSocket = {
  send: (text: string) => void;
  close: () => void;
  addEventListener: (type: "open" | "message" | "close" | "error", listener: (event: any) => void) => void;
};

export type RoomPresenceOptions = Readonly<{
  /** The arcade being stood in: its owner's player id. */
  roomId: string;
  identity: PresenceIdentity;
  url?: string;
  socketFactory?: (url: string) => PresenceSocket;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  poseIntervalMs?: number;
  keepaliveMs?: number;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}>;

export type RoomPresence = Readonly<{
  connect: () => void;
  disconnect: () => void;
  /** Throttled and change-detected; call it every tick with the local pose. */
  publishPose: (pose: PresencePose) => void;
  emote: (emote: PresenceEmote) => void;
  /** A new body or name: rejoins in place so the others redraw. */
  setIdentity: (identity: PresenceIdentity) => void;
  members: () => readonly RemoteMember[];
  status: () => PresenceStatus;
  clientId: () => string;
  onChange: (listener: () => void) => () => void;
  /** Feed a decoded server event. Exposed so the socket is not the only way in. */
  handleEvent: (data: unknown) => void;
}>;

const POSE_EPSILON = 0.005;
const YAW_EPSILON = 0.01;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizePresencePose(value: unknown, previous: PresencePose | null = null): PresencePose {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.freeze({
    x: finite(source.x, previous?.x ?? 0),
    z: finite(source.z, previous?.z ?? 0),
    yaw: finite(source.yaw, previous?.yaw ?? 0),
    moving: source.moving === true,
    activity: cleanText(source.activity).slice(0, 40),
  });
}

export function posesDiffer(a: PresencePose | null, b: PresencePose): boolean {
  if (!a) return true;
  return Math.abs(a.x - b.x) > POSE_EPSILON
    || Math.abs(a.z - b.z) > POSE_EPSILON
    || Math.abs(a.yaw - b.yaw) > YAW_EPSILON
    || a.moving !== b.moving
    || a.activity !== b.activity;
}

function normalizeMember(value: unknown, now: number): RemoteMember | null {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const clientId = cleanText(source?.clientId);
  if (!clientId) return null;
  return Object.freeze({
    clientId,
    playerId: cleanText(source?.playerId),
    displayName: cleanText(source?.displayName) || "Player",
    avatarId: cleanText(source?.avatarId),
    pose: normalizePresencePose(source?.pose),
    poseAt: now,
    emote: "",
    emoteAt: 0,
  });
}

function defaultSocketFactory(url: string): PresenceSocket {
  return new WebSocket(url) as unknown as PresenceSocket;
}

export function createRoomPresence(options: RoomPresenceOptions): RoomPresence {
  const roomId = cleanText(options.roomId);
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as any));
  const socketFactory = options.socketFactory ?? defaultSocketFactory;
  const url = options.url ?? resolveFactoryNetworkUrl();
  const poseIntervalMs = options.poseIntervalMs ?? 100;
  const keepaliveMs = options.keepaliveMs ?? 2000;
  const reconnectDelayMs = options.reconnectDelayMs ?? 1500;
  const maxReconnectDelayMs = options.maxReconnectDelayMs ?? 15000;

  let identity = options.identity;
  let socket: PresenceSocket | null = null;
  let status: PresenceStatus = "idle";
  let selfClientId = "";
  let wanted = false;
  let reconnectHandle: unknown = null;
  let reconnectAttempts = 0;
  const roster = new Map<string, RemoteMember>();
  const listeners = new Set<() => void>();
  let lastSentPose: PresencePose | null = null;
  let lastSentAt = -Infinity;
  let pendingPose: PresencePose | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function setStatus(next: PresenceStatus): void {
    if (status === next) return;
    status = next;
    notify();
  }

  function send(frame: Record<string, unknown>): boolean {
    if (!socket || status !== "online") return false;
    try {
      socket.send(JSON.stringify(frame));
      return true;
    } catch {
      return false;
    }
  }

  function sendJoin(): void {
    if (!socket) return;
    try {
      socket.send(JSON.stringify({
        type: "arcade_room_join",
        roomId,
        identity: { playerId: identity.playerId, displayName: identity.displayName, avatarId: identity.avatarId },
        pose: pendingPose ?? lastSentPose ?? normalizePresencePose(null),
      }));
    } catch {
      // The close handler owns recovery.
    }
  }

  function clearRoster(): void {
    if (roster.size === 0) return;
    roster.clear();
    notify();
  }

  function scheduleReconnect(): void {
    if (!wanted || reconnectHandle !== null) return;
    const delay = Math.min(maxReconnectDelayMs, reconnectDelayMs * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    reconnectHandle = setTimer(() => {
      reconnectHandle = null;
      if (wanted) open();
    }, delay);
  }

  function open(): void {
    if (socket) return;
    let next: PresenceSocket;
    try {
      next = socketFactory(url);
    } catch {
      setStatus("offline");
      scheduleReconnect();
      return;
    }
    socket = next;
    setStatus("connecting");
    next.addEventListener("open", () => {
      if (socket !== next) return;
      sendJoin();
    });
    next.addEventListener("message", (event: any) => {
      if (socket !== next) return;
      let data: unknown = null;
      try {
        data = JSON.parse(String(event?.data ?? ""));
      } catch {
        return;
      }
      handleEvent(data);
    });
    const dropped = (): void => {
      if (socket !== next) return;
      socket = null;
      selfClientId = "";
      lastSentPose = null;
      clearRoster();
      setStatus(wanted ? "offline" : "idle");
      scheduleReconnect();
    };
    next.addEventListener("close", dropped);
    next.addEventListener("error", dropped);
  }

  function handleEvent(data: unknown): void {
    const event = data && typeof data === "object" ? (data as Record<string, any>) : null;
    if (!event) return;
    switch (String(event.event || "")) {
      case "arcade_room_joined": {
        if (cleanText(event.roomId) !== roomId) return;
        selfClientId = cleanText(event.clientId);
        roster.clear();
        const at = now();
        for (const entry of Array.isArray(event.members) ? event.members : []) {
          const member = normalizeMember(entry, at);
          if (member && member.clientId !== selfClientId) roster.set(member.clientId, member);
        }
        reconnectAttempts = 0;
        // The join carried the latest pose; nothing to resend until it moves.
        lastSentPose = pendingPose ?? lastSentPose;
        lastSentAt = at;
        status = "online";
        notify();
        return;
      }
      case "arcade_room_member_joined": {
        if (cleanText(event.roomId) !== roomId) return;
        const member = normalizeMember(event.member, now());
        if (!member || member.clientId === selfClientId) return;
        roster.set(member.clientId, member);
        notify();
        return;
      }
      case "arcade_room_member_left": {
        if (roster.delete(cleanText(event.clientId))) notify();
        return;
      }
      case "arcade_room_pose": {
        const member = roster.get(cleanText(event.clientId));
        if (!member) return;
        roster.set(member.clientId, Object.freeze({
          ...member,
          pose: normalizePresencePose(event, member.pose),
          poseAt: now(),
        }));
        return;
      }
      case "arcade_room_emote": {
        const member = roster.get(cleanText(event.clientId));
        if (!member) return;
        roster.set(member.clientId, Object.freeze({ ...member, emote: cleanText(event.emote), emoteAt: now() }));
        notify();
        return;
      }
      case "error": {
        if (String(event.code) === "ROOM_FULL") {
          wanted = false;
          setStatus("full");
          socket?.close();
        }
        return;
      }
      default:
        return;
    }
  }

  function connect(): void {
    if (!roomId) return;
    wanted = true;
    open();
  }

  function disconnect(): void {
    wanted = false;
    if (reconnectHandle !== null) {
      clearTimer(reconnectHandle);
      reconnectHandle = null;
    }
    const current = socket;
    socket = null;
    selfClientId = "";
    if (current) {
      try {
        current.send(JSON.stringify({ type: "arcade_room_leave" }));
      } catch {
        // Closing anyway.
      }
      try {
        current.close();
      } catch {
        // Already gone.
      }
    }
    clearRoster();
    setStatus("idle");
  }

  function publishPose(pose: PresencePose): void {
    const normalized = normalizePresencePose(pose);
    pendingPose = normalized;
    if (status !== "online") return;
    const at = now();
    const changed = posesDiffer(lastSentPose, normalized);
    if (changed ? at - lastSentAt < poseIntervalMs : at - lastSentAt < keepaliveMs) return;
    if (send({ type: "arcade_room_pose", ...normalized })) {
      lastSentPose = normalized;
      lastSentAt = at;
    }
  }

  function emote(name: PresenceEmote): void {
    send({ type: "arcade_room_emote", emote: name });
  }

  function setIdentity(next: PresenceIdentity): void {
    identity = next;
    if (status === "online") sendJoin();
  }

  return Object.freeze({
    connect,
    disconnect,
    publishPose,
    emote,
    setIdentity,
    members: () => [...roster.values()],
    status: () => status,
    clientId: () => selfClientId,
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    handleEvent,
  });
}
