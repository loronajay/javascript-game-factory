// The farm HUD's pure rules, shared by the Farm, the Market Square and the Cove
// (and anything else built on farm.css). No DOM: farm-hud.mts is the one file
// that turns these answers into elements, so the rules are tested under node.
//
// Two things live here:
//  - which sheet is on top: one sheet at a time, the newest wins, Escape takes
//    the top one away (`createSheetStack`);
//  - how a prompt reads: "E to open the gate · the road to the Market" becomes
//    a key cap and words, so the key the player needs is the first thing seen
//    (`promptParts`).

export type SheetStack = Readonly<{
  /** A sheet became visible: it goes on top. Returns the sheets that must close for it (one at a time). */
  opened: (id: string) => readonly string[];
  /** A sheet was hidden, by whatever hid it. */
  closed: (id: string) => void;
  top: () => string;
  isOpen: (id: string) => boolean;
  anyOpen: () => boolean;
}>;

/**
 * The open sheets in the order they opened. Sheets are exclusive, so the stack
 * is at most one deep once the page has closed what `opened` hands back — but
 * it is kept as a list so a sheet that fails to close never hides another.
 */
export function createSheetStack(): SheetStack {
  const order: string[] = [];
  const remove = (id: string): void => {
    const index = order.indexOf(id);
    if (index >= 0) order.splice(index, 1);
  };
  return Object.freeze({
    opened(id: string) {
      remove(id);
      const others = [...order];
      order.push(id);
      return others;
    },
    closed: remove,
    top: () => order.at(-1) ?? "",
    isOpen: (id: string) => order.includes(id),
    anyOpen: () => order.length > 0,
  });
}

export type PromptPart = Readonly<{ kind: "key" | "text" | "gap"; text: string }>;

// The names a prompt uses for keys. A single capital is a key only where the
// sentence around it says so ("E to", "W and S", "A/D to", "(H)"), so the article
// in "A horse does not go indoors" stays a word.
const NAMED_KEYS = "Space|Shift|Esc|Escape|Enter|Tab|Ctrl|Alt|Del";
const KEY = String.raw`${NAMED_KEYS}|[A-Z](?:\/[A-Z])?`;
const KEY_TOKEN = new RegExp(String.raw`(?:\b(?:Press|press|Hold|hold) )?\b(${KEY})\b(?=(?: to | and | or | ·|$))|\((${NAMED_KEYS}|[A-Z])\)`, "g");
// A key can also open an action: "E Pet Biscuit", "· W walk on", "· A/D turn". The first action of a
// prompt must go on with a capitalised word for that ("A horse…" is a sentence); a later one need not,
// unless it is "A" or "I" on their own, which open sentences far more often than they name keys.
const LEADING_KEY_FIRST = new RegExp(String.raw`^(${KEY}) (?=[A-Z][a-z])`);
const LEADING_KEY_LATER = new RegExp(String.raw`^(?![AI] )(${KEY}) (?=\S)`);

/**
 * A prompt as key caps and words. " · " separates actions and becomes a gap;
 * "Press"/"Hold" before a key is dropped for a plain key ("Press E to nap" →
 * [E] to nap) and kept for a held one ("Hold Space to cast" → Hold [Space] to cast).
 */
export function promptParts(text: string): readonly PromptPart[] {
  const parts: PromptPart[] = [];
  const pushText = (value: string): void => {
    if (!value) return;
    const last = parts.at(-1);
    if (last?.kind === "text") parts[parts.length - 1] = { kind: "text", text: last.text + value };
    else parts.push({ kind: "text", text: value });
  };
  const segments = String(text ?? "").split(" · ");
  segments.forEach((segment, index) => {
    if (index > 0) parts.push({ kind: "gap", text: " · " });
    let cursor = 0;
    const leading = segment.match(index === 0 ? LEADING_KEY_FIRST : LEADING_KEY_LATER);
    if (leading) {
      parts.push({ kind: "key", text: leading[1]! });
      cursor = leading[1]!.length;
    }
    const base = cursor;
    for (const match of segment.slice(base).matchAll(KEY_TOKEN)) {
      const at = base + (match.index ?? 0);
      pushText(segment.slice(cursor, at));
      const lead = match[0].match(/^(Hold|hold) /);
      if (lead) pushText(`${lead[1]} `);
      parts.push({ kind: "key", text: match[1] ?? match[2] ?? "" });
      cursor = at + match[0].length;
    }
    pushText(segment.slice(cursor));
  });
  // A leading space left behind by a dropped "Press" reads as a stray indent.
  return parts.map((part, index) => (part.kind === "text" && (index === 0 || parts[index - 1]!.kind === "gap") ? { ...part, text: part.text.trimStart() } : part))
    .filter((part) => part.text.length > 0);
}
