// Deep links out to the Javascript Game Factory platform pages. The game is served
// from /games/tactical-arena/index.html, so factory pages sit two levels up. Mirrors
// factoryAccount.js's sign-in URL construction (relative URL resolved against the
// current href) and keeps a pure core so the links are unit-testable off a supplied
// href. Returns null for a blank id so callers can hide the action.

const PLAYER_PATH = "../../player/index.html";
const MESSAGES_PATH = "../../messages/index.html";
const FALLBACK_HREF = "http://localhost/games/tactical-arena/index.html";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildUrl(path, params, currentHref) {
  const base = cleanText(currentHref) || FALLBACK_HREF;
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(params)) {
    const v = cleanText(value);
    if (v) url.searchParams.set(key, v);
  }
  return url.toString();
}

// The public /player profile for a given factory playerId.
export function factoryPlayerUrl(playerId, { currentHref = globalThis.location?.href || "" } = {}) {
  const id = cleanText(playerId);
  if (!id) return null;
  return buildUrl(PLAYER_PATH, { id }, currentHref);
}

// The direct-messages thread with a given player (name is an optional display hint the
// thread page uses before it resolves the conversation).
export function factoryMessagesUrl(playerId, { name = "", currentHref = globalThis.location?.href || "" } = {}) {
  const id = cleanText(playerId);
  if (!id) return null;
  return buildUrl(MESSAGES_PATH, { player: id, name }, currentHref);
}
