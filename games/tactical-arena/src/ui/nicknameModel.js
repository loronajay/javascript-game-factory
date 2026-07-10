// Per-unit-type nickname preference — a pure localStorage-backed map, following
// the themes.js/skinModel.js pattern. A nickname is a cosmetic mask over a unit
// type's catalog name ("Swordsman" -> "Leo"); it never mutates unitCatalog.js
// data. Scoped by device (localStorage), not by match, so online peers must
// exchange their own chosen nicknames explicitly (see onlineClient.js/
// onlineFlow.js) rather than relying on this local map for an opponent's units.

export const NICKNAME_STORAGE_KEY = "tactical-arena.nicknames";
export const NICKNAME_MAX_LENGTH = 16;

function stripControlChars(raw) {
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out;
}

export function sanitizeNickname(raw) {
  if (typeof raw !== "string") return null;
  const stripped = stripControlChars(raw);
  const collapsed = stripped.trim().replace(/\s+/g, " ");
  if (!collapsed) return null;
  return collapsed.slice(0, NICKNAME_MAX_LENGTH);
}

export function loadNicknamePrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(NICKNAME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const prefs = {};
    for (const [type, nickname] of Object.entries(parsed)) {
      const clean = sanitizeNickname(nickname);
      if (clean) prefs[type] = clean;
    }
    return prefs;
  } catch {
    return {};
  }
}

export function saveNicknamePref(type, nickname, storage = globalThis.localStorage) {
  if (!type) return;
  try {
    const prefs = loadNicknamePrefs(storage);
    const clean = sanitizeNickname(nickname);
    if (clean) prefs[type] = clean;
    else delete prefs[type];
    storage?.setItem(NICKNAME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — nickname just won't persist.
  }
}

export function getNicknamePref(type, storage = globalThis.localStorage) {
  if (!type) return null;
  return loadNicknamePrefs(storage)[type] ?? null;
}
