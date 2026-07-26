// Pure shaping for the Tactical Arena friends surfaces: display names, records,
// which action a row should offer, and list filtering. No DOM, no network — the
// panels import this and stay renderers, and every rule below is unit-tested.

// The relationship values the server reports, and what the primary button on a row
// should do about each. `null` means the row has no primary action.
export const TA_RELATIONSHIP_ACTIONS = Object.freeze({
  none: Object.freeze({ action: "send", label: "Add Friend", disabled: false }),
  "request-sent": Object.freeze({ action: "cancel", label: "Requested", disabled: false }),
  "request-received": Object.freeze({ action: "accept", label: "Accept", disabled: false }),
  friend: Object.freeze({ action: "remove", label: "Friends", disabled: false }),
  blocked: Object.freeze({ action: "unblock", label: "Blocked", disabled: false }),
  self: Object.freeze({ action: null, label: "You", disabled: true }),
});

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// The factory seeds unnamed profiles with "Commander", so it is a placeholder here
// rather than a name worth showing over a chosen ranked tagline.
function isGenericCommanderName(value) {
  return cleanText(value).toLowerCase() === "commander";
}

/** The name to show for a player row. Never returns blank. */
export function taPlayerName(player, { fallback = "Commander" } = {}) {
  const displayName = cleanText(player?.displayName);
  if (displayName && !isGenericCommanderName(displayName)) return displayName;
  return cleanText(player?.tagline) || displayName || fallback;
}

/** `1300 · 5W / 1L / 0D`, or an honest empty-state line for an unplayed player. */
export function taPlayerRecordLine(player) {
  const wins = Number(player?.wins) || 0;
  const losses = Number(player?.losses) || 0;
  const draws = Number(player?.draws) || 0;
  const record = `${wins}W / ${losses}L / ${draws}D`;
  // An unranked player's rating is null, and Number(null) is 0 — check for absence
  // explicitly or they render as "0 · 0W / 0L / 0D".
  const rating = player?.rating == null ? Number.NaN : Number(player.rating);
  if (!Number.isFinite(rating)) return wins + losses + draws > 0 ? record : "No ranked record yet";
  return `${rating} · ${record}`;
}

/** The primary action a row offers for a given relationship. */
export function taRelationshipAction(relationship) {
  return TA_RELATIONSHIP_ACTIONS[cleanText(relationship)] || TA_RELATIONSHIP_ACTIONS.none;
}

/**
 * Whether a row should also offer Block. Never for yourself, and never for someone
 * already blocked (that row offers Unblock instead).
 */
export function canBlockRelationship(relationship) {
  const value = cleanText(relationship);
  return value !== "self" && value !== "blocked";
}

/** Local, case-insensitive filter across a loaded player list. */
export function filterTaPlayers(players, search = "") {
  const query = cleanText(search).toLowerCase();
  const list = Array.isArray(players) ? players.filter(Boolean) : [];
  if (!query) return list;
  return list.filter((player) => [
    player.displayName,
    player.tagline,
    player.playerId,
    player.rating,
  ].map((value) => String(value ?? "").toLowerCase()).join(" ").includes(query));
}

/**
 * The counts the panel's tab strip shows. Incoming requests are the only one worth a
 * badge — outgoing ones need nothing from the player.
 */
export function taFriendsTabCounts({ friends = [], incoming = [], outgoing = [], blocked = [] } = {}) {
  return {
    friends: friends.length,
    requests: incoming.length,
    outgoing: outgoing.length,
    blocked: blocked.length,
    // What the menu button's notification dot reads.
    actionable: incoming.length,
  };
}

/**
 * Apply the server's answer to a friend action back onto a row's relationship,
 * without a refetch. The server is still the source of truth — this only keeps the
 * row honest until the next load, and refuses to invent a state on failure.
 */
export function nextRelationshipAfter(action, result) {
  if (!result || result.error) return null;
  switch (action) {
    case "send":
      // Two people adding each other at once resolves to friends immediately.
      return result.status === "auto_accepted" ? "friend" : "request-sent";
    case "accept":
      return "friend";
    case "decline":
    case "cancel":
    case "remove":
      return "none";
    case "block":
      return "blocked";
    case "unblock":
      return "none";
    default:
      return null;
  }
}

/**
 * Human-readable copy for a refusal the server returned. Falls back to a plain
 * message rather than leaking a raw error code into the UI.
 */
export function taSocialErrorMessage(error) {
  switch (cleanText(error)) {
    case "blocked": return "You can't send a request while one of you has the other blocked.";
    case "already_friends": return "You're already friends.";
    case "cannot_friend_self": return "You can't add yourself.";
    case "request_not_pending": return "That request was already answered.";
    case "request_not_found": return "That request is no longer available.";
    case "not_friends": return "You aren't friends with that player.";
    case "not_recipient": return "Only the player who received a request can answer it.";
    case "": return "";
    default: return "That didn't work. Try again in a moment.";
  }
}
