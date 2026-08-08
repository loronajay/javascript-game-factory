// Typed input, as a pure buffer.
//
// PURE. The rules about what may be typed live here; `input.js` owns the one
// impure part — putting the keyboard into a mode where letters are letters.
//
// ## Why this needed a mode at all
//
// The stereo row (`B` `P` `N` `L` `F` `0` `-` `=`) is live on **every** screen by
// design: a car stereo does not stop being a car stereo because of what you are
// looking at. That rule is worth keeping, and it is also exactly why typing was
// deferred — a room code is five characters from
// `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, which contains B, N, L, P and F. Typing
// `K7P2M` without a capture mode pauses the music, skips a track and opens a
// folder picker.
//
// So the rule is broken **deliberately and narrowly**: while a field has focus,
// `input.js` routes printable keys here and suppresses `ACTION_STEREO`
// altogether. That is the shape the GDD scoped for typed preset names, and this
// module is reusable for them — the garage already stores a free-text `name`.

/**
 * Room codes use the server's alphabet, which drops the characters that read
 * ambiguously in a shared code: no I/O/0/1 confusion, because `O` and `I` are
 * simply not in it. Codes are read aloud and typed in by hand, so this matters.
 */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;

export function createTextEntry({
  value = "",
  maxLength = ROOM_CODE_LENGTH,
  alphabet = ROOM_CODE_ALPHABET,
  upperCase = true,
} = {}) {
  return { value: normalize(value, { maxLength, alphabet, upperCase }), maxLength, alphabet, upperCase };
}

/**
 * Adds one character, if the field will have it.
 *
 * A rejected character is a no-op rather than an error: someone typing a room
 * code with an `O` in it has misread an `0`, and the useful response is for
 * nothing to happen rather than for the field to flash.
 */
export function typeChar(entry, char) {
  if (typeof char !== "string" || char.length !== 1) return entry;
  const candidate = entry.upperCase ? char.toUpperCase() : char;
  if (entry.alphabet && !entry.alphabet.includes(candidate)) return entry;
  if (entry.value.length >= entry.maxLength) return entry;
  return { ...entry, value: entry.value + candidate };
}

export function backspace(entry) {
  return entry.value.length === 0 ? entry : { ...entry, value: entry.value.slice(0, -1) };
}

export function clearEntry(entry) {
  return entry.value === "" ? entry : { ...entry, value: "" };
}

/** True once the field holds something worth submitting. */
export function isComplete(entry) {
  return entry.value.length === entry.maxLength;
}

/**
 * What to draw: the typed characters padded out to the field's width, plus where
 * the caret sits. Renderers take this rather than measuring the string
 * themselves, so the caret and the boxes cannot disagree about how many there
 * are.
 */
export function entryView(entry) {
  const slots = [];
  for (let i = 0; i < entry.maxLength; i += 1) {
    slots.push({
      index: i,
      char: entry.value[i] ?? "",
      filled: i < entry.value.length,
      caret: i === entry.value.length,
    });
  }
  return { value: entry.value, slots, complete: isComplete(entry) };
}

function normalize(value, { maxLength, alphabet, upperCase }) {
  const source = typeof value === "string" ? value : "";
  let out = "";
  for (const char of upperCase ? source.toUpperCase() : source) {
    if (out.length >= maxLength) break;
    if (alphabet && !alphabet.includes(char)) continue;
    out += char;
  }
  return out;
}
