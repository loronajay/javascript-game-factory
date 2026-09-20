// Arcade chat: the log and the box, with nothing drawn.
//
// The room's chat works the way an in-match chat does: Enter opens a box,
// Enter sends what was typed and closes it, Escape throws the draft away, and
// while the box is open every key belongs to it and none to the walking
// player. Closed, the log shows only the last few seconds of talk and fades;
// open, it shows everything it still holds. This module is that state machine
// and the log behind it — it knows no DOM and no socket. `sendChat` on
// presence is injected as `send`, the clock is injected, and
// `arcade-room-chat-view.mts` turns the entries into elements.
//
// Two kinds of line besides talk: a `self` line is what the local player said
// (the server relays a line to everyone ELSE, so the sender's own words only
// exist here), and a `system` line is the room speaking — who came in, who
// left, a line the server refused. Arrivals are read off the roster rather
// than off events so a dropped socket (which empties the roster) is not
// announced as everyone leaving.

import type { ChatLine } from "./arcade-room-presence.mjs";

export type ChatEntryKind = "chat" | "self" | "system";

export type ChatEntry = Readonly<{
  id: number;
  kind: ChatEntryKind;
  /** Who said it; empty for a system line. */
  clientId: string;
  displayName: string;
  text: string;
  at: number;
}>;

/** What a key did to the box; `typing` means the box has it and the room should not. */
export type ChatKeyResult = "opened" | "sent" | "closed" | "typing" | null;

export type ChatRosterMember = Readonly<{ clientId: string; displayName: string }>;

export type RoomChatOptions = Readonly<{
  /** Puts a line on the wire; false when nothing went out. */
  send: (text: string) => boolean;
  selfName: string;
  now?: () => number;
  fadeMs?: number;
  maxLines?: number;
}>;

export type RoomChat = Readonly<{
  isOpen: () => boolean;
  /** Feed the key and, for Enter, the box's current draft. */
  handleKey: (key: Readonly<{ key: string; repeat?: boolean }>, draft?: string) => ChatKeyResult;
  open: () => void;
  close: () => void;
  /** A line from somebody else in the arcade. */
  receive: (line: ChatLine) => void;
  /** The server turned the last line away. */
  refused: (code: string) => void;
  /** Hand over the roster whenever it changes; arrivals and departures become system lines. */
  noteRoster: (members: readonly ChatRosterMember[], online: boolean) => void;
  entries: () => readonly ChatEntry[];
  /** What the box should draw right now: everything while open, only recent lines while closed. */
  visible: () => readonly ChatEntry[];
  onChange: (listener: () => void) => () => void;
}>;

/** A closed log keeps a line on screen this long. */
export const CHAT_FADE_MS = 12_000;
export const MAX_CHAT_LINES = 60;

export function createRoomChat(options: RoomChatOptions): RoomChat {
  const now = options.now ?? (() => Date.now());
  const fadeMs = options.fadeMs ?? CHAT_FADE_MS;
  const maxLines = options.maxLines ?? MAX_CHAT_LINES;
  const listeners = new Set<() => void>();
  let entries: ChatEntry[] = [];
  let open = false;
  let nextId = 1;
  /** The roster as last announced; a drop keeps it so the reconnect is diffed against real company. */
  let known: Map<string, string> | null = null;

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function push(kind: ChatEntryKind, clientId: string, displayName: string, text: string): void {
    entries.push(Object.freeze({ id: nextId++, kind, clientId, displayName, text, at: now() }));
    if (entries.length > maxLines) entries = entries.slice(entries.length - maxLines);
    notify();
  }

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    notify();
  }

  function submit(draft: string): ChatKeyResult {
    const text = draft.replace(/\s+/g, " ").trim();
    setOpen(false);
    if (!text) return "closed";
    if (options.send(text)) push("self", "", options.selfName, text);
    else push("system", "", "", "Nobody can hear you right now — you are not connected.");
    return "sent";
  }

  function handleKey(key: Readonly<{ key: string; repeat?: boolean }>, draft = ""): ChatKeyResult {
    if (!open) {
      if (key.key !== "Enter" || key.repeat) return null;
      setOpen(true);
      return "opened";
    }
    if (key.key === "Enter") return key.repeat ? "typing" : submit(draft);
    if (key.key === "Escape") {
      setOpen(false);
      return "closed";
    }
    return "typing";
  }

  function receive(line: ChatLine): void {
    if (!line.text) return;
    push("chat", line.clientId, line.displayName, line.text);
  }

  function refused(code: string): void {
    if (code === "TOO_FAST") push("system", "", "", "Slow down a little — that line was not sent.");
  }

  function noteRoster(members: readonly ChatRosterMember[], online: boolean): void {
    if (!online) return;
    const next = new Map(members.map((member) => [member.clientId, member.displayName]));
    if (known) {
      for (const [clientId, displayName] of next) {
        if (!known.has(clientId)) push("system", clientId, "", `${displayName} came in.`);
      }
      for (const [clientId, displayName] of known) {
        if (!next.has(clientId)) push("system", clientId, "", `${displayName} left.`);
      }
    }
    known = next;
  }

  return Object.freeze({
    isOpen: () => open,
    handleKey,
    open: () => setOpen(true),
    close: () => setOpen(false),
    receive,
    refused,
    noteRoster,
    entries: () => entries,
    visible: () => {
      if (open) return entries;
      const cutoff = now() - fadeMs;
      return entries.filter((entry) => entry.at >= cutoff);
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  });
}

/**
 * Break a line into rows for a speech bubble. `measure` is the width of a string in
 * whatever unit `maxWidth` is (a canvas `measureText` in pixels, in practice), so this
 * stays free of the DOM. Words wrap; a word wider than the bubble is cut mid-word; past
 * `maxLines` the rest is dropped and the last row ends in an ellipsis.
 */
export function wrapChatBubble(text: string, measure: (text: string) => number, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const rows: string[] = [];
  let row = "";
  let truncated = false;
  const pushRow = (): boolean => {
    if (rows.length >= maxLines) {
      truncated = true;
      return false;
    }
    rows.push(row);
    row = "";
    return true;
  };
  for (let word of words) {
    while (word) {
      const candidate = row ? `${row} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        row = candidate;
        word = "";
        continue;
      }
      if (row) {
        if (!pushRow()) return finish(rows, true);
        continue;
      }
      // The word alone is too wide: take as many characters as fit.
      let cut = word.length;
      while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut -= 1;
      row = word.slice(0, cut);
      word = word.slice(cut);
      if (word && !pushRow()) return finish(rows, true);
    }
  }
  if (row && !pushRow()) return finish(rows, true);
  return finish(rows, truncated);
}

function finish(rows: string[], truncated: boolean): string[] {
  if (truncated && rows.length) rows[rows.length - 1] = `${rows[rows.length - 1]}…`;
  return rows;
}
