// Custom ranked name — an optional Tactical-Arena-only display name a player can
// set for ranked play, layered over their canonical Javascript Game Factory pilot
// name. Pure localStorage-backed, mirroring nicknameModel.js. It is cosmetic: the
// server keys ranked on the factory playerId, never on this string. When set, it is
// passed as the identity override (createOnlineIdentityPayload's runOverrideName) so
// a ranked opponent sees this name instead of the pilot name.

export const RANKED_NAME_STORAGE_KEY = "tactical-arena.rankedName";
export const RANKED_NAME_MAX_LENGTH = 18;
export const RANKED_NAME_FALLBACK = "Commander";

function stripControlChars(raw) {
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out;
}

export function sanitizeRankedName(raw) {
  if (typeof raw !== "string") return null;
  const collapsed = stripControlChars(raw).trim().replace(/\s+/g, " ");
  if (!collapsed) return null;
  return collapsed.slice(0, RANKED_NAME_MAX_LENGTH);
}

export function loadRankedName(storage = globalThis.localStorage) {
  try {
    return sanitizeRankedName(storage?.getItem(RANKED_NAME_STORAGE_KEY)) ?? "";
  } catch {
    return "";
  }
}

export function saveRankedName(name, storage = globalThis.localStorage) {
  try {
    const clean = sanitizeRankedName(name);
    if (clean) storage?.setItem(RANKED_NAME_STORAGE_KEY, clean);
    else storage?.removeItem(RANKED_NAME_STORAGE_KEY);
    return clean ?? "";
  } catch {
    return "";
  }
}

// The name to show in ranked: the custom ranked name if set, else the factory pilot
// name, else a neutral fallback. Never returns an empty string.
export function resolveRankedDisplayName({ customName, pilotName, fallback = RANKED_NAME_FALLBACK } = {}) {
  const custom = sanitizeRankedName(customName);
  if (custom) return custom;
  const pilot = typeof pilotName === "string" ? pilotName.trim() : "";
  if (pilot) return pilot;
  return fallback;
}
