// Jaybox shell model — game-agnostic helpers shared by the host shell and every
// cabinet. Nothing in this file may know about a specific game's rules; cabinet
// modules (cabinets/<id>.mjs) own everything game-specific. The shell asks the
// cabinet registry, mirroring how factory-network-server keeps src/ generic.
export const PROD_WS_URL = "wss://factory-network-server-production.up.railway.app";
const LOCAL_WS_PORT = "3000";

export const AVATARS = [
  { id: "ember", name: "Ember Ace", mark: "EA", className: "avatar-ember" },
  { id: "volt", name: "Volt Baron", mark: "VB", className: "avatar-volt" },
  { id: "mint", name: "Mint Fox", mark: "MF", className: "avatar-mint" },
  { id: "royal", name: "Royal Mask", mark: "RM", className: "avatar-royal" },
  { id: "neon", name: "Neon Jack", mark: "NJ", className: "avatar-neon" },
  { id: "opal", name: "Opal Crown", mark: "OC", className: "avatar-opal" },
  { id: "ruby", name: "Ruby Switch", mark: "RS", className: "avatar-ruby" },
  { id: "cobalt", name: "Cobalt Coin", mark: "CC", className: "avatar-cobalt" },
  { id: "lime", name: "Lime Key", mark: "LK", className: "avatar-lime" },
  { id: "cosmo", name: "Cosmo Club", mark: "CB", className: "avatar-cosmo" },
  { id: "solar", name: "Solar Dice", mark: "SD", className: "avatar-solar" },
  { id: "ghost", name: "Ghost Note", mark: "GN", className: "avatar-ghost" }
];

function firstNonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function serverParam(locationLike) {
  const search = locationLike?.search || "";
  if (!search) return "";
  return firstNonEmpty(new URLSearchParams(search).get("server"));
}

function isLocalHost(hostname) {
  return hostname === "" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function makeServerUrl(locationLike = globalThis.location, options = {}) {
  const explicitUrl = firstNonEmpty(serverParam(locationLike), options.serverUrl, globalThis.JAYBOX_SERVER_URL);
  if (explicitUrl) return explicitUrl;

  const host = locationLike?.hostname || "localhost";
  if (!isLocalHost(host)) return PROD_WS_URL;

  const secure = locationLike?.protocol === "https:";
  const urlHost = host === "::1" ? "[::1]" : host;
  return `${secure ? "wss" : "ws"}://${urlHost}:${LOCAL_WS_PORT}`;
}

// --- shared render helpers (generic, used by the shell and cabinets) ---

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

export function avatarToken(avatar, extraClass = "") {
  return `<span class="avatar-token ${avatar.className} ${extraClass}" aria-label="${escapeHtml(avatar.name)}"><span>${escapeHtml(avatar.mark)}</span></span>`;
}

function hashText(value) {
  let hash = 0;
  for (const char of String(value || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function getAvatar(avatarId, fallbackKey = "") {
  const avatar = AVATARS.find((candidate) => candidate.id === avatarId);
  if (avatar) return avatar;
  if (!fallbackKey) return AVATARS[0];
  return AVATARS[hashText(fallbackKey) % AVATARS.length];
}

export function decoratePlayer(player = {}, fallbackName = "Player") {
  const name = firstNonEmpty(player.name, player.displayName, fallbackName);
  const avatarId = player.avatarId || player.identity?.avatarId;
  return {
    ...player,
    name,
    avatar: getAvatar(avatarId, player.id || name)
  };
}

// --- generic shell screens (cabinet-agnostic) ---
// The display walks catalog -> lobby -> match purely from connection/lobby state.
// The controller walks reconnect -> join -> lobby -> match; once "match" is
// reached the active cabinet derives its own in-game sub-screen.

export function deriveDisplayScreen(state) {
  if (state.match) return "match";
  if (state.lobby) return "lobby";
  return "catalog";
}

export function deriveControllerScreen(state) {
  if (state.reconnecting) return "reconnect";
  if (!state.match && !state.lobby) return "join";
  if (!state.match) return "lobby";
  return "match";
}
