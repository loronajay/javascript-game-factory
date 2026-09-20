// Emotes in the arcade: the catalog and the wheel, with nothing drawn.
//
// The four pictures are the ones Lovers Lost and Battleshits already use, so
// a player who knows them from a match knows them here. In the room the
// wheel is its own key and its own gesture: press Q and the wheel opens,
// steer the highlight with the mouse (pointer deltas — the mouse is captured
// while walking — or hovering a slot when it is not), and click to send what
// is lit. Q again, or Escape, closes it without sending. No other key is
// touched: WASD keep walking, E keeps playing, Enter keeps chatting.
//
// This module knows no DOM and no socket: `send` is injected (presence's
// `emote`), the clock is injected, and `arcade-room-emote-wheel-view.mts`
// turns the state into elements. The same catalog tells the visitor bodies
// which picture to float over a head, so the wire carries only the id.

import type { PresenceEmote } from "./arcade-room-presence.mjs";

export type EmoteId = "heart" | "middle-finger" | "smile" | "crying";

export type EmoteDefinition = Readonly<{
  id: EmoteId;
  label: string;
  /** Path from the room page. */
  image: string;
  /** Where it sits on the wheel: a unit vector in screen space, y down. */
  dx: number;
  dy: number;
}>;

/** Clockwise from the top: heart, smile, middle finger, crying. */
export const EMOTE_CATALOG: readonly EmoteDefinition[] = Object.freeze([
  Object.freeze({ id: "heart", label: "Heart", image: "assets/emotes/heart.png", dx: 0, dy: -1 }),
  Object.freeze({ id: "smile", label: "Smile", image: "assets/emotes/smile.png", dx: 1, dy: 0 }),
  Object.freeze({ id: "middle-finger", label: "Middle finger", image: "assets/emotes/middle-finger.png", dx: 0, dy: 1 }),
  Object.freeze({ id: "crying", label: "Crying", image: "assets/emotes/crying.png", dx: -1, dy: 0 }),
] as const);

// Every catalog id must be a name the presence protocol (and the bridge) accepts.
const _protocolCheck: readonly PresenceEmote[] = EMOTE_CATALOG.map((emote) => emote.id);
void _protocolCheck;

/** The key that opens the wheel, and closes it again. */
export const EMOTE_WHEEL_KEY = "KeyQ";
/** Battleshits' cooldown; one picture a second is plenty. */
export const EMOTE_COOLDOWN_MS = 1000;
/** How long a picture stays over a head (and in the sender's HUD). */
export const EMOTE_DISPLAY_MS = 3000;
/** Pointer travel before the highlight follows the mouse; a twitch on open lights nothing. */
export const EMOTE_WHEEL_DEADZONE_PX = 22;
/** The steer vector is clamped so a long drag does not take a long drag back. */
const STEER_LIMIT_PX = 120;

export function emoteById(id: unknown): EmoteDefinition | null {
  return EMOTE_CATALOG.find((emote) => emote.id === id) ?? null;
}

export function isEmoteId(value: unknown): value is EmoteId {
  return emoteById(value) !== null;
}

/** The catalog entry nearest a screen-space direction, or null inside the deadzone. */
export function emoteForDirection(dx: number, dy: number, deadzone = EMOTE_WHEEL_DEADZONE_PX): EmoteDefinition | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const length = Math.hypot(dx, dy);
  if (length < deadzone) return null;
  let best: EmoteDefinition | null = null;
  let bestDot = -Infinity;
  for (const emote of EMOTE_CATALOG) {
    const dot = (dx * emote.dx + dy * emote.dy) / length;
    if (dot > bestDot) {
      bestDot = dot;
      best = emote;
    }
  }
  return best;
}

export type EmoteWheelKey = Readonly<{ type: "keydown" | "keyup"; code: string; repeat?: boolean }>;

export type EmoteWheelOptions = Readonly<{
  /** Puts the id on the wire; false when nothing went out. */
  send: (id: EmoteId) => boolean;
  now?: () => number;
  cooldownMs?: number;
  deadzonePx?: number;
}>;

export type EmoteWheel = Readonly<{
  isOpen: () => boolean;
  open: () => void;
  /** Close without sending. */
  cancel: () => void;
  /** Pointer travel while open; the highlight follows the accumulated direction. */
  steer: (dx: number, dy: number) => void;
  /** Light one directly (hovering a slot when the mouse is not captured). */
  highlight: (id: EmoteId | null) => void;
  highlighted: () => EmoteDefinition | null;
  /** The click: sends the lit emote if the cooldown allows and closes. Returns what went out. */
  choose: () => EmoteId | null;
  /** Feed every walking-mode key; true when the wheel took it and the room should not. Only Q and Escape are ever taken. */
  handleKey: (key: EmoteWheelKey) => boolean;
  /** Send without the wheel (a touch button); honours the cooldown. */
  sendNow: (id: EmoteId) => EmoteId | null;
  /** True while a fresh send is still cooling; the view greys the hint. */
  isCooling: () => boolean;
  /** The last emote sent and when; the sender's HUD shows it, they have no body to see it on. */
  lastSent: () => Readonly<{ id: EmoteId; at: number }> | null;
  onChange: (listener: () => void) => () => void;
}>;

export function createEmoteWheel(options: EmoteWheelOptions): EmoteWheel {
  const now = options.now ?? (() => Date.now());
  const cooldownMs = options.cooldownMs ?? EMOTE_COOLDOWN_MS;
  const deadzonePx = options.deadzonePx ?? EMOTE_WHEEL_DEADZONE_PX;
  const listeners = new Set<() => void>();
  let open = false;
  let lit: EmoteDefinition | null = null;
  let steerX = 0;
  let steerY = 0;
  let sentAt = -Infinity;
  let last: Readonly<{ id: EmoteId; at: number }> | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function setLit(next: EmoteDefinition | null): void {
    if (next === lit) return;
    lit = next;
    notify();
  }

  function openWheel(): void {
    if (open) return;
    open = true;
    lit = null;
    steerX = 0;
    steerY = 0;
    notify();
  }

  function cancel(): void {
    if (!open) return;
    open = false;
    lit = null;
    notify();
  }

  function trySend(id: EmoteId): EmoteId | null {
    const at = now();
    if (at - sentAt < cooldownMs) return null;
    if (!options.send(id)) return null;
    sentAt = at;
    last = Object.freeze({ id, at });
    return id;
  }

  function choose(): EmoteId | null {
    if (!open) return null;
    const chosen = lit;
    open = false;
    lit = null;
    const sent = chosen ? trySend(chosen.id) : null;
    notify();
    return sent;
  }

  function steer(dx: number, dy: number): void {
    if (!open || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    steerX += dx;
    steerY += dy;
    const length = Math.hypot(steerX, steerY);
    if (length > STEER_LIMIT_PX) {
      steerX *= STEER_LIMIT_PX / length;
      steerY *= STEER_LIMIT_PX / length;
    }
    const next = emoteForDirection(steerX, steerY, deadzonePx);
    // Inside the deadzone the last choice stands; the mouse has to leave it to change its mind.
    if (next) setLit(next);
  }

  function highlight(id: EmoteId | null): void {
    if (!open) return;
    const next = id ? emoteById(id) : null;
    if (next) {
      // A direct choice re-centres the steer so the next mouse nudge starts from it.
      steerX = next.dx * STEER_LIMIT_PX;
      steerY = next.dy * STEER_LIMIT_PX;
    }
    setLit(next);
  }

  function handleKey(key: EmoteWheelKey): boolean {
    if (key.type !== "keydown") return false;
    if (key.code === EMOTE_WHEEL_KEY) {
      if (key.repeat) return true;
      if (open) cancel();
      else openWheel();
      return true;
    }
    if (open && key.code === "Escape") {
      cancel();
      return true;
    }
    // Every other key stays the room's: the wheel is a mouse gesture, not a mode.
    return false;
  }

  return Object.freeze({
    isOpen: () => open,
    open: openWheel,
    cancel,
    steer,
    highlight,
    highlighted: () => lit,
    choose,
    handleKey,
    sendNow: (id: EmoteId) => {
      const sent = isEmoteId(id) ? trySend(id) : null;
      if (sent) notify();
      return sent;
    },
    isCooling: () => now() - sentAt < cooldownMs,
    lastSent: () => last,
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  });
}
